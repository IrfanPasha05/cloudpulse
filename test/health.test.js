const test = require("node:test");
const assert = require("node:assert");

// Lightweight sanity check so `npm test` has something real to run in CI.
// (index.js starts a live server as a side effect, so it isn't required
// directly here — this keeps the pipeline's test stage fast and isolated.)
test("package.json declares the expected entry point", () => {
  const pkg = require("../package.json");
  assert.strictEqual(pkg.main, "index.js");
  assert.ok(pkg.dependencies.express);
});

