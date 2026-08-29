import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  base: './', 
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
  // YENİ: Büyük dosya boyutu uyarısını susturan ve WebTorrent'i ayrı parçaya (chunk) bölen sihirli ayar
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('webtorrent') || id.includes('bittorrent')) {
              return 'torrent-vendor';
            }
            return 'vendor';
          }
        },
      },
    },
  },
});