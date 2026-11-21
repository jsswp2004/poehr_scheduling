import { useCallback, useEffect, useState } from "react";
import {
  Alert, Box, Chip, CircularProgress, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography,
} from "@mui/material";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import VerifyOrderDialog from "./VerifyOrderDialog";
import {
  DrugName, FILLS_CHANGED_EVENT, PHARMACY_CHANGED_EVENT, PHARMACY_STATUS_COLOR, VERIFY_ROLES, authHeader, directions, errorText,
  fmtDateTime, peso,
} from "./pharmacyShared";

const ORDER_STATUS = { pending_cosign: "Pending cosign", active: "Active", in_progress: "In progress", completed: "Completed", discontinued: "Discontinued", cancelled: "Cancelled" };

function Section({ title, children, testId }) {
  return (
    <Box sx={{ mb: 2 }} data-testid={testId}>
      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>{title}</Typography>
      {children}
    </Box>
  );
}

/**
 * One patient's medication profile for the pharmacist: renal data and allergies on top, then the medication
 * orders (with their verification status), outpatient prescriptions and home medications.
 */
export default function MedProfilePanel({ patient, role }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get(apiEndpoints.pharmacyMedProfile(patient.id), { headers: await authHeader() });
      setData(res.data);
    } catch (err) {
      setError(errorText(err, "Could not load the medication profile."));
    } finally {
      setLoading(false);
    }
  }, [patient.id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    window.addEventListener(PHARMACY_CHANGED_EVENT, load);
    window.addEventListener(FILLS_CHANGED_EVENT, load);
    return () => {
      window.removeEventListener(PHARMACY_CHANGED_EVENT, load);
      window.removeEventListener(FILLS_CHANGED_EVENT, load);
    };
  }, [load]);

  if (loading && !data) return <Box sx={{ p: 2 }}><CircularProgress size={24} /></Box>;
  if (error) return <Alert severity="error" sx={{ m: 2 }} data-testid="med-profile-error">{error}</Alert>;
  if (!data) return null;
  const renal = data.renal || {};

  return (
    <Box sx={{ px: 2, py: 1 }} data-testid="med-profile">
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }} data-testid="med-profile-renal">
        <Chip size="small" variant="outlined" label={`Weight ${renal.weight_kg != null ? `${renal.weight_kg} kg` : "not recorded"}`} />
        <Chip size="small" variant="outlined" label={`SCr ${renal.scr != null ? `${renal.scr} ${renal.scr_units || ""}`.trim() : "not recorded"}`} />
        <Chip
          size="small"
          color={renal.renal_flag ? "error" : "default"}
          variant={renal.renal_flag ? "filled" : "outlined"}
          label={`CrCl ${renal.crcl != null ? `${renal.crcl} mL/min` : "not calculated"}`}
          title={renal.crcl != null ? renal.crcl_method : renal.crcl_note}
        />
        {data.allergies.length > 0 ? (
          data.allergies.map((a) => <Chip key={a.substance} size="small" color="error" variant="outlined" label={`Allergy: ${a.substance}${a.reaction ? ` (${a.reaction})` : ""}`} />)
        ) : (
          <Chip size="small" variant="outlined" label={data.no_known_allergies ? "No known allergies" : "Allergies not documented"} />
        )}
      </Stack>

      <Section title="Medication orders" testId="med-profile-orders">
        <TableContainer component={Paper} variant="outlined">
          <Table size="small" aria-label="Medication orders">
            <TableHead>
              <TableRow>
                <TableCell>Medication</TableCell>
                <TableCell>Directions</TableCell>
                <TableCell>Order</TableCell>
                <TableCell>Pharmacy</TableCell>
                <TableCell>Verified by</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.orders.length === 0 && (
                <TableRow><TableCell colSpan={5}><Typography variant="body2" color="text.secondary">No medication orders.</Typography></TableCell></TableRow>
              )}
              {data.orders.map((o) => (
                <TableRow key={o.id} hover sx={{ cursor: "pointer" }} onClick={() => setOpenId(o.id)} data-testid={`med-order-${o.id}`}>
                  <TableCell><DrugName drug={o.drug} dangerous={o.dangerous_drug} /></TableCell>
                  <TableCell>{directions(o)}</TableCell>
                  <TableCell>{ORDER_STATUS[o.status] || o.status}</TableCell>
                  <TableCell>
                    {o.pharmacy_status_label && <Chip size="small" color={PHARMACY_STATUS_COLOR[o.pharmacy_status] || "default"} label={o.pharmacy_status_label} />}
                    {o.alert_counts?.high > 0 && <Chip size="small" color="error" variant="outlined" sx={{ ml: 0.5 }} label={`${o.alert_counts.high} alert`} />}
                  </TableCell>
                  <TableCell>{o.verified_by ? `${o.verified_by.name} · ${fmtDateTime(o.verified_at)}` : ""}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Section>

      <Section title="Prescriptions" testId="med-profile-prescriptions">
        {data.prescriptions.length === 0 ? (
          <Typography variant="body2" color="text.secondary">No open prescriptions.</Typography>
        ) : (
          data.prescriptions.map((rx) => (
            <Box key={rx.id} sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", py: 0.25 }}>
              <DrugName drug={rx.drug} dangerous={rx.dangerous_drug} detail={[rx.strength, rx.form].filter(Boolean).join(" ")} />
              <Typography variant="body2" color="text.secondary">{rx.sig}</Typography>
              <Chip size="small" variant="outlined" label={rx.status_label} />
              <Typography variant="caption" color="text.secondary">{rx.prescriber}</Typography>
            </Box>
          ))
        )}
      </Section>

      <Section title="Home medications" testId="med-profile-home">
        {data.home_medications.length === 0 ? (
          <Typography variant="body2" color="text.secondary">None recorded.</Typography>
        ) : (
          data.home_medications.map((h) => (
            <Box key={h.id} sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", py: 0.25 }}>
              <DrugName drug={h.drug} dangerous={h.dangerous_drug} detail={h.strength} />
              <Typography variant="body2" color="text.secondary">{[h.dose, h.route, h.frequency].filter(Boolean).join(" ")}</Typography>
              {h.status === "stopped" && <Chip size="small" variant="outlined" label="Stopped" />}
            </Box>
          ))
        )}
      </Section>

      <Section title="Dispensing history" testId="med-profile-dispensing">
        {(data.dispensing || []).length === 0 ? (
          <Typography variant="body2" color="text.secondary">Nothing dispensed by the in-house pharmacy yet.</Typography>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small" aria-label="Dispensing history">
              <TableHead>
                <TableRow>
                  <TableCell>Dispensed</TableCell>
                  <TableCell>Medication</TableCell>
                  <TableCell>Quantity</TableCell>
                  <TableCell>Rx</TableCell>
                  <TableCell>By</TableCell>
                  <TableCell align="right">Total</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.dispensing.map((f) => (
                  <TableRow key={f.id} data-testid={`dispensed-${f.id}`}>
                    <TableCell>{fmtDateTime(f.dispensed?.at)}</TableCell>
                    <TableCell><DrugName drug={f.drug} dangerous={f.dangerous_drug} detail={f.strength} /></TableCell>
                    <TableCell>
                      {f.quantity} {f.quantity_unit}
                      {f.is_partial && <Chip size="small" color="warning" label={`Balance ${f.balance}`} sx={{ ml: 0.5 }} />}
                    </TableCell>
                    <TableCell>{f.rx_number}{f.is_refill ? ` · Refill ${f.fill_number - 1}` : ""}</TableCell>
                    <TableCell>{f.dispensed?.name}</TableCell>
                    <TableCell align="right">{peso(f.total_amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Section>

      {data.interventions.length > 0 && (
        <Section title="Pharmacist interventions" testId="med-profile-interventions">
          {data.interventions.map((iv) => (
            <Typography key={iv.id} variant="body2" color="text.secondary">
              {fmtDateTime(iv.created_at)} · {iv.type_label} by {iv.pharmacist?.name}{iv.reason ? `: ${iv.reason}` : ""}
            </Typography>
          ))}
        </Section>
      )}

      <VerifyOrderDialog open={!!openId} orderId={openId} canVerify={VERIFY_ROLES.includes(role)} onClose={() => setOpenId(null)} onDone={load} />
    </Box>
  );
}
