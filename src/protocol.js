// Keep each MQTT payload comfortably below public brokers' 64 KB limit.
const CHUNK = 8000;
export function packets(message, id = crypto.randomUUID()) {
  const data = JSON.stringify(message);
  if (data.length > 1400000) throw Error("Слишком большой рисунок");
  const total = Math.max(1, Math.ceil(data.length / CHUNK));
  return Array.from({ length: total }, (_, index) =>
    JSON.stringify({
      v: 1,
      id,
      index,
      total,
      data: data.slice(index * CHUNK, (index + 1) * CHUNK),
    }),
  );
}
export class Assembler {
  constructor(now = Date.now) {
    this.pending = new Map();
    this.now = now;
  }
  accept(topic, packet) {
    for (const [key, item] of this.pending)
      if (this.now() - item.at > 15000) this.pending.delete(key);
    if (
      !packet ||
      packet.v !== 1 ||
      typeof packet.id !== "string" ||
      packet.id.length > 64 ||
      !Number.isInteger(packet.total) ||
      packet.total < 1 ||
      packet.total > 175 ||
      !Number.isInteger(packet.index) ||
      packet.index < 0 ||
      packet.index >= packet.total ||
      typeof packet.data !== "string" ||
      packet.data.length > CHUNK
    )
      return null;
    const key = topic + ":" + packet.id;
    if (!this.pending.has(key)) {
      if (this.pending.size >= 8)
        this.pending.delete(this.pending.keys().next().value);
      this.pending.set(key, {
        at: this.now(),
        total: packet.total,
        parts: new Map(),
      });
    }
    const item = this.pending.get(key);
    if (item.total !== packet.total) {
      this.pending.delete(key);
      return null;
    }
    item.parts.set(packet.index, packet.data);
    if (item.parts.size !== item.total) return null;
    this.pending.delete(key);
    try {
      return JSON.parse(
        Array.from({ length: item.total }, (_, i) => item.parts.get(i)).join(
          "",
        ),
      );
    } catch {
      return null;
    }
  }
}
