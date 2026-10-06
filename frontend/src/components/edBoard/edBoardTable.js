import { ORDER_ICON_COLUMNS, formatLos, losMinutes, vitalsStatus } from "./edBoardColumns";

export const BED_LABEL = { available: "Ready", cleaning: "Cleaning", blocked: "Blocked", occupied: "" };
const SEX = { F: "Female", M: "Male", X: "Other" };
const ORDER_RANK = { pending: 1, done: 2 };

/** Columns that cannot be sorted or filtered (the buttons column). */
export const isPlainColumn = (col) => col.key === "actions";

/** The text a cell shows, used for filtering. `ctx` is { now, statuses, limit }. */
export const cellText = (col, row, ctx) => {
  const v = row.visit;
  if (col.type === "custom") {
    const value = v?.custom?.[col.key];
    if (col.kind === "checkbox") return value ? "Yes" : "";
    return value == null ? "" : String(value);
  }
  switch (col.key) {
    case "loc":
      return row.type === "waiting" ? "WAITING" : row.loc || "";
    case "los":
      return v ? formatLos(losMinutes(v.arrival_time, ctx.now)) : "";
    case "patient":
      return v ? v.name : "";
    case "age":
      return v && v.age != null ? `${v.age}y /${v.sex || "?"}` : "";
    case "reason":
      return v?.reason || "";
    case "complaint":
      return v?.complaint || "";
    case "esi":
      return v && v.esi != null ? String(v.esi) : "";
    case "status":
      if (!v) return BED_LABEL[row.bed_status] || "";
      return ctx.statuses.find((s) => s.value === v.ed_status)?.code || "";
    case "md":
    case "rn":
      return v?.[col.key]?.name || "";
    case "resident":
      return v ? v.resident?.name || v.resident_text || "" : "";
    case "comments":
      return v ? v.comments || "" : row.hold_reason || "";
    case "vitals": {
      if (!v) return "";
      const vs = vitalsStatus(v, ctx.now, ctx.limit);
      return `${vs.overdue ? "Due " : ""}${vs.charted ? `${formatLos(vs.minutes)} ago` : "None yet"}`;
    }
    case "meds":
    case "lab":
    case "rad":
    case "urine":
    case "ekg":
    case "cardiac": {
      const state = v?.orders?.[col.key];
      return state ? `${ORDER_ICON_COLUMNS[col.key]} ${state === "done" ? "resulted" : "ordered"}` : "";
    }
    case "bed_status":
      return row.type === "bed" ? BED_LABEL[row.bed_status] || "Occupied" : "";
    case "inc_reg":
      return v && !v.registration_complete ? "Incomplete" : "";
    case "gender":
      return v ? SEX[v.sex] || "" : "";
    case "reg_comp":
      return v ? (v.registration_complete ? "Yes" : "No") : "";
    default:
      return "";
  }
};

/** What a row sorts by in a column: a number, text, or null (empty, always last). */
export const sortValue = (col, row, ctx) => {
  const v = row.visit;
  if (col.type === "custom") {
    if (col.kind === "checkbox") return v ? (v.custom?.[col.key] ? 1 : 0) : null;
    const text = cellText(col, row, ctx);
    return text === "" ? null : text.toLowerCase();
  }
  switch (col.key) {
    case "los":
      return v ? losMinutes(v.arrival_time, ctx.now) : null;
    case "age":
      return v && v.age != null ? v.age : null;
    case "esi":
      return v && v.esi != null ? v.esi : null;
    case "status": {
      if (!v) return null;
      const at = ctx.statuses.findIndex((s) => s.value === v.ed_status);
      return at < 0 ? null : at;
    }
    case "vitals":
      return v ? vitalsStatus(v, ctx.now, ctx.limit).minutes : null;
    case "meds":
    case "lab":
    case "rad":
    case "urine":
    case "ekg":
    case "cardiac":
      return v ? ORDER_RANK[v.orders?.[col.key]] || 0 : null;
    case "reg_comp":
      return v ? (v.registration_complete ? 1 : 0) : null;
    case "inc_reg":
      return v ? (v.registration_complete ? 0 : 1) : null;
    default: {
      const text = cellText(col, row, ctx);
      return text === "" ? null : text.toLowerCase();
    }
  }
};

const compare = (a, b) => {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
};

/** Rows sorted by one column, ascending or descending; empty cells stay at the bottom either way. */
export const sortRows = (rows, col, dir, ctx) => {
  if (!col) return rows;
  const sign = dir === "desc" ? -1 : 1;
  return rows
    .map((row, index) => ({ row, index, value: sortValue(col, row, ctx) }))
    .sort((x, y) => {
      if (x.value === null && y.value === null) return x.index - y.index;
      if (x.value === null) return 1;
      if (y.value === null) return -1;
      return sign * compare(x.value, y.value) || x.index - y.index;
    })
    .map((item) => item.row);
};

/** Rows whose shown text contains every column filter (case-insensitive). */
export const filterByColumns = (rows, columns, filters, ctx) => {
  const active = columns.filter((c) => (filters[c.key] || "").trim() !== "");
  if (active.length === 0) return rows;
  return rows.filter((row) => active.every((c) => cellText(c, row, ctx).toLowerCase().includes(filters[c.key].trim().toLowerCase())));
};
