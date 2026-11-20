import { SchemaEditor } from "./editor.js";
import {
  DEFAULT_SCHEMA,
  loadSchemas,
  storeSchemas,
  downloadSchema,
  validateSchema,
} from "./schemas.js";
import "./styles.css";
import { Game, id, TURN_MS } from "./game.js";
import {
  Network,
  DEFAULT_BROKER,
  invitation,
  parseInvitation,
  allowedBroker,
} from "./network.js";
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
const me = { id: id(), name: "" }; // Every tab is a separate player, including duplicated tabs.
let net,
  game,
  state,
  room,
  broker,
  token,
  pending = null,
  draftKey = "",
  lastHost = 0,
  joining = false;
let host = false,
  clockOffset = 0,
  editing = false;
let customSchemas = loadSchemas();
let schemaAuto = true;
const schemas = () => [DEFAULT_SCHEMA, ...customSchemas];
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
  lastHost = Date.now();
  joining = false;
  const key = `draft:${room}:${state.round}:${me.id}`;
  if (oldRound !== state.round) {
    pending = null;
    draftKey = key;
    drawing.reset(read(key, []));
  }
  if (own()?.done || state.phase !== "play") pending = null;
  render();
}
function broadcast() {
  const snapshot = { ...game.snapshot(), sentAt: Date.now() };
  apply(snapshot);
  for (const p of snapshot.players)
    if (p.id !== me.id)
      net?.send(`out/${p.id}`, { type: "state", state: snapshot });
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
  else if (m.type === "heartbeat") {
    lastHost = Date.now();
    status("На связи", "ok");
    if (state && m.revision > state.revision)
      net.send(`in/${me.id}`, { type: "join", pid: me.id, name: me.name });
  } else if (m.type === "error") {
    joining = false;
    toast(m.message);
  }
}
function connect(asHost, data) {
  net?.close();
  host = asHost;
  state = null;
  pending = null;
  game = null;
  ({ room, broker } = data);
  token = invitation(room, broker);
  me.name =
    $("#in-name").value.trim().slice(0, 32) || (host ? "Хост" : "Игрок");
  save("name", me.name);
  if (host) game = new Game(me);
  joining = true;
  status("Подключаемся…");
  $("#b-create").disabled = $("#b-join").disabled = true;
  net = new Network({
    room,
    broker,
    pid: me.id,
    host,
    onMessage: incoming,
    onStatus: status,
    onReady: () => {
      $("#b-create").disabled = $("#b-join").disabled = false;
      if (host) broadcast();
      else net.send(`in/${me.id}`, { type: "join", pid: me.id, name: me.name });
    },
  });
  setTimeout(() => {
    $("#b-create").disabled = $("#b-join").disabled = false;
    if (joining)
      toast(
        "Комната не отвечает. Проверьте приглашение и открытую вкладку хоста.",
      );
  }, 12000);
}
function render() {
  if (editing) return;
  show(state.phase === "play" ? "game" : state.phase);
  $("#code-big").textContent = room.slice(0, 6).toUpperCase();
  const invite = new URL(location.href);
  invite.hash = token;
  $("#invite-field").value = invite.href;
  $("#host-word-box").hidden = !host;
  $("#host-word-box").style.display = host ? "block" : "none";
  $("#wait-box").style.display = host ? "none" : "block";
  $("#host-start-row").style.display = host ? "flex" : "none";
  $("#p-count").textContent = `· ${state.players.length}`;
  $("#plist").replaceChildren(
    ...state.players.map((p) => {
      const el = document.createElement("div");
      el.className = "tag";
      el.textContent = p.name + (p.id === me.id ? " (ты)" : "");
      return el;
    }),
  );
  $("#b-start").disabled = state.players.length < 2;
  $("#b-start").textContent =
    state.players.length < 2 ? "Нужно хотя бы 2 игрока" : "Начать";
  $("#lobby-note").textContent =
    "До 8 игроков. Каждый получает один фрагмент; общий рисунок откроется в финале.";
  $("#who-tag").textContent = own()?.task
    ? `Фрагмент ${own().strip + 1} из ${count()}: ${own().task.label}`
    : "Зритель · участие со следующего раунда";
  $("#task-instruction").textContent = own()?.task?.instruction || "";
  $("#progress-tag").textContent =
    `Сдано ${state.players.filter((p) => p.strip >= 0 && p.done).length} из ${count()}`;
  $("#wait-overlay").classList.toggle("hide", !!canDraw());
  $("#toolbar").style.opacity = canDraw() ? 1 : 0.35;
  $("#b-done").disabled = !canDraw();
  $("#b-undo").disabled = !canDraw();
  $("#ov-text").textContent = pending
    ? "Отправляем рисунок…"
    : own()?.done
      ? "Готово! Ждём остальных…"
      : `Рисует ${state.players.find((p) => p.id === state.turn?.pid)?.name || "следующий игрок"}`;
  drawing.render();
  if (state.phase === "reveal" && state.reveal) {
    $("#reveal-word").textContent = state.reveal.word;
    paint($("#cv2"), state.reveal.strips);
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
$("#b-create").onclick = () => {
  try {
    const url = $("#in-broker").value.trim() || DEFAULT_BROKER;
    if (!allowedBroker(url)) throw Error("Нужен адрес wss://");
    connect(true, { room: id().replaceAll("-", ""), broker: url });
  } catch (e) {
    toast(e.message);
  }
};
$("#b-join").onclick = () => {
  try {
    connect(false, parseInvitation($("#in-code").value));
  } catch {
    toast("Вставьте приглашение или ссылку целиком");
  }
};
$("#b-start").onclick = () => {
  if (game?.start($("#in-word").value, selectedSchema())) broadcast();
  else toast("Введите слово и пригласите второго игрока");
};
$("#b-again").onclick = () => {
  if (host) {
    game.again();
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
  url.hash = token;
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
  a.download = `frankenstein-${room.slice(0, 6)}.png`;
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
setInterval(() => {
  if (host && game && net?.client.connected) {
    if (game.tick()) broadcast();
    for (const p of game.state.players)
      if (p.id !== me.id)
        net.send(`out/${p.id}`, {
          type: "heartbeat",
          revision: game.state.revision,
        });
  } else if (net && !host) {
    if (pending) sendPending();
    if (joining || Date.now() - lastHost > 6000)
      net.send(`in/${me.id}`, { type: "join", pid: me.id, name: me.name });
    if (state && Date.now() - lastHost > 10000)
      status("Хост не отвечает. Ждём восстановления…");
  }
}, 2000);
setInterval(() => {
  if (state?.phase !== "play") return;
  const left = Math.max(0, state.turn.endsAt - Date.now() - clockOffset);
  $("#timer").style.display = state.turn.pid === me.id ? "block" : "none";
  $("#timer").textContent = Math.ceil(left / 1000);
  $("#tbar").style.width = `${100 * (1 - left / TURN_MS)}%`;
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
  if (selected) {
    el.value = selected;
    schemaAuto = false;
  }
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
  editor.open(selectedSchema());
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
  const word = $("#in-word").value.toLocaleLowerCase("ru");
  const match = schemas().find((s) =>
    s.keywords.some((k) => k && word.includes(k.toLocaleLowerCase("ru"))),
  );
  if (match && schemaAuto) $("#schema-select").value = match.id;
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

$("#schema-select").onchange = () => (schemaAuto = false);
