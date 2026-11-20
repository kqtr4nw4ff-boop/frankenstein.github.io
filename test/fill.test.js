import { test } from "node:test";
import assert from "node:assert/strict";
import { floodRuns } from "../src/fill.js";
import { validStrokes, Game } from "../src/game.js";
test("bucket fill stops at a drawn border and respects assigned regions", () => {
  const W = 10,
    H = 10,
    pixels = new Uint8ClampedArray(W * H * 4).fill(255);
  for (let y = 0; y < H; y++)
    for (let c = 0; c < 3; c++) pixels[(y * W + 5) * 4 + c] = 0;
  const runs = floodRuns(pixels, W, H, 2, 2, [{ x: 0, y: 0, w: 1, h: 1 }]);
  assert.equal(
    runs.reduce((n, r) => n + r.length, 0),
    50,
  );
  assert.equal(
    runs.every((r) => r.x + r.length <= 5),
    true,
  );
  const clipped = floodRuns(pixels, W, H, 2, 2, [
    { x: 0, y: 0, w: 0.3, h: 0.5 },
  ]);
  assert.equal(
    clipped.reduce((n, r) => n + r.length, 0),
    15,
  );
});
test("shape and fill operations validate and preserve tool types in reveal", () => {
  const strokes = [
    {
      tool: "rect",
      filled: true,
      c: "#ff0000",
      w: 9,
      pts: [
        [0.1, 0.1],
        [0.2, 0.2],
      ],
    },
    { tool: "fill", c: "#0000ff", w: 9, pts: [[0.15, 0.15]] },
  ];
  assert.equal(validStrokes(strokes), true);
  assert.equal(validStrokes([{ ...strokes[0], tool: "bad" }]), false);
  assert.equal(
    validStrokes([
      {
        ...strokes[1],
        pts: [
          [0, 0],
          [1, 1],
        ],
      },
    ]),
    false,
  );
  const game = new Game({ id: "a", name: "A" });
  game.join({ id: "b", name: "B" });
  game.start("Кот");
  for (let i = 0; i < 2; i++) {
    const p = game.state.players.find((p) => p.id === game.state.turn.pid);
    game.submit({
      pid: p.id,
      strip: p.strip,
      round: game.state.round,
      strokes,
    });
  }
  assert.equal(game.state.reveal.strips[0].strokes[0].tool, "rect");
  assert.equal(game.state.reveal.strips[0].strokes[0].filled, true);
  assert.equal(game.state.reveal.strips[1].strokes[1].tool, "fill");
});
