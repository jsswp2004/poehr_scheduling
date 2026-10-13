// Plain-language labels for the billing codes the server returns. The server decides the codes;
// this only explains them so staff don't have to remember what 02, 10, 95 and 93 mean.
const PLACE = {
  10: "telehealth, patient at home",
  "02": "telehealth, patient not at home",
};
const MODIFIER = {
  95: "real-time audio and video",
  93: "audio only",
};

export function billingLine(billing) {
  const pos = billing?.place_of_service;
  if (!pos) return null;
  const modifier = billing.modifier;
  return `Place of service ${pos} (${PLACE[pos] ?? "telehealth"})${
    modifier ? `, modifier ${modifier} (${MODIFIER[modifier] ?? "telehealth"})` : ""
  }`;
}

/** True when a visit really took place but nobody has said where the patient was. */
export function needsLocation(session) {
  return Boolean(session?.status === "ended" && session.started_at && !session.billing?.confirmed);
}
