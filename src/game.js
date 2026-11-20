import { hybridTasks } from "./hybrid.js";
import { DEFAULT_SCHEMA, BUILTIN_SCHEMAS, assignments } from "./schemas.js";
export const TURN_MS = 60000;
export const MAX_PLAYERS = 8;
export const MAX_POINTS = 4000;
export const id = () => crypto.randomUUID();
export function validStrokes(strokes) {
  return (
    Array.isArray(strokes) &&
    strokes.length <= 400 &&
    strokes.reduce(
      (n, s) => n + (Array.isArray(s?.pts) ? s.pts.length : MAX_POINTS + 1),
      0,
    ) <= MAX_POINTS &&
    strokes.every(
      (s) =>
        s &&
        [undefined, "pen", "fill", "line", "rect", "ellipse"].includes(
          s.tool,
        ) &&
        (s.filled === undefined || typeof s.filled === "boolean") &&
        (s.tool !== "fill" || s.pts?.length === 1) &&
        (!["line", "rect", "ellipse"].includes(s.tool) ||
          s.pts?.length === 2) &&
        /^#[0-9a-f]{6}$/i.test(s.c) &&
        Number.isFinite(s.w) &&
        s.w >= 3 &&
        s.w <= 30 &&
        Array.isArray(s.pts) &&
        s.pts.length > 0 &&
        s.pts.length <= 2000 &&
        s.pts.every(
          (p) =>
            Array.isArray(p) &&
            p.length === 2 &&
            p.every((v) => Number.isFinite(v) && v >= 0 && v <= 1),
        ),
    )
  );
}
export class Game {
  constructor(host, now = Date.now, random = Math.random) {
    this.random = random;
    this.now = now;
    this.state = {
      hostId: host.id,
      revision: 0,
      round: "",
      phase: "lobby",
      players: [{ ...host, strip: -1, done: false }],
      turn: null,
      reveal: null,
    };
    this.word = "";
    this.drawings = new Map();
  }
  join(player) {
    if (this.state.players.some((p) => p.id === player.id)) return true;
    if (
      this.state.players.length >= MAX_PLAYERS ||
      typeof player.name !== "string"
    )
      return false;
    this.state.players.push({
      id: player.id,
      name: player.name.slice(0, 32),
      avatarId: Number.isInteger(player.avatarId) ? player.avatarId : 0,
      online: player.online !== false,
      strip: -1,
      done: false,
    });
    return true;
  }
  start(word, schema = DEFAULT_SCHEMA, seconds = TURN_MS / 1000) {
    if (
      this.state.phase !== "lobby" ||
      this.state.players.length < 2 ||
      !word.trim() ||
      !Number.isInteger(seconds) ||
      seconds < 10 ||
      seconds > 180 ||
      seconds % 10 !== 0
    )
      return false;
    const tasks = hybridTasks(
      assignments(schema, this.state.players.length),
      this.random,
    );
    if (!BUILTIN_SCHEMAS.some((s) => s.id === schema.id))
      for (const task of tasks)
        task.notes = task.parts
          .filter((p) => p.notes)
          .map((p) => `${p.scope}: ${p.notes}`);
    this.turnMs = seconds * 1000;
    this.word = word.trim().slice(0, 100);
    this.drawings.clear();
    const order = [...this.state.players];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    order.forEach((p, i) => {
      p.strip = i;
      p.task = tasks[i];
      p.done = false;
    });
    Object.assign(this.state, { phase: "play", round: id(), reveal: null });
    this.next();
    return true;
  }
  next() {
    const p = [...this.state.players]
      .sort((a, b) => a.strip - b.strip)
      .find((p) => p.strip >= 0 && !p.done);
    if (p)
      this.state.turn = {
        pid: p.id,
        strip: p.strip,
        durationMs: this.turnMs,
        endsAt: this.now() + this.turnMs,
      };
    else {
      this.state.phase = "reveal";
      this.state.turn = null;
      this.state.reveal = {
        word: this.word,
        strips: this.state.players
          .filter((p) => p.strip >= 0)
          .map((p) => ({
            strip: p.strip,
            artist: p.name,
            avatarId: p.avatarId || 0,
            pid: p.id,
            strokes: this.drawings.get(p.id) || [],
            task: p.task,
          })),
      };
    }
  }
  submit(m) {
    const s = this.state,
      p = s.players.find((p) => p.id === m.pid);
    if (s.phase !== "play" || m.round !== s.round || !p || p.strip !== m.strip)
      return false;
    if (p.done) return true; // QoS 1 and retries can deliver duplicates.
    if (s.turn?.pid !== p.id || !validStrokes(m.strokes)) return false;
    this.drawings.set(
      p.id,
      m.strokes.map((s) => ({
        c: s.c,
        w: s.w,
        tool: s.tool || "pen",
        filled: !!s.filled,
        pts: s.pts.map((point) =>
          point.map((v) => Math.round(v * 10000) / 10000),
        ),
      })),
    );
    p.done = true;
    this.next();
    return true;
  }
  tick() {
    if (
      this.state.phase !== "play" ||
      this.now() < this.state.turn.endsAt + 3000
    )
      return false;
    const p = this.state.players.find((p) => p.id === this.state.turn.pid);
    p.done = true;
    this.next();
    return true;
  }
  again() {
    if (this.state.phase !== "reveal") return;
    Object.assign(this.state, { phase: "lobby", turn: null, reveal: null });
    this.state.players.forEach((p) => {
      p.strip = -1;
      p.done = false;
      delete p.task;
    });
    this.drawings.clear();
    this.word = "";
  }
  serialize() {
    return {
      version: 1,
      state: structuredClone(this.state),
      word: this.word,
      turnMs: this.turnMs || TURN_MS,
      drawings: Object.fromEntries(this.drawings),
    };
  }
  static restore(data, now = Date.now) {
    if (
      data?.version !== 1 ||
      !Array.isArray(data.state?.players) ||
      !data.state.players.some((p) => p.id === data.state.hostId)
    )
      throw Error("Не удалось восстановить комнату");
    const game = new Game(
      data.state.players.find((p) => p.id === data.state.hostId),
      now,
    );
    game.state = structuredClone(data.state);
    game.word = data.word || "";
    game.turnMs = data.turnMs || TURN_MS;
    game.drawings = new Map(Object.entries(data.drawings || {}));
    return game;
  }
  snapshot(viewerId = this.state.hostId, advance = true) {
    if (advance) this.state.revision++;
    const snapshot = structuredClone(this.state);
    if (snapshot.phase !== "reveal")
      for (const p of snapshot.players)
        if (p.id !== viewerId && p.task)
          p.task = {
            label: p.task.label,
            regions: p.task.regions.map((r) => ({
              id: r.id,
              label: r.label,
              x: r.x,
              y: r.y,
              w: r.w,
              h: r.h,
            })),
            anchors: p.task.anchors,
          };
    return snapshot;
  }
}
