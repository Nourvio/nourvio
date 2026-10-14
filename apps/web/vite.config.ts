import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    // The API runs separately in development (apps/server on :3000).
    proxy: {
      // Keep the browser's host, so links Mise makes (like Kroger's sign-in
      // return address) point back here.
      "/api": { target: "http://localhost:3000", xfwd: true },
    },
  },
})
