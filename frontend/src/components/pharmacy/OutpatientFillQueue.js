import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert, Box, Button, Chip, CircularProgress, Paper, Stack, Tab, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, Tabs, TextField, Typography,
} from "@mui/material";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import FillDialog from "./FillDialog";
import PriceTableDialog from "./PriceTableDialog";
import { DrugName, FILLS_CHANGED_EVENT, FILL_STAGES, FILL_STAGE_COLOR, authHeader, errorText, fmtDateTime, peso } from "./pharmacyShared";

/**
 * The in-house outpatient fill queue (Outpatient Rx tab): signed prescriptions sent to the clinic's own pharmacy,
 * by stage. Same layout as the Verification Queue (toolbar, stage tabs with counts, outlined table).
 */
export default function OutpatientFillQueue({ onSelectPatient }) {
  const [stage, setStage] = useState("received");
  const [counts, setCounts] = useState({});
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState(null);
  const [pricesOpen, setPricesOpen] = useState(false);
  const [canWork, setCanWork] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true);
    setError("");
    try {
      const params = { stage };
      if (q.trim()) params.q = q.trim();
      const res = await api.get(apiEndpoints.pharmacyFills, { headers: await authHeader(), params });
      if (mine !== seq.current) return;
      setRows(res.data.results || []);
      setCounts(res.data.counts || {});
      setCanWork(!!res.data.can_work);
    } catch (err) {
      if (mine !== seq.current) return;
      setError(errorText(err, "Could not load the fill queue."));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [stage, q]);

  useEffect(() => {
    const timer = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, q]);

  useEffect(() => {
    window.addEventListener(FILLS_CHANGED_EVENT, load);
    return () => window.removeEventListener(FILLS_CHANGED_EVENT, load);
  }, [load]);

  return (
    <Box sx={{ px: 2, pb: 1, pt: 1 }} data-testid="fill-queue">
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 0.5 }}>
        <Typography variant="subtitle1" noWrap sx={{ fontWeight: 600, mr: 1 }}>Outpatient Rx</Typography>
        <TextField size="small" label="Search" placeholder="Patient or drug" value={q} onChange={(e) => setQ(e.target.value)} inputProps={{ "data-testid": "fill-search" }} sx={{ minWidth: 200 }} />
        <Box sx={{ flexGrow: 1 }} />
        <Button size="small" onClick={() => setPricesOpen(true)} data-testid="fill-prices">Price table</Button>
      </Stack>

      <Tabs
        value={stage}
        onChange={(_, v) => setStage(v)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ minHeight: 36, borderBottom: 1, borderColor: "divider", "& .MuiTab-root": { minHeight: 36, py: 0.5, textTransform: "none" } }}
        aria-label="Fill stages"
      >
        {FILL_STAGES.map((s) => (
          <Tab key={s.value} value={s.value} data-testid={`fill-tab-${s.value}`} label={`${s.label}${counts[s.value] != null ? ` (${counts[s.value]})` : ""}`} />
        ))}
      </Tabs>

      {error && <Alert severity="error" sx={{ my: 0.5 }}>{error}</Alert>}

      <TableContainer component={Paper} variant="outlined" sx={{ mt: 0.5 }}>
        <Table size="small" aria-label="Fill queue">
          <TableHead>
            <TableRow>
              <TableCell>Rx</TableCell>
              <TableCell>Patient</TableCell>
              <TableCell>Medication</TableCell>
              <TableCell>Quantity</TableCell>
              <TableCell>Prescriber</TableCell>
              <TableCell>{stage === "dispensed" ? "Dispensed" : "Received"}</TableCell>
              <TableCell>Stage</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && rows.length === 0 && (
              <TableRow><TableCell colSpan={7}><CircularProgress size={20} /></TableCell></TableRow>
            )}
            {!loading && rows.length === 0 && (
              <TableRow><TableCell colSpan={7} data-testid="fill-empty"><Typography variant="body2" color="text.secondary">No prescriptions at this stage.</Typography></TableCell></TableRow>
            )}
            {rows.map((r) => (
              <TableRow
                key={r.id}
                hover
                sx={{ cursor: "pointer" }}
                onClick={() => {
                  setOpenId(r.id);
                  if (onSelectPatient) onSelectPatient({ user_id: r.patient.id, full_name: r.patient.name });
                }}
                data-testid={`fill-row-${r.id}`}
              >
                <TableCell>
                  <Typography variant="body2">{r.rx_number}</Typography>
                  {r.is_refill && <Typography variant="caption" color="text.secondary">Refill {r.fill_number - 1}</Typography>}
                </TableCell>
                <TableCell>{r.patient.name}</TableCell>
                <TableCell><DrugName drug={r.drug} dangerous={r.dangerous_drug} detail={r.strength} testId={`fill-drug-${r.id}`} /></TableCell>
                <TableCell>
                  {r.quantity || r.prescribed_quantity} {r.quantity_unit}
                  {r.is_partial && <Chip size="small" color="warning" label={`Balance ${r.balance}`} sx={{ ml: 0.5 }} />}
                </TableCell>
                <TableCell>{r.prescriber}</TableCell>
                <TableCell>{fmtDateTime(stage === "dispensed" ? r.dispensed?.at : r.received?.at || r.created_at)}</TableCell>
                <TableCell>
                  <Chip size="small" color={FILL_STAGE_COLOR[r.stage] || "default"} label={r.stage_label} />
                  {r.stage === "on_hold" && <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{r.hold_reason}</Typography>}
                  {r.stage === "dispensed" && r.total_amount && <Typography variant="caption" sx={{ display: "block" }}>{peso(r.total_amount)}</Typography>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }} data-testid="fill-count">
        {rows.length} prescription{rows.length === 1 ? "" : "s"}
        {!canWork && " · read-only"}
      </Typography>

      <FillDialog open={!!openId} fillId={openId} onClose={() => setOpenId(null)} onChanged={load} />
      <PriceTableDialog open={pricesOpen} onClose={() => setPricesOpen(false)} />
    </Box>
  );
}
