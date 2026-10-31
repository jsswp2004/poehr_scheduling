// A tiny shared note of which open editors hold work that has not been saved, so something outside them
// (the patient banner's arrows) can ask before moving to another patient and discarding it.
const open = new Set();

/** An editor calls this with true when it holds unsaved work and false when that is saved or cleared. */
export function setUnsaved(id, isUnsaved) {
  if (isUnsaved) open.add(id);
  else open.delete(id);
}

export function hasUnsaved() {
  return open.size > 0;
}
