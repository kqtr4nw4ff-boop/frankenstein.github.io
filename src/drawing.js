import { floodRuns } from "./fill.js";
import { MAX_POINTS } from "./game.js";
import { contains } from "./schemas.js";
export const PALETTE = [
  "#2b2b33",
  "#ef476f",
  "#3a86ff",
  "#2fbf71",
  "#ff9f1c",
  "#9b5de5",
  "#8d5524",
  "#00b4d8",
];
export function seamGuides(task) {
  const groups = new Map();
  for (const p of task.anchors) {
    const r = task.regions.find((r) => contains(r, p.x, p.y, 0.005));
    if (!r) continue;
    const axis =
      Math.abs(p.x - r.x) < 0.005 || Math.abs(p.x - r.x - r.w) < 0.005
        ? "x"
        : "y";
    const key = p.group || `${axis}:${Math.round(p[axis] * 1000)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  return [...groups.values()]
    .filter((points) => points.length >= 2)
    .map((points) => {
      const a = points[0],
        b = points.at(-1),
        x = (a.x + b.x) / 2,
        y = (a.y + b.y) / 2;
      const r = task.regions.find((r) => contains(r, x, y, 0.005));
      if (!r) return null;
      let dx = 0,
        dy = 0;
      if (Math.abs(x - r.x) < 0.005) dx = 1;
      else if (Math.abs(x - r.x - r.w) < 0.005) dx = -1;
      else if (Math.abs(y - r.y) < 0.005) dy = 1;
      else if (Math.abs(y - r.y - r.h) < 0.005) dy = -1;
      return { a, b, x, y, dx, dy, label: a.label || "Стык", region: r };
    })
    .filter(Boolean);
}
function drawGuides(c, task, W, H) {
  c.save();
  c.beginPath();
  for (const r of task.regions) c.rect(r.x * W, r.y * H, r.w * W, r.h * H);
  c.clip();
  for (const g of seamGuides(task)) {
    const ax = g.a.x * W,
      ay = g.a.y * H,
      bx = g.b.x * W,
      by = g.b.y * H,
      len = Math.min(W, H) * 0.08,
      dx = g.dx * len,
      dy = g.dy * len;
    c.fillStyle = "#3a86ff16";
    c.beginPath();
    c.moveTo(ax, ay);
    c.lineTo(bx, by);
    c.lineTo(bx + dx, by + dy);
    c.lineTo(ax + dx, ay + dy);
    c.closePath();
    c.fill();
    c.strokeStyle = "#3a86ff88";
    c.lineWidth = 3;
    c.setLineDash([9, 8]);
    c.beginPath();
    c.moveTo(ax, ay);
    c.lineTo(ax + dx, ay + dy);
    c.moveTo(bx, by);
    c.lineTo(bx + dx, by + dy);
    c.stroke();
    c.setLineDash([]);
    c.strokeStyle = "#3a86ff";
    c.lineWidth = 7;
    c.beginPath();
    c.moveTo(ax, ay);
    c.lineTo(bx, by);
    c.stroke();
    const mx = g.x * W,
      my = g.y * H;
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(mx + dx * 0.9, my + dy * 0.9);
    c.lineTo(mx + dx * 0.3, my + dy * 0.3);
    const tx = mx + dx * 0.3,
      ty = my + dy * 0.3;
    c.moveTo(tx + g.dx * 14 - g.dy * 12, ty + g.dy * 14 + g.dx * 12);
    c.lineTo(tx, ty);
    c.lineTo(tx + g.dx * 14 + g.dy * 12, ty + g.dy * 14 - g.dx * 12);
    c.stroke();
    c.fillStyle = "#245ba6";
    c.font = "bold 24px system-ui";
    c.textAlign = g.dx > 0 ? "left" : g.dx < 0 ? "right" : "center";
    c.textBaseline = g.dy > 0 ? "top" : "bottom";
    c.fillText(
      g.label,
      mx + dx * 1.1,
      my + dy * 1.1,
      Math.max(60, g.region.w * W - 24),
    );
  }
  c.restore();
}
const fillCache = new WeakMap();
export function paint(canvas, fragments, activeTask = null, plan = []) {
  const c = canvas.getContext("2d"),
    W = canvas.width,
    H = canvas.height;
  c.fillStyle = activeTask ? "#e5dfd4" : "#fff8ec";
  c.fillRect(0, 0, W, H);
  if (activeTask) {
    for (const task of plan) {
      c.fillStyle = "#e8eae4";
      c.strokeStyle = "#bdc5b8";
      c.lineWidth = 2;
      c.setLineDash([10, 12]);
      for (const r of task.regions) {
        c.fillRect(r.x * W, r.y * H, r.w * W, r.h * H);
        c.strokeRect(r.x * W + 2, r.y * H + 2, r.w * W - 4, r.h * H - 4);
      }
    }
    c.setLineDash([]);
  }
  if (activeTask) {
    c.fillStyle = "#fff8ec";
    for (const r of activeTask.regions)
      c.fillRect(r.x * W, r.y * H, r.w * W, r.h * H);
  }

  for (const fragment of fragments) {
    c.save();
    c.beginPath();
    for (const r of fragment.task.regions)
      c.rect(r.x * W, r.y * H, r.w * W, r.h * H);
    c.clip();
    for (const s of fragment.strokes) {
      c.strokeStyle = c.fillStyle = s.c;
      c.lineWidth = (s.w * H) / 1000;
      c.lineCap = c.lineJoin = "round";
      const pts = s.pts.map(([x, y]) => [x * W, y * H]);
      if (!pts.length) continue;
      if (s.tool === "fill") {
        let path = fillCache.get(s);
        if (!path) {
          path = new Path2D();
          const pixels = c.getImageData(0, 0, W, H).data;
          for (const run of floodRuns(
            pixels,
            W,
            H,
            pts[0][0],
            pts[0][1],
            fragment.task.regions,
          ))
            path.rect(run.x, run.y, run.length, 1);
          fillCache.set(s, path);
        }
        c.fill(path);
        continue;
      }
      c.beginPath();
      if (["rect", "ellipse"].includes(s.tool) && pts.length === 2) {
        const x = Math.min(pts[0][0], pts[1][0]),
          y = Math.min(pts[0][1], pts[1][1]),
          w = Math.abs(pts[1][0] - pts[0][0]),
          h = Math.abs(pts[1][1] - pts[0][1]);
        if (s.tool === "rect") c.rect(x, y, w, h);
        else c.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
        if (s.filled) c.fill();
        c.stroke();
        continue;
      }
      c.moveTo(...pts[0]);
      if (pts.length === 1) {
        c.arc(...pts[0], c.lineWidth / 2, 0, Math.PI * 2);
        c.fill();
      } else {
        for (const p of pts.slice(1)) c.lineTo(...p);
        c.stroke();
      }
    }
    c.restore();
  }
  if (activeTask) {
    drawGuides(c, activeTask, W, H);
    c.strokeStyle = "#dc9c23";
    c.lineWidth = 4;
    c.setLineDash([12, 10]);
    for (const r of activeTask.regions)
      c.strokeRect(r.x * W + 2, r.y * H + 2, r.w * W - 4, r.h * H - 4);
    c.setLineDash([]);
    c.fillStyle = "#ef476f";
    for (const p of activeTask.anchors) {
      c.beginPath();
      c.arc(p.x * W, p.y * H, 8, 0, Math.PI * 2);
      c.fill();
    }
  }
}
export class Drawing {
  constructor(canvas, canDraw, task, changed, plan = () => []) {
    this.plan = plan;
    this.canvas = canvas;
    this.canDraw = canDraw;
    this.task = task;
    this.changed = changed;
    this.strokes = [];
    this.current = null;
    this.pointer = null;
    this.color = PALETTE[0];
    this.width = 9;
    this.tool = "pen";
    this.filled = false;
    canvas.addEventListener("pointerdown", (e) => {
      if (
        e.button !== 0 ||
        !canDraw() ||
        this.pointer !== null ||
        this.strokes.length >= 400 ||
        this.pointsUsed() >= MAX_POINTS
      )
        return;
      const p = this.point(e);
      if (!this.task()?.regions.some((r) => contains(r, ...p))) return;
      this.pointer = e.pointerId;
      canvas.setPointerCapture(e.pointerId);
      this.current = {
        tool: this.tool,
        filled: this.filled,
        c: this.color,
        w: this.width,
        pts: this.tool === "pen" || this.tool === "fill" ? [p] : [p, p],
      };
      if (this.tool === "fill") {
        this.finish();
        return;
      }
      this.render();
    });
    canvas.addEventListener("pointermove", (e) => {
      if (e.pointerId !== this.pointer || !this.current) return;
      if (this.current.tool !== "pen") this.current.pts[1] = this.point(e);
      else if (this.current.pts.length < 2000 && this.pointsUsed() < MAX_POINTS)
        this.current.pts.push(this.point(e));
      this.render();
    });
    for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
      canvas.addEventListener(event, (e) => {
        if (e.pointerId === this.pointer) this.finish();
      });
  }
  point(e) {
    const r = this.canvas.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height].map(
      (v) => Math.round(Math.max(0, Math.min(1, v)) * 10000) / 10000,
    );
  }
  pointsUsed() {
    return (
      this.strokes.reduce((n, s) => n + s.pts.length, 0) +
      (this.current?.pts.length || 0)
    );
  }
  finish() {
    if (this.current) this.strokes.push(this.current);
    this.current = null;
    this.pointer = null;
    this.changed(this.strokes);
    this.render();
  }
  reset(strokes = []) {
    this.current = null;
    this.pointer = null;
    this.strokes = strokes;
    this.render();
  }
  undo() {
    if (this.canDraw()) {
      this.finish();
      this.strokes.pop();
      this.changed(this.strokes);
      this.render();
    }
  }
  render() {
    const task = this.task();
    paint(
      this.canvas,
      task
        ? [
            {
              task,
              strokes: [
                ...this.strokes,
                ...(this.current ? [this.current] : []),
              ],
            },
          ]
        : [],
      task,
      this.plan(),
    );
  }
}
