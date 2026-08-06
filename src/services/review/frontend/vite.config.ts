import { resolve } from "node:path"
import vue from "@vitejs/plugin-vue"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [vue()],
  publicDir: resolve(process.cwd(), "public"),
  root: __dirname
})
