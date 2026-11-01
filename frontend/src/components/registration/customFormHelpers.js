const norm = (v) => String(v === null || v === undefined ? "" : v).trim().toLowerCase();

/** Whether a question shows, given the answers so far. A question hides when the one it depends on is hidden or not answered that way. */
export const itemVisible = (form, index, answers) => {
  const item = form.items[index];
  if (!item || item.show_when === null || item.show_when === undefined) return true;
  const parent = form.items[item.show_when];
  if (!parent || item.show_when >= index) return true;
  if (!itemVisible(form, item.show_when, answers)) return false;
  return norm(answers[parent.id]) === norm(item.show_when_value);
};

/** The questions of a form that show right now. */
export const visibleItems = (form, answers) => form.items.filter((_, i) => itemVisible(form, i, answers));

/** Required questions that show and have no answer, as [{step, key, label}] for the completeness list. */
export const missingCustom = (forms, answers) => {
  const out = [];
  (forms || []).forEach((form) => {
    visibleItems(form, answers).forEach((item) => {
      if (item.required && !norm(answers[item.id])) out.push({ step: "forms", key: `item-${item.id}`, label: `${form.name}: ${item.label}` });
    });
  });
  return out;
};

/** What to send when saving: every question of the forms; questions that are hidden are cleared. */
export const answersToSend = (forms, answers) => {
  const out = {};
  (forms || []).forEach((form) => {
    const shown = new Set(visibleItems(form, answers).map((i) => i.id));
    form.items.forEach((item) => {
      out[item.id] = shown.has(item.id) ? answers[item.id] ?? "" : "";
    });
  });
  return out;
};

/** True once the forms have at least one answer and no required question is open. */
export const formsComplete = (forms, answers) =>
  (forms || []).length > 0 && missingCustom(forms, answers).length === 0 && (forms || []).some((f) => visibleItems(f, answers).some((i) => norm(answers[i.id])));
