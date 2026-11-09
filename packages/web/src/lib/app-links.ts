// Links the textures.gg app opens: a mod or a set, ready to install. The app
// registers the scheme; without the app the browser does nothing, so every
// Install sits beside a way to get the app.
const SCHEME = "textures-gg";

export const appLinks = {
  mod: (id: string) => `${SCHEME}://mods/${encodeURIComponent(id)}`,
  set: (name: string) => `${SCHEME}://sets/${encodeURIComponent(name)}`,
};
