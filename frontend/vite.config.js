import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Dev: this server is the single URL. It serves the React app and proxies the API to FastAPI.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  server: {
    // /login and every other page route falls back to index.html (Vite does this by default)
    host: "localhost",
    port: 5173,
    strictPort: true,
    proxy: { "/api/v1": { target: "http://127.0.0.1:8000", changeOrigin: false } },
  },
});
