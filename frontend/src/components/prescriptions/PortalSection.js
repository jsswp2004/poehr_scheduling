import { useState } from "react";
import { Alert, Box, Button, Chip, Stack, TextField, Typography } from "@mui/material";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { toast } from "../SimpleToast";
import { authHeader, errorText, fmtDateTime } from "./rxShared";

/**
 * The POWER Pharmacy Portal on a prescription, for the prescriber: the claim code printed on it, where it stands
 * at the partner pharmacy, what was dispensed, and the pharmacy's change / renewal requests to approve or deny.
 */
export default function PortalSection({ rx, onChanged }) {
  const [answer, setAnswer] = useState({});
  const [busy, setBusy] = useState(false);
  const portal = rx.portal;
  const requests = rx.pharmacy_requests || [];
  if (!rx.claim_code && !portal && requests.length === 0) return null;

  const respond = async (req, decision) => {
    setBusy(true);
    try {
      await api.post(apiEndpoints.pharmacyPortalRespond(req.id), { decision, response: answer[req.id] || "" }, { headers: await authHeader() });
      toast.success(decision === "approved" ? "Approved: the pharmacy has been told." : "Denied: the pharmacy has been told.");
      if (onChanged) onChanged();
    } catch (err) {
      toast.error(errorText(err, "Could not answer the request."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ mt: 2 }} data-testid="rx-portal">
      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>POWER Pharmacy Portal</Typography>
      {rx.claim_code && (
        <Typography variant="body2" data-testid="rx-claim-code">
          Claim code <b>{rx.claim_code}</b> (printed with a QR code; any approved portal pharmacy can claim it with the patient's birthdate)
        </Typography>
      )}
      {portal && (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }} flexWrap="wrap" useFlexGap>
          <Chip size="small" color={portal.status === "cancelled" ? "error" : portal.status === "dispensed" ? "success" : "info"} label={portal.status_label} data-testid="rx-portal-status" />
          {portal.pharmacy && <Typography variant="body2">{portal.pharmacy}{portal.how === "claimed" ? " (claimed)" : ""}</Typography>}
          {portal.decline_reason && <Typography variant="body2" color="error.main">Declined: {portal.decline_reason}</Typography>}
        </Stack>
      )}
      {(portal?.dispenses || []).map((d) => (
        <Typography key={d.id} variant="body2" color="text.secondary">
          {fmtDateTime(d.dispensed_at)} · {d.quantity} {d.generic_name}{d.brand_name ? ` (${d.brand_name})` : ""}{d.manufacturer ? `, ${d.manufacturer}` : ""} · {d.pharmacist} PRC {d.pharmacist_prc}{d.is_partial ? " · partial" : ""}
        </Typography>
      ))}
      {requests.map((r) => (
        <Alert key={r.id} severity={r.status === "pending" ? "warning" : "info"} sx={{ mt: 1 }} data-testid={`rx-portal-request-${r.id}`}>
          <b>{r.kind_label}</b> from {r.pharmacy} · {fmtDateTime(r.created_at)}: {r.message}
          {r.proposed && <> · Proposed: {r.proposed}</>}
          {r.status !== "pending" ? (
            <div>{r.status === "approved" ? "Approved" : "Denied"} by {r.responded_by}{r.response ? `: ${r.response}` : ""}</div>
          ) : (
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mt: 1 }}>
              <TextField size="small" label="Answer to the pharmacy" value={answer[r.id] || ""} onChange={(e) => setAnswer((a) => ({ ...a, [r.id]: e.target.value }))} inputProps={{ "data-testid": `rx-portal-answer-${r.id}` }} sx={{ minWidth: 260 }} />
              <Button size="small" variant="contained" disabled={busy} onClick={() => respond(r, "approved")} data-testid={`rx-portal-approve-${r.id}`}>Approve</Button>
              <Button size="small" color="error" disabled={busy || !(answer[r.id] || "").trim()} onClick={() => respond(r, "denied")} data-testid={`rx-portal-deny-${r.id}`}>Deny</Button>
            </Stack>
          )}
        </Alert>
      ))}
    </Box>
  );
}
