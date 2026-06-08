import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// During dev the core API runs separately (default :4000); proxy API + WS to it.
const CORE = process.env.HUB_CORE_URL ?? "http://localhost:4000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: CORE, changeOrigin: true },
      "/ws": { target: CORE, ws: true, changeOrigin: true },
    },
  },
});
