import { packets, Assembler } from "./protocol.js";
import mqtt from "mqtt";
export const DEFAULT_BROKER = "wss://public:public@public.cloud.shiftr.io";
export function allowedBroker(value) {
  const url = new URL(value);
  return (
    url.protocol === "wss:" ||
    (typeof location !== "undefined" &&
      ["localhost", "127.0.0.1"].includes(location.hostname) &&
      url.protocol === "ws:" &&
      ["localhost", "127.0.0.1"].includes(url.hostname))
  );
}
export function invitation(room, broker) {
  return btoa(JSON.stringify({ v: 1, room, broker }));
}
export function parseInvitation(value) {
  let token = value.trim();
  if (token.includes("#")) token = new URL(token).hash.slice(1);
  const data = JSON.parse(atob(token));
  if (
    data.v !== 1 ||
    !/^[a-f0-9]{32}$/.test(data.room) ||
    !allowedBroker(data.broker)
  )
    throw Error("Неверное приглашение");
  return data;
}
export class Network {
  constructor({ room, broker, pid, host, onMessage, onReady, onStatus }) {
    this.base = `frankenstein/v1/${room}`;
    const assembler = new Assembler();
    this.client = mqtt.connect(broker, {
      clientId: `frk-${pid}`,
      clean: true,
      keepalive: 20,
      connectTimeout: 10000,
      reconnectPeriod: 2500,
      resubscribe: false,
    });
    this.client.on("message", (topic, bytes) => {
      if (bytes.length > 1500000) return;
      try {
        const path = topic.slice(this.base.length + 1);
        const message = assembler.accept(path, JSON.parse(bytes.toString()));
        if (message) onMessage(path, message);
      } catch (e) {
        console.warn("Сообщение отклонено", e);
      }
    });
    this.client.on("connect", () => {
      this.client.subscribe(
        host ? `${this.base}/in/+` : `${this.base}/out/${pid}`,
        { qos: 1 },
        (err, grants) => {
          if (err || grants.some((g) => g.qos === 128)) {
            onStatus("Не удалось подписаться", "err");
            return;
          }
          onStatus("На связи", "ok");
          onReady();
        },
      );
    });
    this.client.on("reconnect", () => onStatus("Переподключение…", "warn"));
    this.client.on("offline", () =>
      onStatus("Нет связи — рисунок сохранён во вкладке", "warn"),
    );
    this.client.on("error", () =>
      onStatus(
        "Брокер недоступен. Проверьте сеть или создайте комнату с другим брокером.",
        "err",
      ),
    );
  }
  send(path, message) {
    if (!this.client.connected) return false;
    for (const payload of packets(message))
      this.client.publish(`${this.base}/${path}`, payload, {
        qos: 1,
        retain: false,
      });
    return true;
  }
  close() {
    this.client.removeAllListeners();
    this.client.on("error", () => {});
    this.client.end(true);
  }
}
