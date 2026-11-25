import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL("./", import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: "@", replacement: root },
      // Next.js handles "server-only" at build time; tests import those modules directly.
      { find: "server-only", replacement: fileURLToPath(new URL("./tests/serverOnlyStub.ts", import.meta.url)) },
    ],
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Rules tests need the emulator, which test:rules starts.
    testTimeout: 15000,
  },
});
