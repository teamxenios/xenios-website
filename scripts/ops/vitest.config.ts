import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import base from "../../vitest.config";

// Explicitly allocated operator qualification only. The global suite and its
// test discovery remain unchanged; no production connection or action exists.
export default defineConfig({
  ...base,
  root:fileURLToPath(new URL("../../",import.meta.url)),
  test:{...base.test,
    include:["scripts/ops/quote-acl-controller.test.ts","scripts/ops/quote-acl-controller.pg.test.ts"],
    maxWorkers:1,fileParallelism:false,allowOnly:false,retry:0,
  },
});
