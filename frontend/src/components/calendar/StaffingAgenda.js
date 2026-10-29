/**
 * Agenda view for the Staffing calendar: seven days starting from the selected
 * date, one card per day with a row for Day, Evening and Night (staffed /
 * needed, a status dot, and what is short). Tap a row to see the people by
 * unit, with Assign (or Pick up) on every gap. It reads well on a phone, which
 * is where it opens by default.
 *
 * Plugs into react-big-calendar as a custom view and reads its data from
 * StaffingDayContext, the same context the Day board uses.
 */
import { useContext, useState } from "react";
import { Box, Button, Typography } from "@mui/material";
import moment from "moment";
import { COVERAGE_STATUS, toISO } from "../../pages/staffingCoverage";
import { SHIFT_NAME, summarizeShifts, toFillList } from "../../utils/calendar/staffingSummary";
import { StaffingDayContext, columnUnits, dayColumns } from "./StaffingDayBoard";
import { CalendarSkeleton, CoverageFailedBanner, RoleFilterNote } from "./StaffingStateViews";

const ROLE_COLORS = { rn: "#2563eb", lpn: "#7c3aed", cna: "#0d9488", other: "#64748b" };
const ROLE_LABELS = { rn: "RN", lpn: "LPN", cna: "CNA", other: "Other" };
const unitKey = (id) => (id == null || id === "" ? "none" : String(id));

/** Seven days starting at `date`. */
export function agendaRange(date) {
  const start = moment(date).startOf("day");
  return Array.from({ length: 7 }, (_, i) => start.clone().add(i, "days").toDate());
}

export function agendaTitle(date) {
  const a = moment(date);
  const b = moment(date).add(6, "days");
  return a.month() === b.month() ? `${a.format("MMMM D")} – ${b.format("D")}` : `${a.format("MMM D")} – ${b.format("MMM D")}`;
}

/** The one-line "what is short" text under a shift row. */
export function shortLine(fills, summaryRow, items) {
  if (fills.length > 0) {
    return fills
      .map((f) => `${f.unit_name || "Organization"} short ${f.need}${f.kind === "rn" ? " RN" : ""}`)
      .join(", ");
  }
  if (summaryRow && (summaryRow.status === "not_met" || summaryRow.status === "at_risk")) {
    const reason = (summaryRow.reasons || [])[0];
    if (reason) return reason;
  }
  if (summaryRow && summaryRow.status === "met") return items.length > 1 ? "All units covered" : "Covered";
  return "";
}

