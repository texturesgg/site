//! Browser adapter for `hsd-render`: the site's 3D preview on a canvas.
//!
//! JavaScript keeps the DOM work (animation frames, input, resizing,
//! visibility, reduced motion). Rust owns parsing, idle playback, and the GPU.
//! Errors are JavaScript `Error`s with a `code`: `gpu-unavailable` means this
//! build's backend cannot start here, so the caller may try the other build.
#![cfg(target_family = "wasm")]

#[cfg(all(feature = "webgpu", feature = "webgl"))]
compile_error!("build with exactly one of the `webgpu` or `webgl` features");
#[cfg(not(any(feature = "webgpu", feature = "webgl")))]
compile_error!("build with exactly one of the `webgpu` or `webgl` features");

use std::fmt::Display;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use dat_parser::hsd::draw::HsdDrawEvaluationPolicy;
use hsd_render::{CameraView, HsdRenderer, Orbit, PreparedGeometry, neutral_preview_lighting};
use js_sys::{Array, Reflect, Uint8Array};
use melee_dat::{
    FighterAttachOutcome, MeleeModel, MeleeModelKind, MeleeReferenceCatalog, MeleeReferenceStore,
};
use wasm_bindgen::prelude::*;

#[cfg(feature = "webgpu")]
const BACKENDS: wgpu::Backends = wgpu::Backends::BROWSER_WEBGPU;
#[cfg(feature = "webgl")]
const BACKENDS: wgpu::Backends = wgpu::Backends::GL;

/// The site preview stops zooming short of the model; the editor goes closer.
const PREVIEW_MIN_ZOOM: f64 = 0.35;

/// With `debug-panics`, a Rust panic reaches the console with its message
/// instead of trapping as a bare `unreachable`.
#[cfg(feature = "debug-panics")]
#[wasm_bindgen(start)]
fn show_panics() {
    console_error_panic_hook::set_once();
}

/// The GPU API this build draws with: `"webgpu"` or `"webgl"`.
#[wasm_bindgen]
pub fn backend() -> String {
    if cfg!(feature = "webgpu") {
        "webgpu"
    } else {
        "webgl"
    }
    .into()
}

/// wgpu's GL backend needs a display even in a browser, where it is the page.
#[derive(Debug)]
struct WebDisplay;

impl raw_window_handle::HasDisplayHandle for WebDisplay {
    fn display_handle(
        &self,
    ) -> Result<raw_window_handle::DisplayHandle<'_>, raw_window_handle::HandleError> {
        Ok(raw_window_handle::DisplayHandle::web())
    }
}

fn error(code: &str, message: impl Display) -> JsValue {
    let error = js_sys::Error::new(&message.to_string());
    // Setting a property on a fresh Error cannot fail.
    let _ = Reflect::set(&error, &"code".into(), &code.into());
    error.into()
}

/// A parsed costume or model, before it has a canvas.
#[wasm_bindgen]
pub struct HsdScene {
    model: Option<MeleeModel>,
}

#[wasm_bindgen]
impl HsdScene {
    /// Parse a DAT. `policy` is `"meleeFighter"` for character costumes (fighter
    /// envelope skinning, idle eligibility) and `"genericHsd"` for everything else.
    #[wasm_bindgen(constructor)]
    pub fn new(dat: &[u8], policy: &str) -> Result<HsdScene, JsValue> {
        let policy = match policy {
            "meleeFighter" => HsdDrawEvaluationPolicy::MELEE_FIGHTER,
            "genericHsd" => HsdDrawEvaluationPolicy::GENERIC_HSD,
            other => return Err(error("invalid-argument", format!("unknown policy {other}"))),
        };
        let model = MeleeModel::open(dat, policy).map_err(|e| error("invalid-dat", e))?;
        Ok(Self { model: Some(model) })
    }

    /// The reference files this costume's idle needs, as `{ key, byteLength }`
    /// storage objects, or `undefined` when no idle applies. Fetch them, then
    /// pass the bytes to [`Self::attach_idle`].
    #[wasm_bindgen(js_name = idleReferenceAssets, unchecked_return_type = "{ key: string; byteLength: number }[] | undefined")]
    pub fn idle_reference_assets(&self) -> Result<JsValue, JsValue> {
        let Some(model) = &self.model else {
            return Ok(JsValue::UNDEFINED);
        };
        if model.static_policy() != Some(HsdDrawEvaluationPolicy::MELEE_FIGHTER) {
            return Ok(JsValue::UNDEFINED);
        }
        let catalog = MeleeReferenceCatalog::checked_in();
        let Some(assets) = catalog.idle_reference_assets(model.scene()) else {
            return Ok(JsValue::UNDEFINED);
        };
        let list = Array::new();
        for asset in assets {
            let entry = js_sys::Object::new();
            // Setting properties on a fresh plain object cannot fail.
            let _ = Reflect::set(&entry, &"key".into(), &asset.key.as_str().into());
            let _ = Reflect::set(
                &entry,
                &"byteLength".into(),
                &(asset.byte_length as f64).into(),
            );
            list.push(&entry);
        }
        Ok(list.into())
    }

