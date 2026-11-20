export const ROLE_LABELS = {
  head: "Голова",
  body: "Туловище",
  limbs: "Лапы и конечности",
  tail: "Хвост",
  wings: "Крылья",
  neck: "Шея",
  shell: "Раковина",
  tentacles: "Щупальца",
  cap: "Шляпка",
  fins: "Плавники",
  detail: "Твоя деталь",
};
export function taskRoles(label) {
  const rules = [
    ["head", /голов|морд|лицо|клюв|купол/i],
    ["body", /тулов|корпус|груд|живот|плеч/i],
    ["limbs", /лап|ног|рук|колёс|копыт/i],
    ["tail", /хвост/i],
    ["wings", /крыл/i],
    ["neck", /ше[яиюе]/i],
    ["shell", /раковин/i],
    ["tentacles", /щупал|лент/i],
    ["cap", /шляпк/i],
    ["fins", /плавник/i],
  ];
  const roles = rules
    .filter(([, pattern]) => pattern.test(label))
    .map(([role]) => role);
  return roles.length ? roles : ["detail"];
}
