const EPS = 0.004;
export function sharedEdge(a, b) {
  const top = Math.max(a.y, b.y),
    bottom = Math.min(a.y + a.h, b.y + b.h),
    left = Math.max(a.x, b.x),
    right = Math.min(a.x + a.w, b.x + b.w);
  if (
    bottom - top > EPS &&
    (Math.abs(a.x + a.w - b.x) < EPS || Math.abs(b.x + b.w - a.x) < EPS)
  )
    return {
      axis: "x",
      at: Math.abs(a.x + a.w - b.x) < EPS ? b.x : a.x,
      lo: top,
      hi: bottom,
    };
  if (
    right - left > EPS &&
    (Math.abs(a.y + a.h - b.y) < EPS || Math.abs(b.y + b.h - a.y) < EPS)
  )
    return {
      axis: "y",
      at: Math.abs(a.y + a.h - b.y) < EPS ? b.y : a.y,
      lo: left,
      hi: right,
    };
  return null;
}
// Clip every connection to the actual shared edge after merging/splitting tasks.
// Both artists receive exactly the same pair, including when a neighboring part was split.
export function connectTasks(tasks, source) {
  tasks.forEach((t) => (t.anchors = []));
  for (let i = 0; i < tasks.length; i++)
    for (let j = i + 1; j < tasks.length; j++)
      for (let a = 0; a < tasks[i].regions.length; a++)
        for (let b = 0; b < tasks[j].regions.length; b++) {
          const edge = sharedEdge(tasks[i].regions[a], tasks[j].regions[b]);
          if (!edge) continue;
          const axis = edge.axis,
            other = axis === "x" ? "y" : "x",
            groups = new Map();
          for (const p of source)
            if (Math.abs(p[axis] - edge.at) < EPS) {
              const key = p.group || "legacy";
              if (!groups.has(key)) groups.set(key, []);
              groups.get(key).push(p);
            }
          for (const [id, points] of groups) {
            points.sort((p, q) => p[other] - q[other]);
            for (let n = 0; n < points.length; n += 2) {
              if (!points[n + 1]) {
                const position = points[n][other];
                if (position >= edge.lo && position <= edge.hi) {
                  const p = {
                    x: axis === "x" ? edge.at : position,
                    y: axis === "y" ? edge.at : position,
                    group: `${id}:${i}:${j}:point`,
                    label: points[n].label || "Стык",
                  };
                  tasks[i].anchors.push({ ...p });
                  tasks[j].anchors.push({ ...p });
                }
                continue;
              }
              const lo = Math.max(edge.lo, points[n][other]),
                hi = Math.min(edge.hi, points[n + 1][other]);
              if (hi - lo < EPS) continue;
              const group = `${id}:${i}:${j}:${a}:${b}:${n}`;
              const pair = [lo, hi].map((v) => ({
                x: axis === "x" ? edge.at : v,
                y: axis === "y" ? edge.at : v,
                group,
                label: points[n].label || "Стык",
              }));
              tasks[i].anchors.push(...pair.map((p) => ({ ...p })));
              tasks[j].anchors.push(...pair.map((p) => ({ ...p })));
            }
          }
        }
  return tasks;
}
export function geometryText(task) {
  const notes = [];
  for (const p of task.anchors) {
    const r = task.regions.find(
      (r) =>
        p.x >= r.x - EPS &&
        p.x <= r.x + r.w + EPS &&
        p.y >= r.y - EPS &&
        p.y <= r.y + r.h + EPS,
    );
    if (!r) continue;
    const side =
      Math.abs(p.x - r.x) < EPS
        ? "слева"
        : Math.abs(p.x - r.x - r.w) < EPS
          ? "справа"
          : Math.abs(p.y - r.y) < EPS
            ? "сверху"
            : "снизу";
    const text = `${p.label || "Стык"} — ${side}`;
    if (!notes.includes(text)) notes.push(text);
  }
  return (
    (task.partial ? "Рисуй только свою часть выделенного участка. " : "") +
    (notes.length
      ? notes.join(" · ") + ". Соедини контур между парными синими метками."
      : "Рисуй внутри своего жёлтого участка.")
  );
}
