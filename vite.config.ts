import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  publicDir: false,
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: {
    outDir: "public/ui",
    emptyOutDir: false,
    lib: {
      entry: fileURLToPath(new URL("./frontend/navigation.tsx", import.meta.url)),
      formats: ["es"],
      fileName: () => "navigation.js",
      cssFileName: "navigation",
    },
    minify: true,
  },
});
