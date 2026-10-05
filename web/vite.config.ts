import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    // During development, forward API calls to the Crewbit server.
    proxy: { "/api": "http://localhost:8787" },
  },
});
