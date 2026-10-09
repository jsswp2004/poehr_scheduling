import { useCallback, useEffect, useState } from "react";
import {
  Alert, Box, Button, Chip, CircularProgress, MenuItem, Paper, Stack, Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tabs, TextField, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import useMe from "../referrals/useMe";
import PrescriptionFormDialog from "./PrescriptionFormDialog";
import PrescriptionDetailDialog from "./PrescriptionDetailDialog";
import PrescriberProfileDialog from "./PrescriberProfileDialog";
import HomeMedsPanel from "./HomeMedsPanel";
import { RX_ROLES, STATUS_COLOR, authHeader, errorText, fmtDate, fmtDay, loadMeta } from "./rxShared";

const FILTERS = [
  { value: "", label: "All" },
  { value: "active", label: "Active" },
  { value: "draft", label: "Drafts" },
  { value: "cancelled", label: "Cancelled" },
];

/** The Prescriptions chart tab: the selected patient's prescriptions, and where a new one is written. */
export default function PrescriptionsPanel({ patient }) {
  const me = useMe();
  const [meta, setMeta] = useState(null);
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState("rx"); // "rx" | "home"
  const [form, setForm] = useState(null); // { prescription, defaults } when open
  const [detailId, setDetailId] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [bump, setBump] = useState(0);
  const allowed = RX_ROLES.includes(me.role);

  const load = useCallback(async () => {
    if (!patient?.id) return;
    setLoading(true);
    try {
      const params = { patient: patient.id, page_size: 100 };
      if (filter) params.status = filter;
      const res = await api.get(apiEndpoints.prescriptions, { headers: await authHeader(), params });
      setRows(res.data?.results || []);
      setError("");
    } catch (err) {
      setError(errorText(err, "Could not load the prescriptions."));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [patient, filter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let live = true;
    loadMeta().then((m) => live && setMeta(m)).catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const afterSave = (saved) => {
    setForm(null);
    load();
    if (saved?.id) setDetailId(saved.id);
  };

  return (
    <Box sx={{ p: 2 }} data-testid="rx-panel">
      <Typography variant="h6" sx={{ mb: 0.5 }}>Prescriptions — {patient.name}</Typography>
      <Tabs value={view} onChange={(_, v) => setView(v)} sx={{ minHeight: 36, mb: 1, borderBottom: 1, borderColor: "divider", "& .MuiTab-root": { minHeight: 36, py: 0.5, textTransform: "none" } }} aria-label="Prescriptions and home medications">
        <Tab value="rx" label="Prescriptions" data-testid="rx-view-rx" />
        <Tab value="home" label="Home medications" data-testid="rx-view-home" />
      </Tabs>
      {view === "home" && (
        <HomeMedsPanel patient={patient} me={me} onPrescribe={(med) => setForm({ prescription: null, defaults: med })} />
      )}
      {view === "rx" && (<>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1.5, flexWrap: "wrap", rowGap: 1 }}>
        <TextField select size="small" label="Show" value={filter} onChange={(e) => setFilter(e.target.value)} sx={{ minWidth: 130 }} inputProps={{ "data-testid": "rx-filter" }}>
          {FILTERS.map((f) => <MenuItem key={f.value || "all"} value={f.value}>{f.label}</MenuItem>)}
        </TextField>
        <Box sx={{ flex: 1 }} />
        {me.role === "doctor" && (
          <Button size="small" onClick={() => setProfileOpen(true)} data-testid="rx-my-details">My prescriber details</Button>
        )}
        {allowed && (
          <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={() => setForm({ prescription: null, defaults: null })} data-testid="rx-new">
            New prescription
          </Button>
        )}
      </Stack>
      {error && <Alert severity="error" sx={{ mb: 1 }} data-testid="rx-list-error">{error}</Alert>}
      {loading ? (
        <CircularProgress size={24} />
      ) : rows.length === 0 && !error ? (
        <Typography variant="body2" color="text.secondary" data-testid="rx-empty">No prescriptions yet.</Typography>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Drug</TableCell>
                <TableCell>Directions</TableCell>
                <TableCell>Dispense</TableCell>
                <TableCell>Refills</TableCell>
                <TableCell>Prescriber</TableCell>
                <TableCell>Date</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} hover sx={{ cursor: "pointer" }} onClick={() => setDetailId(r.id)} data-testid={`rx-row-${r.id}`}>
                  <TableCell>{[r.drug_name, r.strength, r.form].filter(Boolean).join(" ")}</TableCell>
                  <TableCell>{r.sig}</TableCell>
                  <TableCell>{r.quantity ? `${r.quantity} ${r.quantity_unit}`.trim() : ""}</TableCell>
                  <TableCell>{r.refills}</TableCell>
                  <TableCell>{r.prescriber_name}</TableCell>
                  <TableCell>{fmtDate(r.signed_at || r.created_at)}</TableCell>
                  <TableCell>
                    <Chip size="small" color={STATUS_COLOR[r.status] || "default"} label={r.status_label} />
                    {r.delivery_method && <Chip size="small" variant="outlined" sx={{ ml: 0.5 }} label={r.delivery_method === "fax" ? "Faxed" : "Printed"} />}
                    {r.renewal_due && <Chip size="small" color="warning" sx={{ ml: 0.5 }} label="Renewal due" title={`Supply runs out ${fmtDay(r.runs_out_on)}`} data-testid={`rx-renewal-due-${r.id}`} />}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      </>)}

      <PrescriptionFormDialog
        open={!!form}
        onClose={() => setForm(null)}
        onSaved={afterSave}
        patient={patient}
        prescription={form?.prescription || null}
        defaults={form?.defaults || null}
        meta={meta}
        me={me}
      />
      <PrescriptionDetailDialog
        open={!!detailId}
        id={detailId}
        me={me}
        onClose={() => { setDetailId(null); load(); }}
        onChanged={() => load()}
        onEdit={(rx) => { setDetailId(null); setForm({ prescription: rx, defaults: null }); }}
        onSetupProfile={() => setProfileOpen(true)}
        refreshKey={bump}
      />
      <PrescriberProfileDialog
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        onSaved={() => { setBump((n) => n + 1); loadMeta().then(setMeta).catch(() => {}); }}
      />
    </Box>
  );
}
