import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert, Box, Button, Chip, CircularProgress, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, TextField, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import FormularyItemDialog from "./FormularyItemDialog";
import FormularyImportDialog, { FormularyImportsDialog, downloadCsv } from "./FormularyImportDialog";
import FormularyReviewersDialog from "./FormularyReviewersDialog";
import { DrugName, authHeader, errorText, peso } from "./pharmacyShared";

const FILTERS = [
  { key: "scope", label: "Items", options: [["", "All"], ["shared", "Shared POWER"], ["clinic", "Our clinic's own"], ["overridden", "With our overrides"]] },
  { key: "dangerous", label: "Dangerous drug", options: [["", "Any"], ["yes", "Yes"], ["no", "No"]] },
  { key: "renal", label: "Renal flag", options: [["", "Any"], ["yes", "Yes"], ["no", "No"]] },
  { key: "active", label: "Status", options: [["", "Any"], ["yes", "Active"], ["no", "Hidden"]] },
  { key: "review", label: "Review", options: [["", "Any"], ["needs_review", "Needs pharmacist review"], ["reviewed", "Reviewed"]] },
];

/**
 * The POWER Formulary: one row per drug, the shared POWER formulary with this clinic's overrides and its own items.
 * Pharmacists and administrators edit their clinic; POWER system administrators edit the shared formulary;
 * pharmacy assistants only view.
 */
export default function FormularyPanel() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState({ scope: "", dangerous: "", renal: "", active: "", review: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(null); // {item} | {item: null} for a new one
  const [importOpen, setImportOpen] = useState(false);
  const [importsOpen, setImportsOpen] = useState(false);
  const [reviewersOpen, setReviewersOpen] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true);
    try {
      const params = { ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), ...(q.trim() ? { q: q.trim() } : {}) };
      const res = await api.get(apiEndpoints.formulary, { headers: await authHeader(), params });
      if (mine !== seq.current) return;
      setRows(res.data.results || []);
      setMeta(res.data);
      setError("");
    } catch (err) {
      if (mine === seq.current) setError(errorText(err, "Could not load the formulary."));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [filters, q]);

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const canEdit = !!meta?.can_edit;

  return (
    <Box sx={{ px: 2, py: 1 }} data-testid="formulary">
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mr: 1 }}>Formulary{meta?.edits_shared ? " (shared POWER)" : ""}</Typography>
        <TextField size="small" label="Search" placeholder="Generic, brand, code or RxNorm" value={q} onChange={(e) => setQ(e.target.value)} inputProps={{ "data-testid": "formulary-search" }} sx={{ minWidth: 240 }} />
        {FILTERS.map((f) => (
          <TextField key={f.key} select size="small" label={f.label} value={filters[f.key]} onChange={(e) => setFilters((s) => ({ ...s, [f.key]: e.target.value }))} sx={{ minWidth: 140 }} inputProps={{ "data-testid": `formulary-filter-${f.key}` }}>
            {f.options.map(([v, l]) => <MenuItem key={v || "any"} value={v}>{l}</MenuItem>)}
          </TextField>
        ))}
        <Box sx={{ flexGrow: 1 }} />
        <Button size="small" onClick={() => downloadCsv(apiEndpoints.formularyExport, "formulary.csv")} data-testid="formulary-export">Export CSV</Button>
        {canEdit && <Button size="small" onClick={() => setImportOpen(true)} data-testid="formulary-import">Import CSV</Button>}
        <Button size="small" onClick={() => setImportsOpen(true)}>Imports</Button>
        {meta?.edits_shared && <Button size="small" onClick={() => setReviewersOpen(true)} data-testid="formulary-reviewers">Reviewers</Button>}
        {canEdit && <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={() => setOpen({ item: null })} data-testid="formulary-add">Add item</Button>}
      </Stack>
      {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
      <TableContainer component={Paper} variant="outlined">
        <Table size="small" aria-label="Formulary">
          <TableHead>
            <TableRow sx={{ bgcolor: "#dbeafe" }}>
              <TableCell sx={{ fontWeight: "bold" }}>Medication</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Route</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>RxNorm</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Flags</TableCell>
              <TableCell sx={{ fontWeight: "bold" }} align="right">Price</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Status</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Source</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && rows.length === 0 && <TableRow><TableCell colSpan={7}><CircularProgress size={20} /></TableCell></TableRow>}
            {!loading && rows.length === 0 && <TableRow><TableCell colSpan={7}><Typography variant="body2" color="text.secondary">No items.</Typography></TableCell></TableRow>}
            {rows.map((r) => (
              <TableRow key={r.id} hover sx={{ cursor: "pointer", opacity: r.is_active ? 1 : 0.55 }} onClick={() => setOpen({ item: r })} data-testid={`formulary-row-${r.code}`}>
                <TableCell>
                  <DrugName drug={{ generic: r.generic_name, brand: r.brand_name }} detail={[r.strength, r.form].filter(Boolean).join(" ")} />
                  <Typography variant="caption" color="text.secondary">{r.code}</Typography>
                </TableCell>
                <TableCell>{r.route}</TableCell>
                <TableCell>{r.rxnorm_code}</TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                    {r.dangerous_drug && <Chip size="small" color="error" variant="outlined" label="Dangerous drug" />}
                    {r.renal_threshold_crcl != null && <Chip size="small" color="warning" variant="outlined" label={`Renal < ${r.renal_threshold_crcl}`} />}
                    {r.vat_exempt && <Chip size="small" variant="outlined" label="VAT-exempt" />}
                  </Stack>
                </TableCell>
                <TableCell align="right">{r.unit_price_php ? `${peso(r.unit_price_php)}${r.unit ? ` / ${r.unit}` : ""}` : "—"}</TableCell>
                <TableCell>
                  {r.is_active ? "Active" : "Hidden"}
                  {r.review?.status === "needs_review" && (
                    <Chip size="small" color="warning" variant="outlined" sx={{ ml: 0.5 }} label="Needs review" data-testid={`formulary-review-${r.code}`} />
                  )}
                </TableCell>
                <TableCell>
                  <Chip size="small" variant="outlined" label={r.scope === "shared" ? "Shared" : "Our clinic"} />
                  {r.overridden.length > 0 && <Chip size="small" color="warning" sx={{ ml: 0.5 }} label={`${r.overridden.length} overridden`} data-testid={`formulary-overridden-${r.code}`} />}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
        {rows.length} item{rows.length === 1 ? "" : "s"}{!canEdit ? " · view only" : ""}
      </Typography>
      <FormularyItemDialog
        open={!!open}
        item={open?.item || null}
        meta={meta}
        onClose={() => setOpen(null)}
        onSaved={(updated, stay) => {
          load();
          if (stay && updated) setOpen({ item: updated });
          else setOpen(null);
        }}
      />
      <FormularyImportDialog open={importOpen} sharedScope={!!meta?.edits_shared} onClose={() => setImportOpen(false)} onApplied={() => { setImportOpen(false); load(); }} />
      <FormularyImportsDialog open={importsOpen} onClose={() => setImportsOpen(false)} />
      <FormularyReviewersDialog open={reviewersOpen} onClose={() => setReviewersOpen(false)} />
    </Box>
  );
}
