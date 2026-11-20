import { taskRoles } from "./task-roles.js";
import { connectTasks, sharedEdge, geometryText } from "./task-geometry.js";
import { validateContour } from "./contour.js";
export { DEFAULT_SCHEMA, BUILTIN_SCHEMAS } from "./schema-presets.js";
const finiteUnit = (n) => Number.isFinite(n) && n >= 0 && n <= 1;
export function overlaps(a, b) {
  return (
    Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.001 &&
    Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0.001
  );
}
export function validateSchema(data) {
  if (
    !data ||
    data.version !== 1 ||
    typeof data.name !== "string" ||
    !data.name.trim() ||
    data.name.length > 80
  )
    throw Error("Укажи название схемы (до 80 символов)");
  if (
    !Array.isArray(data.regions) ||
    data.regions.length < 2 ||
    data.regions.length > 32
  )
    throw Error("Нужно от 2 до 32 областей");
  const regions = data.regions.map((r, i) => {
    if (
      !r ||
      typeof r.label !== "string" ||
      !r.label.trim() ||
      r.label.length > 100 ||
      typeof r.instruction !== "string" ||
      r.instruction.length > 500
    )
      throw Error(`Подпиши задание для области ${i + 1}`);
    if (
      ![r.x, r.y, r.w, r.h].every(finiteUnit) ||
      r.w < 0.02 ||
      r.h < 0.02 ||
      r.x + r.w > 1.001 ||
      r.y + r.h > 1.001
    )
      throw Error("Область выходит за холст или слишком мала");
    return {
      id: `r${i}`,
      label: r.label.trim(),
      instruction: r.instruction,
      x: r.x,
      y: r.y,
      w: r.w,
      h: r.h,
    };
  });
  for (let i = 0; i < regions.length; i++)
    for (let j = i + 1; j < regions.length; j++)
      if (overlaps(regions[i], regions[j]))
        throw Error("Области пересекаются. Уменьши или перерисуй одну из них.");
  if (
    !Array.isArray(data.anchors) ||
    data.anchors.length > 100 ||
    !data.anchors.every((p) => p && finiteUnit(p.x) && finiteUnit(p.y))
  )
    throw Error("Некорректные метки стыков");
  if (
    data.reference !== undefined &&
    (typeof data.reference !== "string" ||
      data.reference.length > 1500000 ||
      !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(
        data.reference,
      ))
  )
    throw Error("Неверная картинка подложки");
  const layouts = {};
  if (data.layouts !== undefined) {
    if (
      !data.layouts ||
      typeof data.layouts !== "object" ||
      Array.isArray(data.layouts)
    )
      throw Error("Некорректные варианты схемы");
    for (const [count, layout] of Object.entries(data.layouts)) {
      if (!/^[2-8]$/.test(count) || !layout || typeof layout !== "object")
        throw Error("Варианты рассчитаны на 2–8 игроков");
      const normalized = validateSchema({
        version: 1,
        name: data.name,
        regions: layout.regions,
        anchors: layout.anchors,
      });
      layouts[count] = {
        regions: normalized.regions,
        anchors: normalized.anchors,
      };
    }
  }
  return {
    ...(data.contour ? { contour: validateContour(data.contour) } : {}),
    ...(Object.keys(layouts).length ? { layouts } : {}),
    ...(data.reference ? { reference: data.reference } : {}),
    version: 1,
    id:
      typeof data.id === "string" ? data.id.slice(0, 100) : crypto.randomUUID(),
    name: data.name.trim(),
    keywords: Array.isArray(data.keywords)
      ? data.keywords
          .filter((k) => typeof k === "string")
          .map((k) => k.slice(0, 50))
          .slice(0, 20)
      : [],
    regions,
    anchors: data.anchors.map((p) => ({
      x: p.x,
      y: p.y,
      ...(typeof p.group === "string" ? { group: p.group.slice(0, 64) } : {}),
      ...(typeof p.label === "string" ? { label: p.label.slice(0, 40) } : {}),
    })),
  };
}
export function contains(r, x, y, margin = 0) {
  return (
    x >= r.x - margin &&
    x <= r.x + r.w + margin &&
    y >= r.y - margin &&
    y <= r.y + r.h + margin
  );
}
// Remove seams inside a player's assignment when neighboring rectangles form one rectangle.
export function mergeRegions(input) {
  const regions = structuredClone(input),
    near = (a, b) => Math.abs(a - b) < 0.001;
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < regions.length; i++)
      for (let j = i + 1; j < regions.length; j++) {
        const a = regions[i],
          b = regions[j];
        let merged;
        if (
          near(a.y, b.y) &&
          near(a.h, b.h) &&
          (near(a.x + a.w, b.x) || near(b.x + b.w, a.x))
        )
          merged = { x: Math.min(a.x, b.x), y: a.y, w: a.w + b.w, h: a.h };
        if (
          near(a.x, b.x) &&
          near(a.w, b.w) &&
          (near(a.y + a.h, b.y) || near(b.y + b.h, a.y))
        )
          merged = { x: a.x, y: Math.min(a.y, b.y), w: a.w, h: a.h + b.h };
        if (merged) {
          regions[i] = { ...a, ...merged };
          regions.splice(j, 1);
          changed = true;
          break outer;
        }
      }
  }
  return regions;
}
export function assignments(schema, count) {
  if (!Number.isInteger(count) || count < 2 || count > 8)
    throw Error("В игре должно быть от 2 до 8 участников");
  const s = validateSchema(schema),
    layout = s.layouts?.[count] || s,
    regions = structuredClone(layout.regions),
    anchors = structuredClone(layout.anchors);
  while (regions.length < count) {
    const candidates = regions.filter(
      (r) =>
        !taskRoles(r.sourceLabel || r.label).some((role) =>
          ["head", "cap"].includes(role),
        ),
    );
    const largest = (candidates.length ? candidates : regions).reduce((a, r) =>
        r.w * r.h > a.w * a.h ? r : a,
      ),
      i = regions.indexOf(largest),
      r = largest;
    const horizontal = r.w >= r.h * 0.6;
    const first = {
        ...r,
        id: r.id + "a",
        sourceLabel: r.sourceLabel || r.label,
        partial: true,
      },
      second = {
        ...r,
        id: r.id + "b",
        sourceLabel: r.sourceLabel || r.label,
        partial: true,
      };
    if (horizontal) {
      first.w = r.w / 2;
      second.x = r.x + r.w / 2;
      second.w = r.w / 2;
      first.label += " · левая часть";
      second.label += " · правая часть";
      for (const f of [0.35, 0.65])
        anchors.push({
          x: second.x,
          y: r.y + r.h * f,
          group: r.id + "-join",
          label: "Продолжение",
        });
    } else {
      first.h = r.h / 2;
      second.y = r.y + r.h / 2;
      second.h = r.h / 2;
      first.label += " · верхняя часть";
      second.label += " · нижняя часть";
      for (const f of [0.35, 0.65])
        anchors.push({
          x: r.x + r.w * f,
          y: second.y,
          group: r.id + "-join",
          label: "Продолжение",
        });
    }
    regions.splice(i, 1, first, second);
  }
  const tasks = groupParts(regions, count).map((assigned) => {
    const merged = mergeRegions(assigned),
      label = assigned.map((r) => r.label).join(" + ");
    if (merged.length === 1) merged[0].label = label;
    return {
      label,
      instruction: "",
      partial: assigned.some((r) => r.partial),
      parts: assigned.map((r) => ({
        label: r.sourceLabel || r.label,
        scope: r.label,
        notes: r.instruction,
      })),
      regions: merged.map((r) => ({
        id: r.id,
        label: r.label,
        x: r.x,
        y: r.y,
        w: r.w,
        h: r.h,
      })),
      anchors: [],
    };
  });
  connectTasks(tasks, anchors);
  for (const task of tasks) task.instruction = geometryText(task);
  return tasks;
}
function groupParts(regions, count) {
  const groups = regions.map((r, index) => ({ parts: [r], order: index }));
  while (groups.length > count) {
    let choice = null,
      best = Infinity;
    for (let i = 0; i < groups.length; i++)
      for (let j = i + 1; j < groups.length; j++) {
        const a = groups[i],
          b = groups[j],
          connected = a.parts.some((x) =>
            b.parts.some((y) => sharedEdge(x, y)),
          ),
          merged = mergeRegions([...a.parts, ...b.parts]),
          roles = (g) =>
            new Set(
              g.parts.flatMap((r) => taskRoles(r.sourceLabel || r.label)),
            ),
          A = roles(a),
          B = roles(b),
          same = [...A].some((role) => B.has(role));
        const score =
          (connected ? 0 : 100) +
          (merged.length === 1 ? 0 : 10) +
          (same ? 0 : 2) +
          (a.parts.length + b.parts.length) * 0.01;
        if (score < best) {
          best = score;
          choice = [i, j];
        }
      }
    const [i, j] = choice;
    groups[i] = {
      parts: [...groups[i].parts, ...groups[j].parts],
      order: Math.min(groups[i].order, groups[j].order),
    };
    groups.splice(j, 1);
  }
  return groups.sort((a, b) => a.order - b.order).map((g) => g.parts);
}

const KEY = "frankenstein-schemas-v1";
export function loadSchemas() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]").map(validateSchema);
  } catch {
    return [];
  }
}
export function storeSchemas(schemas) {
  localStorage.setItem(KEY, JSON.stringify(schemas));
}
export function downloadSchema(schema) {
  const blob = new Blob([JSON.stringify(validateSchema(schema), null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = "frankenstein-schema.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
