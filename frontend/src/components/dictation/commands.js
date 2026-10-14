// Spoken commands and text joining for dictation.
//
// Transcribe Medical's DICTATION mode already turns "period" and "comma" into punctuation, so
// only the layout and control phrases are handled here.

/**
 * Apply spoken commands to a finished piece of dictation.
 * Returns { text, stop }: `stop` is true when the clinician said "stop dictation".
 */
export function applyVoiceCommands(raw) {
  let text = String(raw || "");
  let stop = false;
  const stopPattern = /[\s,.]*\bstop dictation\b[\s.,!?]*$/i;
  if (stopPattern.test(text)) {
    stop = true;
    text = text.replace(stopPattern, "");
  }
  text = text
    .replace(/\s*\bnew paragraph\b[.,]?\s*/gi, "\n\n")
    .replace(/\s*\bnew line\b[.,]?\s*/gi, "\n");
  return { text: text.replace(/^[ \t]+/, ""), stop };
}

/** Add dictated text after what is already in a field, with one space between unless there is a line break. */
export function appendText(current, addition) {
  const base = current == null ? "" : String(current);
  const add = String(addition || "");
  if (!add) return base;
  if (!base) return add.replace(/^\s+/, "");
  if (/\s$/.test(base) || /^\s/.test(add)) return base + add;
  return `${base} ${add}`;
}
