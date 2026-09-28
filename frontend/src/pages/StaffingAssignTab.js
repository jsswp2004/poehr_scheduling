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
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrash, faPen } from "@fortawesome/free-solid-svg-icons";
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

const SHIFT_TYPES = [
  { value: "day", label: "Day" },
  { value: "evening", label: "Evening" },
  { value: "night", label: "Night" },
  { value: "custom", label: "Custom" },
];

function StaffingAssignTab() {
  const token = getAccessToken();

  const [staffList, setStaffList] = useState([]);
  const [patterns, setPatterns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);

  const [coverageRequirements, setCoverageRequirements] = useState([]);
  const [covShiftType, setCovShiftType] = useState("day");
  const [covDays, setCovDays] = useState([]);
  const [covMinStaff, setCovMinStaff] = useState(1);
  const [covStartDate, setCovStartDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [covEndDate, setCovEndDate] = useState("");
  const [covNotes, setCovNotes] = useState("");
  const [covStatus, setCovStatus] = useState(null);

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

  const [editPatternOpen, setEditPatternOpen] = useState(false);
  const [editPatternForm, setEditPatternForm] = useState(null);
  const [editPatternSaving, setEditPatternSaving] = useState(false);
  const [editPatternError, setEditPatternError] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [staffRes, patternsRes, coverageRes] = await Promise.all([
        axios.get(apiEndpoints.staffingStaff, {
          headers: getAuthHeaders(token),
          params: { active_only: 1 },
        }),
        axios.get(apiEndpoints.staffingRecurringPatterns, {
          headers: getAuthHeaders(token),
        }),
        axios.get(apiEndpoints.staffingCoverageRequirements, {
          headers: getAuthHeaders(token),
        }),
      ]);
      setStaffList(staffRes.data.results || staffRes.data || []);
      setPatterns(patternsRes.data.results || patternsRes.data || []);
      setCoverageRequirements(coverageRes.data.results || coverageRes.data || []);
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

  const openEditPattern = (p) => {
    setEditPatternForm({
      id: p.id,
      staff: p.staff,
      shift_type: p.shift_type,
      start_time: (p.start_time || "").slice(0, 5) || "07:00",
      end_time: (p.end_time || "").slice(0, 5) || "15:00",
      days_of_week: p.days_of_week || [],
      start_date: p.start_date,
      end_date: p.end_date || "",
      notes: p.notes || "",
    });
    setEditPatternError("");
    setEditPatternOpen(true);
  };

  const closeEditPattern = () => {
    if (editPatternSaving) return;
    setEditPatternOpen(false);
    setEditPatternForm(null);
  };

  const toggleEditPatternDay = (code) => {
    setEditPatternForm((f) => ({
      ...f,
      days_of_week: f.days_of_week.includes(code)
        ? f.days_of_week.filter((d) => d !== code)
        : [...f.days_of_week, code],
    }));
  };

  const handleEditPatternSave = async () => {
    if (!editPatternForm.staff) {
      setEditPatternError("Please choose a staff member.");
      return;
    }
    if (editPatternForm.days_of_week.length === 0) {
      setEditPatternError("Choose at least one day of the week.");
      return;
    }
    setEditPatternSaving(true);
    setEditPatternError("");
    try {
      await axios.patch(
        apiEndpoints.staffingRecurringPatternDetail(editPatternForm.id),
        {
          staff: editPatternForm.staff,
          shift_type: editPatternForm.shift_type,
          start_time: editPatternForm.start_time,
          end_time: editPatternForm.end_time,
          days_of_week: editPatternForm.days_of_week,
          start_date: editPatternForm.start_date,
          end_date: editPatternForm.end_date || null,
          notes: editPatternForm.notes,
        },
        { headers: getAuthHeaders(token) }
      );
      setEditPatternOpen(false);
      setEditPatternForm(null);
      fetchData();
    } catch (err) {
      setEditPatternError(
        JSON.stringify(err.response?.data) || err.message || "Failed to save changes."
      );
    } finally {
      setEditPatternSaving(false);
    }
  };

  const toggleCovDay = (code) => {
    setCovDays((prev) =>
      prev.includes(code) ? prev.filter((d) => d !== code) : [...prev, code]
    );
  };

  const resetCovForm = () => {
    setCovDays([]);
    setCovMinStaff(1);
    setCovEndDate("");
    setCovNotes("");
  };

  const handleCovSubmit = async () => {
    if (covDays.length === 0) {
      setCovStatus({ ok: false, message: "Choose at least one day of the week." });
      return;
    }
    try {
      await axios.post(
        apiEndpoints.staffingCoverageRequirements,
        {
          shift_type: covShiftType,
          days_of_week: covDays,
          min_staff_required: covMinStaff,
          start_date: covStartDate,
          end_date: covEndDate || null,
          notes: covNotes,
        },
        { headers: getAuthHeaders(token) }
      );
      setCovStatus({ ok: true, message: "Coverage requirement saved." });
      resetCovForm();
      fetchData();
    } catch (err) {
      setCovStatus({
        ok: false,
        message:
          JSON.stringify(err.response?.data) || err.message || "Save failed.",
      });
    }
  };

  const handleDeleteCoverageRequirement = async (id) => {
    try {
      await axios.delete(apiEndpoints.staffingCoverageRequirementDetail(id), {
        headers: getAuthHeaders(token),
      });
      fetchData();
    } catch (err) {
      setCovStatus({ ok: false, message: "Failed to delete coverage requirement." });
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
                  <Tooltip title="Edit schedule">
                    <IconButton size="small" onClick={() => openEditPattern(p)}>
                      <FontAwesomeIcon icon={faPen} />
                    </IconButton>
                  </Tooltip>
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

      {/* Edit recurring schedule dialog */}
      <Dialog open={editPatternOpen} onClose={closeEditPattern} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Recurring Schedule</DialogTitle>
        <DialogContent>
          {editPatternForm && (
            <Stack spacing={2} sx={{ mt: 1 }}>
              {editPatternError && <Alert severity="error">{editPatternError}</Alert>}
              <FormControl size="small" fullWidth>
                <InputLabel id="edit-staff-label">Staff Member</InputLabel>
                <Select
                  labelId="edit-staff-label"
                  label="Staff Member"
                  value={editPatternForm.staff}
                  onChange={(e) =>
                    setEditPatternForm((f) => ({ ...f, staff: e.target.value }))
                  }
                >
                  {staffList.map((s) => (
                    <MenuItem key={s.id} value={s.id}>
                      {s.full_name} ({s.profession_display || s.profession})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <Stack direction="row" spacing={2}>
                <FormControl size="small" sx={{ minWidth: 160 }}>
                  <InputLabel id="edit-shift-type-label">Shift Type</InputLabel>
                  <Select
                    labelId="edit-shift-type-label"
                    label="Shift Type"
                    value={editPatternForm.shift_type}
                    onChange={(e) =>
                      setEditPatternForm((f) => ({ ...f, shift_type: e.target.value }))
                    }
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
                  value={editPatternForm.start_time}
                  onChange={(e) =>
                    setEditPatternForm((f) => ({ ...f, start_time: e.target.value }))
                  }
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  label="End Time"
                  type="time"
                  size="small"
                  value={editPatternForm.end_time}
                  onChange={(e) =>
                    setEditPatternForm((f) => ({ ...f, end_time: e.target.value }))
                  }
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
                      control={
                        <Checkbox
                          checked={editPatternForm.days_of_week.includes(d.code)}
                          onChange={() => toggleEditPatternDay(d.code)}
                        />
                      }
                      label={d.label}
                    />
                  ))}
                </Stack>
              </Box>

              <Stack direction="row" spacing={2}>
                <TextField
                  label="Start Date"
                  type="date"
                  size="small"
                  value={editPatternForm.start_date}
                  onChange={(e) =>
                    setEditPatternForm((f) => ({ ...f, start_date: e.target.value }))
                  }
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  label="End Date (optional)"
                  type="date"
                  size="small"
                  value={editPatternForm.end_date}
                  onChange={(e) =>
                    setEditPatternForm((f) => ({ ...f, end_date: e.target.value }))
                  }
                  InputLabelProps={{ shrink: true }}
                />
              </Stack>

              <TextField
                label="Notes (optional)"
                size="small"
                multiline
                minRows={2}
                value={editPatternForm.notes}
                onChange={(e) =>
                  setEditPatternForm((f) => ({ ...f, notes: e.target.value }))
                }
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeEditPattern} disabled={editPatternSaving}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleEditPatternSave} disabled={editPatternSaving}>
            {editPatternSaving ? "Saving..." : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      <Divider sx={{ my: 4 }} />

      <Typography variant="h6" sx={{ mb: 1 }}>
        Coverage Requirements (understaffing alerts)
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Mark which shift types need guaranteed coverage. If fewer than the
        minimum number of staff are assigned to a covered shift type/date
        combination 24 hours before it starts, an email alert is sent to
        this organization's admins automatically.
      </Typography>

      <Stack spacing={2} sx={{ mb: 3, maxWidth: 900 }}>
        <Stack direction="row" spacing={2}>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel id="cov-shift-type-label">Shift Type</InputLabel>
            <Select
              labelId="cov-shift-type-label"
              label="Shift Type"
              value={covShiftType}
              onChange={(e) => setCovShiftType(e.target.value)}
            >
              {SHIFT_TYPES.map((s) => (
                <MenuItem key={s.value} value={s.value}>
                  {s.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="Minimum Staff Required"
            type="number"
            size="small"
            inputProps={{ min: 1 }}
            value={covMinStaff}
            onChange={(e) => setCovMinStaff(Math.max(1, Number(e.target.value) || 1))}
            sx={{ width: 220 }}
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
                control={
                  <Checkbox
                    checked={covDays.includes(d.code)}
                    onChange={() => toggleCovDay(d.code)}
                  />
                }
                label={d.label}
              />
            ))}
          </Stack>
        </Box>

        <Stack direction="row" spacing={2}>
          <TextField
            label="Start Date"
            type="date"
            size="small"
            value={covStartDate}
            onChange={(e) => setCovStartDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="End Date (optional)"
            type="date"
            size="small"
            value={covEndDate}
            onChange={(e) => setCovEndDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
        </Stack>

        <TextField
          label="Notes (optional)"
          size="small"
          multiline
          minRows={2}
          value={covNotes}
          onChange={(e) => setCovNotes(e.target.value)}
        />

        <Box>
          <Button variant="contained" onClick={handleCovSubmit}>
            Add Coverage Requirement
          </Button>
        </Box>
      </Stack>

      {covStatus && (
        <Alert severity={covStatus.ok ? "success" : "error"} sx={{ mb: 3 }}>
          {covStatus.message}
        </Alert>
      )}

      {!loading && (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Shift</TableCell>
              <TableCell>Days</TableCell>
              <TableCell>Min Staff</TableCell>
              <TableCell>Start</TableCell>
              <TableCell>End</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {coverageRequirements.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.shift_type_display || r.shift_type}</TableCell>
                <TableCell>{(r.days_of_week || []).join(", ")}</TableCell>
                <TableCell>{r.min_staff_required}</TableCell>
                <TableCell>{r.start_date}</TableCell>
                <TableCell>{r.end_date || "Ongoing"}</TableCell>
                <TableCell>
                  <Tooltip title="Delete coverage requirement">
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => handleDeleteCoverageRequirement(r.id)}
                    >
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
