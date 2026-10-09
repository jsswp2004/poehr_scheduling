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
  Divider,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { toast } from "../SimpleToast";
import {
  STATUS_COLOR, announceChange, authHeader, errorText, fmtDate, fmtDateTime, openPdf, pdfErrorText, runAction,
} from "./rxShared";

const EVENT_LABEL = {
  created: "Draft created", edited: "Draft edited", signed: "Signed", printed: "Printed", reprinted: "Printed again",
  faxed: "Faxed", faxed_again: "Faxed again", cancelled: "Cancelled", revision_started: "Revision started",
};

function Row({ label, children }) {
  if (children === "" || children == null || children === false) return null;
  return (
    <Stack direction="row" spacing={2} sx={{ py: 0.4 }}>
      <Typography variant="body2" color="text.secondary" sx={{ width: 140, flexShrink: 0 }}>{label}</Typography>
      <Typography variant="body2" component="div" sx={{ flex: 1 }}>{children}</Typography>
    </Stack>
  );
}

/**
 * One prescription: what it says, what is wrong with it, and the steps open to this person right now
 * (the server decides which). Signing stops at an allergy or a running duplicate until a reason is given.
 */
export default function PrescriptionDetailDialog({ open, id, onClose, onChanged, onEdit, onSetupProfile, refreshKey = 0, me }) {
  const [rx, setRx] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState(null); // "stop" | "fax" | "cancel"
  const [stop, setStop] = useState(null); // { kind: "allergy"|"duplicate", items, message }
  const [reasons, setReasons] = useState({ allergy: "", duplicate: "" });
  const [fax, setFax] = useState({ fax_number: "", confirmation: "", note: "" });
  const [cancelReason, setCancelReason] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const res = await api.get(apiEndpoints.prescription(id), { headers: await authHeader() });
      setRx(res.data);
      setError("");
    } catch (err) {
      setError(errorText(err, "Could not load the prescription."));
    }
  }, [id]);

  useEffect(() => {
    if (!open) return;
    setRx(null);
    setPanel(null);
    setStop(null);
    setReasons({ allergy: "", duplicate: "" });
    setCancelReason("");
    load();
  }, [open, load]);

  useEffect(() => {
    if (open && refreshKey) load();
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const changed = (data) => {
    setRx(data);
    onChanged && onChanged(data);
    announceChange();
  };

  const act = async (action, body = {}, okMessage = "") => {
    setBusy(true);
    setError("");
    try {
      const data = await runAction(rx.id, action, body);
      changed(data);
      setPanel(null);
      setStop(null);
      if (okMessage) toast.success(okMessage);
      return data;
    } catch (err) {
      const first = err?.response?.data?.errors?.[0];
      if (err?.response?.status === 409 && first && (first.kind === "allergy" || first.kind === "duplicate")) {
        setStop({ kind: first.kind, items: first.kind === "allergy" ? first.allergy_alerts : first.duplicates, message: err.response.data.detail });
        setPanel("stop");
      } else {
        setError(errorText(err, "That did not work."));
      }
      return null;
    } finally {
      setBusy(false);
    }
  };

  const sign = () => act("sign", { allergy_override_reason: reasons.allergy, duplicate_reason: reasons.duplicate }, "Prescription signed.");

  const showPdf = async (log) => {
    setBusy(true);
    setError("");
    try {
      await openPdf(rx.id, { log });
      if (log) {
        await load();
        onChanged && onChanged();
        announceChange();
      }
    } catch (err) {
      setError(await pdfErrorText(err, "Could not open the prescription."));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.delete(apiEndpoints.prescription(rx.id), { headers: await authHeader() });
      toast.success("Draft deleted.");
      onChanged && onChanged();
      announceChange();
      onClose();
    } catch (err) {
      setError(errorText(err, "Could not delete the draft."));
    } finally {
      setBusy(false);
    }
  };

  const revise = async () => {
    const data = await act("revise", {});
    if (data) {
      toast.success("A new draft was made from this prescription.");
      onEdit && onEdit(data);
    }
  };

  const openFax = () => {
    setFax({ fax_number: rx.pharmacy_detail?.fax || "", confirmation: "", note: "" });
    setPanel("fax");
  };

  const actions = rx?.actions || [];
  const isDraft = rx?.status === "draft";
  const canEditDraft = isDraft && ["doctor", "nurse", "admin", "system_admin"].includes(me?.role);
  const canSign = actions.includes("sign");
  const missing = rx?.missing_for_sign || [];
  const youArePrescriber = rx && me?.id === rx.prescriber;
  const needsProfile = youArePrescriber && missing.some((m) => m.startsWith("prescriber"));

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="md" data-testid="rx-detail">
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        {rx ? [rx.drug_name, rx.strength, rx.form].filter(Boolean).join(" ") : "Prescription"}
        {rx && <Chip size="small" color={STATUS_COLOR[rx.status] || "default"} label={rx.status_label} data-testid="rx-status" />}
        {rx?.controlled && <Chip size="small" color="warning" label="Controlled" />}
      </DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }} data-testid="rx-detail-error">{error}</Alert>}
        {!rx && !error && <CircularProgress size={24} />}
        {rx && (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {rx.patient_name} · prescriber {rx.prescriber_name}
            </Typography>
            <Box sx={{ bgcolor: "action.hover", borderRadius: 1, px: 1.5, py: 1, mb: 1.5 }}>
              <Typography variant="caption" color="text.secondary">Directions</Typography>
              <Typography variant="body1" sx={{ fontWeight: 600 }} data-testid="rx-sig">{rx.sig}</Typography>
            </Box>
            <Row label="Dispense">{rx.quantity ? `${rx.quantity} ${rx.quantity_unit}`.trim() : ""}</Row>
            <Row label="Days' supply">{rx.days_supply}</Row>
            <Row label="Refills">{String(rx.refills)}</Row>
            <Row label="Dispense as written">{rx.dispense_as_written ? "Yes - brand medically necessary" : ""}</Row>
            <Row label="Indication">{[rx.indication_code, rx.indication_text].filter(Boolean).join(" ")}</Row>
            <Row label="Note to pharmacist">{rx.note_to_pharmacist}</Row>
            <Row label="Pharmacy">
              {rx.pharmacy_detail ? [rx.pharmacy_detail.name, rx.pharmacy_detail.phone && `Ph ${rx.pharmacy_detail.phone}`, rx.pharmacy_detail.fax && `Fax ${rx.pharmacy_detail.fax}`].filter(Boolean).join(" · ") : rx.pharmacy_name}
            </Row>
            <Row label="Signed">{rx.signed_at ? `${rx.signed_by_name} · ${fmtDateTime(rx.signed_at)}` : ""}</Row>
            <Row label="Given / sent">
              {rx.sent_at ? `${rx.delivery_method === "fax" ? "Faxed" : "Printed"} ${fmtDateTime(rx.sent_at)}${rx.delivery_detail?.fax_number ? ` to ${rx.delivery_detail.fax_number}` : ""}${rx.delivery_detail?.confirmation ? ` (${rx.delivery_detail.confirmation})` : ""}` : ""}
            </Row>
            <Row label="Cancelled">{rx.cancelled_at ? `${fmtDateTime(rx.cancelled_at)} — ${rx.cancel_reason}` : ""}</Row>
            {rx.replaces && <Row label="Replaces">{`Prescription ${rx.replaces}`}</Row>}
            {rx.replaced_by?.length > 0 && <Row label="Replaced by">{rx.replaced_by.map((n) => `Prescription ${n}`).join(", ")}</Row>}

            {isDraft && (missing.length > 0 || rx.allergy_alerts?.length > 0 || rx.duplicates?.length > 0) && <Divider sx={{ my: 1.5 }} />}
            {isDraft && missing.length > 0 && (
              <Alert severity="warning" sx={{ mb: 1 }} data-testid="rx-missing">
                Before it can be signed: {missing.join(", ")}.
                {needsProfile && onSetupProfile && (
                  <Button size="small" sx={{ ml: 1 }} onClick={onSetupProfile} data-testid="rx-setup-profile">Fill in my prescriber details</Button>
                )}
              </Alert>
            )}
            {isDraft && rx.allergy_alerts?.length > 0 && (
              <Alert severity="error" sx={{ mb: 1 }} data-testid="rx-allergy-alerts">
                {rx.allergy_alerts.map((a) => <div key={a.allergy_id}>{a.message}</div>)}
              </Alert>
            )}
            {isDraft && rx.duplicates?.length > 0 && (
              <Alert severity="warning" sx={{ mb: 1 }} data-testid="rx-duplicates">
                {rx.duplicates.map((d) => <div key={d.prescription}>Already prescribed: {d.drug_name} — {d.sig} (runs until {fmtDate(d.runs_until)})</div>)}
              </Alert>
            )}
            {rx.status === "sent" && rx.cancelled_at == null && (
              <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }}>
                If you cancel a prescription that already went to a pharmacy, call the pharmacy too: cancelling here does not recall it.
              </Typography>
            )}

            {panel === "stop" && stop && (
              <Alert severity={stop.kind === "allergy" ? "error" : "warning"} sx={{ mt: 2 }} data-testid="rx-stop">
                <Typography variant="body2" sx={{ mb: 1 }}>{stop.message}</Typography>
                <TextField
                  size="small" fullWidth multiline minRows={2} autoFocus
                  label={stop.kind === "allergy" ? "Reason to prescribe despite the allergy" : "Reason to prescribe again"}
                  value={reasons[stop.kind]}
                  onChange={(e) => setReasons((r) => ({ ...r, [stop.kind]: e.target.value }))}
                  inputProps={{ "data-testid": "rx-stop-reason" }}
                />
                <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                  <Button size="small" variant="contained" color="warning" disabled={busy || !reasons[stop.kind].trim()} onClick={sign} data-testid="rx-stop-confirm">Sign anyway</Button>
                  <Button size="small" onClick={() => { setPanel(null); setStop(null); }}>Back</Button>
                </Stack>
              </Alert>
            )}

            {panel === "fax" && (
              <Box sx={{ mt: 2, p: 1.5, border: 1, borderColor: "divider", borderRadius: 1 }} data-testid="rx-fax-panel">
                <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Record that it was faxed</Typography>
                <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 1 }}>
                  Open the PDF, send it from your fax machine or fax service, then record it here. The app keeps the record.
                </Typography>
                <Stack spacing={1.5}>
                  <TextField size="small" label="Fax number sent to" value={fax.fax_number} onChange={(e) => setFax((f) => ({ ...f, fax_number: e.target.value }))} inputProps={{ "data-testid": "rx-fax-number" }} />
                  <TextField size="small" label="Confirmation / reference (optional)" value={fax.confirmation} onChange={(e) => setFax((f) => ({ ...f, confirmation: e.target.value }))} inputProps={{ "data-testid": "rx-fax-confirmation" }} />
                  <TextField size="small" label="Note (optional)" value={fax.note} onChange={(e) => setFax((f) => ({ ...f, note: e.target.value }))} />
                  <Stack direction="row" spacing={1}>
                    <Button size="small" onClick={() => showPdf(false)} disabled={busy}>Open PDF to fax</Button>
                    <Button size="small" variant="contained" disabled={busy || !fax.fax_number.trim()} onClick={() => act("fax", fax, "Fax recorded.")} data-testid="rx-fax-confirm">Mark as faxed</Button>
                    <Button size="small" onClick={() => setPanel(null)}>Back</Button>
                  </Stack>
                </Stack>
              </Box>
            )}

            {panel === "cancel" && (
              <Box sx={{ mt: 2, p: 1.5, border: 1, borderColor: "divider", borderRadius: 1 }} data-testid="rx-cancel-panel">
                <TextField size="small" fullWidth multiline minRows={2} label="Why is it being cancelled?" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} inputProps={{ "data-testid": "rx-cancel-reason" }} />
                <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                  <Button size="small" variant="contained" color="error" disabled={busy || !cancelReason.trim()} onClick={() => act("cancel", { reason: cancelReason }, "Prescription cancelled.")} data-testid="rx-cancel-confirm">Cancel prescription</Button>
                  <Button size="small" onClick={() => setPanel(null)}>Back</Button>
                </Stack>
              </Box>
            )}

            <Typography variant="subtitle2" sx={{ mt: 2, mb: 0.5 }}>History</Typography>
            <Table size="small" data-testid="rx-history">
              <TableHead>
                <TableRow><TableCell>When</TableCell><TableCell>What</TableCell><TableCell>Who</TableCell></TableRow>
              </TableHead>
              <TableBody>
                {(rx.events || []).map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>{fmtDateTime(e.at)}</TableCell>
                    <TableCell>
                      {EVENT_LABEL[e.type] || e.type}
                      {e.detail?.reason ? ` — ${e.detail.reason}` : ""}
                      {e.detail?.allergy_override ? ` (allergy override: ${e.detail.allergy_override.reason})` : ""}
                      {e.detail?.duplicate_override ? ` (duplicate override: ${e.detail.duplicate_override.reason})` : ""}
                    </TableCell>
                    <TableCell>{e.user}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ flexWrap: "wrap", gap: 0.5 }}>
        {rx && canEditDraft && <Button color="error" onClick={remove} disabled={busy} data-testid="rx-delete">Delete draft</Button>}
        {rx && canEditDraft && <Button onClick={() => onEdit && onEdit(rx)} disabled={busy} data-testid="rx-edit">Edit</Button>}
        {rx && <Button onClick={() => showPdf(false)} disabled={busy} data-testid="rx-preview">{isDraft ? "Preview" : "View PDF"}</Button>}
        {rx && actions.includes("print") && <Button onClick={() => showPdf(true)} disabled={busy} data-testid="rx-print">Print</Button>}
        {rx && actions.includes("fax") && <Button onClick={openFax} disabled={busy} data-testid="rx-fax">Record fax</Button>}
        {rx && actions.includes("revise") && <Button onClick={revise} disabled={busy} data-testid="rx-revise">Revise</Button>}
        {rx && actions.includes("cancel") && <Button color="error" onClick={() => setPanel("cancel")} disabled={busy} data-testid="rx-cancel">Cancel prescription</Button>}
        {rx && canSign && <Button variant="contained" onClick={sign} disabled={busy || missing.length > 0} data-testid="rx-sign">Sign</Button>}
        <Button onClick={onClose} disabled={busy}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
