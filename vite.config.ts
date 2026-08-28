import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: './', // İŞTE BÜTÜN SİYAH EKRAN KRİZİNİ ÇÖZEN SİHİRLİ SATIR
  plugins: [react(), tailwindcss()],
  server: {
    port: 1420,
    strictPort: true,
  },
});