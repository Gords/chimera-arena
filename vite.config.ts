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
      "/socket.io": {
        target: "http://localhost:3001",
        ws: true,
      },
    },
    allowedHosts: [
      "localhost",
      "ape-allowing-lightly.ngrok-free.app",
      "8092-2a00-79e1-2000-3101-892-4a7b-3262-f60f.ngrok-free.app",
      "5ce2-2a00-79e1-2000-3101-9974-9673-cc4-7960.ngrok-free.app",
      "82a7-2a00-79e1-2000-3101-9974-9673-cc4-7960.ngrok-free.app",
    ],
  },
});
