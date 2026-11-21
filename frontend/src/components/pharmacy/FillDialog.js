import { useCallback, useEffect, useState } from "react";
import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, Grid, MenuItem, Stack, TextField, Typography,
} from "@mui/material";
import { toast } from "react-toastify";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import PharmacyLabelDialog from "./PharmacyLabel";
import { DrugName, FILLS_CHANGED_EVENT, FILL_STAGE_COLOR, authHeader, errorText, fmtWho, peso } from "./pharmacyShared";

const STEP_ROWS = [
  ["received", "Received"],
  ["entered", "Data entry"],
  ["filled", "Filled"],
  ["checked", "Pharmacist final check"],
  ["dispensed", "Dispensed"],
];

const DONE = {
  start_entry: "Data entry started.",
  enter: "Sent to filling.",
  fill: "Sent to the pharmacist's final check.",
  check: "Final check passed: ready for pickup.",
  check_fail: "Sent back to filling.",
  dispense: "Dispensed.",
  hold: "Put on hold.",
  release: "Hold released.",
};

/** One outpatient fill: what was prescribed, who did each stage, and the action for the stage it is at. */
export default function FillDialog({ open, fillId, onClose, onChanged }) {
  const [fill, setFill] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({});
  const [mode, setMode] = useState(null); // null | hold | check_fail | add_id
  const [labelOpen, setLabelOpen] = useState(false);

  const load = useCallback(async () => {
    if (!fillId) return;
    try {
      const res = await api.get(apiEndpoints.pharmacyFill(fillId), { headers: await authHeader() });
      setFill(res.data);
      const card = (res.data.discount_ids || [])[0];
      setForm({
        quantity: res.data.balance || res.data.prescribed_quantity || "",
        unit_price: "",
        product_name: res.data.product_name || "",
        product_strength: res.data.product_strength || res.data.strength || "",
        lot_number: res.data.lot_number || "",
        expiry_date: res.data.expiry_date || "",
        product_verified: false,
        strength_verified: false,
        quantity_verified: false,
        counseling_offered: "",
        counseling_accepted: false,
        discount_kind: card ? card.kind : "none",
        yellow_rx_serial: res.data.yellow_rx_serial || "",
        s2_number: res.data.s2_number || "",
        reason: "",
        note: "",
        single_pharmacist_reason: "",
        prc_license_number: res.data.my_prc_license || "",
        id_kind: "senior",
        id_number: "",
        issued_by: "",
      });
    } catch (err) {
      setError(errorText(err, "Could not load the fill."));
    }
  }, [fillId]);

  useEffect(() => {
    if (!open) return;
    setFill(null);
    setError("");
    setMode(null);
    load();
  }, [open, load]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  const changed = () => {
    window.dispatchEvent(new Event(FILLS_CHANGED_EVENT));
    if (onChanged) onChanged();
  };

  const run = async (action, body = {}) => {
    setBusy(true);
    setError("");
    try {
      const res = await api.post(apiEndpoints.pharmacyFillAction(fillId), { action, ...body }, { headers: await authHeader() });
      setFill((f) => ({ ...f, ...res.data }));
      toast.success(DONE[action] || "Saved.");
      setMode(null);
      changed();
      load();
    } catch (err) {
      setError(errorText(err, "That step could not be saved."));
    } finally {
      setBusy(false);
    }
  };

  const post = async (url, body, message) => {
    setBusy(true);
    setError("");
    try {
      await api.post(url, body, { headers: await authHeader() });
      toast.success(message);
      changed();
      return true;
    } catch (err) {
      setError(errorText(err, "That could not be saved."));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const addId = async () => {
    const ok = await post(apiEndpoints.pharmacyDiscountIds(fill.patient.id), { kind: form.id_kind, id_number: form.id_number, issued_by: form.issued_by }, "ID recorded.");
    if (ok) {
      setMode(null);
      load();
    }
  };

  const can = fill && fill.can_work;
  const stage = fill?.stage;
  const q = fill?.quote;
  const field = (key, label, extra = {}) => (
    <TextField size="small" fullWidth label={label} value={form[key] ?? ""} onChange={set(key)} inputProps={{ "data-testid": `fill-${key}` }} {...extra} />
  );

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="md" fullWidth data-testid="fill-dialog">
      <DialogTitle sx={{ pb: 1 }}>
        {fill ? `${fill.rx_number}${fill.is_refill ? ` · Refill ${fill.fill_number - 1}` : ""}` : "Outpatient fill"}
      </DialogTitle>
      <DialogContent dividers>
        {!fill && !error && <CircularProgress size={24} />}
        {error && <Alert severity="error" sx={{ mb: 1.5 }} data-testid="fill-error">{error}</Alert>}
        {fill && (
          <Stack spacing={1.5}>
            <Box>
              <DrugName drug={fill.drug} dangerous={fill.dangerous_drug} detail={[fill.strength, fill.form].filter(Boolean).join(" ")} testId="fill-drug" />
              <Typography variant="body2" sx={{ mt: 0.5 }}>{fill.sig}</Typography>
              <Stack direction="row" spacing={0.5} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
                <Chip size="small" color={FILL_STAGE_COLOR[stage] || "default"} label={fill.stage_label} data-testid="fill-stage" />
                <Chip size="small" variant="outlined" label={`Prescribed ${fill.prescribed_quantity} ${fill.quantity_unit}`} />
                {fill.quantity && <Chip size="small" variant="outlined" label={`This fill ${fill.quantity}`} />}
                {fill.is_partial && <Chip size="small" color="warning" label={`Balance ${fill.balance} ${fill.quantity_unit}`} data-testid="fill-balance" />}
                {!fill.dangerous_drug && <Chip size="small" variant="outlined" label={`Refills ${fill.refills_used}/${fill.refills}`} />}
              </Stack>
            </Box>

            <Grid container spacing={1}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="caption" color="text.secondary">Patient</Typography>
                <Typography variant="body2">{fill.patient.name}</Typography>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="caption" color="text.secondary">Prescriber</Typography>
                <Typography variant="body2">{fill.prescriber}</Typography>
              </Grid>
              {fill.rx_note_to_pharmacist && (
                <Grid size={12}>
                  <Typography variant="caption" color="text.secondary">Note to pharmacist</Typography>
                  <Typography variant="body2">{fill.rx_note_to_pharmacist}</Typography>
                </Grid>
              )}
            </Grid>

            {stage === "on_hold" && <Alert severity="warning" data-testid="fill-hold-reason">On hold: {fill.hold_reason}</Alert>}
            {fill.check_note && stage === "filling" && <Alert severity="warning">Sent back by the pharmacist: {fill.check_note}</Alert>}

            <Box data-testid="fill-steps">
              {STEP_ROWS.map(([key, label]) => (
                <Typography key={key} variant="body2" color={fill[key] ? "text.primary" : "text.disabled"}>
                  {label}: {fmtWho(fill[key]) || "—"}
                </Typography>
              ))}
            </Box>

            {/* the action for the stage the fill is at */}
            {can && !mode && stage === "data_entry" && (
              <Grid container spacing={1} data-testid="form-data-entry">
                <Grid size={{ xs: 12, sm: 6 }}>{field("quantity", `Quantity to dispense (${fill.quantity_unit || "units"})`, { helperText: "Less than prescribed makes a partial fill." })}</Grid>
                {fill.can_price && <Grid size={{ xs: 12, sm: 6 }}>{field("unit_price", "Unit price override (₱, optional)")}</Grid>}
              </Grid>
            )}
            {can && !mode && stage === "filling" && (
              <Grid container spacing={1} data-testid="form-filling">
                <Grid size={{ xs: 12, sm: 6 }}>{field("product_name", "Product taken from the shelf")}</Grid>
                <Grid size={{ xs: 12, sm: 6 }}>{field("product_strength", "Strength")}</Grid>
                <Grid size={{ xs: 12, sm: 6 }}>{field("lot_number", "Lot number")}</Grid>
                <Grid size={{ xs: 12, sm: 6 }}>{field("expiry_date", "Expiry date", { type: "date", InputLabelProps: { shrink: true } })}</Grid>
              </Grid>
            )}
            {!mode && stage === "final_check" && (
              <Box data-testid="form-final-check">
                <Typography variant="body2" sx={{ mb: 0.5 }}>
                  Filled with <b>{fill.product_name} {fill.product_strength}</b>, lot {fill.lot_number}, exp {fill.expiry_date}; quantity {fill.quantity} {fill.quantity_unit}.
                </Typography>
                {fill.can_check ? (
                  <>
                    {["product_verified", "strength_verified", "quantity_verified"].map((k) => (
                      <FormControlLabel
                        key={k}
                        control={<Checkbox size="small" checked={!!form[k]} onChange={set(k)} inputProps={{ "data-testid": `check-${k}` }} />}
                        label={{ product_verified: "Product matches the prescription", strength_verified: "Strength matches", quantity_verified: "Quantity counted and correct" }[k]}
                      />
                    ))}
                    {fill.filled_by_me && (
                      <Stack spacing={1} sx={{ mt: 1 }} data-testid="form-single-pharmacist">
                        <Alert severity="warning">You filled this prescription. A different pharmacist should do the final check.</Alert>
                        {field("single_pharmacist_reason", "Only pharmacist on duty: reason to check your own fill")}
                      </Stack>
                    )}
                  </>
                ) : (
                  <Alert severity="info">Waiting for a pharmacist's final check.</Alert>
                )}
              </Box>
            )}
            {can && !mode && stage === "ready" && (
              <Stack spacing={1} data-testid="form-dispense">
                <Box data-testid="fill-price">
                  <Typography variant="subtitle2">Price</Typography>
                  {q && !q.price_found && (
                    <Alert severity="error" data-testid="fill-no-price">
                      There is no price for {fill.drug.generic} in the price table. Add it to the price table before dispensing.
                    </Alert>
                  )}
                  {q && q.price_found ? (
                    <Typography variant="body2">
                      {peso(q.gross)}
                      {form.discount_kind !== "none" && q.discount_kind ? ` · less VAT ${peso(q.vat_exempt)} · less 20% ${peso(q.discount)} · ` : " · "}
                      <b>Total {form.discount_kind !== "none" && q.discount_kind ? peso(q.total) : peso(q.gross)}</b>
                    </Typography>
                  ) : (
                    <Typography variant="body2" color="text.secondary">No price in the price table for this drug.</Typography>
                  )}
                </Box>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }}>
                  <TextField select size="small" label="Discount" value={form.discount_kind} onChange={set("discount_kind")} sx={{ minWidth: 260 }} inputProps={{ "data-testid": "fill-discount" }}>
                    <MenuItem value="none">None</MenuItem>
                    {(fill.discount_ids || []).map((c) => (
                      <MenuItem key={c.id} value={c.kind}>{c.kind === "senior" ? "Senior citizen" : "PWD"} · ID {c.id_number}</MenuItem>
                    ))}
                  </TextField>
                  <Button size="small" onClick={() => setMode("add_id")} data-testid="fill-add-id">Add senior / PWD ID</Button>
                </Stack>
                {fill.dangerous_drug && (
                  <Grid container spacing={1} data-testid="form-dangerous">
                    <Grid size={12}><Alert severity="error">Dangerous drug (RA 9165): record the DDB yellow prescription and the prescriber's S2 license.</Alert></Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>{field("yellow_rx_serial", "Yellow Rx serial number", { required: true })}</Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>{field("s2_number", "Prescriber S2 license number", { required: true })}</Grid>
                  </Grid>
                )}
                <Stack direction="row" spacing={2} alignItems="center">
                  <TextField select size="small" label="Counseling offered?" value={form.counseling_offered} onChange={set("counseling_offered")} sx={{ minWidth: 200 }} inputProps={{ "data-testid": "fill-counseling-offered" }}>
                    <MenuItem value="yes">Yes</MenuItem>
                    <MenuItem value="no">No</MenuItem>
                  </TextField>
                  {form.counseling_offered === "yes" && (
                    <FormControlLabel control={<Checkbox size="small" checked={!!form.counseling_accepted} onChange={set("counseling_accepted")} inputProps={{ "data-testid": "fill-counseling-accepted" }} />} label="Patient accepted counseling" />
                  )}
                </Stack>
                {fill.can_dispense && !fill.my_prc_license && field("prc_license_number", "Your PRC license number (printed on the label)")}
                {!fill.can_dispense && <Alert severity="info">Only a pharmacist can dispense (RA 10918).</Alert>}
              </Stack>
            )}
            {stage === "dispensed" && (
              <Box data-testid="fill-dispensed">
                <Typography variant="body2">
                  {fill.quantity} {fill.quantity_unit} · Total {peso(fill.total_amount)}
                  {fill.discount_kind ? ` (${fill.discount_kind === "senior" ? "senior citizen" : "PWD"} ID ${fill.discount_id_number}, less ${peso(fill.discount_amount)})` : ""}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Counseling {fill.counseling_offered ? `offered, ${fill.counseling_accepted ? "accepted" : "declined"}` : "not offered"}
                  {fill.yellow_rx_serial ? ` · Yellow Rx ${fill.yellow_rx_serial} · S2 ${fill.s2_number}` : ""}
                </Typography>
              </Box>
            )}

            {mode === "add_id" && (
              <Grid container spacing={1} data-testid="form-add-id">
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField select size="small" fullWidth label="ID" value={form.id_kind} onChange={set("id_kind")}>
                    <MenuItem value="senior">Senior citizen (OSCA)</MenuItem>
                    <MenuItem value="pwd">PWD</MenuItem>
                  </TextField>
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>{field("id_number", "ID number")}</Grid>
                <Grid size={{ xs: 12, sm: 4 }}>{field("issued_by", "Issued by (OSCA / PDAO)")}</Grid>
              </Grid>
            )}
            {(mode === "hold" || mode === "check_fail") && (
              <TextField size="small" fullWidth required label={mode === "hold" ? "Reason for the hold" : "What must be corrected"} value={form.reason} onChange={set("reason")} inputProps={{ "data-testid": "fill-reason", maxLength: 300 }} />
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        {mode && <Button onClick={() => setMode(null)} disabled={busy}>Back</Button>}
        <Box sx={{ flexGrow: 1 }} />
        {fill && ["final_check", "ready", "dispensed"].includes(stage) && !mode && (
          <Button onClick={() => setLabelOpen(true)} data-testid="fill-label">Label</Button>
        )}
        <Button onClick={onClose} disabled={busy}>Close</Button>
        {fill && can && !mode && ["received", "data_entry", "filling", "final_check", "ready"].includes(stage) && (
          <Button color="warning" onClick={() => setMode("hold")} disabled={busy} data-testid="fill-hold">Hold</Button>
        )}
        {mode === "hold" && <Button variant="contained" color="warning" disabled={busy || !form.reason.trim()} onClick={() => run("hold", { reason: form.reason })} data-testid="fill-hold-confirm">Put on hold</Button>}
        {mode === "add_id" && <Button variant="contained" disabled={busy || !form.id_number.trim()} onClick={addId} data-testid="fill-add-id-save">Save ID</Button>}
        {fill && can && !mode && stage === "on_hold" && <Button variant="contained" onClick={() => run("release")} disabled={busy} data-testid="fill-release">Release hold</Button>}
        {fill && can && !mode && stage === "received" && <Button variant="contained" onClick={() => run("start_entry")} disabled={busy} data-testid="fill-start">Start data entry</Button>}
        {fill && can && !mode && stage === "data_entry" && (
          <Button variant="contained" disabled={busy} data-testid="fill-enter" onClick={() => run("enter", { quantity: form.quantity, ...(form.unit_price ? { unit_price: form.unit_price } : {}) })}>
            Send to filling
          </Button>
        )}
        {fill && can && !mode && stage === "filling" && (
          <Button variant="contained" disabled={busy} data-testid="fill-filled"
            onClick={() => run("fill", { product_name: form.product_name, product_strength: form.product_strength, lot_number: form.lot_number, expiry_date: form.expiry_date })}>
            Send to final check
          </Button>
        )}
        {fill && fill.can_check && !mode && stage === "final_check" && (
          <Button color="error" onClick={() => setMode("check_fail")} disabled={busy} data-testid="fill-check-fail">Send back</Button>
        )}
        {mode === "check_fail" && <Button variant="contained" color="error" disabled={busy || !form.reason.trim()} onClick={() => run("check_fail", { reason: form.reason })} data-testid="fill-check-fail-confirm">Send back to filling</Button>}
        {fill && fill.can_check && !mode && stage === "final_check" && (
          <Button variant="contained" data-testid="fill-check-pass"
            disabled={busy || !(form.product_verified && form.strength_verified && form.quantity_verified) || (fill.filled_by_me && !form.single_pharmacist_reason.trim())}
            onClick={() => run("check", {
              product_verified: true, strength_verified: true, quantity_verified: true,
              ...(fill.filled_by_me ? { single_pharmacist_reason: form.single_pharmacist_reason } : {}),
            })}>
            Pass final check
          </Button>
        )}
        {fill && can && fill.can_dispense && !mode && stage === "ready" && (
          <Button variant="contained" data-testid="fill-dispense"
            disabled={busy || !form.counseling_offered || (q && !q.price_found) || !form.prc_license_number.trim() || (fill.dangerous_drug && (!form.yellow_rx_serial.trim() || !form.s2_number.trim()))}
            onClick={() => run("dispense", {
              counseling_offered: form.counseling_offered === "yes",
              counseling_accepted: form.counseling_offered === "yes" && !!form.counseling_accepted,
              discount_kind: form.discount_kind,
              prc_license_number: form.prc_license_number,
              ...(fill.dangerous_drug ? { yellow_rx_serial: form.yellow_rx_serial, s2_number: form.s2_number } : {}),
            })}>
            Dispense
          </Button>
        )}
        {fill && can && !mode && stage === "dispensed" && fill.is_partial && (
          <Button variant="contained" disabled={busy} data-testid="fill-complete-partial"
            onClick={async () => { if (await post(apiEndpoints.pharmacyFillCompletePartial(fillId), {}, "The balance is in the queue.")) onClose(); }}>
            Fill the balance
          </Button>
        )}
        {fill && can && !mode && stage === "dispensed" && !fill.is_partial && !fill.dangerous_drug && fill.refills_used < fill.refills && (
          <Button variant="outlined" disabled={busy} data-testid="fill-refill"
            onClick={async () => { if (await post(apiEndpoints.pharmacyRefill(fill.prescription), {}, "Refill started.")) onClose(); }}>
            Start refill
          </Button>
        )}
      </DialogActions>
      <PharmacyLabelDialog open={labelOpen} fillId={fillId} onClose={() => setLabelOpen(false)} />
    </Dialog>
  );
}
