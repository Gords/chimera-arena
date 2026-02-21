import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3001",
      },
    },
    allowedHosts: [
      "localhost",
      "ape-allowing-lightly.ngrok-free.app",
      "e992-2a00-79e1-2000-3101-892-4a7b-3262-f60f.ngrok-free.app",
    ],
  },
});
