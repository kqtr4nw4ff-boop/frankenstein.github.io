import { claimTabIdentity } from "./tab-identity.js";
import { playerStatus } from "./player-status.js";
import { avatarElement } from "./avatars.js";
import { SchemaDeck } from "./random.js";
import { renderOverview, previewPlayers } from "./overview.js";
import { SchemaEditor } from "./editor.js";
import {
  DEFAULT_SCHEMA,
  BUILTIN_SCHEMAS,
  assignments,
  loadSchemas,
  storeSchemas,
  downloadSchema,
  validateSchema,
} from "./schemas.js";
import "./styles.css";
import { Game, id, TURN_MS } from "./game.js";
import { FirebaseRoom } from "./firebase-room.js";
import { parseRoomCode } from "./room-code.js";
import { RoomUI } from "./room-ui.js";
import { firebaseConfigured } from "./firebase-client.js";
import { Drawing, PALETTE, paint } from "./drawing.js";
const $ = (s) => document.querySelector(s);
function read(key, fallback = "") {
  try {
    return JSON.parse(sessionStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
function save(key, value) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {}
}
const me = {
  id: read("playerId") || id(),
  name: "",
  avatarId: +read("avatar", 0),
};
const identityReady = claimTabIdentity(me.id).then((id) => {
  me.id = id;
  save("playerId", id);
});
let net,
  game,
  state,
  code = "",
  pending = null,
  draftKey = "";
let connecting = false,
  rosterSignature = "";
let host = false,
  clockOffset = 0,
  editing = false;
let customSchemas = loadSchemas();
let schemaAuto = true;
const randomDeck = new SchemaDeck();
const schemas = () => [...BUILTIN_SCHEMAS, ...customSchemas];
const selectedSchema = () =>
  schemas().find((s) => s.id === $("#schema-select").value) || DEFAULT_SCHEMA;
const status = (text, cls = "warn") => {
  $("#net").textContent = text;
  $("#net").className = `pill ${cls}`;
};
let toastTimer;
function toast(text) {
  $("#toast").textContent = text;
  $("#toast").classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#toast").classList.remove("on"), 4500);
}
const roomUI = new RoomUI({
  avatarId: me.avatarId,
  onAvatar: (id) => {
    me.avatarId = id;
    save("avatar", id);
  },
  onChat: (text) => net?.chat(text),
  onLeave: () => leaveRoom(),
  onKick: (pid) => net?.kick(pid),
  toast,
});
function show(name) {
  document
    .querySelectorAll(".screen")
    .forEach((s) => s.classList.toggle("on", s.id === `scr-${name}`));
}
const own = () => state?.players.find((p) => p.id === me.id);
const count = () => state?.players.filter((p) => p.strip >= 0).length || 1;
const canDraw = () =>
  state?.phase === "play" &&
  state.turn?.pid === me.id &&
  !own()?.done &&
  !pending &&
  Date.now() + clockOffset < state.turn.endsAt;
const drawing = new Drawing(
  $("#cv"),
  canDraw,
  () => own()?.task,
  (strokes) => save(draftKey, strokes),
  () =>
    state?.players.filter((p) => p.strip >= 0 && p.task).map((p) => p.task) ||
    [],
);
function apply(next) {
  if (
    !next ||
    !Array.isArray(next.players) ||
    !["lobby", "play", "reveal"].includes(next.phase)
  )
    return;
  if (
    state &&
    (next.hostId !== state.hostId || next.revision <= state.revision)
  )
    return;
  clockOffset = host ? 0 : next.sentAt - Date.now();
  const oldRound = state?.round;
  state = next;
  const key = `draft:${code}:${state.round}:${me.id}`;
  if (oldRound !== state.round) {
    pending = null;
    draftKey = key;
    drawing.reset(read(key, []));
  }
  if (own()?.done || state.phase !== "play") pending = null;
  render();
}
function broadcast() {
  if (!game || !net) return;
  const snapshot = { ...game.snapshot(me.id), sentAt: net.now() };
  apply(snapshot);
  net.publish(game);
}
function incoming(path, m) {
  if (host) {
    const pid = path.split("/")[1];
    if (!pid || pid !== m.pid) return;
    if (m.type === "join") {
      if (game.join({ id: pid, name: m.name })) {
        broadcast();
      } else
        net.send(`out/${pid}`, {
          type: "error",
          message: "В комнате уже 8 игроков",
        });
    } else if (m.type === "submit" && game.submit(m)) broadcast();
  } else if (m.type === "state") apply(m.state);
  else if (m.type === "error") {
    toast(m.message);
  }
}
async function connect(asHost, data = {}) {
  if (connecting) return;
  connecting = true;
  await identityReady;
  await net?.close();
  net = null;
  state = null;
  game = null;
  pending = null;
  rosterSignature = "";
  host = asHost;
  me.name =
    $("#in-name").value.trim().slice(0, 32) ||
    (asHost ? "Ведущий" : "Художник");
  save("name", me.name);
  status("Входим в комнату…");
  $("#b-create").disabled = $("#b-join").disabled = true;
  try {
    net = await FirebaseRoom.open({
      host: asHost,
      room: data.room,
      pid: me.id,
      name: me.name,
      avatarId: me.avatarId,
      onStatus: status,
      onError: (e) => toast(roomError(e)),
    });
    code = net.code;
    host = net.isHost;
    if (host) {
      const stored = await net.engine();
      game = stored
        ? Game.restore(stored, () => net.now())
        : new Game(me, () => net.now());
    }
    state = {
      phase: "lobby",
      players: [],
      hostId: net.meta.hostId,
      revision: -1,
      round: "",
    };
    roomUI.room({ code, pid: me.id, host, hostId: net.meta.hostId });
    net.listen({
      onMessage: incoming,
      onMembers: (members) => {
        roomUI.members(members);
        if (!members.some((p) => p.id === me.id)) {
          leaveRoom(false);
          toast("Ты больше не в этой комнате");
          return;
        }
        if (host && game) {
          const signature = JSON.stringify(
            members.map((p) => [p.id, p.name, p.avatarId, p.online]),
          );
          if (signature !== rosterSignature) {
            rosterSignature = signature;
            syncRoster(members);
            broadcast();
          }
        }
      },
      onChat: (messages) => roomUI.chat(messages),
      onError: (e) => toast(roomError(e)),
      onClosed: () => {
        leaveRoom(false);
        toast("Ведущий закрыл комнату");
      },
    });
    save("activeRoom", code);
    history.replaceState(null, "", "#" + code);
    render();
    if (host) broadcast();
    else net.send(`in/${me.id}`, { type: "join", pid: me.id, name: me.name });
  } catch (e) {
    await net?.close();
    net = null;
    host = false;
    game = null;
    state = null;
    status("Не удалось войти", "err");
    toast(roomError(e));
    show("home");
  } finally {
    connecting = false;
    $("#b-create").disabled = $("#b-join").disabled = false;
  }
}
function syncRoster(members) {
  if (game.state.phase === "play")
    for (const p of game.state.players)
      if (!members.some((m) => m.id === p.id)) {
        p.online = false;
        if (!p.done && game.state.turn?.pid === p.id) {
          p.done = true;
          game.next();
        }
      }
  if (game.state.phase === "lobby")
    game.state.players = game.state.players.filter((p) =>
      members.some((m) => m.id === p.id),
    );
  for (const m of members) {
    game.join(m);
    const p = game.state.players.find((p) => p.id === m.id);
    if (p) {
      p.name = m.name;
      p.avatarId = m.avatarId;
      p.online = m.online;
    }
  }
}
function roomError(error) {
  const value = String(error?.code || error?.message || error);
  if (value.includes("operation-not-allowed"))
    return "В Firebase нужно включить Authentication → Anonymous.";
  if (/permission.denied|PERMISSION_DENIED/i.test(value))
    return "Правила Realtime Database пока не дают доступ. Нужно опубликовать правила проекта.";
  if (value.includes("invalid-api-key"))
    return "Не подходят настройки Firebase. Проверь firebaseConfig.";
  return (
    error?.message ||
    "Не удалось подключиться. Проверь сеть и попробуй ещё раз."
  );
}
async function leaveRoom(destroy = true) {
  const current = net;
  net = null;
  if (current && destroy && host)
    await current.destroy().catch((e) => toast(roomError(e)));
  if (current && destroy && !host)
    await current.leave().catch((e) => toast(roomError(e)));
  await current?.close();
  state = null;
  game = null;
  pending = null;
  host = false;
  save("activeRoom", "");
  roomUI.clear();
  history.replaceState(null, "", location.pathname + location.search);
  show("home");
  status("Можно начинать");
}
function render() {
  if (editing) return;
  show(state.phase === "play" ? "game" : state.phase);
  $("#code-big").textContent = code;
  const invite = new URL(location.href);
  invite.hash = code;
  $("#invite-field").value = invite.href;
  $("#host-word-box").hidden = !host;
  $("#host-word-box").style.display = host ? "block" : "none";
  $("#wait-box").style.display = host ? "none" : "block";
  $("#host-start-row").style.display = host ? "flex" : "none";
  $("#p-count").textContent = `· ${state.players.length}`;
  roomUI.activePid = state.turn?.pid;
  roomUI.members(net?.members || []);
  $("#b-start").disabled = state.players.length < 2;
  $("#b-start").textContent =
    state.players.length < 2 ? "Нужно хотя бы 2 игрока" : "Начать";
  $("#lobby-note").textContent =
    "До 8 игроков. Каждый получает один фрагмент; общий рисунок откроется в финале.";
  $("#who-tag").textContent = own()?.task
    ? own().task.label
    : "Зритель · участие со следующего раунда";
  const task = own()?.task,
    view = playerStatus(state, me.id, {
      pending: !!pending,
      now: Date.now() + clockOffset,
    });
  $("#own-fragment").textContent = task
    ? `Твой участок №${own().strip + 1} из ${count()}`
    : "Участие со следующего раунда";
  $("#turn-status").textContent = view.title;
  $("#turn-status").dataset.kind = view.kind;
  $("#task-instruction").textContent = task?.instruction || "";
  $("#task-concept").textContent = task?.concept?.title || "";
  $("#task-brief").replaceChildren(
    ...(task?.briefs || []).map((b) => {
      const e = document.createElement("li");
      const label = document.createElement("strong");
      label.textContent = b.label + ": ";
      e.append(label, document.createTextNode(b.text));
      return e;
    }),
  );
  $("#task-notes").textContent = (task?.notes || []).join("\n");
  $("#task-notes").hidden = !task?.notes?.length;
  $("#progress-tag").textContent =
    `Готовы ${state.players.filter((p) => p.strip >= 0 && p.done).length} из ${count()}`;
  $("#wait-overlay").classList.toggle("hide", !!canDraw());
  $("#toolbar").style.opacity = canDraw() ? 1 : 0.35;
  $("#b-done").disabled = !canDraw();
  $("#b-undo").disabled = !canDraw();
  $("#ov-text").textContent = view.overlay;
  renderOverview($("#scheme-overview"), state.players, me.id);
  renderSchemaPreview();
  drawing.render();
  if (state.phase === "reveal" && state.reveal) {
    $("#reveal-word").textContent = state.reveal.word;
    paint($("#cv2"), state.reveal.strips);
    $("#reveal-briefs").replaceChildren(
      ...[...state.reveal.strips]
        .sort((a, b) => a.strip - b.strip)
        .map((part) => {
          const card = document.createElement("article");
          card.className = "reveal-brief";
          const head = document.createElement("div"),
            name = document.createElement("strong"),
            role = document.createElement("span"),
            concept = document.createElement("p");
          head.append(avatarElement(part.avatarId));
          name.textContent = part.artist || "Художник";
          role.textContent = part.task.label;
          const info = document.createElement("div");
          info.append(name, role);
          head.append(info);
          concept.textContent = part.task.concept?.title || "";
          card.append(head, concept);
          return card;
        }),
    );
    $("#b-again").style.display = host ? "inline-block" : "none";
  }
}
function submit() {
  if (
    !state ||
    state.phase !== "play" ||
    state.turn?.pid !== me.id ||
    own()?.done ||
    pending
  )
    return;
  drawing.finish();
  pending = {
    type: "submit",
    pid: me.id,
    round: state.round,
    strip: own().strip,
    strokes: structuredClone(drawing.strokes),
  };
  sendPending();
  render();
}
function sendPending() {
  if (!pending) return;
  if (host) {
    if (game.submit(pending)) broadcast();
  } else net.send(`in/${me.id}`, pending);
}
$("#b-create").onclick = () => connect(true);
$("#b-join").onclick = () => {
  try {
    connect(false, { room: parseRoomCode($("#in-code").value) });
  } catch (e) {
    toast(e.message);
  }
};
$("#b-start").onclick = () => {
  if (
    game?.start(
      $("#in-word").value,
      selectedSchema(),
      +$("#turn-seconds").value,
    )
  )
    broadcast();
  else toast("Введите слово и пригласите второго игрока");
};
$("#b-again").onclick = () => {
  if (host) {
    game.again();
    syncRoster(net.members);
    if ($("#random-each-round").checked) rollRandomSchema();
    broadcast();
  }
};
$("#b-done").onclick = submit;
$("#b-undo").onclick = () => drawing.undo();
$("#w-size").oninput = (e) => (drawing.width = +e.target.value);
for (const color of PALETTE) {
  const b = document.createElement("button");
  b.className = "swatch" + (color === drawing.color ? " on" : "");
  b.style.background = color;
  b.ariaLabel = `Цвет ${color}`;
  b.onclick = () => {
    drawing.color = color;
    document
      .querySelectorAll(".swatch")
      .forEach((el) => el.classList.toggle("on", el === b));
  };
  $("#swatches").append(b);
}
$("#b-copy").onclick = async () => {
  const url = new URL(location.href);
  url.hash = code;
  try {
    await navigator.clipboard.writeText(url.href);
    toast("Приглашение скопировано");
  } catch {
    toast("Скопируйте приглашение из поля");
    $("#invite-field").focus();
    $("#invite-field").select();
  }
};
$("#b-download").onclick = () => {
  const a = document.createElement("a");
  a.download = `frankenstein-${code}.png`;
  a.href = $("#cv2").toDataURL();
  a.click();
};
$("#in-code").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("#b-join").click();
});
$("#in-word").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("#b-start").click();
});
$("#in-name").value = read("name");
if (location.hash) $("#in-code").value = location.hash.slice(1);
if (location.hash && read("activeRoom") === location.hash.slice(1))
  setTimeout(() => connect(false, { room: location.hash.slice(1) }), 0);
