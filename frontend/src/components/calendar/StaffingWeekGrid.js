/**
 * Week view for the Staffing calendar: one row per unit, one column per day,
 * a small chip per shift (D 8/8), and an "All units" roll-up row at the bottom.
 *
 * It plugs into react-big-calendar as a custom view (views={{ week: StaffingWeekView }}),
 * so the toolbar, Back/Next/Today and the range-change fetch all keep working.
 * The data comes from the parent through StaffingWeekContext, because the
 * calendar renders this component itself.
 */
import { createContext, useContext } from "react";
import { Box, Typography } from "@mui/material";
import moment from "moment";
import { COVERAGE_STATUS, toISO } from "../../pages/staffingCoverage";
import { CalendarSkeleton, CoverageFailedBanner } from "./StaffingStateViews";
import {
  SHIFT_NAME,
  SHIFT_ORDER,
  SHIFT_SHORT,
  worstStatus,
} from "../../utils/calendar/staffingSummary";

/** Value: { coverage, loading, failed, retrying, onRetry, search } */
export const StaffingWeekContext = createContext({ coverage: null, loading: false, failed: false, retrying: false, onRetry: null, search: "" });

const GRID = "150px repeat(7, minmax(0, 1fr))";

/** The seven days of the week containing `date` (locale week start, like the built-in week view). */
export function weekRange(date) {
  const start = moment(date).startOf("week");
  return Array.from({ length: 7 }, (_, i) => start.clone().add(i, "days").toDate());
}

export function weekTitle(date) {
  const days = weekRange(date);
  const a = moment(days[0]);
  const b = moment(days[6]);
  return a.month() === b.month()
    ? `${a.format("MMMM D")} – ${b.format("D")}`
    : `${a.format("MMM D")} – ${b.format("MMM D")}`;
}

/** One row per unit that has coverage items anywhere in the week, sorted by name. */
export function weekUnits(coverage, isoDays) {
  const by = {};
  isoDays.forEach((iso) => {
    ((coverage && coverage.days && coverage.days[iso] && coverage.days[iso].items) || []).forEach((it) => {
      const key = it.unit_id == null ? "org" : String(it.unit_id);
      const row = (by[key] ||= { key, unit_id: it.unit_id ?? null, name: it.unit_name || "Whole organization", census: null });
      if (row.census == null && it.census != null) row.census = it.census;
    });
  });
  return Object.values(by).sort((a, b) => a.name.localeCompare(b.name));
}

const itemsFor = (coverage, iso, unitKey) =>
  ((coverage && coverage.days && coverage.days[iso] && coverage.days[iso].items) || [])
    .filter((it) => (it.unit_id == null ? "org" : String(it.unit_id)) === unitKey)
    .sort((a, b) => SHIFT_ORDER.indexOf(a.shift_type) - SHIFT_ORDER.indexOf(b.shift_type));

/** Gaps in a day across all units: shifts that are not met or at risk. */
export function dayGaps(coverage, iso) {
  const items = (coverage && coverage.days && coverage.days[iso] && coverage.days[iso].items) || [];
  return items.filter((it) => it.status === "not_met" || it.status === "at_risk");
}

function Chip({ item }) {
  const m = COVERAGE_STATUS[item.status] || COVERAGE_STATUS.unknown;
  const problem = item.status === "not_met" || item.status === "at_risk";
  const short = (item.required || 0) - (item.assigned || 0);
  const label = `${SHIFT_SHORT[item.shift_type] || "?"} ${item.status === "unknown" ? "?" : `${item.assigned}/${item.required}`}${
    problem && short <= 0 ? " !" : ""
  }`;
  return (
    <Box
      component="span"
      title={`${SHIFT_NAME[item.shift_type] || item.shift_type}: ${m.label}`}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        height: 24,
        px: 0.9,
        borderRadius: "4px",
        fontSize: 13,
        fontWeight: 700,
        bgcolor: problem ? m.bg : "#f1f5f9",
        color: problem ? m.color : "#334155",
        borderBottom: `2px solid ${problem ? m.color : "#cbd5e1"}`,
      }}
    >
      {label}
    </Box>
  );
}

