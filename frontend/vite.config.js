import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],

  server: {
    port: 5173,
    // In dev, proxy all /api, /auth, /projects, /payment, /deploy calls to backend
    proxy: {
      "/api":      { target: "http://localhost:5000", changeOrigin: true },
      "/auth":     { target: "http://localhost:5000", changeOrigin: true },
      "/projects": { target: "http://localhost:5000", changeOrigin: true },
      "/payment":  { target: "http://localhost:5000", changeOrigin: true },
      "/pricing":  { target: "http://localhost:5000", changeOrigin: true },
      "/deploy":   { target: "http://localhost:5000", changeOrigin: true },
    },
  },

  build: {
    outDir: "dist",
    sourcemap: false,
    // Code splitting for smaller chunks
    rollupOptions: {
      output: {
        manualChunks: {
          "react-vendor": ["react", "react-dom"],
          "icons":        ["lucide-react"],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
});
