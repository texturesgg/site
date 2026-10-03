import path from "node:path";
import stylex from "@stylexjs/unplugin";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// StyleX's dev-server hook starts a hot-reload timer that is only cleared when
// Vite's HTTP server closes. Vitest runs Vite without one, so the timer kept the
// test process alive until Vitest's teardown timeout (about 10 s per run).
// Tests still compile StyleX; they only skip the dev-server hook.
const stylexPlugin = stylex.vite({
  // Unlayered output: the base reset in src/index.css lives in a CSS layer, and
  // unlayered rules always beat layered ones, so every component style wins over
  // the reset regardless of load order in dev or production.
  useCSSLayers: false,
  // Token variable names are hashed from the defining file's path, so the "@/"
  // alias and the resolution root must be fixed rather than depend on the cwd.
  aliases: { "@/*": [path.join(import.meta.dirname, "src/*")] },
  unstable_moduleResolution: { type: "commonJS", rootDir: import.meta.dirname },
});
if (process.env.VITEST) delete stylexPlugin.configureServer;

export default defineConfig({
  // The router and StyleX plugins must run before React's (StyleX keeps Fast
  // Refresh working that way). autoCodeSplitting loads each route's component in
  // its own chunk. StyleX appends its CSS to the app stylesheet.
  plugins: [tanstackRouter({ target: "react", autoCodeSplitting: true }), stylexPlugin, react()],
  // Pre-bundle every Base UI entry point so adopting a new component in dev
  // doesn't trigger a dependency re-optimization and full page reload.
  optimizeDeps: { include: ["@base-ui/react/*"] },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    port: 5174,
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
      },
    },
  },
});
