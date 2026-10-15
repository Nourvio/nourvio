import { tmpdir } from "node:os"
import { join } from "node:path"

import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Each test file starts an in-memory Postgres and runs the migrations.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    env: {
      // Uploaded photos go to a throwaway folder.
      DATA_DIR: join(tmpdir(), `mise-test-${process.pid}`),
    },
  },
})
