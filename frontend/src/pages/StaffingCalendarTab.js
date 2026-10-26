import { useState, useEffect, useCallback, useMemo } from "react";
import { Calendar, momentLocalizer } from "react-big-calendar";
import moment from "moment";
import "react-big-calendar/lib/css/react-big-calendar.css";
import {
  Alert,
  Box,
  Button,
  Typography,
  CircularProgress,
  Chip,
  Stack,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Collapse,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Divider,
  IconButton,
  Menu,
  Snackbar,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  useMediaQuery,
} from "@mui/material";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import axios from "axios";
import { apiEndpoints, getAuthHeaders } from "../config/api";
import { getAccessToken } from "../utils/tokenManager";
import { US_STATES } from "../constants/usStates";
import StaffingPickUpDialog from "./StaffingPickUpDialog";
import { COVERAGE_STATUS, toISO } from "./staffingCoverage";
import StaffingCalendarToolbar, {
  StaffingCalendarSearchContext,
} from "../components/calendar/StaffingCalendarToolbar";
import StaffingDayPanel from "../components/calendar/StaffingDayPanel";
import { StaffingWeekContext, StaffingWeekView } from "../components/calendar/StaffingWeekGrid";
import { StaffingDayContext, StaffingDayView } from "../components/calendar/StaffingDayBoard";
import { StaffingAgendaView } from "../components/calendar/StaffingAgenda";
import { CoverageFailedBanner, NoRequirementNotice } from "../components/calendar/StaffingStateViews";
import {
  SHIFT_NAME,
  SHIFT_SHORT,
  firstDayWithStatus,
  summarizeShifts,
  worstStatus,
} from "../utils/calendar/staffingSummary";

const localizer = momentLocalizer(moment);

const SHIFT_COLORS = {
  day: "#2563eb",
  evening: "#f57c00",
  night: "#5e35b1",
  custom: "#475569",
};

// Shift types each unit pattern uses (mirrors the backend's hppd.SHIFT_PATTERNS).
// Short label shown beside a name on the calendar (the role the coverage math uses).
const ROLE_LABELS = { rn: "RN", lpn: "LPN", cna: "CNA", other: "Other" };
const roleLabel = (shift) => ROLE_LABELS[shift.nursing_role] || "";

const EDIT_SHIFT_TYPES = [
  { value: "day", label: "Day" },
  { value: "evening", label: "Evening" },
  { value: "night", label: "Night" },
  { value: "custom", label: "Custom (on call / ad hoc)" },
];

// Short shift names inside a month cell (the mock's Day / Eve / Night).
const SHIFT_CELL_LABEL = { day: "Day", evening: "Eve", night: "Night", custom: "Other" };

// Month is the built-in grid; week, day and agenda are our own coverage views.
const CALENDAR_VIEWS = { month: true, week: StaffingWeekView, day: StaffingDayView, agenda: StaffingAgendaView };

// Phones open on Agenda (a seven-day coverage list); wider screens open on Month.
const initialView = () =>
  typeof window !== "undefined" && window.matchMedia && window.matchMedia("(max-width:899px)").matches ? "agenda" : "month";

// The coverage chips above the calendar; clicking one highlights those days.
const STATUS_CHIPS = [
  ["not_met", "not met"],
  ["at_risk", "at risk"],
  ["met", "covered"],
];

const PATTERN_SHIFT_TYPES = {
  "8h": ["day", "evening", "night"],
  "12h": ["day", "night"],
};

