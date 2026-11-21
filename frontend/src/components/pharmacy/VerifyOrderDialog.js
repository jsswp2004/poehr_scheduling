import { useCallback, useEffect, useState } from "react";
import {
  Alert, AlertTitle, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, FormControlLabel, Grid, MenuItem, Stack, TextField, Typography,
} from "@mui/material";
import { toast } from "react-toastify";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import {
  DrugName, NOT_REVIEWED, PHARMACY_CHANGED_EVENT, PHARMACY_STATUS_COLOR, PRIORITY_LABEL, authHeader, directions, errorText, fmtDateTime, fmtWait,
} from "./pharmacyShared";

const FREQUENCIES = [
  ["once", "Once"], ["stat", "STAT (now)"], ["daily", "Daily"], ["qam", "Every morning"], ["qhs", "At bedtime"],
  ["bid", "Twice a day (BID)"], ["tid", "Three times a day (TID)"], ["qid", "Four times a day (QID)"],
  ["q4h", "Every 4 hours"], ["q6h", "Every 6 hours"], ["q8h", "Every 8 hours"], ["q12h", "Every 12 hours"],
  ["weekly", "Weekly"], ["prn", "As needed (PRN)"],
];
const ROUTES = ["PO", "IV", "IVPB", "IM", "SC", "SL", "PR", "Topical", "Inhaled", "Ophthalmic", "Otic", "Nasal", "Transdermal", "Via tube", "Other"];

const MODE_TITLE = {
  modify: "Verify with change",
  clarify: "Clarify with prescriber",
  reject: "Reject order",
};

/**
 * The pharmacist's review of one medication order: what was ordered, the patient's renal data, the CDS alerts
 * (each high-severity alert must be acknowledged with a reason), and the four actions.
 * `canVerify` false (a pharmacy assistant) shows the order read-only.
 */