    /// Attach the catalog idle from fetched reference bytes, each admitted only
    /// by its catalog size and SHA-256. Returns `false` when the costume's
    /// skeleton does not match the reference (it keeps its bind pose); throws
    /// when a reference is missing or wrong, or native attachment fails.
    #[wasm_bindgen(js_name = attachIdle)]
    pub fn attach_idle(&mut self, files: Array) -> Result<bool, JsValue> {
        if self.model.as_ref().map(MeleeModel::kind) != Some(MeleeModelKind::Static) {
            return Err(error("invalid-state", "idle is already attached"));
        }
        let bytes: Vec<Vec<u8>> = files
            .iter()
            .map(|file| {
                file.dyn_into::<Uint8Array>()
                    .map(|array| array.to_vec())
                    .map_err(|_| error("invalid-argument", "references must be Uint8Arrays"))
            })
            .collect::<Result<_, _>>()?;
        let Some(model) = self.model.take() else {
            return Err(error("invalid-state", "scene has no model"));
        };
        let catalog = MeleeReferenceCatalog::checked_in();
        let store = MeleeReferenceStore::from_bytes(catalog, bytes);
        let (model, outcome) = model.attach_fighter(catalog, &store);
        self.model = Some(model);
        match outcome {
            FighterAttachOutcome::Attached => Ok(true),
            FighterAttachOutcome::Failed(e) => Err(error("idle-failed", e)),
            _ => Ok(false),
        }
    }

    #[wasm_bindgen(getter, js_name = hasIdle)]
    pub fn has_idle(&self) -> bool {
        self.model
            .as_ref()
            .is_some_and(|model| model.fighter().is_some())
    }
}

/// A scene drawing on a canvas with this build's GPU backend.
#[wasm_bindgen]
pub struct HsdViewer {
    surface: wgpu::Surface<'static>,
    device: wgpu::Device,
    queue: wgpu::Queue,
    config: wgpu::SurfaceConfiguration,
    renderer: HsdRenderer,
    model: MeleeModel,
    lost: Arc<AtomicBool>,
}

