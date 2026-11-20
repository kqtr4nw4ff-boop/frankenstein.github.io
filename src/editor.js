import {
  validateSchema,
  overlaps,
  downloadSchema,
  BUILTIN_SCHEMAS,
} from "./schemas.js";
import { PALETTE } from "./drawing.js";
export class SchemaEditor {
  constructor({ onSave, onCancel, toast }) {
    this.onSave = onSave;
    this.toast = toast;
    this.canvas = document.querySelector("#editor-canvas");
    this.ctx = this.canvas.getContext("2d");
    this.mode = "regions";
    this.regions = [];
    this.anchors = [];
    this.history = [];
    this.pendingAnchor = null;
    this.start = null;
    this.image = null;
    const $ = (s) => document.querySelector(s);
    $("#editor-cancel").onclick = onCancel;
    $("#editor-regions").onclick = () => this.setMode("regions");
    $("#editor-anchors").onclick = () => this.setMode("anchors");
    $("#editor-undo").onclick = () => {
      const old = this.history.pop();
      if (old) {
        this.regions = old.regions;
        this.anchors = old.anchors;
        this.pendingAnchor = null;
        this.list();
        this.draw();
      }
    };
    this.schemaData = () => {
      if (this.pendingAnchor)
        throw Error(
          "Отметь вторую границу стыка или убери первую метку повторным нажатием",
        );
      return validateSchema({
        version: 1,
        id: this.schemaId,
        name: $("#schema-name").value,
        keywords: $("#schema-keywords")
          .value.split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        regions: this.regions,
        anchors: this.anchors,
        ...(this.reference ? { reference: this.reference } : {}),
      });
    };
    $("#editor-export").onclick = () => {
      try {
        downloadSchema(this.schemaData());
      } catch (e) {
        toast(e.message);
      }
    };
    $("#editor-save").onclick = () => {
      try {
        onSave(this.schemaData());
      } catch (e) {
        toast(e.message);
      }
    };
    $("#schema-image").onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) {
        toast("Выбери картинку до 10 МБ");
        return;
      }
      try {
        const image = await createImageBitmap(file);
        if (image.width * image.height > 40000000) {
          image.close();
          throw Error("Картинка слишком большая");
        }
        this.image?.close();
        this.image = image;
        const reference = document.createElement("canvas"),
          scale = Math.min(1, 1280 / image.width, 800 / image.height);
        reference.width = Math.round(image.width * scale);
        reference.height = Math.round(image.height * scale);
        const ctx = reference.getContext("2d");
        ctx.fillStyle = "#fff8ec";
        ctx.fillRect(0, 0, reference.width, reference.height);
        ctx.drawImage(image, 0, 0, reference.width, reference.height);
        this.reference = reference.toDataURL("image/jpeg", 0.75);
        this.draw();
      } catch {
        toast("Не получилось открыть картинку. Попробуй PNG или JPEG.");
      }
      e.target.value = "";
    };
    this.canvas.addEventListener("pointerdown", (e) => {
      if (this.start || e.button !== 0) return;
      const p = this.point(e);
      this.canvas.setPointerCapture(e.pointerId);
      if (this.mode === "anchors") {
        this.remember();
        const near = this.anchors.findIndex(
          (a) => Math.hypot(a.x - p.x, a.y - p.y) < 0.02,
        );
        if (near >= 0) {
          const group = this.anchors[near].group;
          this.anchors = this.anchors.filter((a, i) =>
            group ? a.group !== group : i !== near,
          );
          this.pendingAnchor = null;
        } else if (this.anchors.length < 100) {
          const edges = [];
          for (const r of this.regions) {
            if (p.y >= r.y - 0.02 && p.y <= r.y + r.h + 0.02)
              for (const x of [r.x, r.x + r.w]) edges.push({ x, y: p.y });
            if (p.x >= r.x - 0.02 && p.x <= r.x + r.w + 0.02)
              for (const y of [r.y, r.y + r.h]) edges.push({ x: p.x, y });
          }
          edges.sort(
            (a, b) =>
              Math.hypot(a.x - p.x, a.y - p.y) -
              Math.hypot(b.x - p.x, b.y - p.y),
          );
          if (
            !edges.length ||
            Math.hypot(edges[0].x - p.x, edges[0].y - p.y) > 0.04
          ) {
            this.history.pop();
            toast("Поставь метку на границе области");
            return;
          }
          const point = edges[0];
          if (this.pendingAnchor) {
            const first = this.pendingAnchor;
            if (
              Math.abs(first.x - point.x) > 0.005 &&
              Math.abs(first.y - point.y) > 0.005
            ) {
              this.history.pop();
              toast("Вторая точка должна быть на той же границе");
              return;
            }
            this.anchors.push({
              ...point,
              group: first.group,
              label: first.label,
            });
            this.pendingAnchor = null;
          } else {
            const anchor = {
              ...point,
              group: crypto.randomUUID(),
              label: $("#anchor-label").value.trim() || "Стык",
            };
            this.anchors.push(anchor);
            this.pendingAnchor = anchor;
            toast(
              "Теперь отметь другой край этого соединения на той же границе",
            );
          }
        }
        this.draw();
        return;
      }
      this.start = { ...p, pointer: e.pointerId };
      this.end = p;
    });
    this.canvas.addEventListener("pointermove", (e) => {
      if (this.start?.pointer === e.pointerId) {
        this.end = this.point(e);
        this.draw();
      }
    });
    this.canvas.addEventListener("pointerup", (e) => {
      if (this.start?.pointer !== e.pointerId) return;
      const r = this.rectangle(this.start, this.point(e));
      this.start = null;
      this.end = null;
      if (r.w < 0.02 || r.h < 0.02) {
        this.draw();
        toast("Выдели область, потянув по картинке");
        return;
      }
      if (this.regions.length >= 32) {
        this.draw();
        toast("Максимум 32 области");
        return;
      }
      if (this.regions.some((other) => overlaps(r, other))) {
        this.draw();
        toast("Области не должны перекрываться. Их края можно совмещать.");
        return;
      }
      this.remember();
      this.regions.push({
        ...r,
        id: crypto.randomUUID(),
        label: "",
        instruction: "",
      });
      this.list();
      this.draw();
      document
        .querySelector("#editor-regions-list")
        .lastElementChild?.querySelector("input")
        ?.focus({ preventScroll: true });
    });
    for (const event of ["pointercancel", "lostpointercapture"])
      this.canvas.addEventListener(event, () => {
        this.start = null;
        this.end = null;
        this.draw();
      });
  }
  open(schema = null) {
    this.image?.close();
    this.image = null;
    this.reference = schema?.reference;
    this.schemaId =
      schema && !BUILTIN_SCHEMAS.some((s) => s.id === schema.id)
        ? schema.id
        : crypto.randomUUID();
    this.regions = structuredClone(schema?.regions || []);
    this.anchors = structuredClone(schema?.anchors || []);
    this.history = [];
    this.pendingAnchor = null;
    this.start = null;
    document.querySelector("#schema-name").value = schema?.name || "";
    document.querySelector("#schema-keywords").value =
      schema?.keywords.join(", ") || "";
    this.setMode("regions");
    this.list();
    this.draw();
    if (this.reference) {
      const current = this.schemaId;
      fetch(this.reference)
        .then((r) => r.blob())
        .then(createImageBitmap)
        .then((image) => {
          if (this.schemaId !== current) {
            image.close();
            return;
          }
          this.image = image;
          this.draw();
        })
        .catch(() => this.toast("Подложка не открылась. Добавь её ещё раз."));
    }
  }
  setMode(mode) {
    this.mode = mode;
    document.querySelector("#editor-regions").className =
      mode === "regions" ? "btn2" : "ghost";
    document.querySelector("#editor-anchors").className =
      mode === "anchors" ? "btn2" : "ghost";
    document.querySelector("#editor-help").textContent =
      mode === "regions"
        ? "Потяни по картинке, чтобы выделить область. Затем подпиши задание. Края примагничиваются друг к другу."
        : "Подпиши стык и отметь две его крайние точки на одной границе — например, левый и правый край шеи. Нажатие на существующую метку удаляет весь стык.";
  }
  remember() {
    this.history.push(
      structuredClone({ regions: this.regions, anchors: this.anchors }),
    );
    if (this.history.length > 60) this.history.shift();
  }
  point(e) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
    };
  }
  rectangle(a, b) {
    const snap = (v, axis) => {
      const edges = this.regions.flatMap((r) =>
        axis === "x" ? [r.x, r.x + r.w] : [r.y, r.y + r.h],
      );
      const near = edges.find((x) => Math.abs(x - v) < 0.015);
      return near ?? Math.round(v * 100) / 100;
    };
    const x = snap(Math.min(a.x, b.x), "x"),
      y = snap(Math.min(a.y, b.y), "y");
    return {
      x,
      y,
      w: snap(Math.max(a.x, b.x), "x") - x,
      h: snap(Math.max(a.y, b.y), "y") - y,
    };
  }
  list() {
    const list = document.querySelector("#editor-regions-list");
    list.replaceChildren();
    this.regions.forEach((r, i) => {
      const card = document.createElement("div");
      card.className = "region-editor";
      const title = document.createElement("strong");
      title.textContent = `Область ${i + 1}`;
      title.style.color = PALETTE[(i + 1) % PALETTE.length];
      const label = document.createElement("input");
      label.placeholder = "Задание: например, голова с ушами";
      label.ariaLabel = `Задание области ${i + 1}`;
      label.maxLength = 100;
      label.value = r.label;
      label.oninput = () => {
        r.label = label.value;
        this.draw();
      };
      const hint = document.createElement("input");
      hint.placeholder = "Подсказка: морда смотрит влево, шея справа";
      hint.ariaLabel = `Подсказка области ${i + 1}`;
      hint.maxLength = 500;
      hint.value = r.instruction;
      hint.oninput = () => (r.instruction = hint.value);
      const remove = document.createElement("button");
      remove.className = "ghost";
      remove.textContent = "Удалить область";
      remove.onclick = () => {
        this.remember();
        this.regions.splice(i, 1);
        this.list();
        this.draw();
      };
      card.append(title, label, hint, remove);
      list.append(card);
    });
  }
  draw() {
    const c = this.ctx,
      W = this.canvas.width,
      H = this.canvas.height;
    c.fillStyle = "#fff8ec";
    c.fillRect(0, 0, W, H);
    if (this.image) {
      const scale = Math.min(W / this.image.width, H / this.image.height),
        w = this.image.width * scale,
        h = this.image.height * scale;
      c.globalAlpha = 0.65;
      c.drawImage(this.image, (W - w) / 2, (H - h) / 2, w, h);
      c.globalAlpha = 1;
    }
    const regions = [
      ...this.regions,
      ...(this.start && this.end ? [this.rectangle(this.start, this.end)] : []),
    ];
    regions.forEach((r, i) => {
      const color = PALETTE[(i + 1) % PALETTE.length];
      c.fillStyle = color + "28";
      c.fillRect(r.x * W, r.y * H, r.w * W, r.h * H);
      c.strokeStyle = color;
      c.lineWidth = 5;
      c.strokeRect(r.x * W, r.y * H, r.w * W, r.h * H);
      c.fillStyle = color;
      c.font = "bold 30px system-ui";
      c.fillText(String(i + 1), r.x * W + 12, r.y * H + 36);
    });
    c.fillStyle = "#ef476f";
    for (const p of this.anchors) {
      c.beginPath();
      c.arc(p.x * W, p.y * H, 10, 0, Math.PI * 2);
      c.fill();
    }
  }
}
