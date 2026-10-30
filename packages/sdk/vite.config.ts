import { defineConfig } from "vite";
export default defineConfig({
  build: {
    lib: {
      entry: { index: "src/index.ts", react: "src/react.tsx" },
      formats: ["es"],
      fileName: (_format, name) => name + ".js",
    },
    rollupOptions: { external: ["react", "react/jsx-runtime"] },
  },
});
