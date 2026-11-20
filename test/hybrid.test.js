import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/game.js";
import { BUILTIN_SCHEMAS, assignments } from "../src/schemas.js";
import { taskRoles } from "../src/task-roles.js";
import { playerStatus } from "../src/player-status.js";
test("all 60 schemes assign independent role-correct briefs for 2–8 people", () => {
  for (const schema of BUILTIN_SCHEMAS)
    for (let count = 2; count <= 8; count++) {
      const game = new Game(
        { id: "p0", name: "Нулевой" },
        () => 1000,
        () => 0.42,
      );
      for (let i = 1; i < count; i++)
        game.join({ id: "p" + i, name: "Художник " + i });
      game.start("Общее секретное слово", schema);
      const players = game.state.players;
      assert.equal(new Set(players.map((p) => p.task.concept.id)).size, count);
      for (const p of players) {
        const roles = [
          ...new Set(p.task.parts.flatMap((r) => taskRoles(r.label))),
        ].sort();
        assert.deepEqual(p.task.briefs.map((b) => b.role).sort(), roles);
        assert.ok(p.task.briefs.every((b) => b.text && b.label));
        assert.equal(p.task.notes, undefined);
        for (const brief of p.task.briefs)
          if (brief.role === "wings")
            assert.doesNotMatch(brief.text, /тапоч|лап|хвост/i);
        const own = game.snapshot(p.id, false);
        assert.ok(own.players.find((q) => q.id === p.id).task.briefs.length);
        for (const other of own.players.filter((q) => q.id !== p.id)) {
          assert.equal(other.task.concept, undefined);
          assert.equal(other.task.briefs, undefined);
          assert.equal(other.task.parts, undefined);
        }
      }
    }
});
test("connections survive splitting and have matching geometry on exactly two tasks", () => {
  for (const schema of BUILTIN_SCHEMAS.slice(0, 12))
    for (let count = 2; count <= 8; count++) {
      const tasks = assignments(schema, count),
        groups = new Map();
      for (let i = 0; i < tasks.length; i++)
        for (const p of tasks[i].anchors) {
          if (!groups.has(p.group)) groups.set(p.group, new Map());
          const owners = groups.get(p.group);
          if (!owners.has(i)) owners.set(i, []);
          owners.get(i).push([p.x, p.y]);
        }
      for (const owners of groups.values()) {
        assert.equal(owners.size, 2);
        const [a, b] = [...owners.values()];
        assert.equal(a.length, 2);
        assert.deepEqual(a, b);
      }
    }
});
test("task identity stays separate from the current artist and restores after reload", () => {
  const game = new Game({ id: "a", name: "Аня" }, () => 1000);
  game.join({ id: "b", name: "Боря" });
  game.start("Кот");
  const active = game.state.turn.pid,
    waiting = active === "a" ? "b" : "a";
  const view = playerStatus(game.state, waiting, { now: 1100 });
  assert.equal(view.kind, "waiting");
  assert.match(view.overlay, /Твой ход ещё не начался/);
  assert.equal(playerStatus(game.state, active, { now: 1100 }).kind, "active");
  const restored = Game.restore(
    JSON.parse(JSON.stringify(game.serialize())),
    () => 1200,
  );
  assert.equal(restored.state.turn.endsAt, game.state.turn.endsAt);
  assert.deepEqual(
    restored.state.players.map((p) => p.task),
    game.state.players.map((p) => p.task),
  );
  assert.equal(
    playerStatus(game.state, waiting, { pending: true }).kind,
    "pending",
  );
});
