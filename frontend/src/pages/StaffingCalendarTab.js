import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Divider,
  IconButton,
  Tooltip,
} from "@mui/material";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPen, faTrash } from "@fortawesome/free-solid-svg-icons";
import axios from "axios";
import { apiEndpoints, getAuthHeaders } from "../config/api";
import { getAccessToken } from "../utils/tokenManager";
import { US_STATES } from "../constants/usStates";
import { COVERAGE_STATUS, toISO } from "./staffingCoverage";
import StaffingCalendarToolbar, {
  StaffingCalendarSearchContext,
} from "../components/calendar/StaffingCalendarToolbar";

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

const PATTERN_SHIFT_TYPES = {
  "8h": ["day", "evening", "night"],
  "12h": ["day", "night"],
};

function StaffingCalendarTab({ isAdmin = false }) {
  const [shifts, setShifts] = useState([]);
  const [coverage, setCoverage] = useState(null);
  const [location, setLocation] = useState(null);
  const [units, setUnits] = useState([]);
  // "" means All Units (the original, unfiltered view).
  const [unitId, setUnitId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [dayDialog, setDayDialog] = useState(null); // ISO date string
  const [view, setView] = useState("month"); // month | week | day | agenda
  const [locDialog, setLocDialog] = useState(false);
  const [editShift, setEditShift] = useState(null); // {id, staff_name, date, shift_label, start_time, end_time, notes}
  const [editShiftError, setEditShiftError] = useState("");
  const [editShiftBusy, setEditShiftBusy] = useState(false);
  const [locForm, setLocForm] = useState({});
  const [locError, setLocError] = useState("");
  const [range, setRange] = useState(() => {
    const start = moment().startOf("month").subtract(7, "days");
    const end = moment().endOf("month").add(7, "days");
    return { start, end };
  });

  const token = getAccessToken();

  const fetchShifts = useCallback(
    async (start, end) => {
      setLoading(true);
      setError("");
      const params = {
        start: start.format("YYYY-MM-DD"),
        end: end.format("YYYY-MM-DD"),
        ...(unitId ? { unit: unitId } : {}),
      };
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
      // Coverage colors are an overlay: if they fail the calendar still works.
      try {
        const cov = await axios.get(apiEndpoints.staffingCoverageStatus, {
          headers: getAuthHeaders(token),
          params,
        });
        setCoverage(cov.data);
      } catch (err) {
        console.error("Failed to load coverage status", err);
        setCoverage(null);
      } finally {
        setLoading(false);
      }
    },
    [token, unitId]
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
  }, [token]);

  // Only the trash button on a shift cell calls this; clicking the cell itself does nothing.
  const handleDeleteShift = async (shift) => {
    if (!isAdmin) return;
    const label = `${shift.staff_name} - ${shift.date} (${shift.shift_type_display || shift.shift_type})`;
    if (!window.confirm(`Remove this shift from the calendar?\n\n${label}`)) {
      return;
    }
    try {
      await axios.delete(apiEndpoints.staffingShiftDetail(shift.id), {
        headers: getAuthHeaders(token),
      });
      fetchShifts(range.start, range.end);
    } catch (err) {
      console.error("Failed to delete shift", err);
      setError("Failed to delete that shift.");
    }
  };

  // Always points at the latest handleDeleteShift so the shift cell component can stay stable.
  const deleteShiftRef = useRef(null);
  deleteShiftRef.current = handleDeleteShift;

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
    if (terms.length === 0) return shifts;
    return shifts.filter((shift) => {
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
  }, [shifts, search]);

  const searchCtx = useMemo(
    () => ({ value: search, onChange: setSearch, shown: filteredShifts.length, total: shifts.length }),
    [search, filteredShifts.length, shifts.length]
  );

  const stackedView = view === "week" || view === "day";

  const events = useMemo(
    () =>
      filteredShifts.map((shift) => {
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
        const kind = shift.shift_type_display || shift.shift_type;
        // Week and day views: every shift is a full-width row stacked in the top
        // band (name, role, hours) instead of narrow side-by-side tiles on the
        // hour grid, so names and the edit/delete buttons always fit.
        if (stackedView) {
          const hhmm = (t) => moment(`2000-01-01T${t}`).format("h:mm A");
          const hours = shift.start_time && shift.end_time ? ` · ${hhmm(shift.start_time)}–${hhmm(shift.end_time)}` : "";
          const day = new Date(`${shift.date}T00:00:00`);
          return {
            id: shift.id,
            title: `${shift.staff_name}${role}${hours} (${kind})`,
            start: day,
            end: day,
            allDay: true,
            resource: shift,
          };
        }
        return {
          id: shift.id,
          title: `${shift.staff_name}${role} (${kind})`,
          start,
          end,
          allDay: !shift.start_time,
          resource: shift,
        };
      }),
    [filteredShifts, stackedView]
  );

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

  // Tints each day cell by coverage status (month, week and day views).
  const dayPropGetter = useCallback(
    (date) => {
      const info = dayInfo(date);
      const meta = info && COVERAGE_STATUS[info.status];
      if (!meta) return {};
      return {
        style: {
          backgroundColor: meta.bg,
          boxShadow: info.status === "not_met" || info.status === "at_risk"
            ? `inset 0 0 0 1px ${meta.color}55`
            : undefined,
        },
      };
    },
    [dayInfo]
  );

  // Month-view date number with a status badge (icon + word, not color alone).
  const DateHeader = useCallback(
    ({ label, date }) => {
      const info = dayInfo(date);
      const meta = info && COVERAGE_STATUS[info.status];
      return (
        <Box
          sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 0.5, cursor: "pointer" }}
          onClick={(e) => {
            e.stopPropagation();
            setDayDialog(toISO(date));
          }}
        >
          {info?.open_emergencies > 0 && (
            <Chip size="small" color="error" label={`🚨 ${info.open_emergencies}`} sx={{ height: 18, fontSize: 11 }} />
          )}
          {meta && info.status !== "unknown" && (
            <Box
              component="span"
              title={meta.label}
              aria-label={meta.label}
              sx={{
                fontSize: 11,
                fontWeight: 700,
                lineHeight: "16px",
                px: 0.75,
                borderRadius: 8,
                color: "#fff",
                bgcolor: meta.color,
              }}
            >
              {meta.icon}
            </Box>
          )}
          <span>{label}</span>
        </Box>
      );
    },
    [dayInfo]
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

  // Shift cell: the name on the left, small edit and delete buttons on the right (admins).
  // Clicking the cell itself does nothing; the remove-shift prompt only comes from the delete button.
  const ShiftEvent = useCallback(
    ({ event }) => (
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, minWidth: 0 }}>
        <Box component="span" title={event.title} sx={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {event.title}
        </Box>
        {isAdmin && (
          <Tooltip title="Edit this shift">
            <IconButton
              size="small"
              aria-label={`Edit shift for ${event.resource.staff_name}`}
              onClick={(e) => {
                e.stopPropagation();
                openEditShift(event.resource);
              }}
              onDoubleClick={(e) => e.stopPropagation()}
              sx={{ color: "inherit", p: "2px", flexShrink: 0, "&:hover": { bgcolor: "rgba(255,255,255,0.25)" } }}
            >
              <FontAwesomeIcon icon={faPen} style={{ fontSize: 10 }} />
            </IconButton>
          </Tooltip>
        )}
        {isAdmin && (
          <Tooltip title="Delete this shift">
            <IconButton
              size="small"
              aria-label={`Delete shift for ${event.resource.staff_name}`}
              onClick={(e) => {
                e.stopPropagation();
                deleteShiftRef.current?.(event.resource);
              }}
              onDoubleClick={(e) => e.stopPropagation()}
              sx={{ color: "inherit", p: "2px", flexShrink: 0, "&:hover": { bgcolor: "rgba(255,255,255,0.25)" } }}
            >
              <FontAwesomeIcon icon={faTrash} style={{ fontSize: 10 }} />
            </IconButton>
          </Tooltip>
        )}
      </Box>
    ),
    [isAdmin, openEditShift]
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
      <Alert
        severity={location?.warning ? "warning" : "info"}
        sx={{ mb: 1, "& .MuiAlert-message": { flex: 1, width: "100%", overflow: "visible" } }}
      >
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            {isAdmin && location && (
              <Button color="inherit" size="small" variant="outlined" onClick={openLocationDialog}>
                {location.state ? "Edit location" : "Set location"}
              </Button>
            )}
          </Stack>

          <Typography variant="body2" sx={{ maxWidth: 360 }}>
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
          </Typography>

          <Stack direction="row" spacing={1} alignItems="center">
            <FormControl size="small" sx={{ minWidth: 170, bgcolor: "background.paper", borderRadius: 1 }}>
              <InputLabel id="calendar-unit-label">All Units</InputLabel>
              <Select
                labelId="calendar-unit-label"
                label="All Units"
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
            {loading && <CircularProgress size={18} />}
          </Stack>

          <Box sx={{ textAlign: "center" }}>
            <Stack direction="row" spacing={1} alignItems="center" justifyContent="center" flexWrap="wrap" useFlexGap>
              {Object.entries(COVERAGE_STATUS).map(([key, m]) => (
                <Chip
                  key={key}
                  size="small"
                  label={`${m.icon} ${m.label}`}
                  sx={{ bgcolor: m.bg, color: m.color, fontWeight: 600, border: `1px solid ${m.color}55` }}
                />
              ))}
            </Stack>
            {coverage && (
              <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                In view: {coverage.summary.not_met} not met, {coverage.summary.at_risk} at risk,{" "}
                {coverage.summary.met} covered
              </Typography>
            )}
          </Box>

          <Box sx={{ textAlign: "center" }}>
            <Stack direction="row" spacing={1} alignItems="center" justifyContent="center">
              {visibleShiftTypes.map((type) => (
                <Chip
                  key={type}
                  label={type}
                  size="small"
                  sx={{ bgcolor: SHIFT_COLORS[type], color: "white", textTransform: "capitalize" }}
                />
              ))}
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
              Click a day for its coverage details.
              {isAdmin ? " Click a shift to remove it." : ""}
            </Typography>
          </Box>
        </Box>
      </Alert>
      {coverage?.warnings?.map((w) => (
        <Alert key={w} severity="warning" sx={{ mb: 1 }}>
          {w}
        </Alert>
      ))}
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
        onClick={handleCalendarClick}
        sx={{
          height: 650,
          bgcolor: "background.paper",
          p: 1,
          borderRadius: 2,
          "& .rbc-time-header-cell .rbc-header": { cursor: view === "week" ? "pointer" : undefined },
        }}
      >
        <StaffingCalendarSearchContext.Provider value={searchCtx}>
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
          onSelectSlot={(slot) => setDayDialog(toISO(slot.start))}
          eventPropGetter={eventPropGetter}
          dayPropGetter={dayPropGetter}
          components={components}
          popup
        />
        </StaffingCalendarSearchContext.Provider>
      </Box>

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
                    {it.status !== "unknown" && (
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
          <Button onClick={() => setDayDialog(null)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Edit one shift */}
      <Dialog open={!!editShift} onClose={() => setEditShift(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Edit shift</DialogTitle>
        <DialogContent>
          {editShift && (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Typography variant="body2" color="text.secondary">
                {editShift.staff_name} · {moment(editShift.date).format("ddd, MMM D, YYYY")}
                {editShift.unit_name ? ` · ${editShift.unit_name}` : ""}
                <br />
                Changes apply to this day only. To change every occurrence, edit the recurring schedule on the Assign
                Schedule tab.
              </Typography>
              {editShiftError && <Alert severity="error">{editShiftError}</Alert>}
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
