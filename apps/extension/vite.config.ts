import { fileURLToPath } from "node:url"

import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url))

// Builds the unpacked extension into dist/: the popup and side panel pages,
// and the background worker, which must keep its plain name for the manifest.
export default defineConfig({
  plugins: [react()],
  base: "",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // Extension pages can't use Vite's preload helper in the worker.
    modulePreload: false,
    rolldownOptions: {
      input: {
        popup: here("popup.html"),
        sidepanel: here("sidepanel.html"),
        background: here("src/background.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
})
