import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert, Box, Button, Chip, CircularProgress, MenuItem, Pagination, Paper, Stack, Tab, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Tabs, TextField, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import PatientChartHeader from "../patientHeader/PatientChartHeader";
import { readLastPatient } from "../tasks/lastPatient";
import PrescriptionFormDialog from "./PrescriptionFormDialog";
import PrescriptionDetailDialog from "./PrescriptionDetailDialog";
import PrescriberProfileDialog from "./PrescriberProfileDialog";
import RxPatientPicker from "./RxPatientPicker";
import { RX_ROLES, STATUS_COLOR, authHeader, errorText, fmtDate, loadMeta } from "./rxShared";

const PAGE_SIZE = 25;

/**
 * The clinic's prescription worklist (the Prescription Manager page): what still needs a doctor's signature,
 * what is signed and waiting to be printed or faxed, what has gone out. Same layout as the Referral and Task Managers.
 */
export default function PrescriptionWorklist({ me = {} }) {
  const [meta, setMeta] = useState(null);
  const [queue, setQueue] = useState("needs_signing");
  const [counts, setCounts] = useState({});
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [prescriber, setPrescriber] = useState("");
  const [lastPatient] = useState(readLastPatient);
  const [whom, setWhom] = useState(() => (lastPatient ? "patient" : ""));
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState("");
  const [detailId, setDetailId] = useState(null);
  const [form, setForm] = useState(null); // { patient, prescription }
  const [pickPatient, setPickPatient] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [bump, setBump] = useState(0);
  const picked = whom === "patient" ? lastPatient : null;
  const allowed = RX_ROLES.includes(me.role);
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
      const base = {};
      if (picked) base.patient = picked.id;
      if (prescriber) base.prescriber = prescriber;
      if (q.trim()) base.q = q.trim();
      const [list, qs] = await Promise.all([
        api.get(apiEndpoints.prescriptions, { headers, params: { ...base, queue, page, page_size: PAGE_SIZE } }),
        api.get(apiEndpoints.prescriptionQueues, { headers, params: base }),
      ]);
      if (mine !== seq.current) return;
      setRows(list.data.results || []);
      setTotal(list.data.count || 0);
      setCounts(qs.data.counts || {});
      setDenied(false);
    } catch (err) {
      if (mine !== seq.current) return;
      if (err?.response?.status === 403) setDenied(true);
      else setError(errorText(err, "Could not load the prescriptions."));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [picked, queue, page, q, prescriber]);

  useEffect(() => {
    const timer = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, q]);

  useEffect(() => {
    window.addEventListener("prescriptions-changed", load);
    return () => window.removeEventListener("prescriptions-changed", load);
  }, [load]);

  if (denied) {
    return (
      <Alert severity="info" sx={{ m: 2 }} data-testid="rx-denied">
        Prescriptions are available to doctors, nurses and administrators.
      </Alert>
    );
  }

  const queues = meta?.queues || [];
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const startNew = () => (picked ? setForm({ patient: picked, prescription: null }) : setPickPatient(true));
  const afterSave = (saved) => {
    setForm(null);
    load();
    if (saved?.id) setDetailId(saved.id);
  };

  return (
    <Box data-testid="rx-worklist">
      {picked && (
        <Box data-testid="rx-patient-banner">
          <PatientChartHeader persistent patientId={picked.id} />
        </Box>
      )}

      <Box sx={{ px: 2, pb: 1 }}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 0.5 }} data-testid="rx-toolbar">
          <Typography variant="subtitle1" noWrap sx={{ fontWeight: 600, mr: 1 }}>Prescription Manager</Typography>
          <TextField
            size="small"
            label="Search"
            placeholder="Patient or drug"
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
            inputProps={{ "data-testid": "rx-search" }}
            sx={{ minWidth: 200 }}
          />
          <TextField select size="small" label="Prescriber" value={prescriber} onChange={(e) => { setPrescriber(e.target.value); setPage(1); }} sx={{ minWidth: 150 }} inputProps={{ "data-testid": "rx-filter-prescriber" }}>
            <MenuItem value="">Anyone</MenuItem>
            {me.role === "doctor" && <MenuItem value="me">Me</MenuItem>}
            {(meta?.doctors || []).filter((d) => d.id !== me.id).map((d) => <MenuItem key={d.id} value={String(d.id)}>{d.name}</MenuItem>)}
          </TextField>
          <TextField select size="small" label="Patients" value={whom} onChange={(e) => { setWhom(e.target.value); setPage(1); }} sx={{ minWidth: 150 }} inputProps={{ "data-testid": "rx-filter-patients" }}>
            <MenuItem value="">All patients</MenuItem>
            {lastPatient && <MenuItem value="patient">{lastPatient.name || "Selected patient"}</MenuItem>}
          </TextField>
          <Box sx={{ flexGrow: 1 }} />
          {me.role === "doctor" && (
            <Button size="small" onClick={() => setProfileOpen(true)} data-testid="rx-my-details">My prescriber details</Button>
          )}
          {allowed && (
            <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={startNew} data-testid="rx-new">
              New prescription
            </Button>
          )}
        </Stack>

        <Tabs
          value={queues.some((x) => x.value === queue) ? queue : false}
          onChange={(_, v) => { setQueue(v); setPage(1); }}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ minHeight: 36, borderBottom: 1, borderColor: "divider", "& .MuiTab-root": { minHeight: 36, py: 0.5, textTransform: "none" } }}
          aria-label="Prescription queues"
        >
          {queues.map((x) => (
            <Tab key={x.value} value={x.value} data-testid={`rx-queue-${x.value}`} label={`${x.label}${counts[x.value] != null && x.value !== "all" ? ` (${counts[x.value]})` : ""}`} />
          ))}
        </Tabs>

        {error && <Alert severity="error" sx={{ my: 0.5 }} data-testid="rx-list-error">{error}</Alert>}

        <TableContainer component={Paper} variant="outlined" sx={{ mt: 0.5 }}>
          <Table size="small" aria-label="Prescriptions">
            <TableHead>
              <TableRow>
                <TableCell>Patient</TableCell>
                <TableCell>Drug</TableCell>
                <TableCell>Directions</TableCell>
                <TableCell>Dispense</TableCell>
                <TableCell>Prescriber</TableCell>
                <TableCell>Date</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && rows.length === 0 && (
                <TableRow><TableCell colSpan={7}><CircularProgress size={20} /></TableCell></TableRow>
              )}
              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} data-testid="rx-empty">
                    <Typography variant="body2" color="text.secondary">
                      {picked ? `No prescriptions in this list for ${picked.name || "the selected patient"}.` : "No prescriptions in this list."}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.id} hover sx={{ cursor: "pointer" }} onClick={() => setDetailId(r.id)} data-testid={`rx-row-${r.id}`}>
                  <TableCell>{r.patient_name}</TableCell>
                  <TableCell>{[r.drug_name, r.strength, r.form].filter(Boolean).join(" ")}</TableCell>
                  <TableCell>{r.sig}</TableCell>
                  <TableCell>{r.quantity ? `${r.quantity} ${r.quantity_unit}`.trim() : ""}</TableCell>
                  <TableCell>{r.prescriber_name}</TableCell>
                  <TableCell>{fmtDate(r.signed_at || r.created_at)}</TableCell>
                  <TableCell>
                    <Chip size="small" color={STATUS_COLOR[r.status] || "default"} label={r.status_label} />
                    {r.delivery_method && <Chip size="small" variant="outlined" sx={{ ml: 0.5 }} label={r.delivery_method === "fax" ? "Faxed" : "Printed"} />}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 1 }}>
          <Typography variant="caption" color="text.secondary" data-testid="rx-count">
            {total} prescription{total === 1 ? "" : "s"}
          </Typography>
          {pages > 1 && <Pagination count={pages} page={page} onChange={(_, p) => setPage(p)} size="small" />}
        </Stack>

        <RxPatientPicker open={pickPatient} onClose={() => setPickPatient(false)} onPick={(p) => { setPickPatient(false); setForm({ patient: p, prescription: null }); }} />
        <PrescriptionFormDialog
          open={!!form}
          onClose={() => setForm(null)}
          onSaved={afterSave}
          patient={form?.patient || null}
          prescription={form?.prescription || null}
          meta={meta}
          me={me}
        />
        <PrescriptionDetailDialog
          open={!!detailId}
          id={detailId}
          me={me}
          onClose={() => { setDetailId(null); load(); }}
          onChanged={() => load()}
          onEdit={(rx) => { setDetailId(null); setForm({ patient: { id: rx.patient, name: rx.patient_name }, prescription: rx }); }}
          onSetupProfile={() => setProfileOpen(true)}
          refreshKey={bump}
        />
        <PrescriberProfileDialog
          open={profileOpen}
          onClose={() => setProfileOpen(false)}
          onSaved={() => { setBump((n) => n + 1); loadMeta().then(setMeta).catch(() => {}); }}
        />
      </Box>
    </Box>
  );
}
