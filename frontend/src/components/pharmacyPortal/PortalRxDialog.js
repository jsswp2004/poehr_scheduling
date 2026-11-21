import { useCallback, useEffect, useState } from "react";
import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider,
  FormControlLabel, Grid, MenuItem, Stack, TextField, Typography,
} from "@mui/material";
import { toast } from "react-toastify";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { DrugName, authHeader, errorText, fmtDateTime } from "../pharmacy/pharmacyShared";

export const PORTAL_STATUS_COLOR = {
  new: "warning",
  in_progress: "info",
  ready: "success",
  partially_dispensed: "warning",
  dispensed: "default",
  declined: "default",
  cancelled: "error",
};

const REQUEST_KINDS = [
  { value: "out_of_stock", label: "Out of stock" },
  { value: "strength_form", label: "Different strength or form" },
  { value: "clarification", label: "Clarification" },
  { value: "renewal", label: "Renewal" },
];

const DONE = {
  accept: "Accepted.",
  decline: "Declined; the prescriber was told.",
  ready: "Marked ready for pickup.",
  dispense: "Dispensed.",
  refill: "Refill started.",
};

/**
 * One prescription in the POWER Pharmacy Portal. Shows only what the pharmacy needs (RA 10173): the patient's
 * name, birthdate and age, allergies, and the prescription. The actions follow where the prescription stands.
 */
