const NS = "http://www.w3.org/2000/svg";
function svgElement(name, attributes = {}) {
  const element = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes))
    element.setAttribute(key, String(value));
  return element;
}
function labelLines(label, limit) {
  const words = label.split(/\s+/),
    lines = [];
  let line = "";
  for (const word of words) {
    if (line && line.length + word.length + 1 > limit) {
      lines.push(line);
      line = word;
    } else line += (line ? " " : "") + word;
  }
  if (line) lines.push(line);
  return lines
    .slice(0, 3)
    .map((line, i) => (i === 2 && lines.length > 3 ? line + "…" : line));
}
// Only task geometry and labels enter this view. Never pass strokes or reference images here.
export function renderOverview(container, players, ownId = null) {
  const participants = players
    .filter((p) => p.strip >= 0 && p.task)
    .sort((a, b) => a.strip - b.strip);
  const svg = svgElement("svg", {
    viewBox: "-24 -24 1048 673",
    role: "img",
    "aria-label": "План рисунка: твой фрагмент выделен цветом",
    "data-fragments": participants.length,
  });
  for (const player of participants) {
    const active = player.id === ownId,
      group = svgElement("g", {
        "data-fragment": player.strip,
        "data-active": active,
        "aria-label": `${player.strip + 1}. ${player.task.label}${active ? " — твой фрагмент" : ""}`,
      });
    const title = svgElement("title");
    title.textContent = group.getAttribute("aria-label");
    group.append(title);
    for (const r of player.task.regions) {
      const x = r.x * 1000,
        y = r.y * 625,
        w = r.w * 1000,
        h = r.h * 625;
      group.append(
        svgElement("rect", {
          x: x + 5,
          y: y + 5,
          width: Math.max(1, w - 10),
          height: Math.max(1, h - 10),
          rx: Math.min(18, w * 0.08, h * 0.08),
          fill: active ? "#ffd078" : "#e8eae4",
          stroke: active ? "#b76b1b" : "#bcc2b8",
          "stroke-width": active ? 4 : 2,
        }),
      );
      const font = Math.max(20, Math.min(46, w / 5, h / 3));
      const lines = labelLines(
        r.label || player.task.label,
        Math.max(8, Math.floor((w / font) * 1.6)),
      );
      const text = svgElement("text", {
        x: x + w / 2,
        y: y + h / 2 - (lines.length - 1) * font * 0.58,
        "text-anchor": "middle",
        fill: active ? "#54371b" : "#62695f",
        "font-size": font,
        "font-family": "system-ui,sans-serif",
        "font-weight": active ? 750 : 550,
      });
      lines.forEach((line, i) => {
        const span = svgElement("tspan", {
          x: x + w / 2,
          dy: i ? font * 1.18 : 0,
        });
        span.textContent = line;
        text.append(span);
      });
      group.append(text);
      const number = svgElement("text", {
        x: x + Math.min(22, w * 0.12),
        y: y + Math.min(35, h * 0.22),
        fill: active ? "#88521c" : "#7c8277",
        "font-size": Math.min(24, h * 0.18),
        "font-family": "system-ui",
        "font-weight": 700,
      });
      number.textContent = player.strip + 1;
      group.append(number);
    }
    svg.append(group);
  }
  container.replaceChildren(svg);
}
export function previewPlayers(tasks) {
  return tasks.map((task, strip) => ({ id: `preview-${strip}`, strip, task }));
}