setInterval(() => {
  if (host && game && net?.client.connected) {
    if (game.tick()) broadcast();
  } else if (net && pending) sendPending();
}, 1500);
setInterval(() => {
  if (state?.phase !== "play") return;
  const left = Math.max(0, state.turn.endsAt - Date.now() - clockOffset);
  $("#timer").style.display = state.turn.pid === me.id ? "block" : "none";
  $("#timer").textContent = Math.ceil(left / 1000);
  $("#tbar").style.width =
    `${100 * (1 - left / (state.turn.durationMs || TURN_MS))}%`;
  if (!left && state.turn.pid === me.id && !pending && !own()?.done) submit();
}, 200);
window.addEventListener("pagehide", () => net?.close());

function updateSchemaSelect(selected) {
  const el = $("#schema-select");
  el.replaceChildren(
    ...schemas().map((schema) => {
      const o = document.createElement("option");
      o.value = schema.id;
      o.textContent = schema.name;
      return o;
    }),
  );
  renderLibrary();
  if (selected) {
    el.value = selected;
    schemaAuto = false;
  }
  renderSchemaPreview();
}
function leaveEditor() {
  editing = false;
  if (state) render();
  else show("home");
}
const editor = new SchemaEditor({
  toast,
  onCancel: leaveEditor,
  onSave: (schema) => {
    const next = [...customSchemas.filter((s) => s.id !== schema.id), schema];
    try {
      storeSchemas(next);
      customSchemas = next;
      updateSchemaSelect(schema.id);
      leaveEditor();
      toast("Схема сохранена в этом браузере");
    } catch {
      toast(
        "Не хватает места в браузере. Скачай схему кнопкой «Сохранить в файл».",
      );
    }
  },
});
$("#b-edit-schema").onclick = () => {
  editing = true;
  editor.open();
  show("editor");
};
$("#b-change-schema").onclick = () => {
  editing = true;
  editor.open(selectedSchema(), Math.max(2, state?.players.length || 2));
  show("editor");
};
$("#b-export-schema").onclick = () => downloadSchema(selectedSchema());
$("#b-import-schema").onclick = () => $("#schema-file").click();
$("#schema-file").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    if (file.size > 2 * 1024 * 1024)
      throw Error("Файл схемы должен быть меньше 2 МБ");
    const schema = validateSchema(JSON.parse(await file.text()));
    schema.id = crypto.randomUUID();
    const next = [...customSchemas, schema];
    storeSchemas(next);
    customSchemas = next;
    updateSchemaSelect(schema.id);
    toast("Схема добавлена");
  } catch (e) {
    toast(e.message || "Не получилось открыть схему");
  }
  e.target.value = "";
};
$("#in-word").addEventListener("input", () => {
  $("#random-each-round").checked = false;
  const word = $("#in-word").value.toLocaleLowerCase("ru");
  const match =
    schemas().find((s) => word.includes(s.name.toLocaleLowerCase("ru"))) ||
    schemas().find((s) =>
      s.keywords.some((k) => k && word.includes(k.toLocaleLowerCase("ru"))),
    );
  if (match && schemaAuto) {
    $("#schema-select").value = match.id;
    renderSchemaPreview();
  }
});
updateSchemaSelect();

