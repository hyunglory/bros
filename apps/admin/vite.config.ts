import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const apiTarget = env.VITE_API_PROXY_TARGET ?? "http://127.0.0.1:3000";

  return {
    plugins: [react()],
    server: {
      host: "127.0.0.1",
      port: 5173,
      proxy: {
        "/health": apiTarget,
        "/ready": apiTarget,
        // Keep the browser Host so the API can compare it with Origin.
        "/api": { target: apiTarget, changeOrigin: false },
      },
    },
    preview: {
      host: "127.0.0.1",
      port: 4173,
    },
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
    },
  };
});
