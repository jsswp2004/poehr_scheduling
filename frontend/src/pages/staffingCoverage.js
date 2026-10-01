// Shared look for coverage status (calendar cells, legend, day detail).
// Colors are never the only signal: every status also has an icon + text label.
export const COVERAGE_STATUS = {
  met: { label: "Covered", icon: "✓", color: "#2e7d32", bg: "rgba(46,125,50,0.14)" },
  at_risk: { label: "At risk", icon: "!", color: "#b26a00", bg: "rgba(255,179,0,0.26)" },
  not_met: { label: "Not met", icon: "✕", color: "#c62828", bg: "rgba(211,47,47,0.18)" },
  unknown: { label: "No census", icon: "?", color: "#616161", bg: "rgba(158,158,158,0.12)" },
};

export const toISO = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
