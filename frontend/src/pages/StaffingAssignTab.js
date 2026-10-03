import { useState, useEffect, useCallback, useMemo } from "react";
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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tabs,
  Tab,
  TablePagination,
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

const DAY_NAMES = {
  mon: "monday",
  tue: "tuesday",
  wed: "wednesday",
  thu: "thursday",
  fri: "friday",
  sat: "saturday",
  sun: "sunday",
};

const ROWS_PER_PAGE = 20;

const daysHaystack = (codes) =>
  (codes || []).map((c) => `${c} ${DAY_NAMES[c] || ""}`).join(" ");

// Every whitespace-separated term must appear somewhere in the haystack.
const matchesTerms = (haystack, search) => {
  const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const hay = haystack.toLowerCase();
  return terms.every((t) => hay.includes(t));
};

function StaffingAssignTab() {
  const token = getAccessToken();

  const [staffList, setStaffList] = useState([]);
  const [patterns, setPatterns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);
  const [assignTab, setAssignTab] = useState("assign");

  const [units, setUnits] = useState([]);
  const [unitId, setUnitId] = useState("");
  const [coverageRequirements, setCoverageRequirements] = useState([]);
  const [covMode, setCovMode] = useState("fixed");
  const [covUnitId, setCovUnitId] = useState("");
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

  const [patSearch, setPatSearch] = useState("");
  const [patStatus, setPatStatus] = useState("active");
  const [patUnit, setPatUnit] = useState("");
  const [patShift, setPatShift] = useState("");
  const [patPage, setPatPage] = useState(0);

  const [covSearch, setCovSearch] = useState("");
  const [covFilterUnit, setCovFilterUnit] = useState("");
  const [covFilterShift, setCovFilterShift] = useState("");
  const [covFilterMode, setCovFilterMode] = useState("");
  const [covPage, setCovPage] = useState(0);

  const [editPatternOpen, setEditPatternOpen] = useState(false);
  const [editPatternForm, setEditPatternForm] = useState(null);
  const [editPatternSaving, setEditPatternSaving] = useState(false);
  const [editPatternError, setEditPatternError] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [staffRes, patternsRes, coverageRes, unitsRes] = await Promise.all([
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
        axios.get(apiEndpoints.staffingUnits, {
          headers: getAuthHeaders(token),
          params: { active_only: 1 },
        }),
      ]);
      setUnits(unitsRes.data.results || unitsRes.data || []);
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
            unit: unitId || null,
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
            unit: unitId || null,
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
      unit: p.unit || "",
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
          unit: editPatternForm.unit || null,
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
    setCovMode("fixed");
    setCovUnitId("");
    setCovEndDate("");
    setCovNotes("");
  };

  const handleCovSubmit = async () => {
    if (covDays.length === 0) {
      setCovStatus({ ok: false, message: "Choose at least one day of the week." });
      return;
    }
    if (covMode === "hppd" && !covUnitId) {
      setCovStatus({
        ok: false,
        message: "Choose a unit: HPPD staffing is calculated from that unit's census.",
      });
      return;
    }
    try {
      await axios.post(
        apiEndpoints.staffingCoverageRequirements,
        {
          shift_type: covShiftType,
          mode: covMode,
          unit: covUnitId || null,
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

  const filteredPatterns = useMemo(
    () =>
      patterns.filter((p) => {
        const isActive = p.is_active !== false;
        if (patStatus === "active" && !isActive) return false;
        if (patStatus === "inactive" && isActive) return false;
        if (patUnit === "none" && p.unit) return false;
        if (patUnit && patUnit !== "none" && String(p.unit) !== String(patUnit)) return false;
        if (patShift && p.shift_type !== patShift) return false;
        const hay = [
          p.staff_name,
          p.unit_name,
          p.shift_type_display,
          p.shift_type,
          daysHaystack(p.days_of_week),
          p.start_date,
          p.end_date || "ongoing",
          p.notes,
        ]
          .filter(Boolean)
          .join(" ");
        return matchesTerms(hay, patSearch);
      }),
    [patterns, patSearch, patStatus, patUnit, patShift]
  );

  const filteredCoverage = useMemo(
    () =>
      coverageRequirements.filter((r) => {
        if (covFilterUnit === "none" && r.unit) return false;
        if (covFilterUnit && covFilterUnit !== "none" && String(r.unit) !== String(covFilterUnit))
          return false;
        if (covFilterShift && r.shift_type !== covFilterShift) return false;
        if (covFilterMode && r.mode !== covFilterMode) return false;
        const hay = [
          r.unit_name,
          r.shift_type_display,
          r.shift_type,
          daysHaystack(r.days_of_week),
          r.mode === "hppd" ? "hppd census-based census" : `fixed minimum min ${r.min_staff_required}`,
          r.start_date,
          r.end_date || "ongoing",
          r.notes,
        ]
          .filter(Boolean)
          .join(" ");
        return matchesTerms(hay, covSearch);
      }),
    [coverageRequirements, covSearch, covFilterUnit, covFilterShift, covFilterMode]
  );

  const patFiltersActive =
    patSearch.trim() !== "" || patStatus !== "active" || patUnit !== "" || patShift !== "";
  const covFiltersActive =
    covSearch.trim() !== "" || covFilterUnit !== "" || covFilterShift !== "" || covFilterMode !== "";

  const patPageSafe = Math.min(patPage, Math.max(0, Math.ceil(filteredPatterns.length / ROWS_PER_PAGE) - 1));
  const covPageSafe = Math.min(covPage, Math.max(0, Math.ceil(filteredCoverage.length / ROWS_PER_PAGE) - 1));
  const pagedPatterns = filteredPatterns.slice(patPageSafe * ROWS_PER_PAGE, (patPageSafe + 1) * ROWS_PER_PAGE);
  const pagedCoverage = filteredCoverage.slice(covPageSafe * ROWS_PER_PAGE, (covPageSafe + 1) * ROWS_PER_PAGE);

  const twoPaneSx = {
    display: "grid",
    gridTemplateColumns: { xs: "1fr", lg: "minmax(380px, 2fr) 3fr" },
    gap: 3,
    alignItems: "start",
  };

  return (
    <Box>
      <Tabs
        value={assignTab}
        onChange={(e, newValue) => setAssignTab(newValue)}
        sx={{ mb: 1.5 }}
      >
        <Tab label="Assign a Schedule" value="assign" />
        <Tab label="Coverage Requirements" value="coverage" />
      </Tabs>

      {assignTab === "assign" && (
        <Box>
      <Box sx={twoPaneSx}>
      <Box sx={{ minWidth: 0 }}>
      <Stack spacing={1.5} sx={{ mb: 1.5 }}>
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

        <FormControl size="small" sx={{ minWidth: 260 }}>
          <InputLabel id="assign-unit-label">Unit (optional)</InputLabel>
          <Select
            labelId="assign-unit-label"
            label="Unit (optional)"
            value={unitId}
            onChange={(e) => setUnitId(e.target.value)}
          >
            <MenuItem value="">
              <em>No unit</em>
            </MenuItem>
            {units.map((u) => (
              <MenuItem key={u.id} value={u.id}>
                {u.name}
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

        <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
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

        <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
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
        <Alert severity={status.ok ? "success" : "error"} sx={{ mb: 1.5 }}>
          {status.message}
        </Alert>
      )}

      </Box>

      <Box sx={{ minWidth: 0 }}>
      <Typography variant="h6" sx={{ mb: 1 }}>
        Active Recurring Schedules
      </Typography>
      <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
        <TextField
          size="small"
          label="Search schedules"
          placeholder="Name, unit, shift, day..."
          value={patSearch}
          onChange={(e) => {
            setPatSearch(e.target.value);
            setPatPage(0);
          }}
          sx={{ minWidth: 220, flex: 1 }}
        />
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel id="pat-status-label">Status</InputLabel>
          <Select
            labelId="pat-status-label"
            label="Status"
            value={patStatus}
            onChange={(e) => {
              setPatStatus(e.target.value);
              setPatPage(0);
            }}
          >
            <MenuItem value="active">Active</MenuItem>
            <MenuItem value="inactive">Inactive</MenuItem>
            <MenuItem value="all">All</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel id="pat-unit-label">Unit</InputLabel>
          <Select
            labelId="pat-unit-label"
            label="Unit"
            value={patUnit}
            onChange={(e) => {
              setPatUnit(e.target.value);
              setPatPage(0);
            }}
          >
            <MenuItem value="">All units</MenuItem>
            <MenuItem value="none">
              <em>No unit</em>
            </MenuItem>
            {units.map((u) => (
              <MenuItem key={u.id} value={u.id}>
                {u.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel id="pat-shift-label">Shift</InputLabel>
          <Select
            labelId="pat-shift-label"
            label="Shift"
            value={patShift}
            onChange={(e) => {
              setPatShift(e.target.value);
              setPatPage(0);
            }}
          >
            <MenuItem value="">All shifts</MenuItem>
            {SHIFT_TYPES.map((st) => (
              <MenuItem key={st.value} value={st.value}>
                {st.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Typography variant="body2" color="text.secondary">
          Showing {filteredPatterns.length} of {patterns.length}
        </Typography>
        {patFiltersActive && (
          <Button
            size="small"
            onClick={() => {
              setPatSearch("");
              setPatStatus("active");
              setPatUnit("");
              setPatShift("");
              setPatPage(0);
            }}
          >
            Clear
          </Button>
        )}
      </Stack>
      {!loading && (
        <Box sx={{ overflowX: "auto" }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Staff</TableCell>
              <TableCell>Unit</TableCell>
              <TableCell>Shift</TableCell>
              <TableCell>Days</TableCell>
              <TableCell>Start</TableCell>
              <TableCell>End</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredPatterns.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ color: "text.secondary", py: 3 }}>
                  {patterns.length === 0
                    ? "No recurring schedules yet."
                    : "No schedules match your search or filters."}
                </TableCell>
              </TableRow>
            )}
            {pagedPatterns.map((p) => (
              <TableRow key={p.id}>
                <TableCell>{p.staff_name}</TableCell>
                <TableCell>{p.unit_name || "-"}</TableCell>
                <TableCell>{p.shift_type_display || p.shift_type}</TableCell>
                <TableCell>{(p.days_of_week || []).join(", ")}</TableCell>
                <TableCell>{p.start_date}</TableCell>
                <TableCell>{p.end_date || "Ongoing"}</TableCell>
                <TableCell sx={{ whiteSpace: "nowrap" }}>
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
        </Box>
      )}
      {!loading && filteredPatterns.length > ROWS_PER_PAGE && (
        <TablePagination
          component="div"
          count={filteredPatterns.length}
          page={patPageSafe}
          onPageChange={(e, p) => setPatPage(p)}
          rowsPerPage={ROWS_PER_PAGE}
          rowsPerPageOptions={[ROWS_PER_PAGE]}
        />
      )}
      </Box>
      </Box>

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

        <FormControl size="small" fullWidth>
          <InputLabel id="edit-unit-label">Unit (optional)</InputLabel>
          <Select
            labelId="edit-unit-label"
            label="Unit (optional)"
            value={editPatternForm.unit}
            onChange={(e) => setEditPatternForm((f) => ({ ...f, unit: e.target.value }))}
          >
            <MenuItem value="">
              <em>No unit</em>
            </MenuItem>
            {units.map((u) => (
              <MenuItem key={u.id} value={u.id}>
                {u.name}
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
        </Box>
      )}

      {assignTab === "coverage" && (
        <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Mark which shift types need guaranteed coverage (understaffing
        alerts). If fewer than the minimum number of staff are assigned to
        a covered shift type/date combination 24 hours before it starts, an
        email alert is sent to this organization's admins automatically.
      </Typography>

      <Box sx={twoPaneSx}>
      <Box sx={{ minWidth: 0 }}>
      <Stack spacing={1.5} sx={{ mb: 1.5 }}>
        <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel id="cov-mode-label">Requirement Type</InputLabel>
            <Select
              labelId="cov-mode-label"
              label="Requirement Type"
              value={covMode}
              onChange={(e) => setCovMode(e.target.value)}
            >
              <MenuItem value="fixed">Fixed minimum staff</MenuItem>
              <MenuItem value="hppd">HPPD (from unit census)</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel id="cov-unit-label">
              {covMode === "hppd" ? "Unit" : "Unit (optional)"}
            </InputLabel>
            <Select
              labelId="cov-unit-label"
              label={covMode === "hppd" ? "Unit" : "Unit (optional)"}
              value={covUnitId}
              onChange={(e) => setCovUnitId(e.target.value)}
            >
              <MenuItem value="">
                <em>No unit</em>
              </MenuItem>
              {units.map((u) => (
                <MenuItem key={u.id} value={u.id}>
                  {u.name} ({u.shift_pattern === "12h" ? "12h" : "8h"})
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>
        {covMode === "hppd" && (
          <Typography variant="body2" color="text.secondary">
            Maryland: 3.0 nursing hours per resident per day (RN + LPN + CNA),
            at least 1 staff per 15 residents, and at least 1 RN every shift.
            Staff counted toward this requirement must be assigned to this
            unit and have a nursing role set on the Roster tab.
          </Typography>
        )}
        <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
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
          {covMode === "fixed" && (
            <TextField
              label="Minimum Staff Required"
              type="number"
              size="small"
              inputProps={{ min: 1 }}
              value={covMinStaff}
              onChange={(e) => setCovMinStaff(Math.max(1, Number(e.target.value) || 1))}
              sx={{ width: 220 }}
            />
          )}
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

        <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
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
        <Alert severity={covStatus.ok ? "success" : "error"} sx={{ mb: 1.5 }}>
          {covStatus.message}
        </Alert>
      )}

      </Box>

      <Box sx={{ minWidth: 0 }}>
      <Typography variant="h6" sx={{ mb: 1 }}>
        Coverage Requirements
      </Typography>
      <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
        <TextField
          size="small"
          label="Search requirements"
          placeholder="Unit, shift, day, minimum..."
          value={covSearch}
          onChange={(e) => {
            setCovSearch(e.target.value);
            setCovPage(0);
          }}
          sx={{ minWidth: 220, flex: 1 }}
        />
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel id="covf-unit-label">Unit</InputLabel>
          <Select
            labelId="covf-unit-label"
            label="Unit"
            value={covFilterUnit}
            onChange={(e) => {
              setCovFilterUnit(e.target.value);
              setCovPage(0);
            }}
          >
            <MenuItem value="">All units</MenuItem>
            <MenuItem value="none">
              <em>No unit</em>
            </MenuItem>
            {units.map((u) => (
              <MenuItem key={u.id} value={u.id}>
                {u.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel id="covf-shift-label">Shift</InputLabel>
          <Select
            labelId="covf-shift-label"
            label="Shift"
            value={covFilterShift}
            onChange={(e) => {
              setCovFilterShift(e.target.value);
              setCovPage(0);
            }}
          >
            <MenuItem value="">All shifts</MenuItem>
            {SHIFT_TYPES.map((st) => (
              <MenuItem key={st.value} value={st.value}>
                {st.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel id="covf-mode-label">Type</InputLabel>
          <Select
            labelId="covf-mode-label"
            label="Type"
            value={covFilterMode}
            onChange={(e) => {
              setCovFilterMode(e.target.value);
              setCovPage(0);
            }}
          >
            <MenuItem value="">All types</MenuItem>
            <MenuItem value="fixed">Fixed minimum</MenuItem>
            <MenuItem value="hppd">HPPD</MenuItem>
          </Select>
        </FormControl>
        <Typography variant="body2" color="text.secondary">
          Showing {filteredCoverage.length} of {coverageRequirements.length}
        </Typography>
        {covFiltersActive && (
          <Button
            size="small"
            onClick={() => {
              setCovSearch("");
              setCovFilterUnit("");
              setCovFilterShift("");
              setCovFilterMode("");
              setCovPage(0);
            }}
          >
            Clear
          </Button>
        )}
      </Stack>

      {!loading && (
        <Box sx={{ overflowX: "auto" }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Unit</TableCell>
              <TableCell>Shift</TableCell>
              <TableCell>Days</TableCell>
              <TableCell>Requirement</TableCell>
              <TableCell>Start</TableCell>
              <TableCell>End</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredCoverage.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ color: "text.secondary", py: 3 }}>
                  {coverageRequirements.length === 0
                    ? "No coverage requirements yet."
                    : "No requirements match your search or filters."}
                </TableCell>
              </TableRow>
            )}
            {pagedCoverage.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.unit_name || "-"}</TableCell>
                <TableCell>{r.shift_type_display || r.shift_type}</TableCell>
                <TableCell>{(r.days_of_week || []).join(", ")}</TableCell>
                <TableCell>
                  {r.mode === "hppd" ? "HPPD (census-based)" : `Min ${r.min_staff_required}`}
                </TableCell>
                <TableCell>{r.start_date}</TableCell>
                <TableCell>{r.end_date || "Ongoing"}</TableCell>
                <TableCell sx={{ whiteSpace: "nowrap" }}>
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
        </Box>
      )}
      {!loading && filteredCoverage.length > ROWS_PER_PAGE && (
        <TablePagination
          component="div"
          count={filteredCoverage.length}
          page={covPageSafe}
          onPageChange={(e, p) => setCovPage(p)}
          rowsPerPage={ROWS_PER_PAGE}
          rowsPerPageOptions={[ROWS_PER_PAGE]}
        />
      )}
      </Box>
      </Box>
        </Box>
      )}
    </Box>
  );
}

export default StaffingAssignTab;
