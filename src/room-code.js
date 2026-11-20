const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function makeRoomCode() {
  const random = crypto.getRandomValues(new Uint32Array(6));
  return [...random].map((n) => ALPHABET[n % ALPHABET.length]).join("");
}
export function parseRoomCode(value) {
  let text = value.trim();
  if (text.includes("#")) {
    try {
      text = new URL(text).hash.slice(1);
    } catch {
      throw Error("Вставь код комнаты или приглашение целиком");
    }
  }
  text = text.toUpperCase().replace(/\s/g, "");
  if (!/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/.test(text))
    throw Error("Нужен код комнаты из 6 символов");
  return text;
}
