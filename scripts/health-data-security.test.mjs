import assert from "node:assert/strict";
import { rejectCliPassword, validateIterations, validatePassword } from "./build-health-data.mjs";

assert.throws(
  () => validatePassword("a".repeat(31)),
  /at least 32 characters/
);
assert.doesNotThrow(() => validatePassword("a".repeat(32)));

assert.throws(
  () => validateIterations(299999),
  /fewer than 300000/
);
assert.throws(
  () => validateIterations(Number.NaN),
  /fewer than 300000/
);
assert.doesNotThrow(() => validateIterations(650000));

assert.throws(
  () => rejectCliPassword({ password: "" }),
  /Do not pass the dashboard password/
);

console.log("Health data security validation tests passed.");
