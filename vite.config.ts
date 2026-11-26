import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  server: {
    host: "0.0.0.0",
    port: 5173,
    cors: true,
    allowedHosts: true as any,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/bybit-api": {
        target: "https://api2.bybit.com",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/bybit-api/, ""),
        secure: false,
      },
    },
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
  },
});