export default function PortalRxDialog({ open, rxId, me, onClose, onChanged }) {
  const [rx, setRx] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState(null); // null | decline | dispense | request
  const [form, setForm] = useState({});

  const load = useCallback(async () => {
    if (!rxId) return;
    try {
      const res = await api.get(apiEndpoints.portalRxDetail(rxId), { headers: await authHeader() });
      setRx(res.data);
      setForm({
        reason: "",
        quantity: res.data.balance || res.data.quantity || "",
        generic_name: res.data.drug.generic || "",
        brand_name: "",
        manufacturer: "",
        strength: res.data.strength || "",
        form: res.data.form || "",
        yellow_rx_serial: res.data.yellow_rx_serial || "",
        original_in_hand: false,
        discount_id_type: "",
        discount_id_number: "",
        kind: "out_of_stock",
        message: "",
        proposed: "",
      });
    } catch (err) {
      setError(errorText(err, "Could not load the prescription."));
    }
  }, [rxId]);

  useEffect(() => {
    if (!open) return;
    setRx(null);
    setError("");
    setMode(null);
    load();
  }, [open, load]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const field = (key, label, extra = {}) => (
    <TextField size="small" fullWidth label={label} value={form[key] ?? ""} onChange={set(key)} inputProps={{ "data-testid": `portal-${key}` }} {...extra} />
  );

  const act = async (action, body = {}) => {
    setBusy(true);
    setError("");
    try {
      const res = await api.post(apiEndpoints.portalRxAction(rxId), { action, ...body }, { headers: await authHeader() });
      setRx(res.data);
      setMode(null);
      toast.success(DONE[action] || "Saved.");
      if (onChanged) onChanged();
      if (action === "decline") onClose();
    } catch (err) {
      setError(errorText(err, "That step could not be saved."));
    } finally {
      setBusy(false);
    }
  };

  const sendRequest = async () => {
    setBusy(true);
    setError("");
    try {
      await api.post(apiEndpoints.portalRxRequests(rxId), { kind: form.kind, message: form.message, proposed: form.proposed }, { headers: await authHeader() });
      toast.success("Sent to the prescriber.");
      setMode(null);
      if (onChanged) onChanged();
      load();
    } catch (err) {
      setError(errorText(err, "The request could not be sent."));
    } finally {
      setBusy(false);
    }
  };

  const status = rx?.status;
  const closed = rx && (rx.rx_cancelled || ["cancelled", "declined"].includes(status));
  const canDispense = !!me?.user?.can_dispense;
  const dispenseBody = () => ({
    quantity: form.quantity, generic_name: form.generic_name, brand_name: form.brand_name, manufacturer: form.manufacturer,
    strength: form.strength, form: form.form,
    ...(rx.dangerous_drug ? { yellow_rx_serial: form.yellow_rx_serial, original_in_hand: !!form.original_in_hand } : {}),
    ...(form.discount_id_type ? { discount_id_type: form.discount_id_type, discount_id_number: form.discount_id_number } : {}),
  });
  const dispenseReady = form.quantity && form.generic_name?.trim() &&
    (!rx?.dangerous_drug || (form.yellow_rx_serial?.trim() && form.original_in_hand)) &&
    (!form.discount_id_type || form.discount_id_number?.trim());

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="md" fullWidth data-testid="portal-rx-dialog">
      <DialogTitle sx={{ pb: 1 }}>{rx ? `${rx.rx_number} · ${rx.clinic}` : "Prescription"}</DialogTitle>
      <DialogContent dividers>
        {!rx && !error && <CircularProgress size={24} />}
        {error && <Alert severity="error" sx={{ mb: 1.5 }} data-testid="portal-error">{error}</Alert>}
        {rx && (
          <Stack spacing={1.5}>
            {rx.rx_cancelled && (
              <Alert severity="error" data-testid="portal-cancelled">Cancelled by the prescriber: do not dispense. {rx.cancel_reason}</Alert>
            )}
            <Grid container spacing={1} data-testid="portal-patient">
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="caption" color="text.secondary">Patient</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{rx.patient.name}</Typography>
                <Typography variant="body2">{rx.patient.birthdate ? `Born ${rx.patient.birthdate}` : ""}{rx.patient.age != null ? ` · ${rx.patient.age} y` : ""}</Typography>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="caption" color="text.secondary">Allergies</Typography>
                {rx.allergies.length > 0 ? (
                  <Typography variant="body2" color="error.main" data-testid="portal-allergies">
                    {rx.allergies.map((a) => [a.substance, a.reaction].filter(Boolean).join(": ")).join("; ")}
                  </Typography>
                ) : (
                  <Typography variant="body2" color="text.secondary">{rx.no_known_allergies ? "No known allergies" : "Not documented"}</Typography>
                )}
              </Grid>
            </Grid>
            <Divider />
            <Box>
              <DrugName drug={rx.drug} dangerous={rx.dangerous_drug} detail={[rx.strength, rx.form].filter(Boolean).join(" ")} testId="portal-drug" />
              <Typography variant="body2" sx={{ mt: 0.5 }}>{rx.sig}</Typography>
              <Stack direction="row" spacing={0.5} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
                <Chip size="small" color={PORTAL_STATUS_COLOR[status] || "default"} label={rx.status_label} data-testid="portal-status" />
                <Chip size="small" variant="outlined" label={`Qty ${rx.quantity} ${rx.quantity_unit}`} />
                {rx.balance && rx.balance !== rx.quantity && <Chip size="small" color="warning" label={`Balance ${rx.balance}`} />}
                {!rx.dangerous_drug && <Chip size="small" variant="outlined" label={`Refills ${rx.refills}`} />}
                {rx.dispense_as_written && <Chip size="small" color="warning" label="Dispense as written" />}
              </Stack>
              {rx.note_to_pharmacist && <Typography variant="body2" sx={{ mt: 1 }}>Note: {rx.note_to_pharmacist}</Typography>}
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {rx.prescriber}{rx.prescriber_license ? ` · PRC Lic. ${rx.prescriber_license}` : ""} · {rx.clinic}{rx.clinic_phone ? ` · ${rx.clinic_phone}` : ""} · signed {fmtDateTime(rx.signed_at)}
              </Typography>
              {rx.dangerous_drug && (
                <Alert severity="error" sx={{ mt: 1 }} data-testid="portal-dangerous">
                  Dangerous drug (RA 9165). Yellow Rx {rx.yellow_rx_serial || "serial not given"} · S2 {rx.s2_number || "—"}. Dispense only with the original prescription in hand. No refills.
                </Alert>
              )}
            </Box>

            {mode === "decline" && field("reason", "Reason for declining (sent to the prescriber)", { required: true })}

            {mode === "dispense" && (
              <Grid container spacing={1} data-testid="portal-dispense-form">
                <Grid size={{ xs: 12, sm: 4 }}>{field("quantity", `Quantity dispensed (${rx.quantity_unit || "units"})`, { helperText: "Less than the balance is a partial fill." })}</Grid>
                <Grid size={{ xs: 12, sm: 8 }}>{field("generic_name", "Generic name of the product dispensed (RA 6675)")}</Grid>
                <Grid size={{ xs: 12, sm: 4 }}>{field("brand_name", "Brand dispensed")}</Grid>
                <Grid size={{ xs: 12, sm: 4 }}>{field("manufacturer", "Manufacturer")}</Grid>
                <Grid size={{ xs: 12, sm: 2 }}>{field("strength", "Strength")}</Grid>
                <Grid size={{ xs: 12, sm: 2 }}>{field("form", "Form")}</Grid>
                {rx.dangerous_drug && (
                  <>
                    <Grid size={{ xs: 12, sm: 6 }}>{field("yellow_rx_serial", "Yellow Rx serial number")}</Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <FormControlLabel
                        control={<Checkbox size="small" checked={!!form.original_in_hand} onChange={set("original_in_hand")} inputProps={{ "data-testid": "portal-original_in_hand" }} />}
                        label="The original yellow prescription is in hand"
                      />
                    </Grid>
                  </>
                )}
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField select size="small" fullWidth label="Senior / PWD ID used" value={form.discount_id_type} onChange={set("discount_id_type")} inputProps={{ "data-testid": "portal-discount_id_type" }}>
                    <MenuItem value="">None</MenuItem>
                    <MenuItem value="senior">Senior citizen (OSCA)</MenuItem>
                    <MenuItem value="pwd">PWD</MenuItem>
                  </TextField>
                </Grid>
                {form.discount_id_type && <Grid size={{ xs: 12, sm: 8 }}>{field("discount_id_number", "ID number")}</Grid>}
              </Grid>
            )}

            {mode === "request" && (
              <Grid container spacing={1} data-testid="portal-request-form">
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField select size="small" fullWidth label="Request" value={form.kind} onChange={set("kind")} inputProps={{ "data-testid": "portal-kind" }}>
                    {REQUEST_KINDS.map((k) => <MenuItem key={k.value} value={k.value}>{k.label}</MenuItem>)}
                  </TextField>
                </Grid>
                <Grid size={{ xs: 12, sm: 8 }}>{field("proposed", "What you can dispense instead (optional)")}</Grid>
                <Grid size={12}>{field("message", "Message to the prescriber", { multiline: true, minRows: 2 })}</Grid>
              </Grid>
            )}

            {(rx.requests || []).length > 0 && (
              <Box data-testid="portal-requests">
                <Typography variant="subtitle2">Requests to the prescriber</Typography>
                {rx.requests.map((r) => (
                  <Typography key={r.id} variant="body2" color="text.secondary">
                    {fmtDateTime(r.created_at)} · {r.kind_label}: {r.message} — <b>{r.status}</b>{r.response ? ` (${r.response})` : ""}
                  </Typography>
                ))}
              </Box>
            )}
            {(rx.dispenses || []).length > 0 && (
              <Box data-testid="portal-dispenses">
                <Typography variant="subtitle2">Dispensed</Typography>
                {rx.dispenses.map((d) => (
                  <Typography key={d.id} variant="body2" color="text.secondary">
                    {fmtDateTime(d.dispensed_at)} · {d.quantity} · {d.generic_name}{d.brand_name ? ` (${d.brand_name})` : ""}{d.manufacturer ? `, ${d.manufacturer}` : ""} · {d.pharmacist} PRC {d.pharmacist_prc}{d.is_partial ? " · partial" : ""}
                  </Typography>
                ))}
              </Box>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        {mode && <Button onClick={() => setMode(null)} disabled={busy}>Back</Button>}
        <Box sx={{ flexGrow: 1 }} />
        <Button onClick={onClose} disabled={busy}>Close</Button>
        {rx && !closed && !mode && <Button onClick={() => setMode("request")} data-testid="portal-open-request">Ask the prescriber</Button>}
        {mode === "request" && <Button variant="contained" disabled={busy || !form.message.trim()} onClick={sendRequest} data-testid="portal-send-request">Send request</Button>}
        {rx && !closed && !mode && status === "new" && (
          <>
            <Button color="error" onClick={() => setMode("decline")} data-testid="portal-decline">Decline</Button>
            {me?.user?.role === "ext_pharmacist" && (
              <Button variant="contained" onClick={() => act("accept")} disabled={busy} data-testid="portal-accept">Accept</Button>
            )}
          </>
        )}
        {mode === "decline" && <Button variant="contained" color="error" disabled={busy || !form.reason.trim()} onClick={() => act("decline", { reason: form.reason })} data-testid="portal-decline-confirm">Decline and return</Button>}
        {rx && !closed && !mode && ["in_progress", "partially_dispensed"].includes(status) && (
          <Button onClick={() => act("ready")} disabled={busy} data-testid="portal-ready">Ready for pickup</Button>
        )}
        {rx && !closed && !mode && ["in_progress", "ready", "partially_dispensed"].includes(status) && canDispense && (
          <Button variant="contained" onClick={() => setMode("dispense")} data-testid="portal-open-dispense">Dispense</Button>
        )}
        {mode === "dispense" && <Button variant="contained" disabled={busy || !dispenseReady} onClick={() => act("dispense", dispenseBody())} data-testid="portal-dispense-confirm">Record dispense</Button>}
        {rx && !closed && !mode && status === "dispensed" && !rx.dangerous_drug && rx.fill_number <= rx.refills && (
          <Button variant="outlined" onClick={() => act("refill")} disabled={busy} data-testid="portal-refill">Start refill</Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