$("#home-editor").onclick = () => {
  editing = true;
  editor.open();
  show("editor");
};

for (const button of document.querySelectorAll("[data-tool]"))
  button.onclick = () => {
    drawing.finish();
    drawing.tool = button.dataset.tool;
    for (const b of document.querySelectorAll("[data-tool]")) {
      const on = b === button;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", String(on));
    }
  };
$("#shape-filled").onchange = (e) => (drawing.filled = e.target.checked);

$("#schema-select").onchange = () => {
  schemaAuto = false;
  $("#random-each-round").checked = false;
  renderSchemaPreview();
};

function renderSchemaPreview() {
  const schema = selectedSchema(),
    n = Math.max(2, state?.players.length || 2);
  renderOverview(
    $("#lobby-schema-preview"),
    previewPlayers(assignments(schema, n)),
  );
  $("#schema-summary").textContent =
    `${schema.name} · ${n} ${n < 5 ? "фрагмента" : "фрагментов"}`;
  document
    .querySelectorAll(".schema-option")
    .forEach((b) =>
      b.classList.toggle("selected", b.dataset.schema === schema.id),
    );
}
function renderLibrary() {
  const library = $("#preset-library");
  library.replaceChildren();
  for (const schema of schemas()) {
    const button = document.createElement("button");
    button.className = "schema-option";
    button.dataset.schema = schema.id;
    const picture = document.createElement("div");
    picture.className = "schema-thumbnail";
    renderOverview(
      picture,
      previewPlayers(assignments(schema, 2)),
      "preview-0",
    );
    const label = document.createElement("span");
    label.textContent = schema.name;
    button.append(picture, label);
    button.onclick = () => {
      $("#schema-select").value = schema.id;
      schemaAuto = false;
      $("#random-each-round").checked = false;
      renderSchemaPreview();
    };
    library.append(button);
  }
}

function rollRandomSchema() {
  const schema = randomDeck.draw(schemas());
  $("#schema-select").value = schema.id;
  $("#in-word").value = schema.name;
  schemaAuto = false;
  renderSchemaPreview();
  $("#random-hint").textContent =
    `Без повторов: ещё ${randomDeck.bag.length} в колоде`;
}
$("#b-random-schema").onclick = () => {
  $("#random-each-round").checked = true;
  rollRandomSchema();
};
$("#random-each-round").onchange = (e) => {
  if (e.target.checked) rollRandomSchema();
};
for (const el of document.querySelectorAll("[data-preset-count]"))
  el.textContent = BUILTIN_SCHEMAS.length;
$("#more-presets").textContent = `+${BUILTIN_SCHEMAS.length - 3} идей`;

if (!firebaseConfigured())
  $("#connection-help").textContent =
    "Комнаты будут доступны после настройки Firebase. Мастерская уже работает.";
