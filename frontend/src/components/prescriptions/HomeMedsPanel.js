import { useCallback, useEffect, useState } from "react";
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Tooltip, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { toast } from "../SimpleToast";
import HomeMedFormDialog from "./HomeMedFormDialog";
import { RX_ROLES, authHeader, errorText, fmtDate, fmtDateTime, fmtDay } from "./rxShared";

/** A small dialog that asks for text (the reason a medicine was stopped, or a note on the reconciliation). */
function TextDialog({ open, title, label, required, confirmLabel, busy, error, onClose, onConfirm, testid }) {
  const [text, setText] = useState("");
  useEffect(() => {
    if (open) setText("");
  }, [open]);
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="xs" data-testid={testid}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 1 }} data-testid={`${testid}-error`}>{error}</Alert>}
        <TextField autoFocus fullWidth multiline minRows={2} size="small" sx={{ mt: 1 }} label={label} value={text} onChange={(e) => setText(e.target.value)} inputProps={{ "data-testid": `${testid}-text` }} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" disabled={busy || (required && !text.trim())} onClick={() => onConfirm(text.trim())} data-testid={`${testid}-confirm`}>
          {busy ? <CircularProgress size={18} /> : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * The patient's home medication list: what they actually take, who said so, and when a clinician last confirmed it.
 * Medication reconciliation is "review complete"; any medicine can be corrected, stopped, or prescribed from here.
 */
export default function HomeMedsPanel({ patient, me, onPrescribe }) {
  const [showing, setShowing] = useState("active");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState(null); // { med } when open
  const [stopping, setStopping] = useState(null);
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const allowed = RX_ROLES.includes(me.role);

  const load = useCallback(async () => {
    if (!patient?.id) return;
    setLoading(true);
    try {
      const res = await api.get(apiEndpoints.homeMedications, { headers: await authHeader(), params: { patient: patient.id, status: showing } });
      setData(res.data);
      setError("");
    } catch (err) {
      setError(errorText(err, "Could not load the home medications."));
    } finally {
      setLoading(false);
    }
  }, [patient, showing]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (med, action, body = {}) => {
    try {
      await api.post(apiEndpoints.homeMedicationAction(med.id), { action, ...body }, { headers: await authHeader() });
      return true;
    } catch (err) {
      toast.error(errorText(err, "That did not work."));
      return false;
    }
  };

  const stop = async (reason) => {
    setBusy(true);
    setDialogError("");
    try {
      await api.post(apiEndpoints.homeMedicationAction(stopping.id), { action: "stop", reason }, { headers: await authHeader() });
      setStopping(null);
      toast.success("Marked as stopped.");
      load();
    } catch (err) {
      setDialogError(errorText(err, "Could not stop the medicine."));
    } finally {
      setBusy(false);
    }
  };

  const review = async (note) => {
    setBusy(true);
    setDialogError("");
    try {
      await api.post(apiEndpoints.homeMedicationReview, { patient: patient.id, note }, { headers: await authHeader() });
      setReviewing(false);
      toast.success("Medication list confirmed.");
      load();
    } catch (err) {
      setDialogError(errorText(err, "Could not record the review."));
    } finally {
      setBusy(false);
    }
  };

  const rows = data?.results || [];
  const counts = data?.counts || { active: 0, stopped: 0 };
  const last = data?.last_review;
  const options = data?.options || {};

  return (
    <Box data-testid="home-meds-panel">
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1, flexWrap: "wrap", rowGap: 1 }}>
        <TextField select size="small" label="Show" value={showing} onChange={(e) => setShowing(e.target.value)} sx={{ minWidth: 150 }} inputProps={{ "data-testid": "home-med-filter" }}>
          <MenuItem value="active">Taking ({counts.active})</MenuItem>
          <MenuItem value="stopped">Stopped ({counts.stopped})</MenuItem>
        </TextField>
        <Typography variant="body2" color={last ? "text.secondary" : "warning.main"} data-testid="home-med-last-review">
          {last ? `List confirmed by ${last.by || "a clinician"} on ${fmtDateTime(last.at)}${last.note ? ` — ${last.note}` : ""}` : "This list has not been confirmed yet."}
        </Typography>
        <Box sx={{ flex: 1 }} />
        {allowed && (
          <>
            <Button size="small" variant="outlined" onClick={() => { setDialogError(""); setReviewing(true); }} data-testid="home-med-review">
              Confirm the list
            </Button>
            <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={() => setForm({ med: null })} data-testid="home-med-add">
              Add medication
            </Button>
          </>
        )}
      </Stack>
      {error && <Alert severity="error" sx={{ mb: 1 }} data-testid="home-med-list-error">{error}</Alert>}
      {loading && !data ? (
        <CircularProgress size={24} />
      ) : rows.length === 0 && !error ? (
        <Typography variant="body2" color="text.secondary" data-testid="home-med-empty">
          {showing === "active" ? "No home medications on the list." : "No stopped medications."}
        </Typography>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small" aria-label="Home medications">
            <TableHead>
              <TableRow>
                <TableCell>Medicine</TableCell>
                <TableCell>Directions</TableCell>
                <TableCell>Reported by</TableCell>
                <TableCell>Last taken</TableCell>
                <TableCell>{showing === "active" ? "Confirmed" : "Stopped"}</TableCell>
                {allowed && <TableCell align="right">Actions</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((m) => (
                <TableRow key={m.id} data-testid={`home-med-row-${m.id}`}>
                  <TableCell>
                    {[m.drug_name, m.strength, m.form].filter(Boolean).join(" ")}
                    {m.controlled && <Chip size="small" color="warning" label="Controlled" sx={{ ml: 0.5 }} />}
                    {m.allergy_alerts?.length > 0 && (
                      <Tooltip title={m.allergy_alerts.join(" ")}>
                        <Chip size="small" color="error" label="Allergy alert" sx={{ ml: 0.5 }} data-testid={`home-med-allergy-${m.id}`} />
                      </Tooltip>
                    )}
                    {m.indication_text && <Typography variant="caption" display="block" color="text.secondary">For {m.indication_text}</Typography>}
                  </TableCell>
                  <TableCell>{m.sig}</TableCell>
                  <TableCell>
                    {m.source_label}
                    {m.outside_prescriber && <Typography variant="caption" display="block" color="text.secondary">{m.outside_prescriber}</Typography>}
                  </TableCell>
                  <TableCell>{fmtDay(m.last_taken)}</TableCell>
                  <TableCell>
                    {showing === "active" ? (
                      m.reviewed_at ? <Typography variant="body2" data-testid={`home-med-confirmed-${m.id}`}>{fmtDate(m.reviewed_at)}</Typography> : <Typography variant="body2" color="text.secondary">Not yet</Typography>
                    ) : (
                      <>
                        <Typography variant="body2">{fmtDate(m.stopped_at)}</Typography>
                        <Typography variant="caption" color="text.secondary">{m.stop_reason}</Typography>
                      </>
                    )}
                  </TableCell>
                  {allowed && (
                    <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                      {m.status === "active" ? (
                        <>
                          <Button size="small" onClick={async () => { if (await act(m, "confirm")) load(); }} data-testid={`home-med-confirm-${m.id}`}>Confirm</Button>
                          <Button size="small" onClick={() => setForm({ med: m })} data-testid={`home-med-edit-${m.id}`}>Edit</Button>
                          <Button size="small" onClick={() => { setDialogError(""); setStopping(m); }} data-testid={`home-med-stop-${m.id}`}>Stop</Button>
                          <Tooltip title={m.controlled ? "Controlled substances can't be prescribed here." : ""}>
                            <span>
                              <Button size="small" disabled={m.controlled} onClick={() => onPrescribe && onPrescribe(m)} data-testid={`home-med-prescribe-${m.id}`}>Prescribe</Button>
                            </span>
                          </Tooltip>
                        </>
                      ) : (
                        <Button size="small" onClick={async () => { if (await act(m, "resume")) { toast.success("Back on the list."); load(); } }} data-testid={`home-med-resume-${m.id}`}>Resume</Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <HomeMedFormDialog
        open={!!form}
        onClose={() => setForm(null)}
        onSaved={() => { setForm(null); load(); }}
        patient={patient}
        med={form?.med || null}
        options={options}
      />
      <TextDialog
        open={!!stopping}
        title={stopping ? `Stop ${stopping.drug_name}` : ""}
        label="Why was it stopped?"
        required
        confirmLabel="Mark as stopped"
        busy={busy}
        error={dialogError}
        onClose={() => setStopping(null)}
        onConfirm={stop}
        testid="home-med-stop-dialog"
      />
      <TextDialog
        open={reviewing}
        title="Confirm the medication list"
        label="Note (optional), for example who you checked with"
        confirmLabel="Confirm list"
        busy={busy}
        error={dialogError}
        onClose={() => setReviewing(false)}
        onConfirm={review}
        testid="home-med-review-dialog"
      />
    </Box>
  );
}