export default function StaffingWeekGrid({ date, onDrillDown }) {
  const { coverage, loading, failed, retrying, onRetry, search } = useContext(StaffingWeekContext);
  const days = weekRange(date);
  const isos = days.map(toISO);
  const today = toISO(new Date());
  const units = weekUnits(coverage, isos);

  let notice = null;
  if (failed) notice = <CoverageFailedBanner detail="This grid needs coverage to draw." onRetry={onRetry} retrying={retrying} />;
  // While another week is loading, the previous coverage has no days for this one: show the skeleton, not "no requirements".
  else if (loading && (!coverage || units.length === 0)) notice = <CalendarSkeleton />;
  else if (units.length === 0)
    notice = "No coverage requirements apply this week. Add one on the Assign Schedule tab, or enter a unit census so state rules can be calculated.";

  // The calendar needs the target view too, or it would move to the date but stay in Week.
  const drill = (d) => onDrillDown && onDrillDown(d, "day");

  return (
    <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", border: "1px solid #e2e8f0", borderRadius: 2, bgcolor: "background.paper" }}>
      <Box sx={{ display: "grid", minWidth: 760, gridTemplateColumns: GRID, borderBottom: "1px solid #e2e8f0", bgcolor: "#fafbfc", position: "sticky", top: 0, zIndex: 1 }}>
        <Box sx={{ px: 1.5, py: 1, fontSize: 12, fontWeight: 700, color: "#3b4556" }}>UNIT</Box>
        {days.map((d, i) => (
          <Box
            key={isos[i]}
            component="button"
            type="button"
            onClick={() => drill(d)}
            aria-label={`Open ${moment(d).format("dddd, MMMM D")}`}
            sx={{
              all: "unset",
              boxSizing: "border-box",
              cursor: "pointer",
              px: 1,
              py: 1,
              fontSize: 12,
              fontWeight: 700,
              color: isos[i] === today ? "#2563eb" : "#3b4556",
              "&:hover": { bgcolor: "#eef2f7" },
            }}
          >
            {moment(d).format("ddd D").toUpperCase()}
          </Box>
        ))}
      </Box>

      {notice ? (
        typeof notice === "string" ? (
          <Typography sx={{ p: 3 }} color="text.secondary">
            {notice}
          </Typography>
        ) : (
          <Box sx={{ p: 1.5 }}>{notice}</Box>
        )
      ) : (
        <>
          {units.map((u) => (
            <Box key={u.key} sx={{ display: "grid", minWidth: 760, gridTemplateColumns: GRID, borderBottom: "1px solid #e2e8f0" }}>
              <Box sx={{ px: 1.5, py: 1.25 }}>
                <Typography sx={{ fontWeight: 700, fontSize: 14 }}>{u.name}</Typography>
                {u.census != null && (
                  <Typography variant="caption" color="text.secondary">
                    Census {u.census}
                  </Typography>
                )}
              </Box>
              {days.map((d, i) => {
                const items = itemsFor(coverage, isos[i], u.key);
                const worst = worstStatus(items.map((it) => it.status));
                const summary = items
                  .map((it) => `${SHIFT_NAME[it.shift_type] || it.shift_type} ${it.assigned} of ${it.required}`)
                  .join(", ");
                return (
                  <Box
                    key={isos[i]}
                    component="button"
                    type="button"
                    onClick={() => drill(d)}
                    aria-label={`${u.name}, ${moment(d).format("ddd MMM D")}: ${summary || "no requirement"}`}
                    sx={{
                      all: "unset",
                      boxSizing: "border-box",
                      cursor: "pointer",
                      display: "flex",
                      flexWrap: "wrap",
                      alignContent: "flex-start",
                      gap: 0.5,
                      p: 1,
                      borderLeft: "1px solid #e2e8f0",
                      bgcolor: worst === "unknown" && items.length === 0 ? "#fafbfc" : "transparent",
                      "&:hover": { bgcolor: "#f1f5f9" },
                      "&:focus-visible": { outline: "2px solid #2563eb", outlineOffset: -2 },
                    }}
                  >
                    {items.map((it, idx) => (
                      <Chip key={`${it.shift_type}-${idx}`} item={it} />
                    ))}
                  </Box>
                );
              })}
            </Box>
          ))}

          <Box sx={{ display: "grid", minWidth: 760, gridTemplateColumns: GRID, bgcolor: "#fafbfc" }}>
            <Box sx={{ px: 1.5, py: 1.25, fontSize: 13, fontWeight: 700 }}>All units</Box>
            {days.map((d, i) => {
              const gaps = dayGaps(coverage, isos[i]);
              const info = coverage && coverage.days && coverage.days[isos[i]];
              const status = worstStatus(gaps.map((g) => g.status));
              const m = COVERAGE_STATUS[status] || COVERAGE_STATUS.met;
              const text = !info || info.items.length === 0 ? "—" : gaps.length === 0 ? "Covered" : `${gaps.length} gap${gaps.length === 1 ? "" : "s"}`;
              const color = !info || info.items.length === 0 ? "#64748b" : gaps.length === 0 ? COVERAGE_STATUS.met.color : m.color;
              return (
                <Box key={isos[i]} sx={{ px: 1, py: 1.25, borderLeft: "1px solid #e2e8f0", fontSize: 13, fontWeight: 700, color }}>
                  {text}
                </Box>
              );
            })}
          </Box>
        </>
      )}
      <Box sx={{ px: 1.5, py: 1, fontSize: 12, color: "text.secondary", borderTop: "1px solid #e2e8f0" }}>
        D day · E evening · N night, shown as people / needed. Click a cell or a date to open that day.
        {search && search.trim() ? " Search filters the Month and Day views, not this grid." : ""}
      </Box>
    </Box>
  );
}

/** The react-big-calendar custom view. Static members tell the calendar how to page and title the week. */
export function StaffingWeekView(props) {
  return <StaffingWeekGrid date={props.date} onDrillDown={props.onDrillDown} />;
}
StaffingWeekView.range = (date) => weekRange(date);
StaffingWeekView.navigate = (date, action) => {
  switch (action) {
    case "PREV":
      return moment(date).subtract(1, "week").toDate();
    case "NEXT":
      return moment(date).add(1, "week").toDate();
    default:
      return date;
  }
};
StaffingWeekView.title = (date) => weekTitle(date);
