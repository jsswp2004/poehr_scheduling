import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Tooltip,
  Button,
  Chip,
  TextField,
  MenuItem,
  CircularProgress,
  Alert,
} from "@mui/material";
import {
  Visibility as VisibilityIcon,
  Assignment as AssignmentIcon,
  MonitorHeart as MonitorHeartIcon,
  PlaylistAddCheck as OrdersIcon,
  Science as LabIcon,
  ChevronLeft as PrevIcon,
  ChevronRight as NextIcon,
  Refresh as RefreshIcon,
} from "@mui/icons-material";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEnvelope, faSms } from "@fortawesome/free-solid-svg-icons";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { getValidToken } from "../../utils/auth";
import { errorText } from "../patientHeader/headerApi";
import SearchField from "./SearchField";

const CLINICAL_ROLES = ["doctor", "nurse", "admin", "system_admin"];

const pad = (n) => String(n).padStart(2, "0");
/** Today (or any date) as YYYY-MM-DD in the browser's own time zone. */
export const localDateString = (date = new Date()) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const parseLocalDate = (text) => {
  const [y, m, d] = text.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const shiftDay = (text, delta) => {
  const d = parseLocalDate(text);
  d.setDate(d.getDate() + delta);
  return localDateString(d);
};
/** [start, end) of that local day as ISO instants, so the server uses the browser's day. */
export const dayWindow = (text) => {
  const start = parseLocalDate(text);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
};

const timeText = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "");

const STATUS_LABEL = { scheduled: "Scheduled", pending: "Pending", in_progress: "In progress", completed: "Completed", no_show: "No show" };
/** What to show for an appointment: the outcome if there is one, otherwise whether they have arrived. */
export function statusChip(appointment) {
  if (appointment.no_show || appointment.status === "no_show") return { label: "No show", color: "error" };
  if (appointment.status === "completed") return { label: "Completed", color: "default" };
  if (appointment.arrived) return { label: "Checked in", color: "success" };
  if (appointment.status === "in_progress") return { label: "In progress", color: "info" };
  return { label: STATUS_LABEL[appointment.status] || appointment.status || "Scheduled", color: "default" };
}

/**
 * The My Schedule tab: the Patient List narrowed to the patients with an appointment on a day.
 * A doctor sees their own. Anyone else sees the whole clinic's and can narrow to one provider.
 */
