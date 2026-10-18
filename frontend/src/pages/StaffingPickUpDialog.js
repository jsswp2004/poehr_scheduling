import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import axios from "axios";
import { apiEndpoints, getAuthHeaders } from "../config/api";
import { getAccessToken } from "../utils/tokenManager";

const DAYS = [
  { code: "mon", label: "Mon" },
  { code: "tue", label: "Tue" },
  { code: "wed", label: "Wed" },
  { code: "thu", label: "Thu" },
  { code: "fri", label: "Fri" },
  { code: "sat", label: "Sat" },
  { code: "sun", label: "Sun" },
];
const DAY_BY_INDEX = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const SHIFT_TYPES = [
  { value: "day", label: "Day" },
  { value: "evening", label: "Evening" },
  { value: "night", label: "Night" },
  { value: "custom", label: "Custom" },
];
const DEFAULT_TIMES = {
  day: ["07:00", "15:00"],
  evening: ["15:00", "23:00"],
  night: ["23:00", "07:00"],
};

// "2026-10-19" -> "mon" (parsed by hand so the time zone can never shift the day).
const weekdayCode = (iso) => {
  const [y, m, d] = (iso || "").split("-").map(Number);
  if (!y || !m || !d) return null;
  return DAY_BY_INDEX[new Date(y, m - 1, d).getDay()];
};

/**
 * "Pick up a shift": the Assign a Schedule form, opened from a Not-met day on the
 * Calendar. Staff member, one-time switch, weekday and date arrive filled in; the
 * only action is "Create schedule". The server creates ONE shift for the signed-in
 * person and emails/texts the admins.
 */
// A readable message out of a DRF error body ({"field": ["msg"]} or {"error": "msg"}).
const apiError = (err, fallback) => {
  const d = err.response?.data;
  if (!d) return fallback;
  if (typeof d === "string") return d;
  if (d.error) return d.error;
  const first = Object.values(d)[0];
  return (Array.isArray(first) ? first[0] : first) || fallback;
};

