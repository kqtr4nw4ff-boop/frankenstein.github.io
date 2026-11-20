import { test } from "node:test";
import assert from "node:assert/strict";
import { assignments, DEFAULT_SCHEMA } from "../src/schemas.js";
import { seamGuides } from "../src/drawing.js";
test("adjacent fragments share identical seam geometry and opposite directions", () => {
  const tasks = assignments(DEFAULT_SCHEMA, 2),
    a = seamGuides(tasks[0]),
    b = seamGuides(tasks[1]);
  assert.equal(a.length, 1);
  assert.equal(b.length, 1);
  assert.deepEqual(a[0].a, b[0].a);
  assert.deepEqual(a[0].b, b[0].b);
  assert.ok(a[0].dx === -b[0].dx && a[0].dy === -b[0].dy);
  assert.equal(a[0].dy, -1);
  assert.equal(a[0].label, "Шея");
});
