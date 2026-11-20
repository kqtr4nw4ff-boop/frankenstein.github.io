// sessionStorage survives reloads but is copied by Duplicate Tab. Claim a live-tab
// identity before joining, so a duplicated tab cannot accidentally become a second host.
export function claimTabIdentity(initial) {
  if (typeof BroadcastChannel === "undefined") return Promise.resolve(initial);
  let id = initial;
  const nonce = crypto.randomUUID(),
    channel = new BroadcastChannel("frankenstein-tabs-v1");
  channel.onmessage = (e) => {
    const m = e.data;
    if (m?.type === "claim" && m.id === id && m.nonce !== nonce)
      channel.postMessage({ type: "occupied", id, nonce: m.nonce });
    if (m?.type === "occupied" && m.nonce === nonce && m.id === id)
      id = crypto.randomUUID();
  };
  window.addEventListener("pagehide", () => channel.close(), { once: true });
  channel.postMessage({ type: "claim", id, nonce });
  return new Promise((resolve) => setTimeout(() => resolve(id), 120));
}
