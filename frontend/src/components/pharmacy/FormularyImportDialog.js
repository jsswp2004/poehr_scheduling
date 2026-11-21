import { useEffect, useState } from "react";
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Typography,
} from "@mui/material";
import { toast } from "react-toastify";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { authHeader, errorText, fmtDateTime } from "./pharmacyShared";

const STATUS_COLOR = { new: "success", changed: "warning", unchanged: "default" };

/** Save a CSV the server sent (the template, the export, an import's original file). */
export async function downloadCsv(url, filename) {
  const res = await api.get(url, { headers: await authHeader(), responseType: "blob" });
  const href = window.URL.createObjectURL(new Blob([res.data], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(href);
}

/**
 * Import a formulary CSV in two steps: Preview (every row new / changed old -> new / unchanged, every error by row
 * and column, warnings such as an RxNorm mismatch) and then Apply, which saves all rows or none.
 */
export default function FormularyImportDialog({ open, onClose, onApplied, sharedScope = false }) {
  const [file, setFile] = useState(null);
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setFile(null);
      setPlan(null);
      setError("");
    }
  }, [open]);

  const send = async (mode) => {
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("mode", mode);
      const res = await api.post(apiEndpoints.formularyImport, body, { headers: await authHeader() });
      if (mode === "apply") {
        toast.success(`Imported: ${res.data.counts.new} new, ${res.data.counts.changed} changed.`);
        onApplied();
      } else {
        setPlan(res.data);
      }
    } catch (err) {
      if (err?.response?.data?.rows) setPlan(err.response.data);
      setError(errorText(err, "Could not read the file."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="lg" fullWidth data-testid="formulary-import-dialog">
      <DialogTitle>Import formulary CSV {sharedScope ? "(shared POWER formulary)" : "(your clinic)"}</DialogTitle>
      <DialogContent dividers>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }} flexWrap="wrap" useFlexGap>
          <Button variant="outlined" component="label" size="small">
            Choose file
            <input hidden type="file" accept=".csv,text/csv" data-testid="fimport-file" onChange={(e) => { setFile(e.target.files[0] || null); setPlan(null); }} />
          </Button>
          <Typography variant="body2">{file ? file.name : "No file chosen"}</Typography>
          <Box sx={{ flexGrow: 1 }} />
          <Button size="small" onClick={() => downloadCsv(apiEndpoints.formularyTemplate, "formulary_upload_template.csv")}>Download template</Button>
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
          Rows match on the item code. A blank cell keeps the current value; a new item gets the defaults. {sharedScope ? "" : "For shared POWER items only your clinic's price, VAT-exempt, unit, active, dangerous-drug and renal values are used."}
        </Typography>
        {error && <Alert severity="error" sx={{ mb: 1 }} data-testid="fimport-error">{error}</Alert>}
        {plan && (
          <>
            <Stack direction="row" spacing={1} sx={{ mb: 1 }} data-testid="fimport-counts">
              <Chip size="small" color="success" label={`${plan.counts?.new ?? 0} new`} />
              <Chip size="small" color="warning" label={`${plan.counts?.changed ?? 0} changed`} />
              <Chip size="small" label={`${plan.counts?.unchanged ?? 0} unchanged`} />
              {plan.errors?.length > 0 && <Chip size="small" color="error" label={`${plan.errors.length} errors`} />}
            </Stack>
            {(plan.errors || []).map((e, i) => (
              <Typography key={`e${i}`} variant="body2" color="error.main" data-testid="fimport-error-row">Row {e.row}, {e.column || "file"}: {e.message}</Typography>
            ))}
            {(plan.warnings || []).map((w, i) => (
              <Typography key={`w${i}`} variant="body2" color="warning.main" data-testid="fimport-warning-row">Row {w.row}, {w.column}: {w.message}</Typography>
            ))}
            <TableContainer component={Paper} variant="outlined" sx={{ mt: 1, maxHeight: 360 }}>
              <Table size="small" stickyHeader aria-label="Import preview">
                <TableHead>
                  <TableRow><TableCell>Row</TableCell><TableCell>Code</TableCell><TableCell>Result</TableCell><TableCell>Changes</TableCell></TableRow>
                </TableHead>
                <TableBody>
                  {(plan.rows || []).map((r) => (
                    <TableRow key={r.row} data-testid={`fimport-row-${r.row}`}>
                      <TableCell>{r.row}</TableCell>
                      <TableCell>{r.code}</TableCell>
                      <TableCell><Chip size="small" color={STATUS_COLOR[r.status]} label={r.status === "changed" && r.scope === "override" ? "override" : r.status} /></TableCell>
                      <TableCell>
                        {Object.entries(r.changes || {}).map(([f, [from, to]]) => `${f}: ${from ?? "—"} → ${to ?? "—"}`).join("; ")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Close</Button>
        <Button onClick={() => send("preview")} disabled={busy || !file} data-testid="fimport-preview">Preview</Button>
        <Button variant="contained" onClick={() => send("apply")} disabled={busy || !plan || !plan.ok} data-testid="fimport-apply">Apply</Button>
      </DialogActions>
    </Dialog>
  );
}

/** The imports applied in this scope, each with its original file. */
export function FormularyImportsDialog({ open, onClose }) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const res = await api.get(apiEndpoints.formularyImports, { headers: await authHeader() });
        setRows(res.data.results || []);
      } catch (err) {
        setRows([]);
      }
    })();
  }, [open]);
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth data-testid="formulary-imports-dialog">
      <DialogTitle>Formulary imports</DialogTitle>
      <DialogContent dividers>
        {rows.length === 0 && <Typography variant="body2" color="text.secondary">No imports yet.</Typography>}
        {rows.map((i) => (
          <Stack key={i.id} direction="row" spacing={1} alignItems="center" sx={{ py: 0.5 }} data-testid={`fimport-past-${i.id}`}>
            <Typography variant="body2" sx={{ flexGrow: 1 }}>
              {fmtDateTime(i.at)} · {i.user} · {i.filename} · {i.created} new, {i.changed} changed, {i.unchanged} unchanged
            </Typography>
            <Button size="small" onClick={() => downloadCsv(apiEndpoints.formularyImportFile(i.id), i.filename)}>Original file</Button>
          </Stack>
        ))}
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Close</Button></DialogActions>
    </Dialog>
  );
}
