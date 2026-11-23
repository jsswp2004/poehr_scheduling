import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert, Box, Chip, CircularProgress, MenuItem, Paper, Stack, Tab, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, Tabs, TextField, Typography,
} from "@mui/material";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import VerifyOrderDialog from "./VerifyOrderDialog";
import {
  DrugName, NOT_REVIEWED, PHARMACY_CHANGED_EVENT, PHARMACY_STATUS_COLOR, PRIORITY_LABEL, VERIFY_ROLES, authHeader, directions, errorText, fmtWait,
} from "./pharmacyShared";

export const QUEUES = [
  { value: "pending_verification", label: "Pending" },
  { value: "on_hold_clarify", label: "On hold" },
  { value: "verified", label: "Verified" },
  { value: "rejected", label: "Rejected" },
];

const CARE_OPTIONS = [
  { value: "", label: "All care settings" },
  { value: "ambulatory", label: "Ambulatory Care" },
  { value: "emergency", label: "Emergency Care" },
  { value: "acute", label: "Acute Care" },
  { value: "surgery", label: "Surgery" },
];

/**
 * The pharmacist's verification queue: medication orders waiting for verification, STAT first and then the
 * oldest. Same layout as the Prescription Manager (toolbar, queue tabs with counts, outlined table).
 * `patient`, when given, narrows the queue to that patient.
 */
