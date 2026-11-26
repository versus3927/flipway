import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    cors: true,
    hmr: { host: "5173-izch8f196v00p0gnznnac.e2b.app", protocol: "https" as const },
    allowedHosts: true as any,
    headers: { "X-Frame-Options": "ALLOWALL" },
    proxy: {
      "/bybit-api": {
        target: "https://api2.bybit.com",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/bybit-api/, ""),
        secure: false,
      },
      "/bybit-x-api": {
        target: "https://www.bybit.com",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/bybit-x-api/, ""),
        secure: false,
      },
    },
  },
});
