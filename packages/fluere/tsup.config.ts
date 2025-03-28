import { defineConfig } from "tsup";

export default defineConfig([
  // Core APIs
  {
    entry: ["src/core/index.ts"],
    outDir: "dist",
    format: ["cjs", "esm"],
    dts: true,
    sourcemap: true,
  },
  // Interrupter APIs
  {
    entry: ["src/interrupter/*.ts"],
    outDir: "interrupter",
    format: ["esm"],
    external: ["react", "next", "hono", "ai/rsc", "fluere"],
    dts: true,
    sourcemap: true,
  },
  // Middleware APIs
  {
    entry: ["src/middleware/*.ts"],
    outDir: "middleware",
    format: ["esm"],
    external: ["fluere"],
    dts: true,
    sourcemap: true,
  },
  // Utility APIs
  {
    entry: ["src/util/*.ts"],
    outDir: "util",
    format: ["esm"],
    external: ["fluere"],
    dts: true,
    sourcemap: true,
  },
]);
