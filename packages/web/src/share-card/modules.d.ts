// What Wrangler gives the Worker for a .wasm import: the compiled module.
declare module "*.wasm" {
  const module: WebAssembly.Module;
  export default module;
}
