import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SCHEMA,
  validateSchema,
  assignments,
  overlaps,
} from "../src/schemas.js";
import { Game } from "../src/game.js";
test("arbitrary rectangular layouts validate and reject overlapping or unsafe input", () => {
  const schema = {
    version: 1,
    id: "custom",
    name: "Секретный кот",
    keywords: ["кот"],
    regions: [
      {
        id: "top",
        label: "Голова с ушами",
        instruction: "Шея снизу",
        x: 0,
        y: 0,
        w: 1,
        h: 0.4,
      },
      {
        id: "bottom",
        label: "Туловище с лапами",
        instruction: "Шея сверху",
        x: 0,
        y: 0.4,
        w: 1,
        h: 0.6,
      },
    ],
    anchors: [{ x: 0.5, y: 0.4 }],
  };
  assert.equal(validateSchema(schema).regions.length, 2);
  assert.throws(
    () =>
      validateSchema({
        ...schema,
        regions: [schema.regions[0], { ...schema.regions[1], y: 0.3 }],
      }),
    /пересекаются/,
  );
  assert.throws(() =>
    validateSchema({ ...schema, reference: "https://tracker.example/image" }),
  );
  const g = new Game({ id: "a", name: "Аня" });
  g.join({ id: "b", name: "Боря" });
  g.start("Секретный кот", schema);
  const snapshot = JSON.stringify(g.snapshot());
  assert.equal(snapshot.includes("Секретный кот"), false);
  assert.equal(snapshot.includes("keywords"), false);
  assert.equal(snapshot.includes("reference"), false);
  assert.equal(
    g.state.players.every((p) => p.task.regions.length === 1),
    true,
  );
});
test("adapts to 2–8 players without losing area or producing overlaps", () => {
  for (let count = 2; count <= 8; count++) {
    const tasks = assignments(DEFAULT_SCHEMA, count),
      regions = tasks.flatMap((t) => t.regions);
    assert.equal(tasks.length, count);
    assert.equal(
      tasks.every((t) => t.regions.length > 0),
      true,
    );
    assert.ok(
      Math.abs(regions.reduce((sum, r) => sum + r.w * r.h, 0) - 1) < 0.00001,
    );

    assert.equal(
      tasks.every((t) => t.regions.length === 1),
      true,
    );
    for (let i = 0; i < regions.length; i++)
      for (let j = i + 1; j < regions.length; j++)
        assert.equal(overlaps(regions[i], regions[j]), false);
  }
});
