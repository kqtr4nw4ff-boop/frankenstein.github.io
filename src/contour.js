const unit = (n) => Number.isFinite(n) && n >= 0 && n <= 1;
export function validateContour(points) {
  if (
    !Array.isArray(points) ||
    points.length < 3 ||
    points.length > 800 ||
    !points.every((p) => Array.isArray(p) && p.length === 2 && p.every(unit))
  )
    throw Error("Обведи один силуэт внутри холста");
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  if (Math.abs(area) < 0.01)
    throw Error("Контур слишком маленький. Обведи зверя целиком");
  return points.map((p) => p.map((v) => Math.round(v * 10000) / 10000));
}
// Simplify freehand input without requiring pixel or image processing services.
export function simplifyContour(points, epsilon = 0.003) {
  if (points.length <= 3) return points;
  const a = points[0],
    b = points.at(-1),
    dx = b[0] - a[0],
    dy = b[1] - a[1],
    length = dx * dx + dy * dy;
  let distance = 0,
    index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i],
      t = length
        ? Math.max(
            0,
            Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length),
          )
        : 0,
      d = Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
    if (d > distance) {
      distance = d;
      index = i;
    }
  }
  if (distance <= epsilon) return [a, b];
  return [
    ...simplifyContour(points.slice(0, index + 1), epsilon).slice(0, -1),
    ...simplifyContour(points.slice(index), epsilon),
  ];
}
function clip(points, axis, value, greater) {
  const output = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length],
      inside = (p) => (greater ? p[axis] >= value : p[axis] <= value),
      A = inside(a),
      B = inside(b);
    if (A) output.push(a);
    if (A !== B) {
      const t = (value - a[axis]) / (b[axis] - a[axis]);
      output.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
  }
  return output;
}
export function sliceContour(raw, count, axis = "y") {
  const contour = validateContour(raw);
  if (!Number.isInteger(count) || count < 2 || count > 8)
    throw Error("Выбери от 2 до 8 частей");
  if (!["x", "y"].includes(axis)) throw Error("Выбери направление разрезов");
  const index = axis === "x" ? 0 : 1,
    other = 1 - index,
    values = contour.map((p) => p[index]),
    min = Math.min(...values),
    max = Math.max(...values),
    cuts = Array.from(
      { length: count + 1 },
      (_, i) => min + ((max - min) * i) / count,
    ),
    regions = [],
    anchors = [];
  for (let i = 0; i < count; i++) {
    const polygon = clip(
      clip(contour, index, cuts[i], true),
      index,
      cuts[i + 1],
      false,
    );
    if (polygon.length < 3)
      throw Error("Между частями есть пустота. Попробуй другое направление");
    const xs = polygon.map((p) => p[0]),
      ys = polygon.map((p) => p[1]),
      x = Math.min(...xs),
      y = Math.min(...ys),
      w = Math.max(...xs) - x,
      h = Math.max(...ys) - y;
    if (w < 0.02 || h < 0.02)
      throw Error("Части получились слишком узкими. Уменьши их число");
    const label =
      i === 0
        ? "Голова"
        : count === 2
          ? "Туловище"
          : i === count - 1
            ? "Нижняя часть / хвост"
            : `Туловище · часть ${i}`;
    regions.push({
      id: `contour-${i}`,
      x,
      y,
      w,
      h,
      label,
      instruction:
        "Ориентируйся на план и синие метки. Продолжи контур к соседним частям.",
    });
  }
  for (let i = 1; i < count; i++) {
    const cut = cuts[i],
      crossings = [];
    for (let j = 0; j < contour.length; j++) {
      const a = contour[j],
        b = contour[(j + 1) % contour.length];
      if (
        (a[index] <= cut && b[index] > cut) ||
        (b[index] <= cut && a[index] > cut)
      ) {
        const t = (cut - a[index]) / (b[index] - a[index]);
        crossings.push(a[other] + t * (b[other] - a[other]));
      }
    }
    crossings.sort((a, b) => a - b);
    const unique = crossings.filter(
      (v, j) => !j || v - crossings[j - 1] > 0.0001,
    );
    for (let j = 0; j + 1 < unique.length; j += 2)
      for (const position of [unique[j], unique[j + 1]])
        anchors.push({
          x: index === 0 ? cut : position,
          y: index === 1 ? cut : position,
          group: `contour-${i}-${j}`,
          label: i === 1 ? "Шея / стык" : `Стык ${i}`,
        });
  }
  return { regions, anchors };
}
