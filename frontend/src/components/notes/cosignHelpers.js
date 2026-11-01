// Co-signature status of a note, as the server sends it in note.cosign.
export const COSIGN_NONE = { status: "none" };

export function cosignChip(cosign) {
  const c = cosign || COSIGN_NONE;
  if (c.status === "awaiting") {
    return {
      label: c.overdue ? "Overdue · awaiting co-signature" : "Awaiting co-signature",
      color: c.overdue ? "error" : "warning",
    };
  }
  if (c.status === "cosigned") return { label: "Co-signed", color: "success" };
  if (c.status === "returned") return { label: "Returned with comments", color: "warning" };
  return null;
}

export function cosignLine(cosign) {
  const c = cosign || COSIGN_NONE;
  if (c.status === "awaiting") return `Signed · Awaiting co-signature from ${c.cosigner_name}`;
  if (c.status === "cosigned") return `Co-signed by ${c.cosigner_name}`;
  if (c.status === "returned") return `Returned by ${c.cosigner_name}`;
  return "";
}

// The "needed by" field is a datetime-local string; the server wants an ISO instant (or nothing).
export function dueToIso(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export const REMINDERS = [
  { value: "", label: "No reminder" },
  { value: "0", label: "At the needed-by time" },
  { value: "60", label: "1 hour before" },
  { value: "240", label: "4 hours before" },
  { value: "1440", label: "1 day before" },
];
