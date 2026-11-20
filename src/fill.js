// Scanline flood fill; store compact horizontal runs rather than full bitmap layers.
export function floodRuns(
  pixels,
  width,
  height,
  x,
  y,
  regions,
  tolerance = 24,
) {
  x = Math.max(0, Math.min(width - 1, Math.floor(x)));
  y = Math.max(0, Math.min(height - 1, Math.floor(y)));
  const mask = new Uint8Array(width * height),
    visited = new Uint8Array(width * height);
  for (const r of regions) {
    const left = Math.max(0, Math.ceil(r.x * width)),
      right = Math.min(width, Math.ceil((r.x + r.w) * width));
    for (
      let row = Math.max(0, Math.ceil(r.y * height));
      row < Math.min(height, Math.ceil((r.y + r.h) * height));
      row++
    )
      mask.fill(1, row * width + left, row * width + right);
  }
  const seed = (y * width + x) * 4,
    target = [
      pixels[seed],
      pixels[seed + 1],
      pixels[seed + 2],
      pixels[seed + 3],
    ],
    stack = [y * width + x],
    runs = [];
  const matches = (i) =>
    mask[i] &&
    !visited[i] &&
    target.every((v, c) => Math.abs(v - pixels[i * 4 + c]) <= tolerance);
  while (stack.length) {
    const index = stack.pop();
    if (!matches(index)) continue;
    const row = Math.floor(index / width);
    let left = index % width;
    while (left > 0 && matches(row * width + left - 1)) left--;
    let right = left;
    while (right < width && matches(row * width + right)) {
      visited[row * width + right] = 1;
      right++;
    }
    runs.push({ x: left, y: row, length: right - left });
    for (const dy of [-1, 1]) {
      if (row + dy < 0 || row + dy >= height) continue;
      let inSpan = false;
      for (let col = left; col < right; col++) {
        const next = (row + dy) * width + col;
        if (matches(next)) {
          if (!inSpan) stack.push(next);
          inSpan = true;
        } else inSpan = false;
      }
    }
  }
  return runs;
}
