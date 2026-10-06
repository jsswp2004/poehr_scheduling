/**
 * Plain-language differences between two Status Board layouts, for the Versions tab ("what changed in v4?").
 * `before` and `after` are config objects as the API returns them. Returns a list of sentences.
 */
const byKey = (columns) => Object.fromEntries((columns || []).map((c, i) => [c.key, { ...c, index: i }]));

const names = (list) => list.map((c) => `"${c.label || c.key}"`).join(", ");

export function diffConfigs(before, after) {
  const out = [];
  const a = byKey(before?.columns);
  const b = byKey(after?.columns);

  const added = Object.values(b).filter((c) => !a[c.key]);
  const removed = Object.values(a).filter((c) => !b[c.key]);
  if (added.length) out.push(`Added ${added.length === 1 ? "column" : "columns"} ${names(added)}`);
  if (removed.length) out.push(`Removed ${removed.length === 1 ? "column" : "columns"} ${names(removed)}`);

  for (const key of Object.keys(b)) {
    const x = a[key];
    const y = b[key];
    if (!x) continue;
    if (x.label !== y.label) out.push(`Renamed column "${x.label || x.key}" to "${y.label}"`);
    if (x.width !== y.width) out.push(`Resized "${y.label || key}" from ${x.width} to ${y.width}`);
    if (!!x.visible !== !!y.visible) out.push(`${y.visible ? "Showed" : "Hid"} column "${y.label || key}"`);
    if (JSON.stringify(x.options || []) !== JSON.stringify(y.options || [])) out.push(`Changed the choices in "${y.label || key}"`);
  }

  // order only counts for columns present in both
  const shared = (cols) => (cols || []).map((c) => c.key).filter((k) => a[k] && b[k]);
  if (JSON.stringify(shared(before?.columns)) !== JSON.stringify(shared(after?.columns))) out.push("Reordered the columns");

  const sa = Object.fromEntries((before?.statuses || []).map((s) => [s.value, s]));
  const sb = Object.fromEntries((after?.statuses || []).map((s) => [s.value, s]));
  Object.keys(sb).filter((k) => !sa[k]).forEach((k) => out.push(`Added status ${sb[k].code}`));
  Object.keys(sa).filter((k) => !sb[k]).forEach((k) => out.push(`Removed status ${sa[k].code}`));
  Object.keys(sb)
    .filter((k) => sa[k] && (sa[k].code !== sb[k].code || sa[k].label !== sb[k].label))
    .forEach((k) => out.push(`Changed status ${sa[k].code} to ${sb[k].code} (${sb[k].label})`));

  const ra = before?.rules || [];
  const rb = after?.rules || [];
  if (JSON.stringify(ra) !== JSON.stringify(rb)) {
    out.push(rb.length === ra.length ? "Changed the color rules" : `Color rules went from ${ra.length} to ${rb.length}`);
  }

  if ((before?.vitals_overdue_minutes ?? 60) !== (after?.vitals_overdue_minutes ?? 60)) {
    out.push(`Vitals are overdue after ${after?.vitals_overdue_minutes} minutes (was ${before?.vitals_overdue_minutes ?? 60})`);
  }

  for (const [key, label] of [["nurses", "nurse"], ["doctors", "doctor"]]) {
    const x = before?.roster?.[key] ?? null;
    const y = after?.roster?.[key] ?? null;
    if (JSON.stringify(x) !== JSON.stringify(y)) {
      out.push(y === null ? `The ${label} list is now everyone in the clinic` : `The ${label} list is now ${y.length} chosen ${y.length === 1 ? "person" : "people"}`);
    }
  }
  return out;
}
