import { avatarElement, AVATAR_COUNT } from "./avatars.js";
const $ = (s) => document.querySelector(s);
export class RoomUI {
  constructor({ avatarId = 0, onAvatar, onChat, onLeave, onKick, toast }) {
    this.avatarId = avatarId;
    this.onChat = onChat;
    this.toast = toast;
    this.messages = [];
    this.seen = new Set();
    this.chatInitialized = false;
    this.unread = 0;
    const drawAvatar = () => {
      $("#my-avatar").replaceChildren(avatarElement(this.avatarId));
      document
        .querySelectorAll("[data-avatar]")
        .forEach((b) =>
          b.setAttribute(
            "aria-pressed",
            String(+b.dataset.avatar === this.avatarId),
          ),
        );
    };
    for (let i = 0; i < AVATAR_COUNT; i++) {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.avatar = i;
      b.ariaLabel = `Человечек ${i + 1}`;
      b.append(avatarElement(i));
      b.onclick = () => {
        this.avatarId = i;
        onAvatar(i);
        drawAvatar();
        $("#avatar-chooser").open = false;
      };
      $("#avatar-picker").append(b);
    }
    drawAvatar();
    $("#chat-toggle").onclick = () => this.toggleChat();
    $("#chat-close").onclick = () => this.toggleChat(false);
    $("#b-leave").onclick = onLeave;
    this.onKick = onKick;
    $("#chat-form").onsubmit = async (e) => {
      e.preventDefault();
      const text = $("#chat-input").value;
      if (!text.trim()) return;
      $("#chat-send").disabled = true;
      try {
        await onChat(text);
        $("#chat-input").value = "";
      } catch (e) {
        toast(e.message);
      } finally {
        $("#chat-send").disabled = false;
      }
    };
    $("#chat-input").onkeydown = (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        $("#chat-form").requestSubmit();
      }
    };
  }
  toggleChat(open = $("#chat-panel").hidden) {
    $("#chat-panel").hidden = !open;
    $("#chat-toggle").setAttribute("aria-expanded", String(open));
    if (open) {
      this.unread = 0;
      this.badge();
      $("#chat-messages").scrollTop = $("#chat-messages").scrollHeight;
      $("#chat-input").focus();
    }
  }
  badge() {
    $("#chat-unread").textContent = this.unread ? String(this.unread) : "";
    $("#chat-unread").hidden = !this.unread;
  }
  room({ code, pid, host, hostId }) {
    this.code = code;
    this.pid = pid;
    this.host = host;
    this.hostId = hostId;
    this.seen = new Set();
    this.chatInitialized = false;
    this.messages = [];
    this.unread = 0;
    this.badge();
    $("#chat-toggle").disabled = false;
    $("#chat-room-code").textContent = code;
    $("#b-leave").textContent = host ? "Закрыть комнату" : "Выйти из комнаты";
  }
  clear() {
    this.code = null;
    this.messages = [];
    this.seen.clear();
    $("#chat-toggle").disabled = true;
    $("#chat-panel").hidden = true;
    $("#chat-messages").replaceChildren();
    this.unread = 0;
    this.badge();
  }
  members(members) {
    const roster = [...members].sort((a, b) => +a.slot - +b.slot);
    $("#plist").replaceChildren(
      ...roster.map((p) => {
        const card = document.createElement("div");
        card.className = "player-card" + (p.online ? "" : " offline");
        card.append(avatarElement(p.avatarId));
        const info = document.createElement("div"),
          name = document.createElement("strong"),
          status = document.createElement("span");
        name.textContent = p.name + (p.id === this.pid ? " · ты" : "");
        status.textContent =
          (p.id === this.hostId ? "Ведущий · " : "") +
          (p.online ? "В комнате" : "Не в сети");
        info.append(name, status);
        card.append(info);
        if (this.host && p.id !== this.pid) {
          const remove = document.createElement("button");
          remove.className = "player-remove";
          remove.ariaLabel = `Убрать ${p.name} из комнаты`;
          remove.textContent = "×";
          remove.onclick = () => this.onKick(p.id);
          card.append(remove);
        }
        return card;
      }),
    );
    $("#game-crew").replaceChildren(
      ...roster.map((p) => {
        const e = document.createElement("span");
        e.className =
          "crew-person" +
          (p.id === this.pid ? " me" : "") +
          (p.id === this.activePid ? " drawing" : "") +
          (!p.online ? " offline" : "");
        e.title = p.name + (p.id === this.activePid ? " — рисует" : "");
        e.append(avatarElement(p.avatarId));
        return e;
      }),
    );
    $("#p-count").textContent = `· ${roster.length}/8`;
  }
  chat(messages) {
    const initial = !this.chatInitialized;
    this.chatInitialized = true;
    const box = $("#chat-messages"),
      nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
    const incoming = messages.filter((m) => !this.seen.has(m.id));
    for (const m of messages) this.seen.add(m.id);
    if (!initial && $("#chat-panel").hidden)
      this.unread += incoming.filter((m) => m.pid !== this.pid).length;
    this.messages = messages;
    this.badge();
    box.replaceChildren(
      ...messages.map((m) => {
        const row = document.createElement("article");
        row.className = "chat-message" + (m.pid === this.pid ? " own" : "");
        row.append(avatarElement(m.avatarId));
        const body = document.createElement("div"),
          head = document.createElement("div"),
          name = document.createElement("strong"),
          time = document.createElement("time"),
          text = document.createElement("p");
        name.textContent = m.name;
        time.textContent = new Date(m.createdAt).toLocaleTimeString("ru", {
          hour: "2-digit",
          minute: "2-digit",
        });
        text.textContent = m.text;
        head.append(name, time);
        body.append(head, text);
        row.append(body);
        return row;
      }),
    );
    if (!messages.length) {
      const empty = document.createElement("p");
      empty.className = "chat-empty";
      empty.textContent =
        "Здесь можно звать друзей, спорить о лапах и смеяться над результатом. Задание пока держи в секрете :)";
      box.append(empty);
    }
    if (nearBottom || incoming.some((m) => m.pid === this.pid))
      box.scrollTop = box.scrollHeight;
  }
}
