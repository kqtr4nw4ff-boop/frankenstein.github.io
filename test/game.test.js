import { test } from "node:test";
import assert from "node:assert/strict";
import { Game, TURN_MS, validStrokes } from "../src/game.js";
const stroke = [
  {
    c: "#123456",
    w: 9,
    pts: [
      [0, 0],
      [1, 1],
    ],
  },
];
function fixture() {
  let now = 1000;
  const game = new Game({ id: "a", name: "Аня" }, () => now);
  game.join({ id: "b", name: "Боря" });
  game.start("Кот");
  return { game, advance: () => (now += TURN_MS + 3001) };
}
function message(game) {
  const s = game.state;
  return {
    pid: s.turn.pid,
    strip: s.turn.strip,
    round: s.round,
    strokes: stroke,
  };
}
test("round completes, duplicates are harmless, word remains secret until reveal", () => {
  const { game } = fixture();
  assert.equal(JSON.stringify(game.snapshot()).includes("Кот"), false);
  const m = message(game);
  assert.equal(game.submit(m), true);
  const turn = game.state.turn.pid;
  assert.equal(game.submit(m), true);
  assert.equal(game.state.turn.pid, turn);
  assert.equal(game.submit(message(game)), true);
  assert.equal(game.state.phase, "reveal");
  assert.equal(game.state.reveal.word, "Кот");
  assert.equal(game.state.reveal.strips.length, 2);
  game.again();
  assert.equal(game.state.phase, "lobby");
  assert.equal(game.start("Слон"), true);
  assert.equal(game.submit(m), false);
});
test("rejects wrong player, strip, round and malformed strokes", () => {
  const { game } = fixture(),
    m = message(game);
  for (const patch of [
    { pid: "intruder" },
    { strip: 99 },
    { round: "old" },
    { strokes: [{ ...stroke[0], pts: [[2, 0]] }] },
  ])
    assert.equal(game.submit({ ...m, ...patch }), false);
  assert.equal(
    game.state.players.some((p) => p.done),
    false,
  );
});
test("late joins are spectators; timeout advances disconnected player", () => {
  const { game, advance } = fixture();
  game.join({ id: "c", name: "Вера" });
  assert.equal(game.state.players.at(-1).strip, -1);
  assert.equal(game.tick(), false);
  advance();
  assert.equal(game.tick(), true);
  advance();
  game.tick();
  assert.equal(game.state.phase, "reveal");
  assert.equal(game.state.reveal.strips.length, 2);
});
test("validates bounded drawing payloads and room capacity", () => {
  assert.equal(validStrokes(stroke), true);
  assert.equal(validStrokes(null), false);
  const g = new Game({ id: "a", name: "A" });
  for (let i = 0; i < 7; i++)
    assert.equal(g.join({ id: String(i), name: "X" }), true);
  assert.equal(g.join({ id: "full", name: "X" }), false);
});
