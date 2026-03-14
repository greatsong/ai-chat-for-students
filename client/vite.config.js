import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 4021,
    proxy: {
      "/api": {
        target: "http://localhost:4022",
        changeOrigin: true,
      },
    },
  },
});