function MySchedulePanel({ userRole, providers = [], selectedId = null, onSelect = null, onOpenChart = null, onSendText = null, onOpenEmailModal = null }) {
  const navigate = useNavigate();
  const [day, setDay] = useState(() => localDateString());
  const [provider, setProvider] = useState("");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState(null);
  const [truncated, setTruncated] = useState(false);
  const [problem, setProblem] = useState("");
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  const isDoctor = userRole === "doctor";
  const canOpenClinical = CLINICAL_ROLES.includes(userRole);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const token = await getValidToken();
        const headers = token ? { Authorization: `Bearer ${token.access_token || token}` } : {};
        const params = { ...dayWindow(day) };
        if (!isDoctor && provider) params.provider = provider;
        if (search.trim()) params.search = search.trim();
        const res = await api.get(apiEndpoints.mySchedule, { headers, params });
        if (cancelled) return;
        setRows(res.data.results || []);
        setTruncated(!!res.data.truncated);
        setProblem("");
      } catch (err) {
        if (cancelled) return;
        setRows([]);
        setProblem(errorText(err, "Could not load the schedule."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [day, provider, search, isDoctor, reloadKey]);

  const onSearch = useCallback((value) => setSearch(value), []);
  const today = localDateString();
  const dayLabel = useMemo(
    () => parseLocalDate(day).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" }),
    [day]
  );
  const open = (patient, tab, path) => {
    if (onOpenChart) onOpenChart(patient, tab);
    else navigate(path);
  };
  const columnCount = isDoctor ? 6 : 7;

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }} data-testid="my-schedule">
      <Box sx={{ display: "flex", gap: 1.5, mb: 1, mt: 0.5, flexWrap: "wrap", alignItems: "center", flexShrink: 0 }}>
        <Tooltip title="Previous day">
          <IconButton size="small" aria-label="Previous day" onClick={() => setDay(shiftDay(day, -1))}>
            <PrevIcon />
          </IconButton>
        </Tooltip>
        <TextField
          type="date"
          size="small"
          label="Date"
          value={day}
          onChange={(e) => e.target.value && setDay(e.target.value)}
          InputLabelProps={{ shrink: true }}
          inputProps={{ "data-testid": "schedule-date" }}
        />
        <Tooltip title="Next day">
          <IconButton size="small" aria-label="Next day" onClick={() => setDay(shiftDay(day, 1))}>
            <NextIcon />
          </IconButton>
        </Tooltip>
        <Button size="small" variant={day === today ? "contained" : "outlined"} onClick={() => setDay(today)} disabled={day === today}>
          Today
        </Button>
        <SearchField label="Search the schedule..." onSearchChange={onSearch} initialValue={search} variant="outlined" size="small" sx={{ minWidth: 220 }} />
        {!isDoctor && (
          <TextField select size="small" label="Provider" value={provider} onChange={(e) => setProvider(e.target.value)} sx={{ minWidth: 200 }} inputProps={{ "data-testid": "schedule-provider" }}>
            <MenuItem value="">All providers</MenuItem>
            {providers.map((p) => (
              <MenuItem key={p.id} value={String(p.id)}>
                Dr. {p.first_name} {p.last_name}
              </MenuItem>
            ))}
          </TextField>
        )}
        <Box sx={{ flex: 1 }} />
        <Typography variant="body2" color="text.secondary" data-testid="schedule-summary">
          {dayLabel}
          {rows ? ` · ${rows.length} ${rows.length === 1 ? "appointment" : "appointments"}` : ""}
        </Typography>
        <Tooltip title="Refresh">
          <IconButton size="small" aria-label="Refresh schedule" onClick={() => setReloadKey((k) => k + 1)}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {problem && (
        <Alert severity="warning" sx={{ mb: 1, flexShrink: 0 }}>
          {problem}
        </Alert>
      )}
      {truncated && (
        <Alert severity="info" sx={{ mb: 1, flexShrink: 0 }}>
          Showing the first appointments only. Narrow it by provider or search to see the rest.
        </Alert>
      )}

      <TableContainer component={Paper} sx={{ flex: 1, minHeight: 0 }}>
        <Table stickyHeader>
          <TableHead>
            <TableRow sx={{ bgcolor: "#e3f2fd" }}>
              <TableCell sx={{ fontWeight: "bold" }}>Time</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Name</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Reason</TableCell>
              {!isDoctor && <TableCell sx={{ fontWeight: "bold" }}>Provider</TableCell>}
              <TableCell sx={{ fontWeight: "bold" }}>Location</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Status</TableCell>
              <TableCell sx={{ fontWeight: "bold", textAlign: "center" }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && rows === null ? (
              <TableRow>
                <TableCell colSpan={columnCount} sx={{ textAlign: "center", py: 4 }}>
                  <CircularProgress size={24} />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columnCount} sx={{ textAlign: "center", py: 4 }} data-testid="schedule-empty">
                  {isDoctor ? "You have no appointments on this day." : "No appointments on this day."}
                </TableCell>
              </TableRow>
            ) : (
              rows.map(({ appointment, patient }) => {
                const chip = statusChip(appointment);
                const selected = selectedId != null && String(patient.user_id) === String(selectedId);
                return (
                  <TableRow
                    key={appointment.id}
                    hover
                    selected={selected}
                    aria-selected={selected}
                    data-testid={`schedule-row-${appointment.id}`}
                    onClick={() => onSelect && onSelect(patient)}
                    sx={{
                      "&:hover": { bgcolor: "#f5f5f5" },
                      "&.Mui-selected, &.Mui-selected:hover": { bgcolor: "#cfe8fc" },
                      cursor: "pointer",
                      opacity: loading ? 0.6 : 1,
                    }}
                  >
                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {timeText(appointment.start)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {patient.full_name}
                      </Typography>
                      {patient.mrn && (
                        <Typography variant="caption" color="text.secondary">
                          MRN {patient.mrn}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{appointment.title || "-"}</Typography>
                    </TableCell>
                    {!isDoctor && (
                      <TableCell>
                        <Typography variant="body2">{appointment.provider_name ? `Dr. ${appointment.provider_name}` : "Not assigned"}</Typography>
                      </TableCell>
                    )}
                    <TableCell>
                      <Typography variant="body2">{appointment.unit_name || "-"}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip size="small" label={chip.label} color={chip.color} variant={chip.color === "default" ? "outlined" : "filled"} data-testid={`schedule-status-${appointment.id}`} />
                    </TableCell>
                    <TableCell sx={{ textAlign: "center" }}>
                      <Box sx={{ display: "flex", gap: 0.5, justifyContent: "center" }}>
                        <Tooltip title="View Details">
                          <IconButton size="small" aria-label={`View details for ${patient.full_name}`} onClick={(e) => { e.stopPropagation(); navigate(`/patients/${patient.user_id}`); }} sx={{ color: "primary.main" }}>
                            <VisibilityIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {canOpenClinical && (
                          <>
                            <Tooltip title="Clinical Notes">
                              <IconButton size="small" aria-label={`Clinical notes for ${patient.full_name}`} onClick={(e) => { e.stopPropagation(); open(patient, "documents", `/patients/${patient.user_id}/notes`); }} sx={{ color: "secondary.main" }}>
                                <AssignmentIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Flowsheet">
                              <IconButton size="small" aria-label={`Flowsheet for ${patient.full_name}`} onClick={(e) => { e.stopPropagation(); open(patient, "flowsheets", `/patients/${patient.user_id}/flowsheet`); }} sx={{ color: "#c2185b" }}>
                                <MonitorHeartIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Orders">
                              <IconButton size="small" aria-label={`Orders for ${patient.full_name}`} onClick={(e) => { e.stopPropagation(); open(patient, "orders", `/patients/${patient.user_id}/orders`); }} sx={{ color: "#2e7d32" }}>
                                <OrdersIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Lab Results">
                              <IconButton size="small" aria-label={`Lab results for ${patient.full_name}`} onClick={(e) => { e.stopPropagation(); open(patient, "results", `/patients/${patient.user_id}/orders#lab-results`); }} sx={{ color: "#6a1b9a" }}>
                                <LabIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </>
                        )}
                        {onOpenEmailModal && (
                          <Tooltip title="Send Email">
                            <IconButton size="small" aria-label={`Email ${patient.full_name}`} onClick={(e) => { e.stopPropagation(); onOpenEmailModal(patient); }} sx={{ color: "success.main" }}>
                              <FontAwesomeIcon icon={faEnvelope} />
                            </IconButton>
                          </Tooltip>
                        )}
                        {onSendText && (
                          <Tooltip title="Send SMS">
                            <IconButton size="small" aria-label={`Text ${patient.full_name}`} onClick={(e) => { e.stopPropagation(); onSendText(patient); }} sx={{ color: "warning.main" }}>
                              <FontAwesomeIcon icon={faSms} />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Box>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

export default MySchedulePanel;
