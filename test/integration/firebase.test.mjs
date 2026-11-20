import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import { get, ref, set } from "firebase/database";
import { FirebaseRoom } from "../../src/firebase-room.js";
import { Game } from "../../src/game.js";
let environment;
const rooms = [];
before(async () => {
  environment = await initializeTestEnvironment({
    projectId: "demo-frankenstein-rules",
    database: {
      host: "127.0.0.1",
      port: 9000,
      rules: await fs.readFile("firebase/database.rules.json", "utf8"),
    },
  });
  await environment.clearDatabase();
});
after(async () => {
  for (const room of rooms) await room.close();
  await environment.cleanup();
});
async function connect(uid, pid, code) {
  const db = environment.authenticatedContext(uid).database(),
    room = new FirebaseRoom({ db, user: { uid } }, { pid, onStatus: () => {} });
  await room.open({ host: !code, room: code, name: pid, avatarId: 2 });
  rooms.push(room);
  return room;
}
test("creates rooms, joins with separate people and enforces private answers", async () => {
  const host = await connect("host-uid", "host-person"),
    guest = await connect("guest-uid", "guest-person", host.code),
    other = await connect("other-uid", "other-person", host.code);
  assert.equal(host.code.length, 6);
  assert.equal(host.slot, "0");
  assert.notEqual(guest.slot, other.slot);
  const game = new Game({ id: host.pid, name: "Host" });
  game.join({ id: guest.pid, name: "Guest" });
  game.join({ id: other.pid, name: "Other" });
  game.start("Секрет");
  game.snapshot(host.pid);
  await host.publish(game);
  await assertSucceeds(get(guest.path(`responses/${guest.pid}`)));
  await assertFails(get(guest.path(`responses/${other.pid}`)));
  await assertFails(get(guest.path("engine")));
  await assertFails(set(guest.path("engine"), "{}"));
  const response = JSON.parse(
    (await get(guest.path(`responses/${guest.pid}`))).val().payload,
  ).state;
  assert.ok(
    response.players.find((p) => p.id === guest.pid).task.briefs.length,
  );
  assert.equal(
    response.players.find((p) => p.id === other.pid).task.briefs,
    undefined,
  );
  await assertFails(set(guest.path(`members/${other.pid}/name`), "Hacked"));
  const stranger = environment.authenticatedContext("stranger").database();
  await assertFails(get(ref(stranger, `rooms/${host.code}/chat`)));
  await assertFails(
    get(ref(stranger, `rooms/${host.code}/responses/${guest.pid}`)),
  );
});
test("chat validates authors and text, while legitimate messages persist", async () => {
  const host = rooms[0],
    guest = rooms[1];
  guest.members = Object.values((await get(guest.path("members"))).val());
  await guest.chat("<img src=x onerror=alert(1)>");
  const chat = (await get(host.path("chat"))).val();
  assert.equal(Object.values(chat)[0].text, "<img src=x onerror=alert(1)>");
  await assertFails(
    set(guest.path("chat/spoof"), {
      pid: host.pid,
      uid: guest.user.uid,
      name: "Host",
      avatarId: 2,
      text: "Fake",
      createdAt: Date.now(),
    }),
  );
  await assert.rejects(() => guest.chat("x".repeat(301)));
});
test("only eight membership slots can be occupied", async () => {
  const host = await connect("full-host", "full-host");
  for (let i = 0; i < 7; i++)
    await connect("full-user-" + i, "full-person-" + i, host.code);
  await assert.rejects(
    () => connect("overflow", "overflow-person", host.code),
    /8 игроков/,
  );
});

test("leaving releases the membership slot", async () => {
  const host = rooms[0],
    guest = rooms[1],
    slot = guest.slot;
  await guest.leave();
  assert.equal((await get(host.path(`members/${guest.pid}`))).exists(), false);
  assert.equal((await get(host.path(`slots/${slot}`))).exists(), false);
  const replacement = await connect(
    "replacement-user",
    "replacement-person",
    host.code,
  );
  assert.equal(replacement.slot, slot);
});
