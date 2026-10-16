import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { getValidToken } from "../../utils/auth";
import { apiEndpoints } from "../../config/api";

const pad = (n) => String(n).padStart(2, "0");

// The visit's date: when the patient arrived, else when the visit was created (local calendar day).
const visitMoment = (v) => {
  const d = new Date(v.arrival_time || v.created_at);
  return Number.isNaN(d.getTime()) ? null : d;
};
const localISODate = (d) => (d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : "");
const fmtDateTime = (d) =>
  d ? d.toLocaleString([], { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";

const isOpen = (v) => !v.discharge_datetime;

/**
 * Lists ALL of a patient's visits (open, discharged/closed) so one can be picked and loaded
 * into the registration form. The list can be narrowed by visit date and status.
 */
function VisitSearchDialog({ open, onClose, patient, currentRegistrationId, canEditClosed, onSelect }) {
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [status, setStatus] = useState("all");

  const load = useCallback(async () => {
    if (!patient?.id) return;
    setLoading(true);
    setError("");
    try {
      const token = await getValidToken();
      const headers = { Authorization: `Bearer ${token}` };
      let all = [];
      let res = await axios.get(apiEndpoints.registrations, { headers, params: { patient: patient.id } });
      for (let page = 0; page < 20; page += 1) {
        const data = res.data;
        all = all.concat(Array.isArray(data) ? data : data?.results || []);
        if (Array.isArray(data) || !data?.next) break;
        res = await axios.get(data.next, { headers });
      }
      setVisits(all);
    } catch (err) {
      console.error("Could not load the patient's visits:", err);
      setError("Could not load this patient's visits.");
    } finally {
      setLoading(false);
    }
  }, [patient?.id]);

  useEffect(() => {
    if (open) {
      setDateFrom("");
      setDateTo("");
      setStatus("all");
      load();
    }
  }, [open, load]);

  const rows = useMemo(() => {
    return visits
      .filter((v) => {
        if (status === "open" && !isOpen(v)) return false;
        if (status === "closed" && isOpen(v)) return false;
        const day = localISODate(visitMoment(v));
        if (dateFrom && (!day || day < dateFrom)) return false;
        if (dateTo && (!day || day > dateTo)) return false;
        return true;
      })
      .sort((a, b) => (visitMoment(b)?.getTime() || 0) - (visitMoment(a)?.getTime() || 0));
  }, [visits, status, dateFrom, dateTo]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Search for Visit
        {patient ? ` — ${patient.first_name || ""} ${patient.last_name || ""}` : ""}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            All visits for this patient: open, discharged and closed. Pick one to load it into the registration form.
            {canEditClosed
              ? " As an admin or registrar you can edit closed visits."
              : " Closed visits open read-only; only admins and registrars can edit them."}
          </Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              size="small"
              type="date"
              label="Visit date from"
              InputLabelProps={{ shrink: true }}
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              fullWidth
            />
            <TextField
              size="small"
              type="date"
              label="Visit date to"
              InputLabelProps={{ shrink: true }}
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              fullWidth
            />
            <TextField
              select
              size="small"
              label="Status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              fullWidth
            >
              <MenuItem value="all">All visits</MenuItem>
              <MenuItem value="open">Open</MenuItem>
              <MenuItem value="closed">Closed / discharged</MenuItem>
            </TextField>
            {(dateFrom || dateTo || status !== "all") && (
              <Button
                size="small"
                sx={{ whiteSpace: "nowrap", textTransform: "none" }}
                onClick={() => {
                  setDateFrom("");
                  setDateTo("");
                  setStatus("all");
                }}
              >
                Clear
              </Button>
            )}
          </Stack>
          {error && <Alert severity="error">{error}</Alert>}
          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress size={28} />
            </Box>
          ) : (
            <Box sx={{ maxHeight: 380, overflow: "auto" }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Visit</TableCell>
                    <TableCell>Visit date</TableCell>
                    <TableCell>Location</TableCell>
                    <TableCell>Reason for visit</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} align="center">
                        <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                          {visits.length === 0 ? "This patient has no visits yet." : "No visits match these filters."}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                  {rows.map((v) => {
                    const closed = !isOpen(v);
                    const discharged = closed ? fmtDateTime(new Date(v.discharge_datetime)) : "";
                    return (
                      <TableRow
                        key={v.id}
                        hover
                        selected={v.id === currentRegistrationId}
                        sx={{ cursor: "pointer" }}
                        onClick={() => onSelect(v)}
                      >
                        <TableCell sx={{ fontWeight: 600 }}>{v.visit_number || `#${v.id}`}</TableCell>
                        <TableCell>{fmtDateTime(visitMoment(v))}</TableCell>
                        <TableCell>{v.location_path || v.care_setting || "—"}</TableCell>
                        <TableCell>{v.reason_for_visit || "—"}</TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            color={closed ? "default" : "success"}
                            label={closed ? "Discharged" : "Open"}
                            title={closed ? `Discharged ${discharged}` : undefined}
                          />
                        </TableCell>
                        <TableCell align="right">
                          <Button
                            size="small"
                            variant="outlined"
                            sx={{ textTransform: "none" }}
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelect(v);
                            }}
                          >
                            {v.id === currentRegistrationId ? "Current" : "Select"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Typography variant="caption" color="text.secondary" sx={{ mr: "auto", pl: 2 }}>
          {!loading && `${rows.length} of ${visits.length} visit${visits.length === 1 ? "" : "s"}`}
        </Typography>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

export default VisitSearchDialog;