function ShiftRow({ iso, type, dayShifts, info, open, onToggle }) {
  const { canFill, fillLabel, onFill } = useContext(StaffingDayContext);
  const summary = summarizeShifts(info).find((r) => r.shift_type === type);
  const fills = toFillList(info).filter((f) => f.shift_type === type);
  const units = columnUnits(type, dayShifts, info);
  const people = dayShifts.filter((s) => s.shift_type === type).length;
  const st = summary ? summary.status : "unknown";
  const m = COVERAGE_STATUS[st] || COVERAGE_STATUS.unknown;
  const problem = st === "not_met" || st === "at_risk";
  const line = shortLine(fills, summary, (info && info.items.filter((i) => i.shift_type === type)) || []);
  const mayFill = canFill ? canFill(iso) : false;

  return (
    <Box sx={{ borderTop: "1px solid #eef1f6" }}>
      <Box
        component="button"
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        aria-label={`${SHIFT_NAME[type] || (summary && summary.label) || type} ${summary && st !== "unknown" ? `${summary.assigned} of ${summary.required}` : `${people} people`}${problem ? `, ${m.label}` : ""}`}
        sx={{
          all: "unset",
          boxSizing: "border-box",
          width: "100%",
          minHeight: 52,
          display: "flex",
          alignItems: "center",
          gap: 1.25,
          px: 1.5,
          py: 0.75,
          cursor: "pointer",
          "&:hover": { bgcolor: "#f8fafc" },
          "&:focus-visible": { outline: "2px solid #2563eb", outlineOffset: -2 },
        }}
      >
        <Typography sx={{ width: 70, fontWeight: 700, fontSize: 15 }}>{SHIFT_NAME[type] || (summary && summary.label) || type}</Typography>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700, fontSize: 15, color: problem ? m.color : "text.primary" }}>
            {summary && st !== "unknown" ? `${summary.assigned} / ${summary.required}` : `${people} ${people === 1 ? "person" : "people"}`}
          </Typography>
          {line && (
            <Typography variant="caption" sx={{ display: "block", color: problem ? m.color : "text.secondary" }}>
              {line}
            </Typography>
          )}
        </Box>
        {problem && (
          <Box component="span" title={m.label} sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: m.color, flexShrink: 0 }} />
        )}
        <Box component="span" aria-hidden sx={{ color: "text.secondary", width: 14, textAlign: "center" }}>
          {open ? "▾" : "▸"}
        </Box>
      </Box>

      {open && (
        <Box sx={{ px: 1.5, pb: 1.25 }}>
          {units.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              Nobody on this shift.
            </Typography>
          )}
          {units.map((u) => {
            const open_ = fills.filter((f) => unitKey(f.unit_id) === u.key);
            return (
              <Box key={u.key} sx={{ mt: 0.75 }}>
                <Typography sx={{ fontWeight: 700, fontSize: 13 }}>{u.name}</Typography>
                {u.people.map((s) => {
                  const role = s.nursing_role || "other";
                  return (
                    <Box key={s.id} sx={{ display: "flex", alignItems: "center", gap: 1, minHeight: 30, fontSize: 14 }}>
                      <Box component="span" sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: ROLE_COLORS[role] || ROLE_COLORS.other }} />
                      <Box component="span" sx={{ flex: 1, minWidth: 0 }}>
                        {s.staff_name}
                      </Box>
                      <Box component="span" sx={{ fontSize: 12, color: "text.secondary" }}>
                        {ROLE_LABELS[role]}
                      </Box>
                    </Box>
                  );
                })}
                {open_.map((f) => (
                  <Box key={f.key} sx={{ display: "flex", alignItems: "center", gap: 1, minHeight: 40 }}>
                    <Typography sx={{ flex: 1, fontSize: 13, fontWeight: 700, color: COVERAGE_STATUS.not_met.color }}>
                      {f.kind === "rn" ? `Open: ${f.need} more RN${f.need === 1 ? "" : "s"} needed` : `Open: ${f.need} more needed`}
                    </Typography>
                    {mayFill && onFill && (
                      <Button size="small" variant="outlined" onClick={() => onFill(f, iso)} aria-label={`${fillLabel} ${u.name} ${SHIFT_NAME[type] || type}`} sx={{ minHeight: 36 }}>
                        {fillLabel}
                      </Button>
                    )}
                  </Box>
                ))}
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}

export default function StaffingAgenda({ date, onDrillDown }) {
  const { coverage, shifts, loading, failed, retrying, onRetry, roleLabel, isAdmin, onAdd } = useContext(StaffingDayContext);
  const [openRows, setOpenRows] = useState({});
  const days = agendaRange(date);
  const today = toISO(new Date());
  const toggle = (key) => setOpenRows((o) => ({ ...o, [key]: !o[key] }));

  return (
    <Box sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>
      {roleLabel && <RoleFilterNote role={roleLabel} />}
      {failed && <CoverageFailedBanner detail="The people below are correct." onRetry={onRetry} retrying={retrying} />}
      {loading && !coverage && !(shifts || []).length && <CalendarSkeleton />}
      {days.map((d) => {
        const iso = toISO(d);
        const info = coverage && coverage.days ? coverage.days[iso] : null;
        const dayShifts = (shifts || []).filter((s) => s.date === iso);
        const empty = dayShifts.length === 0 && (!info || info.items.length === 0);
        const columns = empty ? [] : dayColumns(dayShifts, info);
        const isToday = iso === today;
        return (
          <Box
            key={iso}
            sx={{
              mb: 1.25,
              bgcolor: "background.paper",
              border: "1px solid #e2e8f0",
              borderLeft: isToday ? "3px solid #2563eb" : "1px solid #e2e8f0",
              borderRadius: 2,
              overflow: "hidden",
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 1.5, py: 1 }}>
              <Typography sx={{ fontWeight: 700, fontSize: 16, color: isToday ? "#2563eb" : "text.primary" }}>
                {moment(d).format("ddd, MMM D")}
              </Typography>
              {isToday && (
                <Typography variant="caption" sx={{ color: "#2563eb", fontWeight: 700 }}>
                  Today
                </Typography>
              )}
              <Box sx={{ flex: 1 }} />
              <Button size="small" onClick={() => onDrillDown && onDrillDown(d, "day")} sx={{ minHeight: 36 }} aria-label={`Coverage status ${moment(d).format("dddd, MMMM D")}`}>
                Coverage Status
              </Button>
            </Box>
            {empty ? (
              <Box sx={{ px: 1.5, pb: 1.25, display: "flex", alignItems: "center", gap: 1 }}>
                <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
                  Nothing scheduled, and no staffing requirement applies.
                </Typography>
                {isAdmin && onAdd && (
                  <Button size="small" variant="outlined" onClick={() => onAdd(iso)} sx={{ minHeight: 36 }}>
                    + Add shift
                  </Button>
                )}
              </Box>
            ) : (
              columns.map((type) => (
                <ShiftRow
                  key={type}
                  iso={iso}
                  type={type}
                  dayShifts={dayShifts}
                  info={info}
                  open={!!openRows[`${iso}-${type}`]}
                  onToggle={() => toggle(`${iso}-${type}`)}
                />
              ))
            )}
          </Box>
        );
      })}
    </Box>
  );
}

/** The react-big-calendar custom view: seven days from the selected date, paged by a week. */
export function StaffingAgendaView(props) {
  return <StaffingAgenda date={props.date} onDrillDown={props.onDrillDown} />;
}
StaffingAgendaView.range = (date) => agendaRange(date);
StaffingAgendaView.navigate = (date, action) => {
  switch (action) {
    case "PREV":
      return moment(date).subtract(7, "days").toDate();
    case "NEXT":
      return moment(date).add(7, "days").toDate();
    default:
      return date;
  }
};
StaffingAgendaView.title = (date) => agendaTitle(date);
