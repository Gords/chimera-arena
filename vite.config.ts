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
    allowedHosts: ["localhost", "ape-allowing-lightly.ngrok-free.app"],
    proxy: {
      "/socket.io": {
        target: "http://localhost:3001",
        ws: true,
        configure: (proxy) => {
          // Suppress noisy EPIPE/ECONNRESET errors from normal WS disconnects
          proxy.on("error", () => {});
          proxy.on("proxyReqWs", (_proxyReq, _req, socket) => {
            socket.on("error", () => {});
          });
        },
      },
    },
  },
});
