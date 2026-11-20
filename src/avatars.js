export const AVATAR_COUNT = 24;
const shirts = [
  "#587c69",
  "#be7358",
  "#6882ac",
  "#9873aa",
  "#b99c43",
  "#658e8c",
];
const skin = ["#f2ccab", "#dba87b", "#a66c4e", "#754937"];
const hair = ["#40352e", "#a96935", "#353b43", "#d9bd8f", "#6f5146", "#714d73"];
const styles = [
  "M24 39Q18 14 48 17Q75 13 72 40L63 27Q46 35 29 28Z",
  "M23 39Q17 20 29 18L33 9L44 17L54 10L58 18Q79 22 72 40L62 27L30 30Z",
  "M22 40Q18 15 48 16Q77 15 74 42L64 38L61 26L31 29L29 43Z",
  "M24 36Q20 15 48 17Q69 13 72 38L59 30L33 30Z",
  "M23 39Q16 29 25 21Q26 11 38 17Q48 7 56 17Q74 13 75 32L70 40L61 28L31 28Z",
  "M25 37L28 23Q47 12 68 26L71 40L60 31L37 27Z",
];
export function avatarSvg(value) {
  const id =
      Number.isInteger(+value) && +value >= 0 && +value < AVATAR_COUNT
        ? +value
        : 0,
    shirt = shirts[id % 6],
    tone = skin[Math.floor(id / 6) % 4],
    color = hair[(id + Math.floor(id / 6)) % 6],
    bg = ["#e7ecdc", "#f5e3d2", "#e4e9f0", "#ede4ef"][Math.floor(id / 6)];
  return `<svg viewBox="0 0 96 96" role="img" aria-label="Персонаж ${id + 1}" xmlns="http://www.w3.org/2000/svg"><rect width="96" height="96" rx="26" fill="${bg}"/><path d="M16 96V83Q18 66 39 65H57Q79 67 80 83V96" fill="${shirt}"/><path d="M39 58H57V72Q48 82 39 72" fill="${tone}"/><ellipse cx="25" cy="44" rx="5" ry="7" fill="${tone}"/><ellipse cx="71" cy="44" rx="5" ry="7" fill="${tone}"/><path d="M25 32Q26 17 48 18Q70 17 71 33V47Q69 65 49 69Q28 66 25 49Z" fill="${tone}"/><path d="${styles[id % 6]}" fill="${color}"/><g fill="#34352f"><ellipse cx="38" cy="43" rx="2.5" ry="3"/><ellipse cx="58" cy="43" rx="2.5" ry="3"/></g><path d="M41 56Q48 ${id % 3 === 0 ? 65 : 60} 55 56" fill="none" stroke="#744b3c" stroke-width="2.5" stroke-linecap="round"/>${id % 4 === 0 ? '<g fill="none" stroke="#41483e" stroke-width="2"><rect x="30" y="37" width="16" height="13" rx="5"/><rect x="50" y="37" width="16" height="13" rx="5"/><path d="M46 41h4"/></g>' : ""}${id % 6 === 1 ? '<path d="M33 53Q48 70 64 53Q61 71 48 73Q35 68 33 53" fill="' + color + '" opacity=".6"/>' : ""}<path d="M38 80l10 6 10-6" fill="none" stroke="#ffffff55" stroke-width="2"/></svg>`;
}
export function avatarElement(id, className = "avatar") {
  const element = document.createElement("span");
  element.className = className;
  element.innerHTML = avatarSvg(id);
  return element;
}
