import { defineConfig } from "vite";

export default defineConfig({
  plugins: [],
  base: import.meta.PROD ? "/webgl-path-tracer/" : "/",
});
