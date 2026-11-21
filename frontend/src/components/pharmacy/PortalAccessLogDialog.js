import { useCallback, useEffect, useState } from "react";
import {
  Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Grid, MenuItem, Paper, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Typography,
} from "@mui/material";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { authHeader, errorText, fmtDateTime } from "./pharmacyShared";

const BLANK = { user: "", pharmacy: "", action: "", prescription: "", date_from: "", date_to: "" };

/**
 * The POWER Pharmacy Portal access log (Data Privacy Act, RA 10173): every view and action by portal users.
 * POWER system administrators filter it and export it as CSV. Entries are kept for 5 years.
 */
export default function PortalAccessLogDialog({ open, onClose, pharmacies = [] }) {
  const [filters, setFilters] = useState(BLANK);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");

  const params = useCallback(() => Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), [filters]);

  const load = useCallback(async () => {
    try {
      const res = await api.get(apiEndpoints.pharmacyPortalAccessLog, { headers: await authHeader(), params: params() });
      setRows(res.data.results || []);
      setError("");
    } catch (err) {
      setError(errorText(err, "Could not load the access log."));
    }
  }, [params]);

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const exportCsv = async () => {
    try {
      const res = await api.get(apiEndpoints.pharmacyPortalAccessLog, { headers: await authHeader(), params: { ...params(), export: "csv" }, responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "portal-access-log.csv";
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(errorText(err, "Could not export the access log."));
    }
  };

  const f = (key, label, extra = {}) => (
    <TextField size="small" fullWidth label={label} value={filters[key]} onChange={(e) => setFilters({ ...filters, [key]: e.target.value })} inputProps={{ "data-testid": `log-${key}` }} {...extra} />
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth data-testid="access-log-dialog">
      <DialogTitle>Portal access log</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Every view and action by portal pharmacy staff (Data Privacy Act, RA 10173). Kept for 5 years. The screen shows
          the latest 500 matching entries; Export CSV gives all of them.
        </Typography>
        {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
        <Grid container spacing={1} sx={{ mb: 1 }}>
          <Grid size={{ xs: 12, sm: 2 }}>{f("user", "User")}</Grid>
          <Grid size={{ xs: 12, sm: 2 }}>
            {f("pharmacy", "Pharmacy", {
              select: true,
              children: [<MenuItem key="" value="">All</MenuItem>, ...pharmacies.map((p) => <MenuItem key={p.id} value={String(p.id)}>{p.name}</MenuItem>)],
            })}
          </Grid>
          <Grid size={{ xs: 12, sm: 2 }}>{f("action", "Action")}</Grid>
          <Grid size={{ xs: 12, sm: 2 }}>{f("prescription", "Rx")}</Grid>
          <Grid size={{ xs: 12, sm: 2 }}>{f("date_from", "From", { type: "date", InputLabelProps: { shrink: true } })}</Grid>
          <Grid size={{ xs: 12, sm: 2 }}>{f("date_to", "To", { type: "date", InputLabelProps: { shrink: true } })}</Grid>
        </Grid>
        <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 420 }}>
          <Table size="small" stickyHeader aria-label="Portal access log">
            <TableHead>
              <TableRow>
                <TableCell>When</TableCell>
                <TableCell>User</TableCell>
                <TableCell>Pharmacy</TableCell>
                <TableCell>Action</TableCell>
                <TableCell>Rx</TableCell>
                <TableCell>IP</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 && <TableRow><TableCell colSpan={6}><Typography variant="body2" color="text.secondary">No entries.</Typography></TableCell></TableRow>}
              {rows.map((r) => (
                <TableRow key={r.id} data-testid={`log-row-${r.id}`}>
                  <TableCell>{fmtDateTime(r.at)}</TableCell>
                  <TableCell>{r.name} ({r.user})</TableCell>
                  <TableCell>{r.pharmacy}</TableCell>
                  <TableCell>{r.action}</TableCell>
                  <TableCell>{r.prescription}</TableCell>
                  <TableCell>{r.ip}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </DialogContent>
      <DialogActions>
        <Button onClick={exportCsv} data-testid="log-export">Export CSV</Button>
        <Button variant="contained" onClick={load} data-testid="log-search">Search</Button>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
