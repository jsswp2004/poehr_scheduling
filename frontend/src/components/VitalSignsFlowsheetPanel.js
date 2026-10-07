import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from "react";
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
  Alert,
} from "@mui/material";
import AddAlarmIcon from "@mui/icons-material/AddAlarm";
import DeleteIcon from "@mui/icons-material/Delete";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import DateRangeIcon from "@mui/icons-material/DateRange";
import UnfoldMoreIcon from "@mui/icons-material/UnfoldMore";
import UnfoldLessIcon from "@mui/icons-material/UnfoldLess";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { LocalizationProvider, DateTimePicker } from "@mui/x-date-pickers";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { jwtDecode } from "jwt-decode";
import { api } from "../api/client";
import { apiEndpoints } from "../config/api";
import { getValidToken } from "../utils/auth";
import { toast } from "./SimpleToast";
import PanelTitle from "./patients/PanelTitle";
import { applyCalculations } from "../utils/calculations";

// The shared `api` axios instance has no request interceptor of its own --
// Authorization headers must be attached explicitly per-call, matching the
// same convention ClinicalNotesPanel and the other data hooks use.
const authHeader = async () => {
  const token = await getValidToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token.access_token || token}` };
};

const SECTION_HEADER_BG = "#0d1b4c"; // matches the Sunrise-style dark navy section bars

/**
 * Flowsheet panel: a time-columned chart for a single visit, one per
 * (appointment, flowsheet type) pair -- a visit can be charted against more
 * than one type (e.g. Vital Signs and Intake Screening) at once. The list of
 * available types and each one's row layout (grouped into sections) come
 * from the flowsheet-builder's FlowsheetTemplate/FlowsheetRowDefinition
 * tables via GET /api/flowsheet-templates/ -- this component never
 * hardcodes a row layout or a fixed list of types.
 *
 * A nurse/doctor picks the visit and the flowsheet type, adds a time column
 * for each set of readings taken, fills in the grid, and saves -- the whole
 * columns/data blob is written on Save (no per-keystroke autosave),
 * mirroring how Clinical Notes' Save Draft works.
 */
function VitalSignsFlowsheetPanel({ patientId, patientName, chartVisit }) {
  // On the Patients page the visit being charted is the one in the patient header (chartVisit);
  // elsewhere (the standalone flowsheet page) the visit is still picked from a list.
  const fixedVisit = chartVisit !== undefined;
  const fixedVisitRef = useRef(fixedVisit);
  fixedVisitRef.current = fixedVisit;
  const headerAppointmentId = fixedVisit ? chartVisit?.appointmentId || "" : null;
  const [searchParams] = useSearchParams();
  // Deep-link support: Note History's Edit action for a flowsheet row
  // navigates here with ?appointment=<id> so the correct visit's flowsheet
  // opens directly, instead of defaulting to the most recent visit.
  const requestedAppointmentIdRaw = searchParams.get("appointment");
  const requestedAppointmentId =
    requestedAppointmentIdRaw && !Number.isNaN(Number(requestedAppointmentIdRaw))
      ? Number(requestedAppointmentIdRaw)
      : null;
  // Same deep-link, for which flowsheet TYPE to open -- with more than one
  // type possible per visit, ?appointment= alone no longer says which one.
  const requestedTemplateIdRaw = searchParams.get("template");
  const requestedTemplateId =
    requestedTemplateIdRaw && !Number.isNaN(Number(requestedTemplateIdRaw))
      ? Number(requestedTemplateIdRaw)
      : null;

  const [userRole, setUserRole] = useState(null);
  const [userName, setUserName] = useState("");

  const [appointments, setAppointments] = useState([]);
  const [appointmentId, setAppointmentId] = useState(requestedAppointmentId || "");
  const [loadingAppointments, setLoadingAppointments] = useState(true);
  useEffect(() => {
    if (headerAppointmentId !== null) setAppointmentId(headerAppointmentId);
  }, [headerAppointmentId]);

  // Flowsheet types (templates) come from the flowsheet-builder now, not a
  // hardcoded list -- an admin can add new types (e.g. "Intake Screening")
  // without a frontend deploy. `selectedTemplateCode` drives which one is
  // active; `rowDefinitions` always mirrors the selected template's own
  // layout (already grouped by section, same shape the old hardcoded
  // VITAL_SIGNS_FLOWSHEET_SECTIONS constant used to produce).
  const [templates, setTemplates] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [selectedTemplateCode, setSelectedTemplateCode] = useState("");
  const selectedTemplate = templates.find((t) => t.code === selectedTemplateCode) || null;
  const rowDefinitions = useMemo(() => selectedTemplate?.row_definitions || [], [selectedTemplate]);

  const [flowsheetId, setFlowsheetId] = useState(null);
  const [columns, setColumns] = useState([]);
  const [cellData, setCellData] = useState({});
  const [loadingFlowsheet, setLoadingFlowsheet] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Which section headers are collapsed (hiding their rows), keyed by
  // section name. Collapsed is per-component-instance only -- it resets on
  // reload/visit change, same as the rest of this panel's UI state.
  const [collapsedSections, setCollapsedSections] = useState({});
  const toggleSection = (sectionName) => {
    setCollapsedSections((prev) => ({ ...prev, [sectionName]: !prev[sectionName] }));
  };

  const [addTimeOpen, setAddTimeOpen] = useState(false);
  const [newColumnTime, setNewColumnTime] = useState(new Date());

  // Add Time Range: generates several evenly-spaced time columns at once
  // (e.g. "every 15 minutes for the next 2 hours") instead of adding one
  // column at a time via the dialog above.
  const [addRangeOpen, setAddRangeOpen] = useState(false);
  const [rangeStart, setRangeStart] = useState(new Date());
  const [rangeIntervalChoice, setRangeIntervalChoice] = useState(60); // minutes, or "custom"
  const [rangeCustomMinutes, setRangeCustomMinutes] = useState(60);
  const [rangeCount, setRangeCount] = useState(4);
  const effectiveIntervalMinutes =
    rangeIntervalChoice === "custom" ? Number(rangeCustomMinutes) || 0 : rangeIntervalChoice;
  const clampedRangeCount = Math.max(1, Math.min(50, Number(rangeCount) || 0));

  const canAuthor = ["doctor", "nurse", "admin", "system_admin"].includes(userRole);

  // Calculated rows (a PHQ-9 total, a BMI, ...) are never typed: each time
  // column's result is worked out live from that column's own answers by the
  // row's `calc` config. The server recomputes the same numbers on Save.
  const flatRows = useMemo(() => rowDefinitions.flatMap((section) => section.rows), [rowDefinitions]);
  const hasCalculatedRows = flatRows.some((row) => row.field_type === "calculated");
  const calcByColumn = useMemo(() => {
    const out = {};
    if (!hasCalculatedRows) return out;
    columns.forEach((col) => {
      const values = {};
      flatRows.forEach((row) => {
        if (row.field_type === "calculated") return;
        const v = cellData[row.key]?.[col.id];
        if (v !== undefined && v !== "") values[row.key] = v;
      });
      out[col.id] = applyCalculations(flatRows, values).results;
    });
    return out;
  }, [columns, cellData, flatRows, hasCalculatedRows]);
  // Dropdown rows (e.g. a PHQ-9 item with its four answers) need a wider cell.
  const hasDropdownRows = flatRows.some((row) => row.field_type === "dropdown");
  const columnMinWidth = hasDropdownRows ? 180 : 140;

  // Role + flowsheet types: loaded once, independent of which appointment is
  // selected (the templates endpoint needs no appointment/instance).
  //
  // Every endpoint this panel touches is gated server-side to
  // doctor/nurse/admin/system_admin -- a role outside that list (e.g.
  // registrar) would get a 403 from all of them. Rather than firing those
  // requests and surfacing a "Could not load..." toast for a role that was
  // never going to see this panel anyway (canAuthor's check below renders
  // nothing for it), skip the templates fetch entirely once the role is
  // known not to qualify.
  useEffect(() => {
    const init = async () => {
      const token = await getValidToken();
      if (!token) return;
      let role = null;
      try {
        const decoded = jwtDecode(token.access_token || token);
        role = decoded.role || null;
        setUserRole(role);
        const fullName = `${decoded.first_name || ""} ${decoded.last_name || ""}`.trim();
        setUserName(fullName || decoded.username || "");
      } catch (err) {
        console.error("Failed to decode token:", err);
      }
      if (!["doctor", "nurse", "admin", "system_admin"].includes(role)) {
        setLoadingTemplates(false);
        return;
      }
      try {
        const headers = await authHeader();
        const res = await api.get(apiEndpoints.flowsheetTemplates, { headers });
        const list = Array.isArray(res.data) ? res.data : res.data?.results || [];
        setTemplates(list);
        if (list.length > 0) {
          const requested = requestedTemplateId
            ? list.find((t) => t.id === requestedTemplateId)
            : null;
          setSelectedTemplateCode((current) => current || requested?.code || list[0].code);
        }
      } catch (err) {
        console.error("Failed to load flowsheet types:", err);
        toast.error("Could not load the available flowsheet types.");
      } finally {
        setLoadingTemplates(false);
      }
    };
    init();
  }, []);

  const loadAppointments = useCallback(async () => {
    if (!patientId) return;
    // userRole is null for an instant while the token is still being
    // decoded -- wait for it to resolve rather than treating "not known
    // yet" the same as "not allowed" (this effect re-runs once userRole
    // updates, since it's in the dependency array below).
    if (userRole === null) return;
    if (!canAuthor) {
      setLoadingAppointments(false);
      return;
    }
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
          if (fixedVisitRef.current) return current;
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
  }, [patientId, requestedAppointmentId, userRole, canAuthor]);

  useEffect(() => {
    loadAppointments();
  }, [loadAppointments]);

  const loadFlowsheet = useCallback(async () => {
    if (!appointmentId || !selectedTemplate || !canAuthor) {
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
        params: { appointment: appointmentId, template: selectedTemplate.id },
      });
      const list = Array.isArray(res.data) ? res.data : res.data?.results || [];
      if (list.length > 0) {
        const sheet = list[0];
        setFlowsheetId(sheet.id);
        setColumns(sheet.columns || []);
        setCellData(sheet.data || {});
      } else {
        setFlowsheetId(null);
        setColumns([]);
        setCellData({});
      }
      setDirty(false);
    } catch (err) {
      console.error("Failed to load flowsheet:", err);
      toast.error("Could not load the flowsheet for this visit.");
    } finally {
      setLoadingFlowsheet(false);
    }
  }, [appointmentId, selectedTemplate, canAuthor]);

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
      section.rows.some((row) => row.field_type !== "calculated" && cellData[row.key]?.[col.id])
    );
    if (hasValues) {
      toast.error("This time column has entries -- clear its values before removing it.");
      return;
    }
    setColumns((prev) => prev.filter((c) => c.id !== col.id));
    setDirty(true);
  };

  const confirmAddRange = () => {
    const intervalMs = Math.max(0, effectiveIntervalMinutes) * 60 * 1000;
    if (clampedRangeCount > 1 && intervalMs <= 0) {
      toast.error("Enter an interval greater than 0 minutes for more than one column.");
      return;
    }
    const newColumns = Array.from({ length: clampedRangeCount }, (_, i) => ({
      id: `col_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date(rangeStart.getTime() + i * intervalMs).toISOString(),
      recorded_by_name: userName,
    }));
    setColumns((prev) => [...prev, ...newColumns]);
    setDirty(true);
    setAddRangeOpen(false);
  };

  // Collapse/Expand All: a section is "collapsed" when every section is
  // currently collapsed, so the one button toggles cleanly between the two
  // extremes rather than tracking a separate boolean that can drift out of
  // sync with collapsedSections.
  const allSectionsCollapsed =
    rowDefinitions.length > 0 && rowDefinitions.every((section) => collapsedSections[section.section]);
  const toggleAllSections = () => {
    if (allSectionsCollapsed) {
      setCollapsedSections({});
    } else {
      const next = {};
      rowDefinitions.forEach((section) => {
        next[section.section] = true;
      });
      setCollapsedSections(next);
    }
  };

  const handleSave = async () => {
    if (!appointmentId) {
      toast.error("Please select a visit for this flowsheet.");
      return;
    }
    if (!selectedTemplate) {
      toast.error("Please select a flowsheet type.");
      return;
    }
    setSaving(true);
    try {
      const headers = await authHeader();
      const payload = {
        appointment: appointmentId,
        template: selectedTemplate.id,
        columns,
        data: cellData,
      };
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
    // Flowsheets are gated server-side to doctor/nurse/admin/system_admin --
    // tell a role outside that list plainly why nothing loads here, instead
    // of silently rendering nothing.
    return (
      <Paper elevation={2} sx={{ p: 3, borderRadius: 2, mt: 3 }}>
        <Typography variant="body1" color="text.secondary">
          You are not allowed to view this page.
        </Typography>
      </Paper>
    );
  }

  const sortedColumns = [...columns].sort(
    (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
  );

  // Every caution raised by a calculated row (e.g. the PHQ-9 suicide-risk
  // note when item 9 is answered), listed under the grid with its column.
  const cautionLines = [];
  sortedColumns.forEach((col) => {
    flatRows.forEach((row) => {
      if (row.field_type !== "calculated") return;
      (calcByColumn[col.id]?.[row.key]?.alerts || []).forEach((message) => {
        cautionLines.push({
          id: `${col.id}-${row.key}-${message}`,
          when: `${new Date(col.timestamp).toLocaleDateString()} ${new Date(col.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}`,
          label: row.label,
          message,
        });
      });
    });
  });

  return (
    <Paper elevation={2} sx={{ p: 3, borderRadius: 2, mt: 3 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
        <PanelTitle sx={{ mb: 0 }}>Flowsheets</PanelTitle>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Button
            variant="outlined"
            startIcon={<AddAlarmIcon />}
            onClick={() => setAddTimeOpen(true)}
            disabled={!appointmentId || saving}
          >
            Add Time
          </Button>
          <Button
            variant="outlined"
            startIcon={<DateRangeIcon />}
            onClick={() => setAddRangeOpen(true)}
            disabled={!appointmentId || saving}
          >
            Add Time Range
          </Button>
          <Button
            variant="outlined"
            startIcon={allSectionsCollapsed ? <UnfoldMoreIcon /> : <UnfoldLessIcon />}
            onClick={toggleAllSections}
            disabled={rowDefinitions.length === 0}
          >
            {allSectionsCollapsed ? "Expand All" : "Collapse All"}
          </Button>
          <Button variant="contained" onClick={handleSave} disabled={!appointmentId || !dirty || saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </Stack>
      </Stack>

      <Stack direction="row" spacing={2} sx={{ mb: 1.5 }}>
        {!fixedVisit && (
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
        )}

        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel id="flowsheet-type-label">Flowsheet</InputLabel>
          <Select
            labelId="flowsheet-type-label"
            label="Flowsheet"
            value={selectedTemplateCode}
            onChange={(e) => setSelectedTemplateCode(e.target.value)}
            disabled={loadingTemplates}
          >
            {templates.map((t) => (
              <MenuItem key={t.code} value={t.code}>
                {t.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>

      {loadingTemplates ? (
        <Typography variant="body2" color="text.secondary">
          Loading flowsheet types...
        </Typography>
      ) : templates.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No flowsheet types are configured yet.
        </Typography>
      ) : loadingFlowsheet ? (
        <Typography variant="body2" color="text.secondary">
          Loading flowsheet...
        </Typography>
      ) : !appointmentId ? (
        <Typography variant="body2" color="text.secondary">
          {fixedVisit
            ? "This patient has no visit yet. Register a visit to start a flowsheet."
            : "Select a visit to view or start its flowsheet."}
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
                  <TableCell key={col.id} align="center" sx={{ minWidth: columnMinWidth }}>
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
              {rowDefinitions.map((section) => {
                const isCollapsed = !!collapsedSections[section.section];
                return (
                <Fragment key={section.section}>
                  <TableRow>
                    <TableCell
                      colSpan={Math.max(sortedColumns.length, 1) + 1}
                      onClick={() => toggleSection(section.section)}
                      sx={{
                        bgcolor: SECTION_HEADER_BG,
                        color: "#fff",
                        fontWeight: "bold",
                        py: 0.75,
                        position: "sticky",
                        left: 0,
                        cursor: "pointer",
                        userSelect: "none",
                        "&:hover": { bgcolor: "#13266b" },
                      }}
                    >
                      <Stack direction="row" alignItems="center" spacing={0.5}>
                        {isCollapsed ? (
                          <KeyboardArrowRightIcon fontSize="small" />
                        ) : (
                          <KeyboardArrowDownIcon fontSize="small" />
                        )}
                        <span>{section.section.toUpperCase()}</span>
                      </Stack>
                    </TableCell>
                  </TableRow>
                  {!isCollapsed && section.rows.map((row) => (
                    <TableRow key={row.key} hover>
                      <TableCell
                        sx={{
                          position: "sticky",
                          left: 0,
                          zIndex: 2,
                          bgcolor: "background.paper",
                        }}
                      >
                        <span style={row.field_type === "calculated" ? { fontWeight: 700 } : undefined}>
                          {row.label}
                        </span>
                        {row.unit && (
                          <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                            ({row.unit})
                          </Typography>
                        )}
                      </TableCell>
                      {sortedColumns.map((col) => {
                        if (row.field_type === "calculated") {
                          const result = calcByColumn[col.id]?.[row.key];
                          const hasResult = !!result && result.value !== "";
                          return (
                            <TableCell key={col.id} align="center" sx={{ bgcolor: "action.hover" }}>
                              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                {hasResult ? result.value : "--"}
                              </Typography>
                              {hasResult && result.interpretation && (
                                <Typography variant="caption" display="block">
                                  {result.interpretation}
                                </Typography>
                              )}
                              {(result?.alerts || []).length > 0 && (
                                <Tooltip title={result.alerts.join(" ")}>
                                  <Typography
                                    variant="caption"
                                    color="error"
                                    sx={{ display: "inline-flex", alignItems: "center", gap: 0.25 }}
                                  >
                                    <WarningAmberIcon fontSize="inherit" /> Caution
                                  </Typography>
                                </Tooltip>
                              )}
                            </TableCell>
                          );
                        }
                        if (row.field_type === "dropdown") {
                          const current = cellData[row.key]?.[col.id] ?? "";
                          const options = row.options || [];
                          return (
                            <TableCell key={col.id} align="center">
                              <TextField
                                select
                                size="small"
                                variant="standard"
                                value={current}
                                onChange={(e) => handleCellChange(row.key, col.id, e.target.value)}
                                disabled={!canAuthor}
                                SelectProps={{
                                  displayEmpty: true,
                                  renderValue: (v) =>
                                    v === "" ? "" : options.find((o) => o.value === v)?.label || v,
                                }}
                                sx={{ width: columnMinWidth - 30 }}
                              >
                                <MenuItem value="">
                                  <em>--</em>
                                </MenuItem>
                                {options.map((opt) => (
                                  <MenuItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </MenuItem>
                                ))}
                                {current !== "" && !options.some((o) => o.value === current) && (
                                  <MenuItem value={current}>{current}</MenuItem>
                                )}
                              </TextField>
                            </TableCell>
                          );
                        }
                        return (
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
                        );
                      })}
                      {sortedColumns.length === 0 && <TableCell />}
                    </TableRow>
                  ))}
                </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {cautionLines.length > 0 && (
        <Stack spacing={1} sx={{ mt: 2 }}>
          {cautionLines.map((line) => (
            <Alert key={line.id} severity="warning">
              <strong>
                {line.label} ({line.when}):
              </strong>{" "}
              {line.message}
            </Alert>
          ))}
        </Stack>
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

      <Dialog open={addRangeOpen} onClose={() => setAddRangeOpen(false)}>
        <DialogTitle>Add a Time Range</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1, minWidth: 320 }}>
            <LocalizationProvider dateAdapter={AdapterDateFns}>
              <DateTimePicker
                label="Start time"
                value={rangeStart}
                onChange={(value) => value && setRangeStart(value)}
              />
            </LocalizationProvider>
            <FormControl size="small" fullWidth>
              <InputLabel id="range-interval-label">Interval</InputLabel>
              <Select
                labelId="range-interval-label"
                label="Interval"
                value={rangeIntervalChoice}
                onChange={(e) => setRangeIntervalChoice(e.target.value)}
              >
                <MenuItem value={15}>Every 15 minutes</MenuItem>
                <MenuItem value={30}>Every 30 minutes</MenuItem>
                <MenuItem value={60}>Every hour</MenuItem>
                <MenuItem value={120}>Every 2 hours</MenuItem>
                <MenuItem value={240}>Every 4 hours</MenuItem>
                <MenuItem value={480}>Every 8 hours</MenuItem>
                <MenuItem value="custom">Custom...</MenuItem>
              </Select>
            </FormControl>
            {rangeIntervalChoice === "custom" && (
              <TextField
                label="Custom interval (minutes)"
                type="number"
                size="small"
                value={rangeCustomMinutes}
                onChange={(e) => setRangeCustomMinutes(e.target.value)}
                inputProps={{ min: 1 }}
              />
            )}
            <TextField
              label="Number of columns"
              type="number"
              size="small"
              value={rangeCount}
              onChange={(e) => setRangeCount(e.target.value)}
              inputProps={{ min: 1, max: 50 }}
              helperText="Up to 50 columns at a time"
            />
            <Typography variant="caption" color="text.secondary">
              {clampedRangeCount > 1
                ? `Adds ${clampedRangeCount} columns, from ${rangeStart.toLocaleString()} to ${new Date(
                    rangeStart.getTime() + (clampedRangeCount - 1) * effectiveIntervalMinutes * 60000
                  ).toLocaleString()}.`
                : `Adds 1 column at ${rangeStart.toLocaleString()}.`}
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddRangeOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={confirmAddRange}>
            Add Columns
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}

export default VitalSignsFlowsheetPanel;
