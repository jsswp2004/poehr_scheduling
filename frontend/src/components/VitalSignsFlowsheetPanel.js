import { useState, useEffect, useCallback, Fragment } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Box,
  Paper,
  Typography,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stack,
} from "@mui/material";
import AddAlarmIcon from "@mui/icons-material/AddAlarm";
import DeleteIcon from "@mui/icons-material/Delete";
import { LocalizationProvider, DateTimePicker } from "@mui/x-date-pickers";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { jwtDecode } from "jwt-decode";
import { api } from "../api/client";
import { apiEndpoints } from "../config/api";
import { getValidToken } from "../utils/auth";
import { toast } from "./SimpleToast";

// The shared `api` axios instance has no request interceptor of its own --
// Authorization headers must be attached explicitly per-call, matching the
// same convention ClinicalNotesPanel and the other data hooks use.
const authHeader = async () => {
  const token = await getValidToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token.access_token || token}` };
};

const SECTION_HEADER_BG = "#0d1b4c"; // matches the Sunrise-style dark navy section bars

// Only one flowsheet type exists today, but the selector is here from the
// start so adding a new flowsheet type later (once the flowsheet-builder
// lands) is just adding an entry here -- never a UI restructure.
const FLOWSHEET_TYPES = [{ value: "vital_signs", label: "Vital Sign Flowsheet" }];

/**
 * Vital Signs flowsheet: a time-columned chart for a single visit, one per
 * appointment. Rows (grouped into sections) come from the backend's
 * `row_definitions` -- this component never hardcodes the row layout, so a
 * future flowsheet-builder can swap the fixed VITAL_SIGNS_FLOWSHEET_SECTIONS
 * constant for a database-backed definition without a frontend change.
 *
 * A nurse/doctor picks the visit, adds a time column for each set of
 * readings taken, fills in the grid, and saves -- the whole columns/data
 * blob is written on Save (no per-keystroke autosave), mirroring how
 * Clinical Notes' Save Draft works.
 */
function VitalSignsFlowsheetPanel({ patientId, patientName }) {
  const [searchParams] = useSearchParams();
  // Deep-link support: Note History's Edit action for a flowsheet row
  // navigates here with ?appointment=<id> so the correct visit's flowsheet
  // opens directly, instead of defaulting to the most recent visit.
  const requestedAppointmentIdRaw = searchParams.get("appointment");
  const requestedAppointmentId =
    requestedAppointmentIdRaw && !Number.isNaN(Number(requestedAppointmentIdRaw))
      ? Number(requestedAppointmentIdRaw)
      : null;

  const [userRole, setUserRole] = useState(null);
  const [userName, setUserName] = useState("");

  const [appointments, setAppointments] = useState([]);
  const [appointmentId, setAppointmentId] = useState(requestedAppointmentId || "");
  const [loadingAppointments, setLoadingAppointments] = useState(true);

  const [flowsheetType, setFlowsheetType] = useState(FLOWSHEET_TYPES[0].value);
  const [rowDefinitions, setRowDefinitions] = useState([]);
  const [flowsheetId, setFlowsheetId] = useState(null);
  const [columns, setColumns] = useState([]);
  const [cellData, setCellData] = useState({});
  const [loadingFlowsheet, setLoadingFlowsheet] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [addTimeOpen, setAddTimeOpen] = useState(false);
  const [newColumnTime, setNewColumnTime] = useState(new Date());

  const canAuthor = ["doctor", "nurse", "admin", "system_admin"].includes(userRole);

  // Role + row layout: loaded once, independent of which appointment is
  // selected (the definition endpoint needs no appointment/instance).
  useEffect(() => {
    const init = async () => {
      const token = await getValidToken();
      if (!token) return;
      try {
        const decoded = jwtDecode(token.access_token || token);
        setUserRole(decoded.role || null);
        const fullName = `${decoded.first_name || ""} ${decoded.last_name || ""}`.trim();
        setUserName(fullName || decoded.username || "");
      } catch (err) {
        console.error("Failed to decode token:", err);
      }
      try {
        const headers = await authHeader();
        const res = await api.get(apiEndpoints.vitalSignsFlowsheetDefinition, { headers });
        setRowDefinitions(res.data.row_definitions || []);
      } catch (err) {
        console.error("Failed to load flowsheet row definitions:", err);
        toast.error("Could not load the flowsheet layout.");
      }
    };
    init();
  }, []);

  const loadAppointments = useCallback(async () => {
    if (!patientId) return;
    setLoadingAppointments(true);
    try {
      const headers = await authHeader();
      const res = await api.get(`/api/appointments/?patient=${patientId}`, { headers });
      const list = Array.isArray(res.data) ? res.data : res.data?.results || [];
      setAppointments(list);
      // Default to the most recent visit so the panel isn't blank on load,
      // unless a specific visit was requested via ?appointment= (a deep link
      // from Note History's Edit action) and it's actually in this patient's
      // list -- that request always wins over "most recent".
      if (list.length > 0) {
        const sorted = [...list].sort(
          (a, b) => new Date(b.appointment_datetime) - new Date(a.appointment_datetime)
        );
        const requestedIsValid =
          requestedAppointmentId != null &&
          list.some((a) => a.id === requestedAppointmentId);
        setAppointmentId((current) => {
          if (requestedIsValid) return requestedAppointmentId;
          return current || sorted[0].id;
        });
      }
    } catch (err) {
      console.error("Failed to load appointments:", err);
      toast.error("Could not load appointments for this patient.");
    } finally {
      setLoadingAppointments(false);
    }
  }, [patientId, requestedAppointmentId]);

  useEffect(() => {
    loadAppointments();
  }, [loadAppointments]);

  const loadFlowsheet = useCallback(async () => {
    if (!appointmentId) {
      setFlowsheetId(null);
      setColumns([]);
      setCellData({});
      return;
    }
    setLoadingFlowsheet(true);
    try {
      const headers = await authHeader();
      const res = await api.get(apiEndpoints.vitalSignsFlowsheets, {
        headers,
        params: { appointment: appointmentId },
      });
      const list = Array.isArray(res.data) ? res.data : res.data?.results || [];
      if (list.length > 0) {
        const sheet = list[0];
        setFlowsheetId(sheet.id);
        setColumns(sheet.columns || []);
        setCellData(sheet.data || {});
        if (sheet.row_definitions?.length) setRowDefinitions(sheet.row_definitions);
      } else {
        setFlowsheetId(null);
        setColumns([]);
        setCellData({});
      }
      setDirty(false);
    } catch (err) {
      console.error("Failed to load vital signs flowsheet:", err);
      toast.error("Could not load the vital signs flowsheet for this visit.");
    } finally {
      setLoadingFlowsheet(false);
    }
  }, [appointmentId]);

  useEffect(() => {
    loadFlowsheet();
  }, [loadFlowsheet]);

  const handleCellChange = (rowKey, colId, value) => {
    setCellData((prev) => ({
      ...prev,
      [rowKey]: { ...prev[rowKey], [colId]: value },
    }));
    setDirty(true);
  };

  const confirmAddTime = () => {
    const colId = `col_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setColumns((prev) => [
      ...prev,
      {
        id: colId,
        timestamp: newColumnTime.toISOString(),
        recorded_by_name: userName,
      },
    ]);
    setDirty(true);
    setAddTimeOpen(false);
    setNewColumnTime(new Date());
  };

  const removeColumn = (col) => {
    const hasValues = rowDefinitions.some((section) =>
      section.rows.some((row) => cellData[row.key]?.[col.id])
    );
    if (hasValues) {
      toast.error("This time column has entries -- clear its values before removing it.");
      return;
    }
    setColumns((prev) => prev.filter((c) => c.id !== col.id));
    setDirty(true);
  };

  const handleSave = async () => {
    if (!appointmentId) {
      toast.error("Please select a visit for this flowsheet.");
      return;
    }
    setSaving(true);
    try {
      const headers = await authHeader();
      const payload = { appointment: appointmentId, columns, data: cellData };
      if (flowsheetId) {
        await api.patch(apiEndpoints.vitalSignsFlowsheet(flowsheetId), payload, { headers });
      } else {
        const res = await api.post(apiEndpoints.vitalSignsFlowsheets, payload, { headers });
        setFlowsheetId(res.data.id);
      }
      setDirty(false);
      toast.success("Vital signs flowsheet saved.");
    } catch (err) {
      console.error("Failed to save vital signs flowsheet:", err);
      const detail =
        err?.response?.data?.detail ||
        JSON.stringify(err?.response?.data) ||
        "Failed to save flowsheet.";
      toast.error(detail);
    } finally {
      setSaving(false);
    }
  };

  if (!canAuthor && userRole !== null) {
    return null;
  }

  const sortedColumns = [...columns].sort(
    (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
  );

  return (
    <Paper elevation={2} sx={{ p: 3, borderRadius: 2, mt: 3 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h6">
          Flowsheets{patientName ? ` - ${patientName}` : ""}
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            startIcon={<AddAlarmIcon />}
            onClick={() => setAddTimeOpen(true)}
            disabled={!appointmentId || saving}
          >
            Add Time
          </Button>
          <Button variant="contained" onClick={handleSave} disabled={!appointmentId || !dirty || saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </Stack>
      </Stack>

      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
        <FormControl size="small" sx={{ minWidth: 320 }}>
          <InputLabel id="flowsheet-appt-label">Appointment / Registration</InputLabel>
          <Select
            labelId="flowsheet-appt-label"
            label="Appointment / Registration"
            value={appointmentId}
            onChange={(e) => setAppointmentId(e.target.value)}
            disabled={loadingAppointments}
          >
            {appointments.map((a) => (
              <MenuItem key={a.id} value={a.id}>
                {a.title} - {new Date(a.appointment_datetime).toLocaleString()}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel id="flowsheet-type-label">Flowsheet</InputLabel>
          <Select
            labelId="flowsheet-type-label"
            label="Flowsheet"
            value={flowsheetType}
            onChange={(e) => setFlowsheetType(e.target.value)}
          >
            {FLOWSHEET_TYPES.map((ft) => (
              <MenuItem key={ft.value} value={ft.value}>
                {ft.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>

      {loadingFlowsheet ? (
        <Typography variant="body2" color="text.secondary">
          Loading flowsheet...
        </Typography>
      ) : !appointmentId ? (
        <Typography variant="body2" color="text.secondary">
          Select a visit to view or start its vital signs flowsheet.
        </Typography>
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2, maxHeight: "70vh" }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell
                  sx={{
                    position: "sticky",
                    left: 0,
                    zIndex: 3,
                    bgcolor: "background.paper",
                    minWidth: 220,
                    fontWeight: "bold",
                  }}
                >
                  Measure
                </TableCell>
                {sortedColumns.map((col) => (
                  <TableCell key={col.id} align="center" sx={{ minWidth: 140 }}>
                    <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="center">
                      <Box>
                        <Typography variant="caption" display="block" sx={{ fontWeight: "bold" }}>
                          {new Date(col.timestamp).toLocaleDateString()}
                        </Typography>
                        <Typography variant="caption" display="block" color="text.secondary">
                          {new Date(col.timestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </Typography>
                      </Box>
                      {canAuthor && (
                        <Tooltip title="Remove this time column">
                          <IconButton size="small" onClick={() => removeColumn(col)}>
                            <DeleteIcon fontSize="inherit" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Stack>
                  </TableCell>
                ))}
                {sortedColumns.length === 0 && (
                  <TableCell align="center" sx={{ color: "text.secondary" }}>
                    Click "Add Time" to start charting
                  </TableCell>
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {rowDefinitions.map((section) => (
                <Fragment key={section.section}>
                  <TableRow>
                    <TableCell
                      colSpan={Math.max(sortedColumns.length, 1) + 1}
                      sx={{
                        bgcolor: SECTION_HEADER_BG,
                        color: "#fff",
                        fontWeight: "bold",
                        py: 0.75,
                        position: "sticky",
                        left: 0,
                      }}
                    >
                      {section.section.toUpperCase()}
                    </TableCell>
                  </TableRow>
                  {section.rows.map((row) => (
                    <TableRow key={row.key} hover>
                      <TableCell
                        sx={{
                          position: "sticky",
                          left: 0,
                          zIndex: 2,
                          bgcolor: "background.paper",
                        }}
                      >
                        {row.label}
                        {row.unit && (
                          <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                            ({row.unit})
                          </Typography>
                        )}
                      </TableCell>
                      {sortedColumns.map((col) => (
                        <TableCell key={col.id} align="center">
                          <TextField
                            size="small"
                            variant="standard"
                            value={cellData[row.key]?.[col.id] ?? ""}
                            onChange={(e) => handleCellChange(row.key, col.id, e.target.value)}
                            disabled={!canAuthor}
                            inputProps={{
                              style: { textAlign: "center" },
                              inputMode: row.field_type === "numeric" ? "decimal" : "text",
                            }}
                            sx={{ width: 90 }}
                          />
                        </TableCell>
                      ))}
                      {sortedColumns.length === 0 && <TableCell />}
                    </TableRow>
                  ))}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={addTimeOpen} onClose={() => setAddTimeOpen(false)}>
        <DialogTitle>Add Time Column</DialogTitle>
        <DialogContent>
          <LocalizationProvider dateAdapter={AdapterDateFns}>
            <DateTimePicker
              label="Date & time of reading"
              value={newColumnTime}
              onChange={(value) => value && setNewColumnTime(value)}
              sx={{ mt: 1, width: "100%" }}
            />
          </LocalizationProvider>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddTimeOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={confirmAddTime}>
            Add
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}

export default VitalSignsFlowsheetPanel;
