import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { toast } from "../SimpleToast";
import SingleFacilityOnly from "../facility/SingleFacilityOnly";
import { applyToFacilities } from "../../utils/facilityScope";
import { authHeader, errorText, loadMeta } from "./referralShared";

const BLANK = { name: "", specialty: "", kind: "external", provider: "", npi: "", phone: "", fax: "", address: "", direct_address: "", notes: "", is_active: true };

function DestinationDialog({ initial, meta, onClose, onSaved }) {
  const [form, setForm] = useState({ ...BLANK, ...initial, provider: initial?.provider || "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const editing = !!initial?.id;

  const save = async () => {
    setError("");
    if (!form.name.trim()) return setError("Give the destination a name.");
    setBusy(true);
    try {
      const headers = await authHeader();
      const body = { ...form, provider: form.kind === "internal" && form.provider ? form.provider : null };
      if (editing) await api.patch(apiEndpoints.referralDestination(initial.id), body, { headers });
      else await api.post(apiEndpoints.referralDestinations, body, { headers });
      toast.success("Directory saved.");
      onSaved();
    } catch (err) {
      setError(errorText(err, "Could not save the destination."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="sm" data-testid="destination-dialog">
      <DialogTitle>{editing ? "Edit destination" : "Add destination"}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          {error && <Alert severity="error" data-testid="destination-error">{error}</Alert>}
          <TextField size="small" label="Name" value={form.name} onChange={set("name")} inputProps={{ "data-testid": "destination-name" }} />
          <Stack direction="row" spacing={2}>
            <TextField select size="small" fullWidth label="Specialty" value={form.specialty} onChange={set("specialty")} inputProps={{ "data-testid": "destination-specialty" }}>
              <MenuItem value="">—</MenuItem>
              {form.specialty && !(meta?.specialties || []).includes(form.specialty) && <MenuItem value={form.specialty}>{form.specialty}</MenuItem>}
              {(meta?.specialties || []).map((s) => (
                <MenuItem key={s} value={s}>
                  {s}
                </MenuItem>
              ))}
            </TextField>
            <TextField select size="small" fullWidth label="Where" value={form.kind} onChange={set("kind")} inputProps={{ "data-testid": "destination-kind" }}>
              <MenuItem value="internal">Inside our facility</MenuItem>
              <MenuItem value="external">Outside practice</MenuItem>
            </TextField>
          </Stack>
          {form.kind === "internal" && (
            <TextField select size="small" label="Our provider" value={form.provider} onChange={set("provider")}>
              <MenuItem value="">Not linked</MenuItem>
              {(meta?.doctors || []).map((d) => (
                <MenuItem key={d.id} value={d.id}>
                  {d.name}
                </MenuItem>
              ))}
            </TextField>
          )}
          <Stack direction="row" spacing={2}>
            <TextField size="small" fullWidth label="Phone" value={form.phone} onChange={set("phone")} />
            <TextField size="small" fullWidth label="Fax" value={form.fax} onChange={set("fax")} />
          </Stack>
          <Stack direction="row" spacing={2}>
            <TextField size="small" fullWidth label="NPI (10 digits)" value={form.npi} onChange={set("npi")} inputProps={{ "data-testid": "destination-npi" }} />
            <TextField size="small" fullWidth label="Direct address" value={form.direct_address} onChange={set("direct_address")} />
          </Stack>
          <TextField size="small" label="Address" value={form.address} onChange={set("address")} />
          <TextField size="small" multiline minRows={2} label="Notes (insurance, how to send)" value={form.notes} onChange={set("notes")} />
          {editing && <FormControlLabel control={<Switch checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />} label="In use" />}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant="contained" onClick={save} disabled={busy} data-testid="destination-save">
          {busy ? <CircularProgress size={18} /> : "Save"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

const URGENCIES = [
  ["routine", "Routine"],
  ["urgent", "Urgent"],
  ["emergent", "Emergent"],
];

/** Overdue timers: how many days to schedule by urgency, and to wait for the report. */
function Timers({ canEdit }) {
  const [days, setDays] = useState({ routine: "14", urgent: "3", emergent: "1" });
  const [report, setReport] = useState("14");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get(apiEndpoints.referralSettings, { headers: await authHeader() });
        const d = res.data.schedule_days || {};
        setDays({ routine: String(d.routine ?? 14), urgent: String(d.urgent ?? 3), emergent: String(d.emergent ?? 1) });
        setReport(String(res.data.report_days ?? 14));
      } catch (err) {
        setError(errorText(err, "Could not load the timers."));
      }
    })();
  }, []);

  const save = async () => {
    setError("");
    const parsed = {};
    for (const [key] of URGENCIES) {
      const n = Number(days[key]);
      if (!Number.isInteger(n) || n < 1 || n > 365) return setError("Days must be a whole number from 1 to 365.");
      parsed[key] = n;
    }
    const r = Number(report);
    if (!Number.isInteger(r) || r < 1 || r > 365) return setError("Days must be a whole number from 1 to 365.");
    setBusy(true);
    try {
      await applyToFacilities(async () =>
        api.put(apiEndpoints.referralSettings, { schedule_days: parsed, report_days: r }, { headers: await authHeader() })
      );
      toast.success("Timers saved. They apply to referrals sent from now on.");
    } catch (err) {
      setError(errorText(err, "Could not save the timers."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 3 }} data-testid="referral-timers">
      <Typography variant="subtitle1">Overdue timers</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        A referral is flagged overdue when it is not scheduled within these days of being sent, or when no report arrives within the report days after the visit. Changes apply to referrals sent from now on.
      </Typography>
      {error && <Alert severity="error" sx={{ mb: 1 }} data-testid="timers-error">{error}</Alert>}
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        {URGENCIES.map(([key, label]) => (
          <TextField
            key={key}
            size="small"
            type="number"
            label={`Schedule within (${label.toLowerCase()}), days`}
            value={days[key]}
            disabled={!canEdit}
            onChange={(e) => setDays((d) => ({ ...d, [key]: e.target.value }))}
            inputProps={{ min: 1, max: 365, "data-testid": `timer-${key}` }}
          />
        ))}
        <TextField
          size="small"
          type="number"
          label="Report within, days after the visit"
          value={report}
          disabled={!canEdit}
          onChange={(e) => setReport(e.target.value)}
          inputProps={{ min: 1, max: 365, "data-testid": "timer-report" }}
        />
      </Stack>
      {canEdit && (
        <Button sx={{ mt: 2 }} variant="contained" onClick={save} disabled={busy} data-testid="timers-save">
          Save timers
        </Button>
      )}
    </Paper>
  );
}

/** Settings > Referrals: the destination directory (one facility at a time) and the overdue timers. */
export default function ReferralSettings() {
  const [meta, setMeta] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [dialog, setDialog] = useState(null); // null | {} (new) | destination
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setMeta(await loadMeta());
    } catch (err) {
      setError(errorText(err, "Could not load the referral settings."));
    }
    try {
      const res = await api.get(apiEndpoints.referralDestinations, { headers: await authHeader(), params: { active: showInactive ? "0" : "1" } });
      setRows(Array.isArray(res.data) ? res.data : []);
      setError("");
    } catch (err) {
      setError(errorText(err, "Could not load the directory."));
    } finally {
      setLoading(false);
    }
  }, [showInactive]);

  useEffect(() => {
    load();
  }, [load]);

  const canEdit = !!meta?.can_manage;

  return (
    <Box sx={{ p: 2, maxWidth: 980 }} data-testid="referral-settings">
      <Typography variant="h6">Referrals</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Where your clinic sends patients, and when a referral counts as overdue.
      </Typography>

      <Timers canEdit={canEdit} />

      <SingleFacilityOnly what="The destination directory">
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
          <Typography variant="subtitle1">Destination directory</Typography>
          <Stack direction="row" spacing={2} alignItems="center">
            <FormControlLabel control={<Switch checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />} label="Show retired" />
            {canEdit && (
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog({})} data-testid="destination-add">
                Add destination
              </Button>
            )}
          </Stack>
        </Stack>
        {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
        {loading ? (
          <CircularProgress size={22} />
        ) : (
          <Paper variant="outlined">
            <Table size="small" aria-label="Destinations">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Specialty</TableCell>
                  <TableCell>Where</TableCell>
                  <TableCell>Phone / fax</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} data-testid="destination-empty">
                      <Typography variant="body2" color="text.secondary">
                        No destinations yet.
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((d) => (
                  <TableRow key={d.id} data-testid={`destination-row-${d.id}`}>
                    <TableCell>
                      {d.name} {!d.is_active && <Chip size="small" label="Retired" />}
                    </TableCell>
                    <TableCell>{d.specialty}</TableCell>
                    <TableCell>{d.kind_label}</TableCell>
                    <TableCell>{[d.phone, d.fax && `fax ${d.fax}`].filter(Boolean).join(" · ")}</TableCell>
                    <TableCell align="right">
                      {canEdit && (
                        <Tooltip title="Edit">
                          <IconButton size="small" aria-label={`Edit ${d.name}`} onClick={() => setDialog(d)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        )}
        {!canEdit && !loading && (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
            An administrator keeps the directory. You can add an outside practice while writing a referral.
          </Typography>
        )}
      </SingleFacilityOnly>

      {dialog && (
        <DestinationDialog
          initial={dialog.id ? dialog : null}
          meta={meta}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            load();
          }}
        />
      )}
    </Box>
  );
}