export default function VerifyOrderDialog({ open, orderId, onClose, onDone, canVerify = false }) {
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState(null); // null | modify | clarify | reject
  const [acked, setAcked] = useState({});
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [change, setChange] = useState({ dose: "", frequency: "", route: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    setError("");
    try {
      const res = await api.get(apiEndpoints.pharmacyOrder(orderId), { headers: await authHeader() });
      setOrder(res.data);
      setChange({ dose: res.data.dose || "", frequency: res.data.frequency || "", route: res.data.route || "" });
    } catch (err) {
      setError(errorText(err, "Could not load the order."));
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    if (!open) return;
    setMode(null);
    setAcked({});
    setReason("");
    setNote("");
    setOrder(null);
    load();
  }, [open, load]);

  const alerts = order?.alerts || [];
  const high = alerts.filter((a) => a.severity === "high");
  const allAcked = high.every((a) => acked[a.key]);
  const editable = canVerify && order?.can_verify;

  const submit = async (action) => {
    if (action !== "verify" && action !== mode) {
      setMode(action);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const body = { action, reason, note, acknowledged_alerts: Object.keys(acked).filter((k) => acked[k]) };
      if (action === "modify") {
        body.new_value = Object.fromEntries(Object.entries(change).filter(([k, v]) => v !== (order[k] || "")));
      }
      await api.post(apiEndpoints.pharmacyOrderAction(orderId), body, { headers: await authHeader() });
      const done = { verify: "Order verified.", modify: "Order verified with change.", clarify: "Clarification sent to the prescriber.", reject: "Order rejected; the prescriber was told." }[action];
      toast.success(done);
      window.dispatchEvent(new Event(PHARMACY_CHANGED_EVENT));
      if (onDone) onDone(action);
      onClose();
    } catch (err) {
      setError(errorText(err, "The action could not be saved."));
      if (err?.response?.data?.alerts) setOrder((o) => ({ ...o, alerts: err.response.data.alerts }));
    } finally {
      setSaving(false);
    }
  };

  const needsReason = mode === "modify" || mode === "clarify" || mode === "reject" || high.length > 0;
  const verifyDisabled = saving || !allAcked || (high.length > 0 && !reason.trim());

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth data-testid="verify-order-dialog">
      <DialogTitle sx={{ pb: 1 }}>
        {mode ? MODE_TITLE[mode] : editable ? "Verify medication order" : "Medication order"}
      </DialogTitle>
      <DialogContent dividers>
        {loading && <CircularProgress size={24} />}
        {error && <Alert severity="error" sx={{ mb: 1.5 }} data-testid="verify-error">{error}</Alert>}
        {order && (
          <Stack spacing={1.5}>
            <Box>
              <DrugName drug={order.drug} dangerous={order.dangerous_drug} testId="verify-drug" />
              <Typography variant="body2" sx={{ mt: 0.5 }}>{directions(order)}</Typography>
              {order.instructions && <Typography variant="body2" color="text.secondary">{order.instructions}</Typography>}
              <Stack direction="row" spacing={0.5} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
                <Chip size="small" color={order.priority === "stat" ? "error" : "default"} label={PRIORITY_LABEL[order.priority] || order.priority} />
                <Chip size="small" color={PHARMACY_STATUS_COLOR[order.pharmacy_status] || "default"} label={order.pharmacy_status_label} />
                {order.past_goal && <Chip size="small" color="error" variant="outlined" label={`Past ${order.goal_minutes}-min goal`} />}
              </Stack>
              {order.needs_review && (
                <Alert severity="warning" sx={{ mt: 1 }} data-testid="verify-needs-review">{NOT_REVIEWED}: check its formulary details (strength, form, route, flags) as you verify.</Alert>
              )}
            </Box>

            <Grid container spacing={1}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="caption" color="text.secondary">Patient</Typography>
                <Typography variant="body2">{order.patient?.name}</Typography>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="caption" color="text.secondary">Prescriber</Typography>
                <Typography variant="body2">{order.ordering_provider?.name} · {fmtDateTime(order.signed_at)}</Typography>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="caption" color="text.secondary">Indication</Typography>
                <Typography variant="body2">{order.indication || "Not given"}</Typography>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="caption" color="text.secondary">Waiting</Typography>
                <Typography variant="body2">{fmtWait(order.waiting_minutes)} (goal {order.goal_minutes} min)</Typography>
              </Grid>
              {order.renal && (
                <Grid size={12} data-testid="verify-renal">
                  <Typography variant="caption" color="text.secondary">Renal function</Typography>
                  <Typography variant="body2">
                    Weight {order.renal.weight_kg != null ? `${order.renal.weight_kg} kg` : "not recorded"} · SCr{" "}
                    {order.renal.scr != null ? `${order.renal.scr} ${order.renal.scr_units || ""}`.trim() : "not recorded"} · CrCl{" "}
                    {order.renal.crcl != null ? `${order.renal.crcl} mL/min (Cockcroft-Gault)` : order.renal.crcl_note || "not calculated"}
                  </Typography>
                </Grid>
              )}
            </Grid>

            <Box data-testid="verify-alerts">
              {alerts.length === 0 && <Alert severity="success">No allergy or renal alerts for this order.</Alert>}
              {alerts.map((a) => (
                <Alert key={a.key} severity={a.severity === "high" ? "error" : "warning"} sx={{ mb: 0.75 }} data-testid={`cds-alert-${a.key}`}>
                  <AlertTitle sx={{ mb: 0 }}>{a.title}</AlertTitle>
                  {a.message}
                  {a.severity === "high" && editable && (
                    <FormControlLabel
                      sx={{ display: "block", mt: 0.5 }}
                      control={
                        <Checkbox
                          size="small"
                          checked={!!acked[a.key]}
                          onChange={(e) => setAcked((s) => ({ ...s, [a.key]: e.target.checked }))}
                          inputProps={{ "data-testid": `ack-${a.key}` }}
                        />
                      }
                      label="I have reviewed this alert"
                    />
                  )}
                </Alert>
              ))}
            </Box>

            {editable && mode === "modify" && (
              <Grid container spacing={1} data-testid="modify-form">
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField fullWidth size="small" label="Dose" value={change.dose} onChange={(e) => setChange((c) => ({ ...c, dose: e.target.value }))} inputProps={{ "data-testid": "modify-dose" }} />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField select fullWidth size="small" label="Frequency" value={change.frequency} onChange={(e) => setChange((c) => ({ ...c, frequency: e.target.value }))}>
                    {FREQUENCIES.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
                  </TextField>
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField select fullWidth size="small" label="Route" value={change.route} onChange={(e) => setChange((c) => ({ ...c, route: e.target.value }))}>
                    {ROUTES.map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
                  </TextField>
                </Grid>
              </Grid>
            )}

            {editable && needsReason && (
              <TextField
                size="small"
                fullWidth
                required
                label={mode === "clarify" ? "Question for the prescriber" : mode === "reject" ? "Reason for rejecting" : mode === "modify" ? "Reason for the change" : "Reason for overriding the alert"}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                inputProps={{ "data-testid": "verify-reason", maxLength: 300 }}
              />
            )}
            {editable && (
              <TextField size="small" fullWidth multiline minRows={2} label="Pharmacist note (optional)" value={note} onChange={(e) => setNote(e.target.value)} inputProps={{ "data-testid": "verify-note" }} />
            )}

            {(order.interventions || []).length > 0 && (
              <Box>
                <Divider sx={{ mb: 1 }} />
                <Typography variant="subtitle2">Interventions</Typography>
                {order.interventions.map((iv) => (
                  <Typography key={iv.id} variant="body2" color="text.secondary">
                    {fmtDateTime(iv.created_at)} · {iv.type_label} by {iv.pharmacist?.name}{iv.reason ? `: ${iv.reason}` : ""}
                  </Typography>
                ))}
              </Box>
            )}
            {order.verified_by && (
              <Typography variant="body2" color="text.secondary" data-testid="verified-by">
                Verified by {order.verified_by.name} · {fmtDateTime(order.verified_at)}
              </Typography>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        {mode && editable && <Button onClick={() => setMode(null)} disabled={saving}>Back</Button>}
        <Box sx={{ flexGrow: 1 }} />
        <Button onClick={onClose} disabled={saving}>Close</Button>
        {editable && (!mode || mode === "reject") && (
          <Button color="error" onClick={() => submit("reject")} disabled={saving || (mode === "reject" && !reason.trim())} data-testid="action-reject">
            Reject
          </Button>
        )}
        {editable && (!mode || mode === "clarify") && (
          <Button onClick={() => submit("clarify")} disabled={saving || (mode === "clarify" && !reason.trim())} data-testid="action-clarify">
            Clarify with Prescriber
          </Button>
        )}
        {editable && (!mode || mode === "modify") && (
          <Button variant="outlined" onClick={() => submit("modify")} disabled={mode === "modify" && (verifyDisabled || !reason.trim())} data-testid="action-modify">
            Verify with Change
          </Button>
        )}
        {editable && !mode && (
          <Button variant="contained" onClick={() => submit("verify")} disabled={verifyDisabled} data-testid="action-verify">
            Verify
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
