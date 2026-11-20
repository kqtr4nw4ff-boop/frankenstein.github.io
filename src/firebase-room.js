import {
  ref,
  get,
  set,
  update,
  remove,
  push,
  onValue,
  onChildAdded,
  onChildChanged,
  query,
  limitToLast,
  orderByChild,
  onDisconnect,
  runTransaction,
  serverTimestamp,
} from "firebase/database";
import { connectFirebase } from "./firebase-client.js";
import { makeRoomCode, parseRoomCode } from "./room-code.js";
const clean = (value) => JSON.parse(JSON.stringify(value));
export class FirebaseRoom {
  static async open(options) {
    const session = await connectFirebase(),
      room = new FirebaseRoom(session, options);
    try {
      await room.open(options);
      return room;
    } catch (e) {
      await room.close();
      throw e;
    }
  }
  constructor({ db, user }, options) {
    this.db = db;
    this.user = user;
    this.pid = options.pid;
    this.options = options;
    this.unsubscribers = [];
    this.members = [];
    this.client = { connected: false };
    this.offset = 0;
    this.queue = Promise.resolve();
    this.closed = false;
  }
  now() {
    return Date.now() + this.offset;
  }
  path(path = "") {
    return ref(this.db, `rooms/${this.code}${path ? "/" + path : ""}`);
  }
  async open({ host, room, name, avatarId = 0, onStatus = () => {} }) {
    this.onStatus = onStatus;
    this.unsubscribers.push(
      onValue(
        ref(this.db, ".info/serverTimeOffset"),
        (s) => (this.offset = s.val() || 0),
      ),
    );
    if (host) {
      for (let attempt = 0; attempt < 8; attempt++) {
        this.code = makeRoomCode();
        const meta = {
          hostUid: this.user.uid,
          hostId: this.pid,
          createdAt: serverTimestamp(),
          expiresAt: this.now() + 24 * 60 * 60 * 1000 - 60000,
        };
        const result = await runTransaction(
          this.path("meta"),
          (value) => (value ? undefined : meta),
          { applyLocally: false },
        );
        if (result.committed) {
          this.meta = result.snapshot.val();
          break;
        }
      }
      if (!this.meta)
        throw Error("Не удалось выбрать свободный код. Попробуй ещё раз.");
    } else {
      this.code = parseRoomCode(room);
      this.meta = (await get(this.path("meta"))).val();
      if (!this.meta)
        throw Error(
          "Комната не найдена. Проверь код или попроси новую ссылку.",
        );
      if (this.meta.expiresAt < this.now())
        throw Error("Эта комната уже закрыта. Создай новую.");
    }
    this.isHost =
      this.meta.hostUid === this.user.uid && this.meta.hostId === this.pid;
    const slots = (await get(this.path("slots"))).val() || {};
    this.slot = Object.keys(slots).find(
      (slot) =>
        slots[slot].pid === this.pid && slots[slot].uid === this.user.uid,
    );
    if (this.slot === undefined) {
      const candidates = this.isHost
        ? ["0"]
        : ["1", "2", "3", "4", "5", "6", "7"];
      for (const slot of candidates) {
        const result = await runTransaction(
          this.path(`slots/${slot}`),
          (value) =>
            value ? undefined : { pid: this.pid, uid: this.user.uid },
          { applyLocally: false },
        );
        if (result.committed) {
          this.slot = slot;
          break;
        }
      }
    }
    if (this.slot === undefined) throw Error("В комнате уже 8 игроков.");
    this.memberRef = this.path(`members/${this.pid}`);
    this.connectionRef = this.path(
      `presence/${this.pid}/${crypto.randomUUID()}`,
    );
    await set(this.memberRef, {
      id: this.pid,
      uid: this.user.uid,
      slot: this.slot,
      name: name.trim().slice(0, 32) || "Художник",
      avatarId,
      online: true,
      lastSeen: serverTimestamp(),
    });
    this.unsubscribers.push(
      onValue(ref(this.db, ".info/connected"), async (snap) => {
        this.client.connected = !!snap.val();
        if (this.closed) return;
        if (this.client.connected) {
          try {
            this.disconnect = onDisconnect(this.connectionRef);
            await this.disconnect.remove();
            if (!this.closed) {
              await set(this.connectionRef, true);
              await update(this.memberRef, { lastSeen: serverTimestamp() });
            }
            this.onStatus("В комнате", "ok");
          } catch (e) {
            this.onStatus("Нет доступа к комнате", "err");
          }
        } else this.onStatus("Восстанавливаем соединение…", "warn");
      }),
    );
    this.client.connected = true;
  }
  listen({
    onMessage,
    onMembers = () => {},
    onChat = () => {},
    onError = () => {},
    onClosed = () => {},
  }) {
    this.unsubscribers.push(
      onValue(this.path("meta"), (s) => {
        if (!s.exists() && !this.closed) onClosed();
      }),
    );
    const fail = (e) => {
      this.onStatus("Нет доступа к комнате", "err");
      onError(e);
    };
    let rawMembers = null,
      presence = {};
    const roster = () => {
      if (!rawMembers) return;
      this.members = Object.values(rawMembers).map((m) => ({
        ...m,
        online: !!Object.keys(presence[m.id] || {}).length,
      }));
      onMembers(this.members);
    };
    this.unsubscribers.push(
      onValue(
        this.path("members"),
        (s) => {
          rawMembers = s.val() || {};
          roster();
        },
        fail,
      ),
      onValue(
        this.path("presence"),
        (s) => {
          presence = s.val() || {};
          roster();
        },
        fail,
      ),
    );
    if (this.isHost) {
      const receive = (s) => {
        const data = s.val();
        if (!data) return;
        try {
          const m = JSON.parse(data.payload);
          if (m.pid !== data.pid) throw Error("Неверный отправитель");
          onMessage(`in/${data.pid}`, m);
          remove(s.ref).catch(fail);
        } catch (e) {
          onError(e);
        }
      };
      this.unsubscribers.push(
        onChildAdded(this.path("commands"), receive, fail),
        onChildChanged(this.path("commands"), receive, fail),
      );
    } else
      this.unsubscribers.push(
        onValue(
          this.path(`responses/${this.pid}`),
          (s) => {
            const data = s.val();
            if (data?.payload)
              try {
                onMessage(`out/${this.pid}`, JSON.parse(data.payload));
              } catch (e) {
                onError(e);
              }
          },
          fail,
        ),
      );
    this.unsubscribers.push(
      onValue(
        query(this.path("chat"), orderByChild("createdAt"), limitToLast(100)),
        (s) =>
          onChat(
            Object.entries(s.val() || {})
              .map(([id, m]) => ({ id, ...m }))
              .sort((a, b) => a.createdAt - b.createdAt),
          ),
        fail,
      ),
    );
  }
  async engine() {
    if (!this.isHost) return null;
    const value = (await get(this.path("engine"))).val();
    return value ? JSON.parse(value) : null;
  }
  publish(game) {
    if (!this.isHost) throw Error("Только ведущий может менять раунд");
    const sentAt = this.now(),
      payload = { engine: JSON.stringify(game.serialize()) };
    for (const player of game.state.players)
      if (player.id !== this.pid)
        payload[`responses/${player.id}`] = {
          payload: JSON.stringify({
            type: "state",
            state: { ...game.snapshot(player.id, false), sentAt },
          }),
          updatedAt: serverTimestamp(),
        };
    this.queue = this.queue
      .then(() => update(this.path(), payload))
      .catch((e) => {
        this.onStatus("Не удалось сохранить раунд", "err");
        this.options.onError?.(e);
      });
    return this.queue;
  }
  send(path, message) {
    if (this.closed) return false;
    if (path.startsWith("out/")) {
      const pid = path.slice(4);
      if (message.type === "heartbeat") return true;
      set(this.path(`responses/${pid}`), {
        payload: JSON.stringify(message),
        updatedAt: serverTimestamp(),
      }).catch((e) => this.options.onError?.(e));
      return true;
    }
    const key = `${this.pid}-${message.type}-${message.round || "session"}`,
      payload = JSON.stringify(message);
    if (payload.length > 1400000) throw Error("Слишком большой рисунок");
    set(this.path(`commands/${key}`), {
      pid: this.pid,
      type: message.type,
      payload,
      createdAt: serverTimestamp(),
    }).catch((e) => this.options.onError?.(e));
    return true;
  }
  async chat(text) {
    const message = text.trim();
    if (!message || message.length > 300)
      throw Error("Сообщение — от 1 до 300 символов");
    if (this.lastChat && this.now() - this.lastChat < 1000)
      throw Error("Дай остальным тоже написать :)");
    const me = this.members.find((p) => p.id === this.pid);
    if (!me) throw Error("Ты уже вышел из комнаты");
    this.lastChat = this.now();
    await set(push(this.path("chat")), {
      pid: this.pid,
      uid: this.user.uid,
      name: me.name,
      avatarId: me.avatarId,
      text: message,
      createdAt: serverTimestamp(),
    });
  }
  async kick(pid) {
    if (!this.isHost || pid === this.pid) return;
    const member = this.members.find((p) => p.id === pid);
    if (member)
      await update(this.path(), {
        [`members/${pid}`]: null,
        [`slots/${member.slot}`]: null,
        [`responses/${pid}`]: null,
        [`presence/${pid}`]: null,
      });
  }
  async leave() {
    await this.close();
    await update(this.path(), {
      [`members/${this.pid}`]: null,
      [`slots/${this.slot}`]: null,
    });
  }
  async destroy() {
    if (this.isHost) await remove(this.path());
  }
  async close() {
    if (this.closed) return;
    this.closed = true;
    for (const stop of this.unsubscribers) stop();
    this.unsubscribers = [];
    this.client.connected = false;
    if (this.memberRef) {
      try {
        if (this.connectionRef) await remove(this.connectionRef);
        await update(this.memberRef, { lastSeen: serverTimestamp() });
        await this.disconnect?.cancel();
      } catch {}
    }
  }
}
