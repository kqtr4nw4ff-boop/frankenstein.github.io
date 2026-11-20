export function playerStatus(
  state,
  pid,
  { pending = false, now = Date.now() } = {},
) {
  const me = state?.players.find((p) => p.id === pid);
  if (!me?.task || me.strip < 0)
    return {
      kind: "spectator",
      title: "Ты зритель в этом раунде",
      overlay: "Ты присоединишься к рисованию в следующем раунде.",
    };
  if (pending)
    return {
      kind: "pending",
      title: "Сохраняем твой фрагмент…",
      overlay: "Отправляем твой рисунок. Пока не закрывай вкладку.",
    };
  if (me.done)
    return {
      kind: "done",
      title: "Твой фрагмент принят ✓",
      overlay: "Готово! Чужие части увидим вместе в финале.",
    };
  if (state.turn?.pid === pid)
    return {
      kind: now < state.turn.endsAt ? "active" : "expired",
      title:
        now < state.turn.endsAt
          ? "Сейчас твой ход — рисуй!"
          : "Время вышло — сохраняем",
      overlay: "",
    };
  const artist =
    state.players.find((p) => p.id === state.turn?.pid)?.name ||
    "другой художник";
  return {
    kind: "waiting",
    title: `Сейчас рисует ${artist}`,
    overlay: `Твой ход ещё не начался. Твоё задание остаётся слева, а участок — жёлтым.`,
  };
}