export default function VerificationQueue({ role, patient = null, onSelectPatient }) {
  const [queue, setQueue] = useState("pending_verification");
  const [counts, setCounts] = useState({});
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [care, setCare] = useState("");
  const [onlyPatient, setOnlyPatient] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState(null);
  const seq = useRef(0);
  const canVerify = VERIFY_ROLES.includes(role);
  const patientId = onlyPatient && patient ? patient.id : null;

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true);
    setError("");
    try {
      const params = { status: queue };
      if (q.trim()) params.q = q.trim();
      if (care) params.care = care;
      if (patientId) params.patient = patientId;
      const res = await api.get(apiEndpoints.pharmacyQueue, { headers: await authHeader(), params });
      if (mine !== seq.current) return;
      setRows(res.data.results || []);
      setCounts(res.data.counts || {});
    } catch (err) {
      if (mine !== seq.current) return;
      setError(errorText(err, "Could not load the verification queue."));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [queue, q, care, patientId]);

  useEffect(() => {
    const timer = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, q]);

  useEffect(() => {
    window.addEventListener(PHARMACY_CHANGED_EVENT, load);
    return () => window.removeEventListener(PHARMACY_CHANGED_EVENT, load);
  }, [load]);

  return (
    <Box sx={{ px: 2, pb: 1, pt: 1 }} data-testid="verification-queue">
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 0.5 }} data-testid="queue-toolbar">
        <Typography variant="subtitle1" noWrap sx={{ fontWeight: 600, mr: 1 }}>Verification Queue</Typography>
        <TextField
          size="small"
          label="Search"
          placeholder="Patient or drug"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          inputProps={{ "data-testid": "queue-search" }}
          sx={{ minWidth: 200 }}
        />
        <TextField select size="small" label="Care setting" value={care} onChange={(e) => setCare(e.target.value)} sx={{ minWidth: 170 }}
          SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }} inputProps={{ "data-testid": "queue-filter-care" }}>
          {CARE_OPTIONS.map((c) => <MenuItem key={c.value || "all"} value={c.value}>{c.label}</MenuItem>)}
        </TextField>
        {patient && (
          <TextField select size="small" label="Patients" value={onlyPatient ? "patient" : ""} onChange={(e) => setOnlyPatient(e.target.value === "patient")} sx={{ minWidth: 150 }} inputProps={{ "data-testid": "queue-filter-patient" }}>
            <MenuItem value="">All patients</MenuItem>
            <MenuItem value="patient">{patient.name || "Selected patient"}</MenuItem>
          </TextField>
        )}
        <Box sx={{ flexGrow: 1 }} />
        {counts.past_goal > 0 && <Chip size="small" color="error" label={`${counts.past_goal} past goal`} data-testid="queue-past-goal" />}
      </Stack>

      <Tabs
        value={queue}
        onChange={(_, v) => setQueue(v)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ minHeight: 36, borderBottom: 1, borderColor: "divider", "& .MuiTab-root": { minHeight: 36, py: 0.5, textTransform: "none" } }}
        aria-label="Verification queues"
      >
        {QUEUES.map((x) => (
          <Tab key={x.value} value={x.value} data-testid={`queue-tab-${x.value}`} label={`${x.label}${counts[x.value] != null ? ` (${counts[x.value]})` : ""}`} />
        ))}
      </Tabs>

      {error && <Alert severity="error" sx={{ my: 0.5 }} data-testid="queue-error">{error}</Alert>}

      <TableContainer component={Paper} variant="outlined" sx={{ mt: 0.5 }}>
        <Table size="small" aria-label="Verification queue">
          <TableHead>
            <TableRow>
              <TableCell>Priority</TableCell>
              <TableCell>Patient</TableCell>
              <TableCell>Medication</TableCell>
              <TableCell>Directions</TableCell>
              <TableCell>Prescriber</TableCell>
              <TableCell>Waiting</TableCell>
              <TableCell>Alerts</TableCell>
              <TableCell>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && rows.length === 0 && (
              <TableRow><TableCell colSpan={8}><CircularProgress size={20} /></TableCell></TableRow>
            )}
            {!loading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} data-testid="queue-empty">
                  <Typography variant="body2" color="text.secondary">No medication orders in this list.</Typography>
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow
                key={r.id}
                hover
                sx={{ cursor: "pointer" }}
                onClick={() => {
                  setOpenId(r.id);
                  if (onSelectPatient) onSelectPatient({ user_id: r.patient.id, full_name: r.patient.name });
                }}
                data-testid={`queue-row-${r.id}`}
              >
                <TableCell>
                  <Chip size="small" color={r.priority === "stat" ? "error" : r.priority === "urgent" ? "warning" : "default"} label={PRIORITY_LABEL[r.priority] || r.priority} />
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{r.patient.name}</Typography>
                  <Typography variant="caption" color="text.secondary">{r.care_setting_label}</Typography>
                </TableCell>
                <TableCell>
                  <DrugName drug={r.drug} dangerous={r.dangerous_drug} testId={`queue-drug-${r.id}`} />
                  {r.needs_review && <Chip size="small" color="warning" variant="outlined" label={NOT_REVIEWED} data-testid={`queue-needs-review-${r.id}`} />}
                </TableCell>
                <TableCell>{directions(r)}</TableCell>
                <TableCell>{r.ordering_provider?.name}</TableCell>
                <TableCell sx={{ color: r.past_goal ? "error.main" : "inherit", fontWeight: r.past_goal ? 600 : 400, whiteSpace: "nowrap" }}>
                  {fmtWait(r.waiting_minutes)}
                  {r.past_goal && (
                    <Chip size="small" color="error" label="Overdue" title={`Goal ${r.goal_minutes} min`} sx={{ ml: 0.5 }} data-testid={`queue-overdue-${r.id}`} />
                  )}
                </TableCell>
                <TableCell>
                  {r.alert_counts?.high > 0 && <Chip size="small" color="error" label={`${r.alert_counts.high} high`} sx={{ mr: 0.5 }} />}
                  {r.alert_counts?.moderate > 0 && <Chip size="small" color="warning" label={`${r.alert_counts.moderate} moderate`} />}
                </TableCell>
                <TableCell>
                  <Chip size="small" color={PHARMACY_STATUS_COLOR[r.pharmacy_status] || "default"} label={r.pharmacy_status_label} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }} data-testid="queue-count">
        {rows.length} order{rows.length === 1 ? "" : "s"}
        {!canVerify && " · read-only: only a pharmacist can verify"}
      </Typography>

      <VerifyOrderDialog open={!!openId} orderId={openId} canVerify={canVerify} onClose={() => setOpenId(null)} onDone={() => load()} />
    </Box>
  );
}
