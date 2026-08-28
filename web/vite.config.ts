import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // MapLibre ships its renderer as a web worker. Vite's dependency pre-bundling
  // rewrites the import but does not emit the worker chunk, so the worker 404s
  // and the canvas stays blank with no error on the main thread.
  optimizeDeps: { exclude: ["maplibre-gl"] },
  worker: { format: "es" },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:3000", rewrite: (p) => p.replace(/^\/api/, "") },
      // The tile proxy rewrites style URLs to absolute paths under /tiles, so dev
      // has to forward that prefix too. In production both are the same origin.
      "/tiles": { target: "http://localhost:3000" },
    },
  },
});
