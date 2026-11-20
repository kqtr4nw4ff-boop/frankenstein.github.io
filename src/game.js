import { DEFAULT_SCHEMA, assignments } from "./schemas.js";
export const TURN_MS = 75000;
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
  constructor(host, now = Date.now) {
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
      strip: -1,
      done: false,
    });
    return true;
  }
  start(word, schema = DEFAULT_SCHEMA) {
    if (
      this.state.phase !== "lobby" ||
      this.state.players.length < 2 ||
      !word.trim()
    )
      return false;
    const tasks = assignments(schema, this.state.players.length);
    this.word = word.trim().slice(0, 100);
    this.drawings.clear();
    const order = [...this.state.players];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
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
        endsAt: this.now() + TURN_MS,
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
  snapshot() {
    return structuredClone({ ...this.state, revision: ++this.state.revision });
  }
}
