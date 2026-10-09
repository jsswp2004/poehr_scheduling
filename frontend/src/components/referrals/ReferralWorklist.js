import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Pagination,
  Paper,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import ReferralFormDialog from "./ReferralFormDialog";
import ReferralDetailDialog from "./ReferralDetailDialog";
import PatientChartHeader from "../patientHeader/PatientChartHeader";
import { readLastPatient } from "../tasks/lastPatient";
import { STATUS_COLOR, URGENCY_COLOR, authHeader, errorText, fmtDate, fmtDateTime, loadMeta, overdueText } from "./referralShared";

const PAGE_SIZE = 25;

/** Pick the patient a new referral is for (used on the worklist page, where no chart is open). */
function PatientPicker({ open, onClose, onPick }) {
  const [text, setText] = useState("");
  const [options, setOptions] = useState([]);
  const [value, setValue] = useState(null);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    if (!open) return undefined;
    setText("");
    setValue(null);
    setOptions([]);
    return undefined;
  }, [open]);

  useEffect(() => {
    const term = text.trim();
    if (!open || term.length < 2) return undefined;
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.get(apiEndpoints.patients, { headers: await authHeader(), params: { search: term } });
        if (mine !== seq.current) return;
        const rows = Array.isArray(res.data) ? res.data : res.data?.results || [];
        setOptions(rows.map((p) => ({ id: p.user_id, name: `${p.first_name} ${p.last_name}`.trim(), dob: p.date_of_birth || "" })));
      } catch (err) {
        if (mine === seq.current) setOptions([]);
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [text, open]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" data-testid="referral-patient-picker">
      <DialogTitle>Who is the referral for?</DialogTitle>
      <DialogContent>
        <Autocomplete
          sx={{ mt: 1 }}
          options={options}
          loading={loading}
          value={value}
          filterOptions={(o) => o}
          getOptionLabel={(o) => (o.dob ? `${o.name} (${o.dob})` : o.name)}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          onInputChange={(_, v) => setText(v)}
          onChange={(_, v) => setValue(v)}
          noOptionsText={text.trim().length < 2 ? "Type at least two letters" : "No patient found"}
          renderInput={(params) => <TextField {...params} size="small" label="Patient name" autoFocus inputProps={{ ...params.inputProps, "data-testid": "referral-patient-search" }} />}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!value} onClick={() => onPick(value)} data-testid="referral-patient-continue">
          Continue
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * The referral list: queue tabs with counts, filters, and a table. With `patient` it shows that
 * patient's referrals (the chart tab); without it, the clinic's whole worklist (the manager page).
 * The server decides what each person may see and do; this screen shows it and relays messages.
 */
export default function ReferralWorklist({ patient = null, me = {}, defaultQueue }) {
  const scoped = !!patient;
  const [meta, setMeta] = useState(null);
  const [queue, setQueue] = useState(defaultQueue || (scoped ? "all" : "needs_action"));
  const [counts, setCounts] = useState({});
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [urgency, setUrgency] = useState("");
  // the last patient picked on the Patients page; the Patients filter starts on that patient when there is one
  const [lastPatient] = useState(readLastPatient);
  const [whom, setWhom] = useState(() => (!patient && lastPatient ? "patient" : "")); // "" = all patients, or "patient"
  const [assigned, setAssigned] = useState("");
  const [ordering, setOrdering] = useState("urgency");
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState(null);
  const [pickPatient, setPickPatient] = useState(false);
  const [creating, setCreating] = useState(null); // patient {id, name} while the new-referral form is open
  const picked = !scoped && whom === "patient" ? lastPatient : null; // { id, name }: the patient the banner and list show
  const seq = useRef(0);

  useEffect(() => {
    (async () => {
      try {
        setMeta(await loadMeta());
      } catch (err) {
        if (err?.response?.status === 403) setDenied(true);
      }
    })();
  }, []);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true);
    setError("");
    try {
      const headers = await authHeader();
      const base = patient ? { patient: patient.id } : picked ? { patient: picked.id } : {};
      const params = { ...base, queue, page, page_size: PAGE_SIZE, ordering };
      if (q.trim()) params.q = q.trim();
      if (urgency) params.urgency = urgency;
      if (assigned) params.assigned_to = assigned;
      const [list, qs] = await Promise.all([
        api.get(apiEndpoints.referrals, { headers, params }),
        api.get(apiEndpoints.referralQueues, { headers, params: base }),
      ]);
      if (mine !== seq.current) return;
      setRows(list.data.results || []);
      setTotal(list.data.count || 0);
      setCounts(qs.data.counts || {});
      setDenied(false);
    } catch (err) {
      if (mine !== seq.current) return;
      if (err?.response?.status === 403) setDenied(true);
      else setError(errorText(err, "Could not load the referrals."));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [patient, picked, queue, page, q, urgency, assigned, ordering]);

  useEffect(() => {
    const timer = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, q]);

  useEffect(() => {
    window.addEventListener("referrals-changed", load);
    return () => window.removeEventListener("referrals-changed", load);
  }, [load]);

  if (denied) {
    return (
      <Alert severity="info" sx={{ m: 2 }} data-testid="referrals-denied">
        Referrals are available to doctors, nurses, registration staff and administrators.
      </Alert>
    );
  }

  const queues = meta?.queues || [];
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const startNew = () => {
    if (patient) setCreating(patient);
    else if (picked) setCreating(picked);
    else setPickPatient(true);
  };

  return (
    <Box data-testid="referral-worklist">
      {/* the patient banner sits flush at the top, above the heading, as on the Patients page */}
      {picked && (
        <Box data-testid="referral-patient-banner">
          <PatientChartHeader persistent patientId={picked.id} />
        </Box>
      )}

      <Box sx={{ px: 2, pb: 1 }}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 0.5 }} data-testid="referral-toolbar">
          <Typography variant="subtitle1" noWrap sx={{ fontWeight: 600, mr: 1 }}>
            {scoped ? `Referrals — ${patient.name}` : "Referral Manager"}
          </Typography>
          <TextField
            size="small"
            label="Search"
            placeholder={scoped ? "Specialty, destination, reason" : "Patient, specialty, destination"}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            inputProps={{ "data-testid": "referral-search" }}
            sx={{ minWidth: 200 }}
          />
          <TextField select size="small" label="Urgency" value={urgency} onChange={(e) => { setUrgency(e.target.value); setPage(1); }} sx={{ minWidth: 120 }} inputProps={{ "data-testid": "referral-filter-urgency" }}>
            <MenuItem value="">Any</MenuItem>
            {(meta?.urgencies || []).map((u) => (
              <MenuItem key={u.value} value={u.value}>
                {u.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField select size="small" label="Assigned" value={assigned} onChange={(e) => { setAssigned(e.target.value); setPage(1); }} sx={{ minWidth: 130 }} inputProps={{ "data-testid": "referral-filter-assigned" }}>
            <MenuItem value="">Anyone</MenuItem>
            <MenuItem value="me">Me</MenuItem>
            <MenuItem value="none">Nobody</MenuItem>
          </TextField>
          {!scoped && (
            <TextField select size="small" label="Patients" value={whom} onChange={(e) => { setWhom(e.target.value); setPage(1); }} sx={{ minWidth: 150 }} inputProps={{ "data-testid": "referral-filter-patients" }}>
              <MenuItem value="">All patients</MenuItem>
              {lastPatient && <MenuItem value="patient">{lastPatient.name || "Selected patient"}</MenuItem>}
            </TextField>
          )}
          <TextField select size="small" label="Order" value={ordering} onChange={(e) => setOrdering(e.target.value)} sx={{ minWidth: 140 }} inputProps={{ "data-testid": "referral-ordering" }}>
            <MenuItem value="urgency">Most urgent first</MenuItem>
            <MenuItem value="oldest">Oldest first</MenuItem>
            <MenuItem value="newest">Newest first</MenuItem>
          </TextField>
          <Box sx={{ flexGrow: 1 }} />
          <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={startNew} data-testid="referral-new">
            New referral
          </Button>
        </Stack>

        <Tabs
          value={queues.some((x) => x.value === queue) ? queue : false}
          onChange={(_, v) => {
            setQueue(v);
            setPage(1);
          }}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ minHeight: 36, borderBottom: 1, borderColor: "divider", "& .MuiTab-root": { minHeight: 36, py: 0.5, textTransform: "none" } }}
          aria-label="Referral queues"
        >
          {queues.map((x) => (
            <Tab
              key={x.value}
              value={x.value}
              data-testid={`referral-queue-${x.value}`}
              label={`${x.label}${counts[x.value] != null && x.value !== "all" ? ` (${counts[x.value]})` : ""}`}
            />
          ))}
        </Tabs>

        {error && <Alert severity="error" sx={{ my: 0.5 }}>{error}</Alert>}

        <TableContainer component={Paper} variant="outlined" sx={{ mt: 0.5 }}>
          <Table size="small" aria-label="Referrals">
            <TableHead>
              <TableRow>
                {!scoped && <TableCell>Patient</TableCell>}
                <TableCell>Specialty / send to</TableCell>
                <TableCell>Urgency</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Next date</TableCell>
                <TableCell>Referred by</TableCell>
                <TableCell>Assigned</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={scoped ? 6 : 7}>
                    <CircularProgress size={20} />
                  </TableCell>
                </TableRow>
              )}
              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={scoped ? 6 : 7} data-testid="referral-empty">
                    <Typography variant="body2" color="text.secondary">
                      No referrals in this list.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.id} hover sx={{ cursor: "pointer" }} onClick={() => setOpenId(r.id)} data-testid={`referral-row-${r.id}`}>
                  {!scoped && <TableCell>{r.patient_name}</TableCell>}
                  <TableCell>
                    <Typography variant="body2">{r.specialty || "—"}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {r.destination_name}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip size="small" variant="outlined" color={URGENCY_COLOR[r.urgency]} label={r.urgency_label} />
                  </TableCell>
                  <TableCell>
                    <Chip size="small" color={STATUS_COLOR[r.status]} label={r.status_label} />
                    {r.overdue && <Chip size="small" color="error" sx={{ ml: 0.5 }} label={overdueText(r)} data-testid={`referral-overdue-${r.id}`} />}
                  </TableCell>
                  <TableCell>
                    {r.scheduled_for && ["scheduled", "seen"].includes(r.status)
                      ? fmtDateTime(r.scheduled_for)
                      : r.status === "report_received"
                      ? fmtDate(r.report_received_at)
                      : r.schedule_due
                      ? `Schedule by ${fmtDate(r.schedule_due)}`
                      : r.report_due
                      ? `Report by ${fmtDate(r.report_due)}`
                      : ""}
                  </TableCell>
                  <TableCell>{r.referring_provider_name}</TableCell>
                  <TableCell>{r.assigned_to_name}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 1 }}>
          <Typography variant="caption" color="text.secondary" data-testid="referral-count">
            {total} referral{total === 1 ? "" : "s"}
          </Typography>
          {pages > 1 && <Pagination count={pages} page={page} onChange={(_, p) => setPage(p)} size="small" />}
        </Stack>

        <PatientPicker
          open={pickPatient}
          onClose={() => setPickPatient(false)}
          onPick={(p) => {
            setPickPatient(false);
            setCreating(p);
          }}
        />
        {creating && (
          <ReferralFormDialog
            open
            patient={creating}
            meta={meta}
            me={me}
            onClose={() => setCreating(null)}
            onSaved={(ref) => {
              setCreating(null);
              setOpenId(ref.id);
              load();
            }}
          />
        )}
        {openId && (
          <ReferralDetailDialog
            referralId={openId}
            open
            meta={meta}
            me={me}
            onClose={() => setOpenId(null)}
            onChanged={() => load()}
          />
        )}
      </Box>
    </Box>
  );
}
