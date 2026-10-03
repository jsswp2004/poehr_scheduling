import { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
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
} from "@mui/material";
import axios from "axios";
import { apiEndpoints, getAuthHeaders } from "../config/api";
import { getAccessToken } from "../utils/tokenManager";
import { US_STATES } from "../constants/usStates";
import { COVERAGE_STATUS, toISO } from "./staffingCoverage";

const localizer = momentLocalizer(moment);

const SHIFT_COLORS = {
  day: "#1976d2",
  evening: "#f57c00",
  night: "#5e35b1",
  custom: "#546e7a",
};

// Render into a slot in the page header when one is provided; otherwise inline.
const intoSlot = (el, node) => (el ? createPortal(node, el) : node);

function StaffingCalendarTab({ isAdmin = false, shiftSlot = null, legendSlot = null }) {
  const [shifts, setShifts] = useState([]);
  const [coverage, setCoverage] = useState(null);
  const [location, setLocation] = useState(null);
  const [units, setUnits] = useState([]);
  // "" means All Units (the original, unfiltered view).
  const [unitId, setUnitId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dayDialog, setDayDialog] = useState(null); // ISO date string
  const [locDialog, setLocDialog] = useState(false);
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

  const handleSelectEvent = async (event) => {
    if (!isAdmin) return;
    const shift = event.resource;
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

  const events = useMemo(
    () =>
      shifts.map((shift) => {
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
        return {
          id: shift.id,
          title: `${shift.staff_name} (${shift.shift_type_display || shift.shift_type})`,
          start,
          end,
          allDay: !shift.start_time,
          resource: shift,
        };
      }),
    [shifts]
  );

  const eventPropGetter = (event) => {
    const color = SHIFT_COLORS[event.resource.shift_type] || "#546e7a";
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

  const components = useMemo(() => ({ month: { dateHeader: DateHeader } }), [DateHeader]);

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

  return (
    <Box>
      {location && (
        <Alert
          severity={location.warning ? "warning" : "info"}
          sx={{ mb: 1 }}
          action={
            isAdmin && (
              <Button color="inherit" size="small" onClick={openLocationDialog}>
                {location.state ? "Edit location" : "Set location"}
              </Button>
            )
          }
        >
          {location.state ? (
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
            location.warning
          )}
        </Alert>
      )}

      {intoSlot(
        legendSlot,
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ justifyContent: "flex-end", mb: legendSlot ? 0 : 1 }}>
          {Object.entries(COVERAGE_STATUS).map(([key, m]) => (
            <Chip
              key={key}
              size="small"
              label={`${m.icon} ${m.label}`}
              sx={{ bgcolor: m.bg, color: m.color, fontWeight: 600, border: `1px solid ${m.color}55` }}
            />
          ))}
          {coverage && (
            <Typography variant="caption" color="text.secondary">
              In view: {coverage.summary.not_met} not met, {coverage.summary.at_risk} at risk,{" "}
              {coverage.summary.met} covered
            </Typography>
          )}
        </Stack>
      )}
      {intoSlot(
        shiftSlot,
        <Box sx={{ textAlign: "center", mb: shiftSlot ? 0 : 1 }}>
          <Stack direction="row" spacing={1} alignItems="center" justifyContent="center">
            {Object.entries(SHIFT_COLORS).map(([type, color]) => (
              <Chip
                key={type}
                label={type}
                size="small"
                sx={{ bgcolor: color, color: "white", textTransform: "capitalize" }}
              />
            ))}
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
            Click a day for its coverage details.
            {isAdmin ? " Click a shift to remove it." : ""}
          </Typography>
        </Box>
      )}
      <Stack direction="row" spacing={1} sx={{ mb: 1 }} alignItems="center">
        <Box sx={{ flexGrow: 1 }} />
        {loading && <CircularProgress size={18} />}
        <FormControl size="small" sx={{ minWidth: 200 }}>
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
      </Stack>
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
      <Box sx={{ height: 650, bgcolor: "background.paper", p: 1, borderRadius: 2 }}>
        <Calendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          style={{ height: "100%", cursor: "pointer" }}
          onRangeChange={handleRangeChange}
          onSelectEvent={handleSelectEvent}
          selectable
          onSelectSlot={(slot) => setDayDialog(toISO(slot.start))}
          eventPropGetter={eventPropGetter}
          dayPropGetter={dayPropGetter}
          components={components}
          popup
        />
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
                        Staff scheduled: {it.assigned} (need {it.required})
                        {it.required_hours != null &&
                          ` · Care hours: ${it.hours_scheduled ?? 0} of ${Math.round(it.required_hours * 10) / 10}`}
                        {it.required_rn != null && ` · RNs: ${it.rn_scheduled ?? 0} (need ${it.required_rn})`}
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
