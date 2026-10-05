import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // Relative asset paths, so the app works from GitHub Pages
  // (https://<user>.github.io/<repo>/) as well as from the optional server.
  base: "./",
});
