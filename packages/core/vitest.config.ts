import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  test: {
    workspace: [
      {
        plugins: [
          tsconfigPaths({
            projects: ["./tsconfig.browser.test.json"],
          }),
        ],
        test: {
          name: "DOM",
          environment: "happy-dom",
          exclude: ["**/lib/**", "**/dist/**", "**/node_modules/**"],
        },
      },
      {
        plugins: [
          tsconfigPaths({
            projects: ["./tsconfig.test.json"],
          }),
        ],
        test: {
          name: "Node.js",
          environment: "node",
          exclude: ["**/lib/**", "**/dist/**", "**/node_modules/**"],
        },
      },
      {
        plugins: [
          tsconfigPaths({
            projects: ["./tsconfig.test.json"],
          }),
        ],
        test: {
          name: "Edge Runtime",
          environment: "edge-runtime",
          exclude: ["**/lib/**", "**/dist/**", "**/node_modules/**"],
        },
      },
    ],
  },
});
