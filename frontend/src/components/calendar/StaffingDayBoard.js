/**
 * Day view for the Staffing calendar: three columns (Day, Evening, Night), each
 * with its hours and a staffed / needed badge. Inside a column every unit is a
 * card: the people working (role dot, name, role, a ⋮ menu for admins), the
 * requirement, and what is still open with an Assign button.
 *
 * It plugs into react-big-calendar as a custom view (views={{ day: StaffingDayView }}).
 * Data and actions arrive through StaffingDayContext because the calendar renders
 * the view itself.
 */
import { createContext, useContext } from "react";
import { Box, Button, IconButton, Typography } from "@mui/material";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEllipsisVertical } from "@fortawesome/free-solid-svg-icons";
import moment from "moment";
import { COVERAGE_STATUS, toISO } from "../../pages/staffingCoverage";
import { SHIFT_NAME, SHIFT_ORDER, summarizeShifts, toFillList } from "../../utils/calendar/staffingSummary";
import { CalendarSkeleton, CoverageFailedBanner, RoleFilterNote } from "./StaffingStateViews";

/**
 * Value: { coverage, shifts, loading, failed, retrying, onRetry, isAdmin, canFill(iso),
 *          fillLabel, onFill(item, iso), onPersonMenu(anchorEl, shift), onAdd(iso) }
 * `shifts` is already narrowed by the search box.
 */
export const StaffingDayContext = createContext({
  coverage: null,
  shifts: [],
  loading: false,
  failed: false,
  roleLabel: "",
  retrying: false,
  onRetry: null,
  isAdmin: false,
  canFill: () => false,
  fillLabel: "Assign",
  onFill: null,
  onPersonMenu: null,
  onAdd: null,
});

const ROLE_COLORS = { rn: "#2563eb", lpn: "#7c3aed", cna: "#0d9488", other: "#64748b" };
const ROLE_LABELS = { rn: "RN", lpn: "LPN", cna: "CNA", other: "Other" };
const hhmm = (t) => moment(`2000-01-01T${t}`).format("h:mm A");
const unitKey = (id) => (id == null || id === "" ? "none" : String(id));

/** Column order and titles: Day, Evening, Night, plus Custom only when someone is on a custom shift. */
export function dayColumns(shifts, info) {
  const types = new Set([...(shifts || []).map((s) => s.shift_type), ...((info && info.items) || []).map((i) => i.shift_type)]);
  const ordered = SHIFT_ORDER.filter((t) => types.has(t) || t === "day" || t === "night");
  if (types.has("evening") && !ordered.includes("evening")) ordered.splice(1, 0, "evening");
  if (types.has("custom")) ordered.push("custom");
  return ordered;
}

/** The unit cards of one column: every unit with a person or a requirement in that shift, sorted by name. */
export function columnUnits(type, shifts, info) {
  const by = {};
  ((info && info.items) || [])
    .filter((it) => it.shift_type === type)
    .forEach((it) => {
      const k = unitKey(it.unit_id);
      (by[k] ||= { key: k, unit_id: it.unit_id ?? null, name: it.unit_name || "Whole organization", people: [], item: null }).item = it;
    });
  (shifts || [])
    .filter((s) => s.shift_type === type)
    .forEach((s) => {
      const k = unitKey(s.unit);
      (by[k] ||= { key: k, unit_id: s.unit ?? null, name: s.unit_name || "No unit", people: [], item: null }).people.push(s);
    });
  return Object.values(by).sort((a, b) => a.name.localeCompare(b.name));
}

function PersonRow({ shift, isAdmin, onPersonMenu }) {
  const role = shift.nursing_role || "other";
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        minHeight: 34,
        px: 1,
        borderRadius: "6px",
        bgcolor: "#fff",
        border: "1px solid #e2e8f0",
        fontSize: 14,
      }}
    >
      <Box component="span" sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: ROLE_COLORS[role] || ROLE_COLORS.other, flexShrink: 0 }} />
      <Box component="span" sx={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={shift.staff_name}>
        {shift.staff_name}
      </Box>
      {shift.source === "pickup" && (
        <Box component="span" sx={{ fontSize: 11, color: "text.secondary" }}>
          picked up
        </Box>
      )}
      <Box component="span" sx={{ fontSize: 12, color: "text.secondary" }}>
        {ROLE_LABELS[role] || ""}
      </Box>
      {isAdmin && onPersonMenu && (
        <IconButton
          size="small"
          aria-label={`Actions for ${shift.staff_name}`}
          aria-haspopup="menu"
          onClick={(e) => onPersonMenu(e.currentTarget, shift)}
          sx={{ p: "4px" }}
        >
          <FontAwesomeIcon icon={faEllipsisVertical} style={{ fontSize: 13 }} />
        </IconButton>
      )}
    </Box>
  );
}

