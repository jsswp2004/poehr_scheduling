// The assistant only ever talks about visit codes (v_1a2b3c4d). This swaps each code for the
// patient's name in the browser, using the schedule the staff member is already allowed to see.
// Names never go to the server for this.
const REF = /\bv_[0-9a-f]{8}\b/g;

export function rehydrate(text, refs, items) {
  return text.replace(REF, (ref) => {
    const appointmentId = refs?.[ref]?.appointment_id;
    const item = items.find((i) => i.appointment_id === appointmentId);
    return item ? item.patient_display : "a visit";
  });
}

const LOCATION_WORDS = { home: "at home", other: "somewhere else" };

/** What a proposal asks the person to approve, in the same words the buttons use elsewhere. */
export function describeProposal(proposal, name) {
  switch (proposal.kind) {
    case "admit":
      return { question: `Let ${name} into the visit?`, confirm: "Admit patient" };
    case "send_link":
      return { question: `Send ${name} a join link?`, confirm: "Send link" };
    case "end_visit":
      return { question: `End the visit with ${name} for everyone?`, confirm: "End visit" };
    case "set_location":
      return { question: `Record that ${name} was ${LOCATION_WORDS[proposal.location] ?? "there"}?`, confirm: "Save location" };
    default:
      return null;
  }
}
