import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  base: "./",

  plugins: [
    react(),
    tailwindcss(),
    nodePolyfills({
      protocolImports: true,
    }),
  ],

  server: {
    port: 1420,
    strictPort: true,
  },

  build: {
    target: "chrome53",

    chunkSizeWarningLimit: 5000,

    rollupOptions: {
      output: {
        format: "iife",

        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name].[ext]",
      },
    },
  },
});