#[wasm_bindgen]
impl HsdViewer {
    /// Take ownership of `scene` and start drawing it on `canvas` at
    /// `width`×`height` device pixels.
    pub async fn create(
        canvas: web_sys::HtmlCanvasElement,
        scene: HsdScene,
        width: u32,
        height: u32,
    ) -> Result<HsdViewer, JsValue> {
        let mut model = scene
            .model
            .ok_or_else(|| error("invalid-state", "scene has no model"))?;
        let unavailable = |e: &dyn Display| error("gpu-unavailable", e);
        let mut descriptor =
            wgpu::InstanceDescriptor::new_with_display_handle(Box::new(WebDisplay));
        descriptor.backends = BACKENDS;
        let instance = wgpu::Instance::new(descriptor);
        canvas.set_width(width.max(1));
        canvas.set_height(height.max(1));
        let surface = instance
            .create_surface(wgpu::SurfaceTarget::Canvas(canvas))
            .map_err(|e| unavailable(&e))?;
        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                compatible_surface: Some(&surface),
                ..wgpu::RequestAdapterOptions::default()
            })
            .await
            .map_err(|e| unavailable(&e))?;
        let (device, queue) = adapter
            .request_device(&wgpu::DeviceDescriptor {
                label: Some("HSD preview"),
                required_limits: adapter.limits(),
                ..wgpu::DeviceDescriptor::default()
            })
            .await
            .map_err(|e| unavailable(&e))?;
        let capabilities = surface.get_capabilities(&adapter);
        // HSD output is raw GX color: the canvas format must not be sRGB.
        let format = capabilities
            .formats
            .iter()
            .copied()
            .find(|format| !format.is_srgb())
            .ok_or_else(|| unavailable(&"the canvas offers no non-sRGB format"))?;
        let alpha_mode = if capabilities
            .alpha_modes
            .contains(&wgpu::CompositeAlphaMode::Opaque)
        {
            wgpu::CompositeAlphaMode::Opaque
        } else {
            *capabilities
                .alpha_modes
                .first()
                .ok_or_else(|| unavailable(&"the canvas offers no alpha mode"))?
        };
        let config = wgpu::SurfaceConfiguration {
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            format,
            width: width.max(1),
            height: height.max(1),
            present_mode: wgpu::PresentMode::Fifo,
            desired_maximum_frame_latency: 2,
            alpha_mode,
            view_formats: Vec::new(),
        };
        surface.configure(&device, &config);
        let lost = Arc::new(AtomicBool::new(false));
        let flag = Arc::clone(&lost);
        device.set_device_lost_callback(move |_, _| flag.store(true, Ordering::Relaxed));
        let focus = model.focus();
        let (scene, work) = model.evaluate().map_err(|e| error("render-failed", e))?;
        let geometry = PreparedGeometry::new(scene, work)
            .map_err(|e| error("render-failed", e))?
            .with_focus(focus);
        let renderer = HsdRenderer::new(
            &device,
            &queue,
            format,
            geometry,
            neutral_preview_lighting(),
            (config.width, config.height),
            CameraView::Front.orbit(),
        )
        .map_err(|e| error("render-failed", e))?;
        Ok(Self {
            surface,
            device,
            queue,
            config,
            renderer,
            model,
            lost,
        })
    }

    #[wasm_bindgen(getter, js_name = hasIdle)]
    pub fn has_idle(&self) -> bool {
        self.model.fighter().is_some()
    }

    /// Advance the idle, or a stage's animations, by `ticks` 60 Hz frames and
    /// upload the result. The caller owns the clock; a bind-pose model
    /// ignores this.
    pub fn advance(&mut self, ticks: u32) -> Result<(), JsValue> {
        if ticks == 0 {
            return Ok(());
        }
        fn failed(e: impl Display) -> JsValue {
            error("render-failed", e)
        }
        if !self.model.is_animated() {
            return Ok(());
        }
        for _ in 0..ticks {
            self.model.advance().map_err(failed)?;
        }
        let (scene, work) = self.model.evaluate().map_err(failed)?;
        self.renderer
            .update_draw_work(&self.queue, scene, work)
            .map_err(failed)
    }

    /// Orbit in radians and a zoom factor; both are clamped to the preview's
    /// range, which stops short of the model.
    #[wasm_bindgen(js_name = setOrbit)]
    pub fn set_orbit(&mut self, yaw: f64, pitch: f64, zoom: f64) -> Result<(), JsValue> {
        let orbit = Orbit {
            yaw,
            pitch,
            zoom: zoom.max(PREVIEW_MIN_ZOOM),
            ..Orbit::default()
        };
        self.renderer
            .set_orbit(&self.queue, orbit)
            .map_err(|e| error("render-failed", e))
    }

    /// Resize to `width`×`height` device pixels.
    pub fn resize(&mut self, width: u32, height: u32) -> Result<(), JsValue> {
        let (width, height) = (width.max(1), height.max(1));
        if (width, height) == (self.config.width, self.config.height) {
            return Ok(());
        }
        self.config.width = width;
        self.config.height = height;
        self.surface.configure(&self.device, &self.config);
        self.renderer
            .resize(&self.device, &self.queue, width, height)
            .map_err(|e| error("render-failed", e))
    }

    /// Draw one frame. Throws `device-lost` once the GPU device is gone.
    pub fn render(&mut self) -> Result<(), JsValue> {
        if self.lost.load(Ordering::Relaxed) {
            return Err(error("device-lost", "the GPU device was lost"));
        }
        let frame = match self.surface.get_current_texture() {
            wgpu::CurrentSurfaceTexture::Success(frame)
            | wgpu::CurrentSurfaceTexture::Suboptimal(frame) => frame,
            // Skip this frame; the next request tries again.
            wgpu::CurrentSurfaceTexture::Timeout | wgpu::CurrentSurfaceTexture::Occluded => {
                return Ok(());
            }
            wgpu::CurrentSurfaceTexture::Outdated | wgpu::CurrentSurfaceTexture::Lost => {
                self.surface.configure(&self.device, &self.config);
                return Ok(());
            }
            wgpu::CurrentSurfaceTexture::Validation => {
                return Err(error(
                    "render-failed",
                    "the canvas surface failed validation",
                ));
            }
        };
        let view = frame
            .texture
            .create_view(&wgpu::TextureViewDescriptor::default());
        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("HSD preview frame"),
            });
        self.renderer.encode(&mut encoder, &view);
        self.queue.submit([encoder.finish()]);
        frame.present();
        Ok(())
    }
}
