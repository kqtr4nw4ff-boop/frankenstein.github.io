import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sliceContour,
  simplifyContour,
  validateContour,
} from "../src/contour.js";
import {
  validateSchema,
  assignments,
  BUILTIN_SCHEMAS,
} from "../src/schemas.js";
import { SchemaDeck } from "../src/random.js";
import { Game } from "../src/game.js";
const rectangle = [
  [0.2, 0.1],
  [0.8, 0.1],
  [0.8, 0.9],
  [0.2, 0.9],
];
test("contour generates disjoint slices and paired connections in both directions", () => {
  for (const axis of ["x", "y"])
    for (let count = 2; count <= 8; count++) {
      const layout = sliceContour(rectangle, count, axis),
        schema = validateSchema({
          version: 1,
          name: "Зверь",
          contour: rectangle,
          ...layout,
        });
      assert.equal(schema.regions.length, count);
      assert.equal(schema.anchors.length, (count - 1) * 2);
      assert.equal(assignments(schema, count).length, count);
      for (let i = 0; i < schema.anchors.length; i += 2)
        assert.equal(schema.anchors[i].group, schema.anchors[i + 1].group);
      const area = schema.regions.reduce((sum, r) => sum + r.w * r.h, 0);
      assert.ok(Math.abs(area - 0.48) < 1e-6);
    }
  assert.throws(() => sliceContour(rectangle, 1));
  assert.throws(() =>
    validateContour([
      [0, 0],
      [1, 1],
      [0, 0],
    ]),
  );
});
test("contour detects separate pairs of legs on one cutting line", () => {
  const contour = [
      [0.1, 0.1],
      [0.9, 0.1],
      [0.9, 0.9],
      [0.65, 0.9],
      [0.65, 0.5],
      [0.35, 0.5],
      [0.35, 0.9],
      [0.1, 0.9],
    ],
    layout = sliceContour(contour, 2, "y");
  assert.equal(layout.anchors.length, 4);
  assert.equal(new Set(layout.anchors.map((p) => p.group)).size, 2);
  const circle = Array.from({ length: 100 }, (_, i) => [
    0.5 + Math.cos((i / 100) * Math.PI * 2) * 0.3,
    0.5 + Math.sin((i / 100) * Math.PI * 2) * 0.3,
  ]);
  assert.ok(simplifyContour(circle).length < 50);
});
test("random deck uses all 60 characters before repeating and does not repeat at cycle boundary", () => {
  const deck = new SchemaDeck(() => 0.42),
    first = Array.from({ length: 60 }, () => deck.draw(BUILTIN_SCHEMAS));
  assert.equal(new Set(first.map((s) => s.id)).size, 60);
  assert.notEqual(deck.draw(BUILTIN_SCHEMAS).id, first.at(-1).id);
  const one = [BUILTIN_SCHEMAS[0]];
  assert.equal(deck.draw(one).id, one[0].id);
  assert.equal(deck.draw(one).id, one[0].id);
});
test("host duration is fixed per round and each turn uses the selected preset", () => {
  for (let seconds = 10; seconds <= 180; seconds += 10) {
    let now = 1000;
    const game = new Game({ id: "a", name: "A" }, () => now);
    game.join({ id: "b", name: "B" });
    assert.equal(game.start("Зверь", BUILTIN_SCHEMAS[0], seconds), true);
    assert.equal(game.state.turn.durationMs, seconds * 1000);
    assert.equal(game.state.turn.endsAt - now, seconds * 1000);
    now += seconds * 1000 + 3001;
    assert.equal(game.tick(), true);
    assert.equal(game.state.turn.endsAt - now, seconds * 1000);
  }
  const game = new Game({ id: "a", name: "A" });
  game.join({ id: "b", name: "B" });
  for (const seconds of [0, 15, 75, 190, NaN])
    assert.equal(game.start("Зверь", BUILTIN_SCHEMAS[0], seconds), false);
});
test("source contour and reference stay private when generated scheme is played", () => {
  const schema = {
      version: 1,
      name: "Секретное имя",
      reference: "data:image/png;base64,AAAA",
      contour: rectangle,
      ...sliceContour(rectangle, 2),
    },
    game = new Game({ id: "a", name: "A" });
  game.join({ id: "b", name: "B" });
  game.start("Тайный зверь", schema, 30);
  const publicState = JSON.stringify(game.snapshot());
  for (const text of [
    '"contour":',
    '"reference":',
    "Секретное имя",
    "Тайный зверь",
  ])
    assert.equal(publicState.includes(text), false);
});
