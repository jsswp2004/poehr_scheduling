import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { Alert, Box, Button, Stack, TextField, Typography } from "@mui/material";
import PrintIcon from "@mui/icons-material/Print";
import { getValidToken } from "../../utils/auth";
import { apiEndpoints } from "../../config/api";
import DictionaryField from "./DictionaryField";
import { optionsFor } from "./useRegistrationSetup";

const PAY_ROLES = ["nurse", "registrar", "admin", "system_admin"];
const VOID_ROLES = ["registrar", "admin", "system_admin"];
const EMPTY = { payment_type: "", method: "", amount: "", reference: "", note: "" };

const esc = (s) => String(s === null || s === undefined ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (v) => `$${Number(v || 0).toFixed(2)}`;

/** Why the payment cannot be taken yet, or "". Mirrors the server's rules. */
export const paymentProblem = (f) => {
  if (!f.payment_type.trim()) return "Choose a payment type.";
  if (!f.method.trim()) return "Choose how it was paid.";
  const amount = String(f.amount).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) return "Enter an amount more than zero, with at most two decimals.";
  if (Number(amount) > 99999.99) return "The amount is too large.";
  return "";
};

/** Opens a printable receipt. */
export const printReceipt = (r) => {
  const w = window.open("", "_blank", "width=480,height=640");
  if (!w) return;
  w.document.write(`<!doctype html><html><head><title>Receipt ${esc(r.number)}</title><style>
    body{font-family:Arial,sans-serif;margin:24px;color:#111} h1{font-size:18px;margin:0 0 2px} .sub{color:#555;font-size:12px;margin-bottom:14px}
    table{width:100%;border-collapse:collapse;font-size:13px} td{padding:5px 0;border-bottom:1px solid #ddd} td.l{color:#555;width:38%}
    .amt{font-size:22px;font-weight:700;margin:14px 0} .void{color:#b00020;font-weight:700;border:2px solid #b00020;display:inline-block;padding:2px 8px;margin-bottom:8px}
  </style></head><body>
    <h1>${esc(r.clinic)}</h1><div class="sub">Payment receipt ${esc(r.number)}</div>
    ${r.voided ? `<div class="void">VOID</div>` : ""}
    <div class="amt">${esc(money(r.amount))}</div>
    <table>
      <tr><td class="l">Patient</td><td>${esc(r.patient_name)}</td></tr>
      <tr><td class="l">MRN</td><td>${esc(r.mrn)}</td></tr>
      ${r.visit_number ? `<tr><td class="l">Visit</td><td>${esc(r.visit_number)}</td></tr>` : ""}
      <tr><td class="l">Date</td><td>${esc(new Date(r.received_at).toLocaleString())}</td></tr>
      <tr><td class="l">Type</td><td>${esc(r.payment_type)}</td></tr>
      <tr><td class="l">Paid by</td><td>${esc(r.method)}${r.reference ? ` (${esc(r.reference)})` : ""}</td></tr>
      ${r.note ? `<tr><td class="l">Note</td><td>${esc(r.note)}</td></tr>` : ""}
      <tr><td class="l">Received by</td><td>${esc(r.received_by)}</td></tr>
      ${r.voided ? `<tr><td class="l">Void reason</td><td>${esc(r.void_reason)}</td></tr>` : ""}
    </table></body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 250);
};

/**
 * Registration > Payments: money taken now, each with a numbered receipt. Receipts are not edited; a mistake is
 * voided with a reason. Payments are recorded as they are taken, not when the registration is saved.
 */
export default function PaymentsStep({ userId, visitId, setup, role, onCount }) {
  const [data, setData] = useState({ receipts: [], total_collected: "0.00" });
  const [loaded, setLoaded] = useState(false);
  const [f, setF] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [voiding, setVoiding] = useState(null); // { id, reason }

  const apply = useCallback(
    (d) => {
      setData({ receipts: d.receipts || [], total_collected: d.total_collected || "0.00" });
      if (onCount) onCount((d.receipts || []).filter((r) => !r.voided).length);
    },
    [onCount]
  );

  useEffect(() => {
    setLoaded(false);
    setMessage(null);
    if (!userId || !apiEndpoints.payments) return undefined;
    let live = true;
    (async () => {
      try {
        const token = await getValidToken();
        const res = await axios.get(apiEndpoints.payments(userId), { headers: { Authorization: `Bearer ${token}` } });
        if (live) {
          apply(res.data);
          setLoaded(true);
        }
      } catch (err) {
        if (live) setMessage({ severity: "error", text: "Could not load the payments." });
      }
    })();
    return () => {
      live = false;
    };
  }, [userId, apply]);

  const set = (key, value) => {
    setF((p) => ({ ...p, [key]: value }));
    setMessage(null);
  };
  const problem = paymentProblem(f);
  const canTake = PAY_ROLES.includes(role);
  const canVoid = VOID_ROLES.includes(role);

  const take = async () => {
    setBusy(true);
    try {
      const token = await getValidToken();
      const res = await axios.post(apiEndpoints.payments(userId), { ...f, amount: f.amount.trim(), visit: visitId || null }, { headers: { Authorization: `Bearer ${token}` } });
      apply(res.data);
      setF(EMPTY);
      setMessage({ severity: "success", text: `Receipt ${res.data.receipt.number} written.`, receipt: res.data.receipt });
    } catch (err) {
      setMessage({ severity: "error", text: (err && err.response && err.response.data && err.response.data.detail) || "Could not take the payment." });
    } finally {
      setBusy(false);
    }
  };

  const confirmVoid = async () => {
    setBusy(true);
    try {
      const token = await getValidToken();
      const res = await axios.post(apiEndpoints.paymentVoid(voiding.id), { reason: voiding.reason }, { headers: { Authorization: `Bearer ${token}` } });
      apply(res.data);
      setVoiding(null);
      setMessage({ severity: "success", text: `Receipt ${res.data.receipt.number} voided.` });
    } catch (err) {
      setMessage({ severity: "error", text: (err && err.response && err.response.data && err.response.data.detail) || "Could not void the receipt." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack spacing={2} data-testid="step-payments">
      {canTake ? (
        <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, p: 1.5 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Take a payment
          </Typography>
          <Stack spacing={1.5}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <DictionaryField label="Payment type" options={optionsFor(setup, "payment_type")} value={f.payment_type} onChange={(v) => set("payment_type", v)} />
              <DictionaryField label="Paid by" options={optionsFor(setup, "payment_method")} value={f.method} onChange={(v) => set("method", v)} />
              <TextField size="small" fullWidth label="Amount" value={f.amount} onChange={(e) => set("amount", e.target.value)} inputProps={{ inputMode: "decimal", "data-testid": "pay-amount" }} />
            </Stack>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField size="small" fullWidth label="Reference (check no., card last 4)" value={f.reference} onChange={(e) => set("reference", e.target.value)} inputProps={{ maxLength: 100 }} />
              <TextField size="small" fullWidth label="Note" value={f.note} onChange={(e) => set("note", e.target.value)} inputProps={{ maxLength: 255 }} />
            </Stack>
            <Box>
              <Button variant="contained" onClick={take} disabled={busy || !loaded || !!problem} data-testid="pay-take">
                Take payment
              </Button>
              {problem && (f.amount || f.payment_type || f.method) && (
                <Typography variant="caption" color="text.secondary" sx={{ ml: 1.5 }}>
                  {problem}
                </Typography>
              )}
            </Box>
          </Stack>
        </Box>
      ) : (
        <Alert severity="info">Your role can view payments but not take them.</Alert>
      )}

      {message && (
        <Alert
          severity={message.severity}
          action={message.receipt ? <Button size="small" startIcon={<PrintIcon />} onClick={() => printReceipt(message.receipt)}>Print</Button> : undefined}
        >
          {message.text}
        </Alert>
      )}

      <Box data-testid="pay-list">
        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
          Receipts{data.receipts.length ? ` · collected ${money(data.total_collected)}` : ""}
        </Typography>
        {!data.receipts.length && <Typography variant="body2" color="text.secondary">No payments yet.</Typography>}
        {data.receipts.map((r) => (
          <Box key={r.id} data-testid={`receipt-${r.id}`} sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap", py: 0.75, borderBottom: "1px solid", borderColor: "divider", opacity: r.voided ? 0.6 : 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 74, textDecoration: r.voided ? "line-through" : "none" }}>
              {r.number}
            </Typography>
            <Typography variant="body2" sx={{ minWidth: 70 }}>
              {money(r.amount)}
            </Typography>
            <Typography variant="body2" sx={{ flex: 1, minWidth: 160 }} color="text.secondary">
              {[r.payment_type, r.method + (r.reference ? ` ${r.reference}` : ""), new Date(r.received_at).toLocaleDateString(), r.voided ? `VOID: ${r.void_reason}` : ""].filter(Boolean).join(" · ")}
            </Typography>
            <Button size="small" startIcon={<PrintIcon />} onClick={() => printReceipt(r)}>
              Print
            </Button>
            {canVoid && !r.voided && (
              <Button size="small" color="error" onClick={() => setVoiding({ id: r.id, reason: "" })} data-testid={`void-${r.id}`}>
                Void
              </Button>
            )}
            {voiding && voiding.id === r.id && (
              <Stack direction="row" spacing={1} sx={{ width: "100%" }}>
                <TextField size="small" fullWidth autoFocus label="Reason for voiding" value={voiding.reason} onChange={(e) => setVoiding({ ...voiding, reason: e.target.value })} inputProps={{ maxLength: 255, "data-testid": "void-reason" }} />
                <Button variant="contained" color="error" disabled={busy || !voiding.reason.trim()} onClick={confirmVoid} data-testid="void-confirm">
                  Void receipt
                </Button>
                <Button onClick={() => setVoiding(null)}>Cancel</Button>
              </Stack>
            )}
          </Box>
        ))}
      </Box>
    </Stack>
  );
}
