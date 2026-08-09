import fs from "fs"
import path from "path"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig, type Plugin } from "vite"

// dist/placeholder.txt is tracked in git so //go:embed dist compiles in fresh
// checkouts; emptyOutDir wipes it on every build, so put it back afterwards.
const keepDistPlaceholder = (): Plugin => ({
  name: "keep-dist-placeholder",
  closeBundle() {
    const placeholder = path.resolve(__dirname, "dist/placeholder.txt")
    if (fs.existsSync(path.dirname(placeholder)) && !fs.existsSync(placeholder)) {
      const eol = process.platform === "win32" ? "\r\n" : "\n"
      fs.writeFileSync(placeholder, `This file keeps the shared frontend embed directory present in source checkouts.${eol}`)
    }
  },
})

export default defineConfig({
    base: "/",
    plugins: [tailwindcss(), react(), keepDistPlaceholder()],
    build: {
      // Clean the output directory so stale hashed bundles never accumulate —
      // the community server embeds web/dist wholesale via //go:embed.
      emptyOutDir: true,
      outDir: path.resolve(__dirname, "dist"),
    },
    resolve: {
      alias: {
        "@/AppEntry": path.resolve(__dirname, "./src/App.tsx"),
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:12789',
          changeOrigin: true,
        },
        '/v1beta': {
          target: 'http://localhost:12789',
          changeOrigin: true,
        },
        '/v1': {
          target: 'http://localhost:12789',
          changeOrigin: true,
        },
        '/auth': {
          target: 'http://localhost:12789',
          changeOrigin: true,
        },
      },
    },
})
