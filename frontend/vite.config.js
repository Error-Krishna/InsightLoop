import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api/v1": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:8000",
        ws: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split heavy, slow-changing vendor code into its own cacheable
        // chunk(s), separate from app code (which changes far more often).
        // recharts specifically is only used by the Dashboard page but was
        // previously bundled into the main chunk regardless -- combined
        // with route-level lazy-loading in App.jsx, this keeps the initial
        // bundle small for anyone whose first page isn't the dashboard.
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-charts": ["recharts"],
        },
      },
    },
  },
});
