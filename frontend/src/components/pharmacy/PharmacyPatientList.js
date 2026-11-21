import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert, Box, Chip, CircularProgress, FormControl, IconButton, InputLabel, MenuItem, Paper, Select as MUISelect, Table,
  TableBody, TableCell, TableContainer, TableHead, TableRow, Tooltip, Typography,
} from "@mui/material";
import FactCheckIcon from "@mui/icons-material/FactCheck";
import MedicationIcon from "@mui/icons-material/Medication";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import SearchField from "../patients/SearchField";
import { PHARMACY_CHANGED_EVENT, authHeader, errorText } from "./pharmacyShared";

const CARE_OPTIONS = [
  { value: "", label: "All care settings" },
  { value: "ambulatory", label: "Ambulatory Care" },
  { value: "emergency", label: "Emergency Care" },
  { value: "acute", label: "Acute Care" },
  { value: "surgery", label: "Surgery" },
];

const SEX = { M: "M", F: "F", X: "X" };

/**
 * The Pharmacy Patient List: patients with medication orders to verify (or verified) and patients with open
 * prescriptions, with what a pharmacist needs at a glance (location, weight, SCr, CrCl, allergies, counts).
 * Looks and behaves like the Patients table: a row click selects the patient for the chart header.
 */
export default function PharmacyPatientList({ selectedId, onSelect, onOpenChart, onListChange }) {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [care, setCare] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true);
    setError("");
    try {
      const params = {};
      if (search.trim()) params.q = search.trim();
      if (care) params.care = care;
      const res = await api.get(apiEndpoints.pharmacyPatients, { headers: await authHeader(), params });
      if (mine !== seq.current) return;
      const list = res.data.results || [];
      setRows(list);
      if (onListChange) onListChange("Pharmacy list", list.map((r) => ({ user_id: r.id, full_name: r.name })));
    } catch (err) {
      if (mine !== seq.current) return;
      setError(errorText(err, "Could not load the pharmacy patient list."));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, care]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    window.addEventListener(PHARMACY_CHANGED_EVENT, load);
    return () => window.removeEventListener(PHARMACY_CHANGED_EVENT, load);
  }, [load]);

  const pick = (r) => onSelect && onSelect({ user_id: r.id, full_name: r.name });

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", px: 0.5 }} data-testid="pharmacy-patient-list">
      <Box sx={{ display: "flex", gap: 2, mb: 1, mt: 0.5, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <SearchField label="Search patients..." onSearchChange={setSearch} initialValue={search} variant="outlined" size="small" sx={{ minWidth: 250 }} />
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel id="pharmacy-care-filter-label">Filter by Care Setting</InputLabel>
          <MUISelect
            labelId="pharmacy-care-filter-label"
            label="Filter by Care Setting"
            value={care}
            displayEmpty
            onChange={(e) => setCare(e.target.value)}
            inputProps={{ "data-testid": "pharmacy-care-filter" }}
          >
            {CARE_OPTIONS.map((c) => <MenuItem key={c.value || "all"} value={c.value}>{c.label}</MenuItem>)}
          </MUISelect>
        </FormControl>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 1 }} data-testid="pharmacy-list-error">{error}</Alert>}

      <TableContainer component={Paper} sx={{ flex: 1, minHeight: 0 }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: "#dbeafe" }}>
              <TableCell sx={{ fontWeight: "bold" }}>Name</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Location</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Weight</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>SCr</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>CrCl</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Allergies</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Orders</TableCell>
              <TableCell sx={{ fontWeight: "bold", textAlign: "center" }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && rows.length === 0 && (
              <TableRow><TableCell colSpan={8}><CircularProgress size={20} /></TableCell></TableRow>
            )}
            {!loading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} sx={{ textAlign: "center", py: 4 }} data-testid="pharmacy-list-empty">
                  No patients with medication orders or open prescriptions.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => {
              const selected = selectedId != null && String(r.id) === String(selectedId);
              return (
                <TableRow
                  key={r.id}
                  hover
                  selected={selected}
                  aria-selected={selected}
                  onClick={() => pick(r)}
                  data-testid={`pharmacy-patient-row-${r.id}`}
                  sx={{ "&:hover": { bgcolor: "#f8fafc" }, "&.Mui-selected, &.Mui-selected:hover": { bgcolor: "#cfe8fc" }, cursor: "pointer" }}
                >
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>{r.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {[r.mrn, [r.age != null ? `${r.age} y` : "", SEX[r.sex] || ""].filter(Boolean).join(" ")].filter(Boolean).join(" · ")}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{r.location}</Typography>
                    <Typography variant="caption" color="text.secondary">{r.care_setting_label}</Typography>
                  </TableCell>
                  <TableCell>{r.weight_kg != null ? `${r.weight_kg} kg` : "—"}</TableCell>
                  <TableCell>{r.scr != null ? `${r.scr} ${r.scr_units || ""}`.trim() : "—"}</TableCell>
                  <TableCell>
                    {r.crcl != null ? (
                      <Typography variant="body2" sx={{ color: r.flags.renal ? "error.main" : "inherit", fontWeight: r.flags.renal ? 600 : 400 }} data-testid={`pharmacy-crcl-${r.id}`}>
                        {r.crcl} mL/min
                      </Typography>
                    ) : (
                      <Typography variant="caption" color="warning.dark" data-testid={`pharmacy-crcl-missing-${r.id}`}>
                        {(r.crcl_note || "CrCl not calculated").replace(/^CrCl not calculated — /, "Not calculated — ")}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    {r.allergies.length > 0 ? (
                      <Typography variant="body2" color="error.main">{r.allergies.map((a) => a.substance).join(", ")}</Typography>
                    ) : (
                      <Typography variant="body2" color="text.secondary">{r.no_known_allergies ? "No known allergies" : "Not documented"}</Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                      {r.counts.pending > 0 && (
                        <Chip size="small" color={r.flags.past_goal ? "error" : "warning"} label={`${r.counts.pending} to verify`} data-testid={`pharmacy-pending-${r.id}`} />
                      )}
                      {r.counts.on_hold > 0 && <Chip size="small" color="info" label={`${r.counts.on_hold} on hold`} />}
                      {r.counts.verified > 0 && <Chip size="small" variant="outlined" label={`${r.counts.verified} verified`} />}
                      {r.counts.prescriptions > 0 && <Chip size="small" variant="outlined" label={`${r.counts.prescriptions} Rx`} />}
                      {r.flags.dangerous_drug && <Chip size="small" color="error" variant="outlined" label="Dangerous drug" />}
                    </Box>
                  </TableCell>
                  <TableCell sx={{ textAlign: "center" }}>
                    <Box sx={{ display: "flex", gap: 0.5, justifyContent: "center" }}>
                      <Tooltip title="Verification Queue">
                        <IconButton size="small" sx={{ color: "primary.main" }} aria-label="Open verification queue" onClick={(e) => { e.stopPropagation(); onOpenChart && onOpenChart({ user_id: r.id, full_name: r.name }, "verification_queue"); }}>
                          <FactCheckIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Med Profile">
                        <IconButton size="small" sx={{ color: "primary.main" }} aria-label="Open med profile" onClick={(e) => { e.stopPropagation(); onOpenChart && onOpenChart({ user_id: r.id, full_name: r.name }, "med_profile"); }}>
                          <MedicationIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
