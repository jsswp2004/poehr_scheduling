import { useEffect, useState } from "react";
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, GlobalStyles, Typography } from "@mui/material";
import PrintIcon from "@mui/icons-material/Print";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { authHeader, errorText } from "./pharmacyShared";

/**
 * The dispensing label, as it prints: the generic name first, the brand in parentheses (RA 6675 / RA 9502),
 * the directions, quantity, prescriber, the pharmacy with its FDA LTO number, and the fill date.
 */
export function LabelBody({ label }) {
  return (
    <Box className="pharmacy-label-print" data-testid="pharmacy-label" sx={{ border: 1, borderColor: "text.primary", p: 1.5, maxWidth: 420, fontSize: 13, bgcolor: "#fff", color: "#000" }}>
      <Typography sx={{ fontWeight: 700, fontSize: 14 }}>{label.pharmacy_name}</Typography>
      <Typography sx={{ fontSize: 12 }}>{[label.pharmacy_address, label.pharmacy_phone].filter(Boolean).join(" · ")}</Typography>
      <Typography sx={{ fontSize: 12 }} data-testid="label-lto">FDA LTO No. {label.fda_lto_number || "—"}</Typography>
      <Box sx={{ borderTop: 1, my: 1 }} />
      <Typography sx={{ fontSize: 12 }}>
        {label.rx_number}{label.fill_number > 1 ? ` · Refill ${label.fill_number - 1}` : ""} · Filled {label.fill_date}
      </Typography>
      <Typography sx={{ fontWeight: 700, mt: 0.5 }}>{label.patient}</Typography>
      <Typography sx={{ fontWeight: 700, fontSize: 15, mt: 0.5 }} data-testid="label-drug">{label.drug_line}</Typography>
      <Typography sx={{ mt: 0.5 }} data-testid="label-sig">{label.sig}</Typography>
      <Typography sx={{ mt: 0.5 }}>Qty: {label.quantity} {label.quantity_unit}</Typography>
      <Typography sx={{ fontSize: 12, mt: 0.5 }}>
        Prescriber: {label.prescriber}{label.prescriber_license ? ` · PRC Lic. ${label.prescriber_license}` : ""}
      </Typography>
      {label.dispensed_by && (
        <Typography sx={{ fontSize: 12 }} data-testid="label-pharmacist">
          Dispensed by {label.dispensed_by}{label.pharmacist_license ? ` · PRC Lic. ${label.pharmacist_license}` : ""}
        </Typography>
      )}
      <Typography sx={{ fontSize: 12 }}>
        Lot {label.lot_number || "—"} · Exp {label.expiry_date || "—"}
        {label.dangerous_drug ? " · No refills (dangerous drug)" : ` · Refills left: ${label.refills_left}`}
      </Typography>
    </Box>
  );
}

export default function PharmacyLabelDialog({ open, fillId, onClose }) {
  const [label, setLabel] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !fillId) return;
    setLabel(null);
    setError("");
    (async () => {
      try {
        const res = await api.get(apiEndpoints.pharmacyFillLabel(fillId), { headers: await authHeader() });
        setLabel(res.data);
      } catch (err) {
        setError(errorText(err, "Could not load the label."));
      }
    })();
  }, [open, fillId]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth data-testid="label-dialog">
      {/* print only the label */}
      <GlobalStyles styles={{ "@media print": { "body *": { visibility: "hidden" }, ".pharmacy-label-print, .pharmacy-label-print *": { visibility: "visible" }, ".pharmacy-label-print": { position: "absolute", left: 0, top: 0 } } }} />
      <DialogTitle>Label</DialogTitle>
      <DialogContent dividers>
        {!label && !error && <CircularProgress size={24} />}
        {error && <Alert severity="error">{error}</Alert>}
        {label && <LabelBody label={label} />}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Button variant="contained" startIcon={<PrintIcon />} disabled={!label} onClick={() => window.print()} data-testid="label-print">
          Print
        </Button>
      </DialogActions>
    </Dialog>
  );
}
