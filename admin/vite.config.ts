import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const worker = "http://localhost:8787";

export default defineConfig({
  root: "src/web",
  publicDir: "../../public",
  plugins: [react(), tailwindcss()],
  build: { outDir: "../../dist", emptyOutDir: true },
  // `npm run dev:web` serves the UI with hot reload; the API comes from `wrangler dev`.
  server: {
    proxy: Object.fromEntries(["/api", "/login", "/logout", "/auth", "/callback", "/e"].map((p) => [p, worker])),
  },
});
