import { test } from "node:test";
import assert from "node:assert/strict";

// Tests run against the BUILT output (the package's `test` script compiles
// first) so they exercise exactly what ships in `dist`.
import {
  titleCaseFromDir,
  validateAppName,
} from "../dist/rename-option.js";

test("titleCaseFromDir suggests a display name from the directory", () => {
  assert.equal(titleCaseFromDir("my-cool-app"), "My Cool App");
  assert.equal(titleCaseFromDir("acme"), "Acme");
  assert.equal(titleCaseFromDir("acme_2-demo"), "Acme 2 Demo");
});

test("validateAppName accepts ordinary names (incl. & and unicode)", () => {
  for (const ok of ["Acme", "Acme & Co", "Café 24", "My Cool App"]) {
    assert.equal(validateAppName(ok), null, ok);
  }
});

test("validateAppName rejects empty and literal-breaking characters", () => {
  assert.match(validateAppName("   "), /empty/i);
  for (const bad of ['A "quoted" name', "back`tick", "back\\slash", "Cash $ App"]) {
    assert.match(validateAppName(bad), /must not contain/i, bad);
  }
});