function StaffingPickUpDialog({ open, onClose, date, defaults, me, units, isAdmin = false, onDone }) {
  const [staffList, setStaffList] = useState([]);
  const [staffId, setStaffId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [shiftType, setShiftType] = useState("day");
  const [startTime, setStartTime] = useState("07:00");
  const [endTime, setEndTime] = useState("15:00");
  const [pickDate, setPickDate] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Fresh, prefilled form every time the dialog opens.
  useEffect(() => {
    if (!open) return;
    const type = SHIFT_TYPES.some((s) => s.value === defaults?.shift_type) ? defaults.shift_type : "day";
    const [s, e] = DEFAULT_TIMES[type] || DEFAULT_TIMES.day;
    setPickDate(date || "");
    setUnitId(defaults?.unit_id ? String(defaults.unit_id) : "");
    setShiftType(type);
    setStartTime(s);
    setEndTime(e);
    setNotes("");
    setError("");
    setBusy(false);
    setStaffId(me?.staff_id || "");
  }, [open, date, defaults, me]);

  // Admins choose who to put on the shift, so they need the roster.
  useEffect(() => {
    if (!open || !isAdmin) return;
    axios
      .get(apiEndpoints.staffingStaff, { headers: getAuthHeaders(getAccessToken()), params: { active_only: 1 } })
      .then((res) => setStaffList(res.data.results || res.data || []))
      .catch(() => setStaffList([]));
  }, [open, isAdmin]);

  const changeShiftType = (type) => {
    setShiftType(type);
    if (DEFAULT_TIMES[type]) {
      setStartTime(DEFAULT_TIMES[type][0]);
      setEndTime(DEFAULT_TIMES[type][1]);
    }
  };

  const submit = async () => {
    setError("");
    if (!pickDate) {
      setError("Choose a date.");
      return;
    }
    if (isAdmin && !staffId) {
      setError("Choose a staff member.");
      return;
    }
    setBusy(true);
    try {
      if (isAdmin) {
        // Admins assign directly (same call as Assign a Schedule > one-time assignment).
        await axios.post(
          apiEndpoints.staffingShifts,
          {
            staff: staffId,
            unit: unitId === "" ? null : Number(unitId),
            date: pickDate,
            shift_type: shiftType,
            start_time: startTime,
            end_time: endTime,
            notes,
          },
          { headers: getAuthHeaders(getAccessToken()) }
        );
        const who = staffList.find((s) => s.id === staffId)?.full_name;
        onDone(`Shift assigned${who ? ` to ${who}` : ""}.`);
        return;
      }
      const res = await axios.post(
        apiEndpoints.staffingPickUpShift,
        {
          date: pickDate,
          shift_type: shiftType,
          start_time: startTime,
          end_time: endTime,
          unit: unitId === "" ? null : Number(unitId),
          notes,
        },
        { headers: getAuthHeaders(getAccessToken()) }
      );
      const told = (res.data?.alert?.emails || 0) + (res.data?.alert?.sms || 0) > 0;
      onDone(`Shift added to your schedule.${told ? " Your admin has been notified." : ""}`);
    } catch (err) {
      setError(apiError(err, "Could not add the shift. Please try again."));
      setBusy(false);
    }
  };

  const dayCode = weekdayCode(pickDate);

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Pick up a shift</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {!isAdmin && me && !me.staff_id && (
            <Alert severity="warning">
              Your login is not linked to a staff roster entry yet. Ask an admin to link it before picking up shifts.
            </Alert>
          )}

          <FormControl size="small" sx={{ minWidth: 260 }}>
            <InputLabel id="pickup-staff-label">Staff Member</InputLabel>
            {isAdmin ? (
              <Select
                labelId="pickup-staff-label"
                label="Staff Member"
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
              >
                {staffList.map((s) => (
                  <MenuItem key={s.id} value={s.id}>
                    {s.full_name} ({s.profession_display || s.profession})
                  </MenuItem>
                ))}
              </Select>
            ) : (
              <Select labelId="pickup-staff-label" label="Staff Member" value={me?.staff_id || ""} disabled>
                {me?.staff_id && (
                  <MenuItem value={me.staff_id}>
                    {me.full_name}
                    {me.profession ? ` (${me.profession})` : ""}
                  </MenuItem>
                )}
              </Select>
            )}
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 260 }}>
            <InputLabel id="pickup-unit-label">Unit (optional)</InputLabel>
            <Select
              labelId="pickup-unit-label"
              label="Unit (optional)"
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
            >
              <MenuItem value="">
                <em>No unit</em>
              </MenuItem>
              {(units || [])
                .filter((u) => u.is_active !== false)
                .map((u) => (
                  <MenuItem key={u.id} value={String(u.id)}>
                    {u.name}
                  </MenuItem>
                ))}
            </Select>
          </FormControl>

          <FormControlLabel
            control={<Switch checked disabled />}
            label="One-time assignment (single date, no recurrence)"
          />

          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel id="pickup-shift-type-label">Shift Type</InputLabel>
              <Select
                labelId="pickup-shift-type-label"
                label="Shift Type"
                value={shiftType}
                onChange={(e) => changeShiftType(e.target.value)}
              >
                {SHIFT_TYPES.map((s) => (
                  <MenuItem key={s.value} value={s.value}>
                    {s.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Start Time"
              type="time"
              size="small"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="End Time"
              type="time"
              size="small"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Stack>

          <Box>
            <Typography variant="body2" sx={{ mb: 0.5 }}>
              Days of the Week
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap">
              {DAYS.map((d) => (
                <FormControlLabel
                  key={d.code}
                  control={<Checkbox checked={dayCode === d.code} disabled />}
                  label={d.label}
                />
              ))}
            </Stack>
          </Box>

          <TextField
            label="Start Date"
            type="date"
            size="small"
            value={pickDate}
            onChange={(e) => setPickDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ maxWidth: 220 }}
          />

          <TextField
            label="Notes (optional)"
            size="small"
            multiline
            minRows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          <Stack direction="row" spacing={1}>
            <Button variant="contained" onClick={submit} disabled={busy || (isAdmin ? !staffId : !me?.staff_id)}>
              {busy ? "Creating..." : "Create schedule"}
            </Button>
            <Button onClick={onClose} disabled={busy}>
              Cancel
            </Button>
          </Stack>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}

export default StaffingPickUpDialog;