export default function StaffingDayBoard({ date }) {
  const ctx = useContext(StaffingDayContext);
  const { coverage, loading, failed, retrying, onRetry, roleLabel, isAdmin, canFill, fillLabel, onFill, onPersonMenu, onAdd } = ctx;
  const iso = toISO(date);
  const info = coverage && coverage.days ? coverage.days[iso] : null;
  const shifts = (ctx.shifts || []).filter((s) => s.date === iso);
  const summary = Object.fromEntries(summarizeShifts(info).map((r) => [r.shift_type, r]));
  const fills = toFillList(info);
  const columns = dayColumns(shifts, info);
  const mayFill = canFill ? canFill(iso) : false;

  if (shifts.length === 0 && (!info || info.items.length === 0)) {
    if (loading) return <CalendarSkeleton />;
    return (
      <Box sx={{ flex: 1, textAlign: "center", p: 4 }}>
        <Typography sx={{ fontWeight: 700 }}>No shifts on {moment(date).format("ddd, MMM D")}</Typography>
        <Typography color="text.secondary" sx={{ mb: 1.5 }}>
          {failed ? "Coverage could not be loaded either." : "Nobody is scheduled yet, and no staffing requirement applies."}
        </Typography>
        {isAdmin && onAdd && (
          <Button variant="contained" size="small" onClick={() => onAdd(iso)}>
            + Add shift
          </Button>
        )}
      </Box>
    );
  }

  return (
    <Box sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>
      {roleLabel && <RoleFilterNote role={roleLabel} />}
      {failed && <CoverageFailedBanner detail="The people below are correct." onRetry={onRetry} retrying={retrying} />}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: `repeat(${columns.length}, minmax(0, 1fr))` }, gap: 1.5, alignItems: "start" }}>
        {columns.map((type) => {
          const units = columnUnits(type, shifts, info);
          const sum = summary[type];
          const m = sum ? COVERAGE_STATUS[sum.status] || COVERAGE_STATUS.unknown : null;
          const first = shifts.find((s) => s.shift_type === type && s.start_time && s.end_time);
          const hours = first ? `${hhmm(first.start_time)} – ${hhmm(first.end_time)}` : "";
          const count = shifts.filter((s) => s.shift_type === type).length;
          return (
            <Box key={type} sx={{ bgcolor: "background.paper", border: "1px solid #e2e8f0", borderRadius: 2, p: 1.5, minWidth: 0 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.25 }}>
                <Typography sx={{ fontWeight: 700, fontSize: 16 }}>{SHIFT_NAME[type] || type}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {hours}
                </Typography>
                <Box sx={{ flex: 1 }} />
                <Box
                  component="span"
                  sx={{
                    px: 1.25,
                    py: "2px",
                    borderRadius: 3,
                    fontSize: 13,
                    fontWeight: 700,
                    bgcolor: m && sum.status !== "unknown" ? m.bg : "#f1f5f9",
                    color: m && sum.status !== "unknown" ? m.color : "#334155",
                    border: `1px solid ${m && sum.status !== "unknown" ? m.color : "#cbd5e1"}`,
                  }}
                >
                  {sum && sum.status !== "unknown" ? `${sum.assigned}/${sum.required}` : `${count} ${count === 1 ? "person" : "people"}`}
                </Box>
              </Box>

              {units.length === 0 && (
                <Typography variant="body2" color="text.secondary">
                  Nobody on this shift.
                </Typography>
              )}
              {units.map((u) => {
                const it = u.item;
                const st = it ? COVERAGE_STATUS[it.status] || COVERAGE_STATUS.unknown : COVERAGE_STATUS.unknown;
                const problem = it && (it.status === "not_met" || it.status === "at_risk");
                const open = fills.filter((f) => f.shift_type === type && unitKey(f.unit_id) === u.key);
                return (
                  <Box
                    key={u.key}
                    sx={{
                      border: "1px solid #e2e8f0",
                      borderLeft: `3px solid ${it && it.status !== "unknown" ? st.color : "#cbd5e1"}`,
                      borderRadius: 2,
                      bgcolor: "#fafbfc",
                      p: 1,
                      mb: 1,
                    }}
                  >
                    <Box sx={{ display: "flex", alignItems: "center", mb: 0.75 }}>
                      <Typography sx={{ fontWeight: 700, fontSize: 14 }}>{u.name}</Typography>
                      <Box sx={{ flex: 1 }} />
                      {it && it.status !== "unknown" && (
                        <Typography sx={{ fontSize: 13, fontWeight: 700, color: problem ? st.color : "text.primary" }}>
                          {it.assigned}/{it.required}
                          {it.required_rn != null ? ` · RN ${it.rn_scheduled ?? 0}/${it.required_rn}` : ""}
                        </Typography>
                      )}
                    </Box>
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                      {u.people.map((s) => (
                        <PersonRow key={s.id} shift={s} isAdmin={isAdmin} onPersonMenu={onPersonMenu} />
                      ))}
                    </Box>
                    {open.map((f) => (
                      <Box key={f.key} sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.75 }}>
                        <Typography sx={{ flex: 1, fontSize: 13, fontWeight: 700, color: COVERAGE_STATUS.not_met.color }}>
                          {f.kind === "rn"
                            ? `Open: ${f.need} more RN${f.need === 1 ? "" : "s"} needed`
                            : `Open: ${f.need} more needed`}
                        </Typography>
                        {mayFill && onFill && (
                          <Button size="small" onClick={() => onFill(f, iso)} aria-label={`${fillLabel} ${u.name} ${SHIFT_NAME[type] || type}`}>
                            {fillLabel}
                          </Button>
                        )}
                      </Box>
                    ))}
                    {problem && open.length === 0 && (it.reasons || []).slice(0, 2).map((r) => (
                      <Typography key={r} variant="caption" sx={{ display: "block", mt: 0.5, color: st.color }}>
                        {r}
                      </Typography>
                    ))}
                  </Box>
                );
              })}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

/** The react-big-calendar custom view. */
export function StaffingDayView(props) {
  return <StaffingDayBoard date={props.date} />;
}
StaffingDayView.range = (date) => [moment(date).startOf("day").toDate()];
StaffingDayView.navigate = (date, action) => {
  switch (action) {
    case "PREV":
      return moment(date).subtract(1, "day").toDate();
    case "NEXT":
      return moment(date).add(1, "day").toDate();
    default:
      return date;
  }
};
StaffingDayView.title = (date) => moment(date).format("dddd, MMMM D");
