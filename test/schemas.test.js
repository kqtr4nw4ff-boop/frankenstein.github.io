import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SCHEMA,
  BUILTIN_SCHEMAS,
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

test("every built-in has complete, disjoint assignments for 2–8 players", () => {
  assert.equal(BUILTIN_SCHEMAS.length, 12);
  assert.equal(new Set(BUILTIN_SCHEMAS.map((s) => s.id)).size, 12);
  for (const schema of BUILTIN_SCHEMAS) {
    const safe = validateSchema(schema);
    for (let count = 2; count <= 8; count++) {
      const source = safe.layouts?.[count] || safe,
        tasks = assignments(safe, count),
        regions = tasks.flatMap((t) => t.regions);
      assert.equal(tasks.length, count, `${schema.id}: ${count} tasks`);
      assert.ok(
        tasks.every((t) => t.regions.length && t.label && t.instruction),
      );
      const area = (rs) => rs.reduce((total, r) => total + r.w * r.h, 0);
      assert.ok(
        Math.abs(area(regions) - area(source.regions)) < 0.00001,
        `${schema.id}: missing area for ${count}`,
      );
      for (let i = 0; i < regions.length; i++)
        for (let j = i + 1; j < regions.length; j++)
          assert.equal(
            overlaps(regions[i], regions[j]),
            false,
            `${schema.id}: overlap`,
          );
      for (const region of source.regions) {
        for (const fx of [0.15, 0.5, 0.85])
          for (const fy of [0.15, 0.5, 0.85]) {
            const x = region.x + region.w * fx,
              y = region.y + region.h * fy;
            assert.equal(
              regions.filter(
                (r) =>
                  x > r.x - 1e-8 &&
                  x < r.x + r.w - 1e-8 &&
                  y > r.y - 1e-8 &&
                  y < r.y + r.h - 1e-8,
              ).length,
              1,
              `${schema.id}: area assigned exactly once`,
            );
          }
      }
    }
  }
});
test("two-player cat is a head above a body and exports preserve layouts", () => {
  const tasks = assignments(DEFAULT_SCHEMA, 2);
  assert.equal(tasks.length, 2);
  assert.equal(tasks[0].regions.length, 1);
  assert.equal(tasks[1].regions.length, 1);
  assert.match(tasks[0].label, /Голова/);
  assert.doesNotMatch(tasks[0].label, /Грудь|лапы/);
  assert.match(tasks[1].label, /Туловище/);
  assert.equal(
    tasks[0].regions[0].y + tasks[0].regions[0].h,
    tasks[1].regions[0].y,
  );
  assert.deepEqual(
    assignments(JSON.parse(JSON.stringify(validateSchema(DEFAULT_SCHEMA))), 2),
    tasks,
  );
  const g = new Game({ id: "a", name: "Аня" });
  g.join({ id: "b", name: "Боря" });
  g.start("Секретное животное", DEFAULT_SCHEMA);
  const state = JSON.stringify(g.snapshot());
  for (const secret of [
    "Секретное животное",
    "keywords",
    "reference",
    "layouts",
    "Кот с характером",
  ])
    assert.equal(state.includes(secret), false);
});
