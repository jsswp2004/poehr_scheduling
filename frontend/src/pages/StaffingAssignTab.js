import { useState, useEffect, useCallback } from "react";
import {
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Alert,
  Stack,
  TextField,
  FormControlLabel,
  Checkbox,
  Switch,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  IconButton,
  Tooltip,
} from "@mui/material";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrash } from "@fortawesome/free-solid-svg-icons";
import axios from "axios";
import { apiEndpoints, getAuthHeaders } from "../config/api";

const DAYS = [
  { code: "mon", label: "Mon" },
  { code: "tue", label: "Tue" },
  { code: "wed", label: "Wed" },
  { code: "thu", label: "Thu" },
  { code: "fri", label: "Fri" },
  { code: "sat", label: "Sat" },
  { code: "sun", label: "Sun" },
];

const SHIFT_TYPES = [
  { value: "day", label: "Day" },
  { value: "evening", label: "Evening" },
  { value: "night", label: "Night" },
  { value: "custom", label: "Custom" },
];

function StaffingAssignTab() {
  const token = localStorage.getItem("access_token");

  const [staffList, setStaffList] = useState([]);
  const [patterns, setPatterns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);

  const [staffId, setStaffId] = useState("");
  const [shiftType, setShiftType] = useState("day");
  const [startTime, setStartTime] = useState("07:00");
  const [endTime, setEndTime] = useState("15:00");
  const [days, setDays] = useState([]);
  const [startDate, setStartDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [endDate, setEndDate] = useState("");
  const [oneTimeOnly, setOneTimeOnly] = useState(false);
  const [notes, setNotes] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [staffRes, patternsRes] = await Promise.all([
        axios.get(apiEndpoints.staffingStaff, {
          headers: getAuthHeaders(token),
          params: { active_only: 1 },
        }),
        axios.get(apiEndpoints.staffingRecurringPatterns, {
          headers: getAuthHeaders(token),
        }),
      ]);
      setStaffList(staffRes.data.results || staffRes.data || []);
      setPatterns(patternsRes.data.results || patternsRes.data || []);
    } catch (err) {
      console.error("Failed to load staffing data", err);
      setStatus({ ok: false, message: "Failed to load staff/patterns." });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleDay = (code) => {
    setDays((prev) =>
      prev.includes(code) ? prev.filter((d) => d !== code) : [...prev, code]
    );
  };

  const resetForm = () => {
    setDays([]);
    setNotes("");
    setEndDate("");
  };

  const handleSubmit = async () => {
    if (!staffId) {
      setStatus({ ok: false, message: "Please choose a staff member." });
      return;
    }
    if (!oneTimeOnly && days.length === 0) {
      setStatus({
        ok: false,
        message: "Choose at least one day of the week, or switch to one-time assignment.",
      });
      return;
    }

    try {
      if (oneTimeOnly) {
        await axios.post(
          apiEndpoints.staffingShifts,
          {
            staff: staffId,
            date: startDate,
            shift_type: shiftType,
            start_time: startTime,
            end_time: endTime,
            notes,
          },
          { headers: getAuthHeaders(token) }
        );
        setStatus({ ok: true, message: "One-time shift assigned." });
      } else {
        await axios.post(
          apiEndpoints.staffingRecurringPatterns,
          {
            staff: staffId,
            shift_type: shiftType,
            start_time: startTime,
            end_time: endTime,
            days_of_week: days,
            start_date: startDate,
            end_date: endDate || null,
            notes,
          },
          { headers: getAuthHeaders(token) }
        );
        setStatus({ ok: true, message: "Recurring schedule created." });
      }
      resetForm();
      fetchData();
    } catch (err) {
      setStatus({
        ok: false,
        message:
          JSON.stringify(err.response?.data) || err.message || "Save failed.",
      });
    }
  };

  const handleDeletePattern = async (id) => {
    try {
      await axios.delete(apiEndpoints.staffingRecurringPatternDetail(id), {
        headers: getAuthHeaders(token),
      });
      fetchData();
    } catch (err) {
      setStatus({ ok: false, message: "Failed to delete pattern." });
    }
  };

  return (
    <Box sx={{ maxWidth: 900 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>
        Assign a Schedule
      </Typography>

      <Stack spacing={2} sx={{ mb: 3 }}>
        <FormControl size="small" sx={{ minWidth: 260 }}>
          <InputLabel id="staff-label">Staff Member</InputLabel>
          <Select
            labelId="staff-label"
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
        </FormControl>

        <FormControlLabel
          control={
            <Switch
              checked={oneTimeOnly}
              onChange={(e) => setOneTimeOnly(e.target.checked)}
            />
          }
          label="One-time assignment (single date, no recurrence)"
        />

        <Stack direction="row" spacing={2}>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel id="shift-type-label">Shift Type</InputLabel>
            <Select
              labelId="shift-type-label"
              label="Shift Type"
              value={shiftType}
              onChange={(e) => setShiftType(e.target.value)}
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

        {!oneTimeOnly && (
          <Box>
            <Typography variant="body2" sx={{ mb: 0.5 }}>
              Days of the Week
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap">
              {DAYS.map((d) => (
                <FormControlLabel
                  key={d.code}
                  control={
                    <Checkbox
                      checked={days.includes(d.code)}
                      onChange={() => toggleDay(d.code)}
                    />
                  }
                  label={d.label}
                />
              ))}
            </Stack>
          </Box>
        )}

        <Stack direction="row" spacing={2}>
          <TextField
            label={oneTimeOnly ? "Date" : "Start Date"}
            type="date"
            size="small"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          {!oneTimeOnly && (
            <TextField
              label="End Date (optional)"
              type="date"
              size="small"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          )}
        </Stack>

        <TextField
          label="Notes (optional)"
          size="small"
          multiline
          minRows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        <Box>
          <Button variant="contained" onClick={handleSubmit}>
            {oneTimeOnly ? "Assign Shift" : "Create Recurring Schedule"}
          </Button>
        </Box>
      </Stack>

      {status && (
        <Alert severity={status.ok ? "success" : "error"} sx={{ mb: 3 }}>
          {status.message}
        </Alert>
      )}

      <Typography variant="h6" sx={{ mb: 1 }}>
        Active Recurring Schedules
      </Typography>
      {!loading && (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Staff</TableCell>
              <TableCell>Shift</TableCell>
              <TableCell>Days</TableCell>
              <TableCell>Start</TableCell>
              <TableCell>End</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {patterns.map((p) => (
              <TableRow key={p.id}>
                <TableCell>{p.staff_name}</TableCell>
                <TableCell>{p.shift_type_display || p.shift_type}</TableCell>
                <TableCell>{(p.days_of_week || []).join(", ")}</TableCell>
                <TableCell>{p.start_date}</TableCell>
                <TableCell>{p.end_date || "Ongoing"}</TableCell>
                <TableCell>
                  <Tooltip title="Delete schedule">
                    <IconButton size="small" color="error" onClick={() => handleDeletePattern(p.id)}>
                      <FontAwesomeIcon icon={faTrash} />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Box>
  );
}

export default StaffingAssignTab;