function StaffingCalendarTab({ isAdmin = false, onAssign = null, onNavigate = null }) {
  const [shifts, setShifts] = useState([]);
  const [coverage, setCoverage] = useState(null);
  const [coverageFailed, setCoverageFailed] = useState(false);
  const [coverageLoading, setCoverageLoading] = useState(true); // the coverage request is separate from the shifts
  const [location, setLocation] = useState(null);
  const [units, setUnits] = useState([]);
  // "" means All Units (the original, unfiltered view).
  const [unitId, setUnitId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [dayDialog, setDayDialog] = useState(null); // ISO date string
  const [view, setView] = useState(initialView); // month | week | day | agenda
  const [locDialog, setLocDialog] = useState(false);
  const [editShift, setEditShift] = useState(null); // {id, staff_name, date, shift_label, start_time, end_time, notes}
  const [editShiftError, setEditShiftError] = useState("");
  const [editShiftBusy, setEditShiftBusy] = useState(false);
  const [me, setMe] = useState(null); // {staff_id, full_name, profession}: who is signed in on the roster
  const [pickUp, setPickUp] = useState(null); // {date, defaults:{unit_id, shift_type}} while the modal is open
  const [notice, setNotice] = useState("");
  const [selectedISO, setSelectedISO] = useState(() => toISO(new Date()));
  const [statusFocus, setStatusFocus] = useState(""); // "" | not_met | at_risk | met
  const [showRule, setShowRule] = useState(false);
  const [roleFilter, setRoleFilter] = useState(""); // "" | rn | lpn | cna: narrows the people shown, not the coverage maths
  const [shiftMenu, setShiftMenu] = useState(null); // {anchorEl, shift}: the person menu in Day view
  const [removeTarget, setRemoveTarget] = useState(null); // shift awaiting the remove confirmation
  const [removeBusy, setRemoveBusy] = useState(false);
  const [undo, setUndo] = useState(null); // {shift, message}: shown in the Undo snackbar
  const narrow = useMediaQuery("(max-width:899px)");
  const [locForm, setLocForm] = useState({});
  const [locError, setLocError] = useState("");
  const [range, setRange] = useState(() => {
    const start = moment().startOf("month").subtract(7, "days");
    const end = moment().endOf("month").add(7, "days");
    return { start, end };
  });

  const token = getAccessToken();

  // Coverage colours are an overlay: if they fail the calendar still works, and Retry runs this alone.
  const fetchCoverage = useCallback(
    async (start, end) => {
      setCoverageLoading(true);
      try {
        const cov = await axios.get(apiEndpoints.staffingCoverageStatus, {
          headers: getAuthHeaders(token),
          params: {
            start: start.format("YYYY-MM-DD"),
            end: end.format("YYYY-MM-DD"),
            ...(unitId ? { unit: unitId } : {}),
          },
        });
        setCoverage(cov.data);
        setCoverageFailed(false);
      } catch (err) {
        console.error("Failed to load coverage status", err);
        setCoverage(null);
        setCoverageFailed(true);
      } finally {
        setCoverageLoading(false);
      }
    },
    [token, unitId]
  );

  const fetchShifts = useCallback(
    async (start, end) => {
      setLoading(true);
      setError("");
      const params = {
        start: start.format("YYYY-MM-DD"),
        end: end.format("YYYY-MM-DD"),
        ...(unitId ? { unit: unitId } : {}),
      };
      // Both requests start together (they used to run one after the other, so the waits added up).
      const coverageReq = fetchCoverage(start, end);
      try {
        const res = await axios.get(apiEndpoints.staffingShifts, {
          headers: getAuthHeaders(token),
          params,
        });
        setShifts(res.data.results || res.data || []);
      } catch (err) {
        console.error("Failed to load staffing shifts", err);
        setError("Failed to load the staffing calendar.");
      }
      // The shifts are what the calendar needs; show them now and let the colors follow.
      setLoading(false);
      await coverageReq;
    },
    [token, unitId, fetchCoverage]
  );

  // Loads on mount and again whenever the unit dropdown changes, keeping
  // the month/week the user is currently looking at.
  useEffect(() => {
    fetchShifts(range.start, range.end);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitId]);

  useEffect(() => {
    axios
      .get(apiEndpoints.staffingUnits, {
        headers: getAuthHeaders(token),
        params: { active_only: 1 },
      })
      .then((res) => setUnits(res.data.results || res.data || []))
      .catch((err) => console.error("Failed to load units", err));
    axios
      .get(apiEndpoints.staffingLocation, { headers: getAuthHeaders(token) })
      .then((res) => setLocation(res.data))
      .catch((err) => console.error("Failed to load clinic location", err));
    axios
      .get(apiEndpoints.staffingMePickup, { headers: getAuthHeaders(token) })
      .then((res) => setMe(res.data))
      .catch(() => setMe(null)); // no pick-up button if this cannot be loaded
  }, [token]);

  // Remove goes through a confirmation dialog, then offers Undo (re-creates the same shift).
  const confirmRemoveShift = async () => {
    const shift = removeTarget;
    if (!shift || !isAdmin) return;
    setRemoveBusy(true);
    try {
      await axios.delete(apiEndpoints.staffingShiftDetail(shift.id), {
        headers: getAuthHeaders(token),
      });
      setRemoveTarget(null);
      setUndo({
        shift,
        message: `Removed ${shift.staff_name} from ${moment(shift.date).format("MMM D")} (${shift.shift_type_display || shift.shift_type}).`,
      });
      fetchShifts(range.start, range.end);
    } catch (err) {
      console.error("Failed to delete shift", err);
      setRemoveTarget(null);
      setError("Failed to delete that shift.");
    } finally {
      setRemoveBusy(false);
    }
  };

  const undoRemove = async () => {
    const shift = undo?.shift;
    if (!shift) return;
    setUndo(null);
    try {
      await axios.post(
        apiEndpoints.staffingShifts,
        {
          staff: shift.staff,
          unit: shift.unit || null,
          date: shift.date,
          shift_type: shift.shift_type,
          start_time: shift.start_time || null,
          end_time: shift.end_time || null,
          notes: shift.notes || "",
        },
        { headers: getAuthHeaders(token) }
      );
      setNotice(`Restored ${shift.staff_name} on ${moment(shift.date).format("MMM D")}.`);
      fetchShifts(range.start, range.end);
    } catch (err) {
      console.error("Failed to restore shift", err);
      setError("Could not restore that shift. Add it again from the Assign Schedule tab.");
    }
  };

  const openEditShift = useCallback((shift) => {
    setEditShiftError("");
    setEditShift({
      id: shift.id,
      staff_name: shift.staff_name,
      date: shift.date,
      shift_label: shift.shift_type_display || shift.shift_type,
      shift_type: shift.shift_type,
      original_shift_type: shift.shift_type,
      unit_name: shift.unit_name || "",
      unit_id: shift.unit ? String(shift.unit) : "",
      original_unit_id: shift.unit ? String(shift.unit) : "",
      start_time: (shift.start_time || "").slice(0, 5),
      end_time: (shift.end_time || "").slice(0, 5),
      notes: shift.notes || "",
    });
  }, []);

  const saveEditShift = async () => {
    if (!editShift) return;
    if ((editShift.start_time && !editShift.end_time) || (!editShift.start_time && editShift.end_time)) {
      setEditShiftError("Enter both a start and an end time, or leave both blank.");
      return;
    }
    setEditShiftBusy(true);
    setEditShiftError("");
    try {
      await axios.patch(
        apiEndpoints.staffingShiftDetail(editShift.id),
        {
          start_time: editShift.start_time || null,
          end_time: editShift.end_time || null,
          notes: editShift.notes || "",
          ...(editShift.shift_type !== editShift.original_shift_type ? { shift_type: editShift.shift_type } : {}),
          ...(editShift.unit_id !== editShift.original_unit_id
            ? { unit: editShift.unit_id ? Number(editShift.unit_id) : null }
            : {}),
        },
        { headers: getAuthHeaders(token) }
      );
      setEditShift(null);
      fetchShifts(range.start, range.end);
    } catch (err) {
      const data = err.response?.data;
      setEditShiftError((data && JSON.stringify(data)) || "Could not save this shift.");
    } finally {
      setEditShiftBusy(false);
    }
  };

  const handleRangeChange = (rangeInfo) => {
    let start, end;
    if (Array.isArray(rangeInfo)) {
      start = moment(rangeInfo[0]);
      end = moment(rangeInfo[rangeInfo.length - 1]);
    } else {
      start = moment(rangeInfo.start);
      end = moment(rangeInfo.end);
    }
    setRange({ start, end });
    fetchShifts(start, end);
  };

  // Only the shift types the unit(s) in view actually use, plus any type that has a shift on the calendar
  // (so Custom shows only when a custom shift exists).
  const visibleShiftTypes = useMemo(() => {
    const inScope = unitId === "" ? units : units.filter((u) => String(u.id) === String(unitId));
    const types = new Set();
    inScope.forEach((u) => (PATTERN_SHIFT_TYPES[u.shift_pattern] || PATTERN_SHIFT_TYPES["8h"]).forEach((t) => types.add(t)));
    if (inScope.length === 0) ["day", "evening", "night"].forEach((t) => types.add(t));
    shifts.forEach((s) => types.add(s.shift_type));
    return Object.keys(SHIFT_COLORS).filter((t) => types.has(t));
  }, [units, unitId, shifts]);

  // Search narrows which shifts are drawn; every term must match somewhere in the
  // shift's staff, unit, shift type, time, date or notes. Coverage colors still
  // reflect the whole schedule.
  const filteredShifts = useMemo(() => {
    const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const byRole = roleFilter ? shifts.filter((shift) => (shift.nursing_role || "other") === roleFilter) : shifts;
    if (terms.length === 0) return byRole;
    return byRole.filter((shift) => {
      const hay = [
        shift.staff_name,
        roleLabel(shift),
        shift.unit_name,
        shift.shift_type_display,
        shift.shift_type,
        shift.start_time,
        shift.end_time,
        shift.date,
        shift.notes,
        moment(shift.date).format("dddd MMMM"),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [shifts, search, roleFilter]);

  const retryCoverage = useCallback(() => fetchCoverage(range.start, range.end), [fetchCoverage, range]);
  const waiting = loading || coverageLoading; // the views show a skeleton until both have answered

  const weekCtx = useMemo(
    () => ({ coverage, loading: waiting, failed: coverageFailed, retrying: coverageLoading, onRetry: retryCoverage, search }),
    [coverage, waiting, coverageFailed, coverageLoading, retryCoverage, search]
  );

  const searchCtx = useMemo(
    () => ({ value: search, onChange: setSearch, shown: filteredShifts.length, total: shifts.length }),
    [search, filteredShifts.length, shifts.length]
  );

  // The month grid shows coverage lines instead of one pill per person; people appear
  // there only when a search is active. Week, Day and Agenda are our own views and draw from
  // the shifts directly, so the calendar gets no events for them.
  const monthSummaryOnly = view !== "month" || (search.trim() === "" && roleFilter === "");

  const events = useMemo(
    () =>
      (monthSummaryOnly ? [] : filteredShifts).map((shift) => {
        const start = new Date(`${shift.date}T${shift.start_time || "00:00:00"}`);
        let end = new Date(`${shift.date}T${shift.end_time || "23:59:59"}`);
        // Overnight shifts (e.g. 7:00 PM - 7:00 AM) have an end clock-time
        // earlier than (or equal to) the start clock-time on the same
        // calendar date -- without this, react-big-calendar sees a
        // negative-duration event and renders it as a sliver instead of
        // spanning from the start time down to midnight. Bump the end
        // onto the next day whenever that happens.
        if (shift.start_time && shift.end_time && end <= start) {
          end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
        }
        const role = roleLabel(shift) ? ` · ${roleLabel(shift)}` : "";
        // In the All Units view, say which unit the shift is on.
        const unit = shift.unit_name && unitId === "" ? ` · ${shift.unit_name}` : "";
        const kind = (shift.shift_type_display || shift.shift_type) + (shift.source === "pickup" ? ", picked up" : "");
        return {
          id: shift.id,
          title: `${shift.staff_name}${role}${unit} (${kind})`,
          start,
          end,
          allDay: !shift.start_time,
          resource: shift,
        };
      }),
    [filteredShifts, unitId, monthSummaryOnly]
  );

  // When people are shown in the month grid (a role filter or a search is on), the rows need room for their
  // names. On a short screen the fixed height squeezed them into thin slivers, so grow the grid to fit and let
  // the page scroll (the filter row and day panel stay frozen).
  const monthPeopleHeight = useMemo(() => {
    if (monthSummaryOnly) return null;
    const perDay = {};
    filteredShifts.forEach((s) => {
      perDay[s.date] = (perDay[s.date] || 0) + 1;
    });
    const most = Math.max(1, ...Object.values(perDay));
    return 80 + 6 * (84 + Math.min(most, 6) * 22);
  }, [monthSummaryOnly, filteredShifts]);

  const eventPropGetter = (event) => {
    const color = SHIFT_COLORS[event.resource.shift_type] || "#475569";
    return {
      style: {
        backgroundColor: color,
        borderRadius: "4px",
        color: "white",
        border: "none",
      },
    };
  };

  const dayInfo = useCallback(
    (date) => coverage?.days?.[toISO(date)] || null,
    [coverage]
  );

  const openPickUp = useCallback(
    (iso) => {
      // Prefill the unit and shift of the first short slot that day.
      const slot = (coverage?.days?.[iso]?.items || []).find((i) => i.status === "not_met");
      setPickUp({
        date: iso,
        defaults: { unit_id: slot?.unit_id || null, shift_type: slot?.shift_type || "day" },
      });
    },
    [coverage]
  );

  // Week and day views tint each day by coverage status. The month grid stays neutral (its
  // D/E/N lines carry the status); it only outlines the selected day and, when a coverage
  // chip is on, tints the days with that status.
  const dayPropGetter = useCallback(
    (date) => {
      const info = dayInfo(date);
      const meta = info && COVERAGE_STATUS[info.status];
      const iso = toISO(date);
      const style = {};
      if (view === "month") {
        if (statusFocus && info?.status === statusFocus && meta) style.backgroundColor = meta.bg;
        if (iso === selectedISO && !narrow) style.boxShadow = "inset 0 0 0 2px #2563eb";
      } else if (meta) {
        style.backgroundColor = meta.bg;
        if (info.status === "not_met" || info.status === "at_risk") style.boxShadow = `inset 0 0 0 1px ${meta.color}55`;
      }
      return Object.keys(style).length ? { style } : {};
    },
    [dayInfo, view, statusFocus, selectedISO, narrow]
  );

  // Month-view cell header: the date number, then one line per shift (D 14/14), coloured by status.
  // The words and icons carry the meaning too, not colour alone.
  const todayISO = toISO(new Date());
  const DateHeader = useCallback(
    ({ label, date }) => {
      const iso = toISO(date);
      const info = dayInfo(date);
      // Shifts with no census add only "?" noise to the grid; the panel still says "No census".
      const rows = summarizeShifts(info).filter((r) => r.status !== "unknown");
      const pending = coverageLoading && !info; // coverage still on its way
      const dim = !!statusFocus && info?.status !== statusFocus;
      const worst = worstStatus(rows.map((r) => r.status));
      return (
        <Box
          sx={{ cursor: "pointer", textAlign: "left", opacity: dim ? 0.4 : 1 }}
          onClick={(e) => {
            e.stopPropagation();
            if (narrow) setDayDialog(iso);
            else setSelectedISO(iso);
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            setDayDialog(iso);
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 0.5, mb: 0.25 }}>
            <Box
              component="span"
              sx={{
                minWidth: 26,
                height: 26,
                lineHeight: "26px",
                textAlign: "center",
                borderRadius: "50%",
                fontSize: 14,
                fontWeight: iso === todayISO ? 700 : 600,
                color: iso === todayISO ? "#fff" : "inherit",
                bgcolor: iso === todayISO ? "#2563eb" : "transparent",
              }}
            >
              {label}
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              {info?.open_emergencies > 0 && (
                <Chip size="small" color="error" label={`🚨 ${info.open_emergencies}`} sx={{ height: 18, fontSize: 11 }} />
              )}
              {(worst === "not_met" || worst === "at_risk") && (
                <Box
                  component="span"
                  title={COVERAGE_STATUS[worst].label}
                  aria-label={COVERAGE_STATUS[worst].label}
                  sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: COVERAGE_STATUS[worst].color, flexShrink: 0 }}
                />
              )}
            </Box>
          </Box>
          {pending &&
            [0, 1, 2].map((i) => (
              <Box key={i} aria-hidden sx={{ height: 24, mt: "3px", borderRadius: "4px", bgcolor: "#eef1f6" }} />
            ))}
          {rows.map((r) => {
            const m = COVERAGE_STATUS[r.status] || COVERAGE_STATUS.unknown;
            const problem = r.status === "not_met" || r.status === "at_risk";
            const short = r.required - r.assigned;
            return (
              <Box
                key={r.shift_type}
                title={`${SHIFT_NAME[r.shift_type] || r.label || r.shift_type}: ${m.label}`}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.75,
                  height: 24,
                  px: 0.75,
                  mt: "3px",
                  borderRadius: "4px",
                  borderLeft: `3px solid ${m.color}`,
                  bgcolor: problem ? m.bg : "#f8fafc",
                  fontSize: 13,
                }}
              >
                <Box component="span" sx={{ width: 38, color: "text.secondary", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {SHIFT_CELL_LABEL[r.shift_type] || r.label || r.shift_type}
                </Box>
                <b style={{ color: problem ? m.color : "#1f2937" }}>
                  {r.assigned}/{r.required}
                </b>
                {problem && (
                  <Box component="span" sx={{ ml: "auto", fontWeight: 700, color: m.color }}>
                    {short > 0 ? `\u2212${short}` : m.icon}
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>
      );
    },
    [dayInfo, statusFocus, narrow, todayISO, coverageLoading]
  );

  // Week view column header: the label is still RBC's button (click = go to day view). It carries
  // the column's date so a click on the blank part of the header cell can open the coverage modal.
  const WeekHeader = useCallback(
    ({ date, label }) => <span data-date={toISO(date)}>{label}</span>,
    []
  );

  // Week view: clicking the blank space beside the date label (not the label itself) opens the
  // same coverage modal as clicking a day in the month view.
  const handleCalendarClick = (e) => {
    if (view !== "week") return;
    const cell = e.target.closest?.(".rbc-time-header-cell .rbc-header");
    if (!cell || e.target.closest("button")) return;
    const iso = cell.querySelector("[data-date]")?.getAttribute("data-date");
    if (iso) setDayDialog(iso);
  };

  // Shift cell: just the name. People are edited from the Day board's person menu, so one
  // stray click on a busy grid can never change a shift.
  const ShiftEvent = useCallback(
    ({ event }) => (
      <Box component="span" title={event.title} sx={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {event.title}
      </Box>
    ),
    []
  );

  const components = useMemo(
    () => ({
      month: { dateHeader: DateHeader },
      week: { header: WeekHeader },
      event: ShiftEvent,
      toolbar: StaffingCalendarToolbar,
    }),
    [DateHeader, ShiftEvent, WeekHeader]
  );

  const openLocationDialog = () => {
    setLocForm({
      address_line1: location?.address_line1 || "",
      city: location?.city || "",
      state: location?.state || "",
      postal_code: location?.postal_code || "",
      staffing_spare_buffer: location?.staffing_spare_buffer ?? 1,
    });
    setLocError("");
    setLocDialog(true);
  };

  const saveLocation = async () => {
    try {
      const res = await axios.patch(apiEndpoints.staffingLocation, locForm, {
        headers: getAuthHeaders(token),
      });
      setLocation(res.data);
      setLocDialog(false);
      fetchShifts(range.start, range.end);
    } catch (err) {
      setLocError(err.response?.data?.error || "Could not save the clinic location.");
    }
  };

  // A single unit is chosen but nothing in view requires staff for it, so every day would stay grey.
  const noRequirementUnit =
    unitId !== "" && coverage && !coverageLoading &&
    Object.values(coverage.days || {}).every((d) => !d.items || d.items.length === 0)
      ? units.find((u) => String(u.id) === String(unitId))?.name || "this unit"
      : "";

  const locationAction =
    isAdmin && location ? (
      <Button color="inherit" size="small" onClick={openLocationDialog}>
        {location.state ? "Edit location" : "Set location"}
      </Button>
    ) : null;

  // Clicking a coverage chip highlights those days and jumps to the first one.
  const toggleStatusFocus = (key) => {
    if (statusFocus === key) {
      setStatusFocus("");
      return;
    }
    setStatusFocus(key);
    const first = firstDayWithStatus(coverage, key);
    if (first) setSelectedISO(first);
  };

  // Month view: a click selects the day (side panel), a double-click opens it. Other views, and
  // narrow screens with no side panel, open the day dialog straight away.
  const handleSelectSlot = (slot) => {
    const iso = toISO(slot.start);
    if (view === "month" && !narrow) {
      if (slot.action === "doubleClick") setDayDialog(iso);
      else setSelectedISO(iso);
    } else {
      setDayDialog(iso);
    }
  };

  // Side panel actions. Admins jump to Assign Schedule with the unit, date and shift filled in;
  // staff pick the shift up for themselves.
  const panelCanFill = isAdmin || (!!me?.staff_id && selectedISO >= toISO(new Date()));
  const panelFillLabel = isAdmin && onAssign ? "Assign" : "Pick up";
  const fillFor = (item, iso) => {
    if (isAdmin && onAssign) {
      onAssign({ unit_id: item.unit_id, date: iso, shift_type: item.shift_type });
    } else {
      setPickUp({ date: iso, defaults: { unit_id: item.unit_id, shift_type: item.shift_type } });
    }
  };
  const handleFill = (item) => fillFor(item, selectedISO);
  const handleAddShift = () =>
    onAssign({ unit_id: unitId || null, date: selectedISO, shift_type: "day" });

  // The Day board's actions. They are recreated each render, so the context below is rebuilt with them.
  const dayCtx = {
    coverage,
    shifts: filteredShifts,
    loading: waiting,
    failed: coverageFailed,
    retrying: coverageLoading,
    onRetry: retryCoverage,
    isAdmin,
    canFill: (iso) => isAdmin || (!!me?.staff_id && iso >= toISO(new Date())),
    fillLabel: panelFillLabel,
    roleLabel: roleFilter ? ROLE_LABELS[roleFilter] : "",
    onFill: fillFor,
    onPersonMenu: (anchorEl, shift) => setShiftMenu({ anchorEl, shift }),
    onAdd: isAdmin && onAssign ? (iso) => onAssign({ unit_id: unitId || null, date: iso, shift_type: "day" }) : null,
  };

  const selectedDay = dayDialog ? coverage?.days?.[dayDialog] : null;

  const fmtHrs = (h) => (Math.round(Number(h) * 10) / 10).toString();

  // One census line per unit for the selected day (taken from its shift items).
  const censusSummary = (() => {
    const byUnit = {};
    (selectedDay?.items || []).forEach((it) => {
      if (it.census == null || !it.unit_name) return;
      const c = (byUnit[it.unit_name] ||= {
        unit_name: it.unit_name,
        census: it.census,
        carried: it.census_source === "carried_forward",
        hppd: coverage?.rule?.hppd_min ?? null,
        required_total: null,
      });
      if (it.required_hours != null) c.required_total = (c.required_total || 0) + it.required_hours;
    });
    return Object.values(byUnit);
  })();

  return (
    <Box>
      <Stack
        direction="row"
        spacing={1.5}
        alignItems="center"
        flexWrap="wrap"
        useFlexGap
        sx={{
          // Frozen: stays just under the Staffing Center title and tabs while the page scrolls.
          position: "sticky",
          top: "calc(64px + var(--staffing-sticky-h, 130px))",
          zIndex: 900,
          bgcolor: "background.paper",
          py: 0.75,
          mb: 0.5,
        }}
      >
        <FormControl size="small" sx={{ minWidth: 170, bgcolor: "background.paper", borderRadius: 1 }}>
          <InputLabel id="calendar-unit-label">Unit</InputLabel>
          <Select
            labelId="calendar-unit-label"
            label="Unit"
            value={unitId}
            onChange={(e) => setUnitId(e.target.value)}
          >
            <MenuItem value="">All Units</MenuItem>
            {units.map((u) => (
              <MenuItem key={u.id} value={u.id}>
                {u.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={roleFilter || "all"}
          onChange={(e, v) => v !== null && setRoleFilter(v === "all" ? "" : v)}
          aria-label="Show people by role"
          disabled={view === "week"}
          sx={{ "& .MuiToggleButton-root": { py: 0.25, px: 1.25, fontWeight: 600, textTransform: "none" } }}
        >
          <ToggleButton value="all">All</ToggleButton>
          <ToggleButton value="rn">RN</ToggleButton>
          <ToggleButton value="lpn">LPN</ToggleButton>
          <ToggleButton value="cna">CNA</ToggleButton>
        </ToggleButtonGroup>
        {loading && <CircularProgress size={18} aria-label="Loading" />}
        {coverage &&
          STATUS_CHIPS.map(([key, word]) => {
            const m = COVERAGE_STATUS[key];
            const on = statusFocus === key;
            return (
              <Chip
                key={key}
                size="small"
                clickable
                aria-pressed={on}
                onClick={() => toggleStatusFocus(key)}
                label={`${m.icon} ${coverage.summary?.[key] ?? 0} ${word}`}
                sx={{
                  bgcolor: on ? m.color : m.bg,
                  color: on ? "#fff" : m.color,
                  fontWeight: 600,
                  border: `1px solid ${m.color}55`,
                  "&:hover": { bgcolor: on ? m.color : m.bg },
                }}
              />
            );
          })}
        <Box sx={{ flex: 1 }} />
        <Typography variant="caption" color="text.secondary">
          {visibleShiftTypes
            .filter((t) => t !== "custom")
            .map((t) => `${SHIFT_SHORT[t]} ${SHIFT_NAME[t]}`)
            .join(" · ")}
          {view === "month" && !narrow ? " · double-click a day to open it" : ""}
        </Typography>
        <Tooltip title="Staffing rules applied to this calendar">
          <IconButton
            size="small"
            aria-label="Staffing rules"
            aria-expanded={showRule}
            onClick={() => setShowRule((v) => !v)}
          >
            <FontAwesomeIcon icon={faCircleInfo} style={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      </Stack>
      <Collapse in={showRule} unmountOnExit>
        <Alert severity={location?.warning ? "warning" : "info"} sx={{ mb: 1 }} action={locationAction}>
          {location?.state ? (
            <>
              <strong>{location.state_name}</strong>
              {location.city ? ` - ${location.city}` : ""}.{" "}
              {location.rule
                ? `${location.rule.name} staffing rules are applied automatically (${location.rule.hppd_min} care hrs/resident/day${
                    location.rule.max_residents_per_staff ? `, 1:${location.rule.max_residents_per_staff} ratio` : ""
                  }, ${location.rule.min_rn_per_shift} RN per shift).`
                : location.warning}
            </>
          ) : (
            location?.warning
          )}
        </Alert>
      </Collapse>
      {!showRule && location?.warning && (
        <Alert severity="warning" sx={{ mb: 1 }} action={locationAction}>
          {location.warning}
        </Alert>
      )}
      {view === "month" && coverageFailed && (
        <CoverageFailedBanner detail="The day lines need coverage." onRetry={retryCoverage} retrying={coverageLoading} />
      )}
      {noRequirementUnit && (
        <NoRequirementNotice unitName={noRequirementUnit} onOpenUnits={onNavigate ? () => onNavigate("units") : null} />
      )}
      {coverage?.warnings?.map((w) => (
        <Alert key={w} severity="warning" sx={{ mb: 1 }}>
          {w}
        </Alert>
      ))}
      {notice && (
        <Alert severity="success" sx={{ mb: 1 }} onClose={() => setNotice("")}>
          {notice}
        </Alert>
      )}
      {error && (
        <Typography color="error" sx={{ mb: 1 }}>
          {error}
        </Typography>
      )}
      {/*
        IMPORTANT: the Calendar must stay mounted at all times. react-big-calendar
        tracks its own current month/view internally (it's an uncontrolled
        component here); conditionally swapping it out for a loading spinner
        while a fetch is in flight would unmount and remount it on every
        navigation click, silently resetting it back to today's month every
        time -- which is exactly the "won't advance to October" bug this
        comment is guarding against. Loading state is shown as a small inline
        spinner next to the legend instead (above), never by hiding the grid.
      */}
      <Box
        sx={{
          display: "flex",
          gap: 1.5,
          alignItems: "stretch",
          height: { xs: monthPeopleHeight || 560, md: monthPeopleHeight || "calc(100vh - 300px)" },
          minHeight: 520,
        }}
      >
        <Box
          onClick={handleCalendarClick}
          sx={{
            flex: 1,
            minWidth: 0,
            bgcolor: "background.paper",
            p: 1,
            borderRadius: 2,
            "& .rbc-time-header-cell .rbc-header": { cursor: view === "week" ? "pointer" : undefined },
          }}
        >
          <StaffingCalendarSearchContext.Provider value={searchCtx}>
          <StaffingWeekContext.Provider value={weekCtx}>
          <StaffingDayContext.Provider value={dayCtx}>
          <Calendar
            localizer={localizer}
            events={events}
            startAccessor="start"
            endAccessor="end"
            style={{ height: "100%", cursor: "pointer" }}
            view={view}
            onView={setView}
            onRangeChange={handleRangeChange}
            selectable
            onSelectSlot={handleSelectSlot}
            eventPropGetter={eventPropGetter}
            dayPropGetter={dayPropGetter}
            components={components}
            views={CALENDAR_VIEWS}
            popup
          />
          </StaffingDayContext.Provider>
          </StaffingWeekContext.Provider>
          </StaffingCalendarSearchContext.Provider>
        </Box>
        {view === "month" && !narrow && (
          <Box
            sx={{
              // Frozen: the day panel stays in view (under the filter row) and scrolls inside itself.
              width: 320,
              flexShrink: 0,
              alignSelf: "flex-start",
              position: "sticky",
              top: "calc(64px + var(--staffing-sticky-h, 130px) + 56px)",
              maxHeight: "calc(100vh - 64px - var(--staffing-sticky-h, 130px) - 56px - 48px)",
              overflowY: "auto",
            }}
          >
            <StaffingDayPanel
              iso={selectedISO}
              info={dayInfo(new Date(`${selectedISO}T00:00:00`))}
              isAdmin={isAdmin}
              canFill={panelCanFill}
              fillLabel={panelFillLabel}
              onFill={handleFill}
              onOpenDay={() => setDayDialog(selectedISO)}
              onAdd={isAdmin && onAssign ? handleAddShift : null}
            />
          </Box>
        )}
      </Box>

      {/* Person menu (Day view, admins) */}
      <Menu
        anchorEl={shiftMenu?.anchorEl}
        open={!!shiftMenu}
        onClose={() => setShiftMenu(null)}
      >
        <MenuItem
          onClick={() => {
            const shift = shiftMenu.shift;
            setShiftMenu(null);
            openEditShift(shift);
          }}
        >
          Edit shift
        </MenuItem>
        <MenuItem
          sx={{ color: "error.main" }}
          onClick={() => {
            const shift = shiftMenu.shift;
            setShiftMenu(null);
            setRemoveTarget(shift);
          }}
        >
          Remove shift
        </MenuItem>
      </Menu>

      {/* Confirm remove */}
      <Dialog open={!!removeTarget} onClose={() => !removeBusy && setRemoveTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Remove this shift?</DialogTitle>
        <DialogContent>
          {removeTarget && (
            <Typography variant="body2">
              {removeTarget.staff_name} · {moment(removeTarget.date).format("ddd, MMM D, YYYY")} ·{" "}
              {removeTarget.shift_type_display || removeTarget.shift_type}
              {removeTarget.unit_name ? ` · ${removeTarget.unit_name}` : ""}
              <br />
              You can undo this right after.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRemoveTarget(null)} disabled={removeBusy}>
            Cancel
          </Button>
          <Button color="error" variant="contained" onClick={confirmRemoveShift} disabled={removeBusy}>
            {removeBusy ? "Removing..." : "Remove"}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!!undo}
        autoHideDuration={8000}
        onClose={(e, reason) => reason !== "clickaway" && setUndo(null)}
        message={undo?.message}
        action={
          <Button color="inherit" size="small" onClick={undoRemove}>
            Undo
          </Button>
        }
      />

      {/* Day detail */}
      <Dialog open={!!dayDialog} onClose={() => setDayDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {dayDialog && moment(dayDialog).format("dddd, MMMM D, YYYY")}
          {selectedDay && COVERAGE_STATUS[selectedDay.status] && (
            <Chip
              size="small"
              label={`${COVERAGE_STATUS[selectedDay.status].icon} ${COVERAGE_STATUS[selectedDay.status].label}`}
              sx={{
                ml: 1,
                bgcolor: COVERAGE_STATUS[selectedDay.status].bg,
                color: COVERAGE_STATUS[selectedDay.status].color,
                fontWeight: 600,
              }}
            />
          )}
        </DialogTitle>
        <DialogContent dividers>
          {!selectedDay || selectedDay.items.length === 0 ? (
            <Typography color="text.secondary">
              No coverage requirements apply to this day. Add a coverage requirement on the Assign
              Schedule tab, or enter a unit census so state rules can be calculated.
            </Typography>
          ) : (
            <Stack spacing={1.5} divider={<Divider flexItem />}>
              {selectedDay.open_emergencies > 0 && (
                <Alert severity="error">
                  {selectedDay.open_emergencies} emergency call-out(s) waiting for cover. See the Time Off tab.
                </Alert>
              )}
              {selectedDay.pending_requests > 0 && (
                <Alert severity="warning">{selectedDay.pending_requests} pending time-off request(s) this day.</Alert>
              )}
              {censusSummary.map((c) => (
                <Box key={c.unit_name}>
                  <Typography variant="subtitle2">{c.unit_name} census</Typography>
                  <Typography variant="body2">
                    {c.census} resident{c.census === 1 ? "" : "s"}
                    {c.hppd != null && ` × ${c.hppd} nursing hrs/resident/day = ${fmtHrs(c.census * c.hppd)} care hours for the day`}
                    {c.required_total != null && ` · split across the shifts below (${fmtHrs(c.required_total)} hrs in total)`}
                  </Typography>
                  {c.carried && (
                    <Typography variant="caption" color="text.secondary">
                      Census carried forward from an earlier day (none entered for this date).
                    </Typography>
                  )}
                </Box>
              ))}
              {selectedDay.items.map((it, idx) => {
                const m = COVERAGE_STATUS[it.status];
                return (
                  <Box key={idx}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="subtitle2">
                        {it.unit_name || "Whole organization"}
                        {it.shift_label ? ` - ${it.shift_label}` : ""}
                      </Typography>
                      {m && (
                        <Chip
                          size="small"
                          label={`${m.icon} ${m.label}`}
                          sx={{ bgcolor: m.bg, color: m.color, fontWeight: 600 }}
                        />
                      )}
                    </Stack>
                    {it.status !== "unknown" && it.status !== "no_standard" && (
                      <Typography variant="body2">
                        Staff scheduled: {it.assigned} (need {it.required}
                        {it.shift_hours != null ? ` full ${fmtHrs(it.shift_hours)}-hr shifts` : ""})
                        {it.required_hours != null &&
                          ` · Care hours: ${it.hours_scheduled ?? 0} of ${Math.round(it.required_hours * 10) / 10} needed for this shift`}
                        {it.required_rn != null && ` · RNs in facility: ${it.rn_scheduled ?? 0} (need ${it.required_rn})`}
                      </Typography>
                    )}
                    {it.census != null && it.required_hours != null && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                        Census {it.census}
                        {coverage?.rule?.hppd_min != null &&
                          ` × ${coverage.rule.hppd_min} = ${fmtHrs(it.census * coverage.rule.hppd_min)} hrs/day; this shift carries ${fmtHrs(it.required_hours)} of them`}
                      </Typography>
                    )}
                    {it.shift_hours != null && it.assigned > 0 && Math.abs(it.hours_scheduled / it.assigned - it.shift_hours) > 0.01 && (
                      <Typography variant="caption" color="warning.main" sx={{ display: "block" }}>
                        The {it.assigned} scheduled average {fmtHrs(it.hours_scheduled / it.assigned)} hrs each, but this
                        unit's {it.shift_label} shift is {fmtHrs(it.shift_hours)} hrs, so they supply fewer care hours than
                        the requirement assumes. Check the shift start/end times.
                      </Typography>
                    )}
                    {it.on_call?.length > 0 && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                        On call: {it.on_call.map((o) => `${o.name}${ROLE_LABELS[o.role] ? ` · ${ROLE_LABELS[o.role]}` : ""} (${fmtHrs(o.hours)} hrs)`).join(", ")}.
                        On-call time is ad hoc: it can lift a short shift to amber but never makes it green.
                      </Typography>
                    )}
                    {it.reasons.map((r) => (
                      <Typography key={r} variant="body2" sx={{ color: m?.color }}>
                        {r}
                      </Typography>
                    ))}
                    {it.note && (
                      <Typography variant="caption" color="text.secondary">
                        {it.note}
                      </Typography>
                    )}
                  </Box>
                );
              })}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          {(isAdmin || me?.staff_id) && selectedDay?.status === "not_met" && dayDialog >= toISO(new Date()) && (
            <Button
              color="error"
              onClick={() => {
                const iso = dayDialog;
                setDayDialog(null);
                openPickUp(iso);
              }}
            >
              Pick up a shift
            </Button>
          )}
          <Button onClick={() => setDayDialog(null)}>Close</Button>
        </DialogActions>
      </Dialog>

      <StaffingPickUpDialog
        open={!!pickUp}
        onClose={() => setPickUp(null)}
        date={pickUp?.date}
        defaults={pickUp?.defaults}
        me={me}
        units={units}
        isAdmin={isAdmin}
        onDone={(message) => {
          setPickUp(null);
          setNotice(message);
          fetchShifts(range.start, range.end); // reloads the shifts and recolors the days
        }}
      />

      {/* Edit one shift */}
      <Dialog open={!!editShift} onClose={() => setEditShift(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Edit shift</DialogTitle>
        <DialogContent>
          {editShift && (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Typography variant="body2" color="text.secondary">
                {editShift.staff_name} · {moment(editShift.date).format("ddd, MMM D, YYYY")}
                <br />
                Changes apply to this day only. To change every occurrence, edit the recurring schedule on the Assign
                Schedule tab.
              </Typography>
              {editShiftError && <Alert severity="error">{editShiftError}</Alert>}
              <TextField
                select
                size="small"
                label="Unit"
                value={editShift.unit_id}
                onChange={(e) => setEditShift({ ...editShift, unit_id: e.target.value })}
                fullWidth
              >
                <MenuItem value="">No unit</MenuItem>
                {/* Keep the shift's current unit selectable even if it is no longer active. */}
                {editShift.original_unit_id && !units.some((u) => String(u.id) === editShift.original_unit_id) && (
                  <MenuItem value={editShift.original_unit_id}>{editShift.unit_name || "Current unit"}</MenuItem>
                )}
                {units.map((u) => (
                  <MenuItem key={u.id} value={String(u.id)}>
                    {u.name}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                size="small"
                label="Shift type"
                value={editShift.shift_type}
                onChange={(e) => setEditShift({ ...editShift, shift_type: e.target.value })}
                fullWidth
              >
                {EDIT_SHIFT_TYPES.map((t) => (
                  <MenuItem key={t.value} value={t.value}>
                    {t.label}
                  </MenuItem>
                ))}
              </TextField>
              <Stack direction="row" spacing={2}>
                <TextField
                  size="small"
                  type="time"
                  label="Start time"
                  InputLabelProps={{ shrink: true }}
                  value={editShift.start_time}
                  onChange={(e) => setEditShift({ ...editShift, start_time: e.target.value })}
                  fullWidth
                />
                <TextField
                  size="small"
                  type="time"
                  label="End time"
                  InputLabelProps={{ shrink: true }}
                  value={editShift.end_time}
                  onChange={(e) => setEditShift({ ...editShift, end_time: e.target.value })}
                  fullWidth
                />
              </Stack>
              <TextField
                size="small"
                label="Notes"
                value={editShift.notes}
                onChange={(e) => setEditShift({ ...editShift, notes: e.target.value })}
                multiline
                minRows={2}
                fullWidth
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditShift(null)}>Cancel</Button>
          <Button variant="contained" onClick={saveEditShift} disabled={editShiftBusy}>
            {editShiftBusy ? "Saving..." : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Clinic location */}
      <Dialog open={locDialog} onClose={() => setLocDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Clinic location</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              The state decides which staffing rules are applied to your calendar.
            </Typography>
            <TextField
              label="Street address"
              size="small"
              value={locForm.address_line1 || ""}
              onChange={(e) => setLocForm({ ...locForm, address_line1: e.target.value })}
            />
            <Stack direction="row" spacing={2}>
              <TextField
                label="City"
                size="small"
                fullWidth
                value={locForm.city || ""}
                onChange={(e) => setLocForm({ ...locForm, city: e.target.value })}
              />
              <TextField
                select
                label="State"
                size="small"
                sx={{ minWidth: 170 }}
                value={locForm.state || ""}
                onChange={(e) => setLocForm({ ...locForm, state: e.target.value })}
              >
                <MenuItem value="">Not set</MenuItem>
                {US_STATES.map((s) => (
                  <MenuItem key={s.code} value={s.code}>
                    {s.name}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="ZIP"
                size="small"
                sx={{ minWidth: 110 }}
                value={locForm.postal_code || ""}
                onChange={(e) => setLocForm({ ...locForm, postal_code: e.target.value })}
              />
            </Stack>
            <TextField
              select
              label="'At risk' sensitivity"
              size="small"
              value={locForm.staffing_spare_buffer ?? 1}
              onChange={(e) => setLocForm({ ...locForm, staffing_spare_buffer: Number(e.target.value) })}
              helperText="When a covered shift turns amber."
            >
              <MenuItem value={1}>Amber when one call-out would break coverage (recommended)</MenuItem>
              <MenuItem value={2}>Amber when two call-outs would break coverage</MenuItem>
              <MenuItem value={0}>Amber only for pending requests or open call-outs</MenuItem>
            </TextField>
            {locError && <Typography color="error">{locError}</Typography>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLocDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={saveLocation}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default StaffingCalendarTab;
