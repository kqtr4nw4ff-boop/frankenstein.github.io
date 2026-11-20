import { test } from "node:test";
import assert from "node:assert/strict";
import { packets, Assembler } from "../src/protocol.js";
import { assignments, DEFAULT_SCHEMA } from "../src/schemas.js";
import { seamGuides } from "../src/drawing.js";
test("large drawings travel in bounded packets and reassemble out of order", () => {
  const source = { type: "reveal", text: "зверь".repeat(30000) },
    chunks = packets(source, "test").map(JSON.parse),
    assembler = new Assembler();
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((c) => Buffer.byteLength(JSON.stringify(c)) < 64000));
  let result;
  for (const part of [...chunks].reverse()) {
    const next = assembler.accept("out/player", part);
    if (next) result = next;
  }
  assert.deepEqual(result, source);
});
test("duplicate, malformed and expired chunks do not corrupt other topics", () => {
  let now = 0;
  const a = new Assembler(() => now),
    chunks = packets({ text: "a".repeat(20000) }, "x").map(JSON.parse);
  assert.equal(a.accept("one", chunks[0]), null);
  assert.equal(a.accept("one", chunks[0]), null);
  assert.equal(a.accept("two", chunks[1]), null);
  assert.equal(a.accept("one", { ...chunks[1], total: 999999 }), null);
  now = 16000;
  assert.equal(a.accept("one", chunks[2]), null);
  assert.equal(a.accept("one", chunks[0]), null);
  assert.equal(a.accept("one", chunks[1]).text.length, 20000);
});
test("adjacent fragments share identical seam geometry and opposite directions", () => {
  const tasks = assignments(DEFAULT_SCHEMA, 2),
    a = seamGuides(tasks[0]),
    b = seamGuides(tasks[1]);
  assert.equal(a.length, 1);
  assert.equal(b.length, 1);
  assert.deepEqual(a[0].a, b[0].a);
  assert.deepEqual(a[0].b, b[0].b);
  assert.equal(a[0].dx, -b[0].dx);
  assert.equal(a[0].label, "Туловище");
});
