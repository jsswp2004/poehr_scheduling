import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { authHeader } from "../patientHeader/headerApi";
import { PatientRecord } from "../../pages/PatientDetailPage";

/** A date and time for the visit table: 10/14/2026 08:30. */
export const fmtDateTime = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}/${p(d.getDate())}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** "Emergency · Scheduled", leaving out the second part when it only repeats the first. */
export const visitType = (v) =>
  [v.care_setting_label, v.admission_type].filter((x, i, a) => x && a.findIndex((y) => y && y.toLowerCase() === x.toLowerCase()) === i).join(" \u00b7 ");

export const visitLabel = (v) => v.visit_number || `Visit #${v.id}`;

const VIEWS = [
  { value: "visit_history", label: "Visit History" },
  { value: "demographics", label: "Demographics & Contacts" },
];

const EMPTY_FILTER = { text: "", care: "" };

const matchesFilter = (v, f) => {
  if (f.care && v.care_setting !== f.care) return false;
  const q = f.text.trim().toLowerCase();
  if (!q) return true;
  return [v.visit_number, v.facility, v.location, v.provider, v.reason, v.admission_type, v.care_setting_label]
    .join(" ")
    .toLowerCase()
    .includes(q);
};

function VisitHistory({ patientId, openVisitId, onOpenVisit }) {
  const [rows, setRows] = useState(null);
  const [failed, setFailed] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [filter, setFilter] = useState(EMPTY_FILTER);
  const [filterOpen, setFilterOpen] = useState(false);
  const [draft, setDraft] = useState(EMPTY_FILTER);
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    let live = true;
    setRows(null);
    setFailed(false);
    setSelectedId(null);
    setFilter(EMPTY_FILTER);
    (async () => {
      try {
        const headers = await authHeader();
        const res = await api.get(apiEndpoints.patientVisits(patientId), { headers });
        if (live) setRows(res.data.visits || []);
      } catch (err) {
        if (live) setFailed(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [patientId]);

  const filtered = useMemo(() => (rows || []).filter((v) => matchesFilter(v, filter)), [rows, filter]);
  const isFiltered = !!(filter.text || filter.care);
  const selected = (rows || []).find((v) => v.id === selectedId) || null;
  // the visit already in use is not offered again
  const inUse = (v) => (openVisitId ? v.id === openVisitId : v.is_current);
  const canOpen = !!selected && !inUse(selected);
  const careOptions = useMemo(() => {
    const seen = new Map();
    (rows || []).forEach((v) => seen.set(v.care_setting, v.care_setting_label));
    return [...seen.entries()];
  }, [rows]);

  if (failed) return <Typography color="error" sx={{ p: 2 }}>Could not load the visit history.</Typography>;
  if (!rows) return <Box sx={{ p: 3, textAlign: "center" }}><CircularProgress size={22} /></Box>;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }} data-testid="visit-history">
      <TableContainer sx={{ flex: 1, minHeight: 0, overflow: "auto", border: 1, borderColor: "divider", borderRadius: 1 }}>
        <Table stickyHeader aria-label="Visit history">
          <TableHead>
            <TableRow>
              <TableCell>Admit/Reg. Date</TableCell>
              <TableCell>Discharge Date</TableCell>
              <TableCell>Type/Care Level</TableCell>
              <TableCell>Facility</TableCell>
              <TableCell>Location</TableCell>
              <TableCell>Provider</TableCell>
              <TableCell>Visit Reason</TableCell>
              <TableCell>Visit ID</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} sx={{ color: "text.secondary" }}>
                  {rows.length === 0 ? "No visits on file." : "No visits match the filter."}
                </TableCell>
              </TableRow>
            )}
            {filtered.map((v) => (
              <TableRow
                key={v.id}
                hover
                selected={v.id === selectedId}
                onClick={() => setSelectedId(v.id)}
                onDoubleClick={() => {
                  setSelectedId(v.id);
                  if (!inUse(v)) onOpenVisit(v);
                }}
                sx={{ cursor: "pointer" }}
                data-testid={`visit-row-${v.id}`}
              >
                <TableCell>{fmtDateTime(v.admit)}</TableCell>
                <TableCell>{v.discharge ? fmtDateTime(v.discharge) : ""}</TableCell>
                <TableCell>{visitType(v)}</TableCell>
                <TableCell>{v.facility}</TableCell>
                <TableCell>{v.location}</TableCell>
                <TableCell>{v.provider}</TableCell>
                <TableCell>{v.reason}</TableCell>
                <TableCell>
                  {visitLabel(v)}
                  {v.id === openVisitId ? (
                    <Chip size="small" color="warning" label="Open" sx={{ ml: 0.75, height: 18 }} />
                  ) : !openVisitId && v.is_current ? (
                    <Chip size="small" color="primary" variant="outlined" label="Current" sx={{ ml: 0.75, height: 18 }} />
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Box sx={{ display: "flex", gap: 1, pt: 1, flexWrap: "wrap", flex: "none" }} data-testid="visit-actions">
        <Button size="small" variant="contained" disabled={!canOpen} onClick={() => onOpenVisit(selected)} data-testid="visit-open">
          Open Visit
        </Button>
        <Button
          size="small"
          variant="outlined"
          onClick={() => {
            setDraft(filter);
            setFilterOpen(true);
          }}
        >
          Filter...
        </Button>
        <Button size="small" variant="outlined" disabled={!isFiltered} onClick={() => setFilter(EMPTY_FILTER)}>
          Clear Filter
        </Button>
        <Button size="small" variant="outlined" disabled={!selected} onClick={() => setDetail(selected)}>
          Details...
        </Button>
      </Box>

      <Dialog open={filterOpen} onClose={() => setFilterOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Filter visits</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "8px !important" }}>
          <TextField
            size="small"
            label="Contains"
            helperText="Visit ID, facility, location, provider or reason"
            value={draft.text}
            onChange={(e) => setDraft({ ...draft, text: e.target.value })}
            autoFocus
          />
          <TextField select size="small" label="Type/Care level" value={draft.care} onChange={(e) => setDraft({ ...draft, care: e.target.value })}>
            <MenuItem value="">All</MenuItem>
            {careOptions.map(([value, label]) => (
              <MenuItem key={value} value={value}>
                {label}
              </MenuItem>
            ))}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFilterOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => {
              setFilter(draft);
              setFilterOpen(false);
            }}
          >
            Apply
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!detail} onClose={() => setDetail(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{detail ? `Visit ${visitLabel(detail)}` : ""}</DialogTitle>
        <DialogContent>
          {detail && (
            <Box sx={{ display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 2, rowGap: 0.5 }}>
              {[
                ["Admitted", fmtDateTime(detail.admit)],
                ["Discharged", detail.discharge ? fmtDateTime(detail.discharge) : "Not discharged"],
                ["Care level", detail.care_setting_label],
                ["Admission type", detail.admission_type],
                ["Facility", detail.facility],
                ["Location", detail.location],
                ["Provider", detail.provider],
                ["Reason", detail.reason],
                ["Diagnoses", detail.diagnoses],
              ].map(([k, val]) => (
                <Box key={k} sx={{ display: "contents" }}>
                  <Typography variant="body2" color="text.secondary">{k}</Typography>
                  <Typography variant="body2">{val || "-"}</Typography>
                </Box>
              ))}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetail(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

/**
 * The Patient Info tab: a list of views on the left, the chosen view on the right.
 * Only views we hold data for are listed. Visit History also lets a visit be opened as the
 * context for the whole chart (`onOpenVisit`).
 */
export default function PatientInfoPanel({ patient, openVisitId = null, onOpenVisit, onOpenNotes }) {
  const [view, setView] = useState("visit_history");
  useEffect(() => {
    setView("visit_history");
  }, [patient.id]);
  const open = useCallback((v) => onOpenVisit(v), [onOpenVisit]);

  return (
    <Box
      sx={{
        display: "flex",
        gap: 1,
        p: 0.5,
        // A fixed-height panel: the Visit History list on the left stays put and the table scrolls inside,
        // so the buttons under the table are always visible.
        height: "calc(100vh - 300px)",
        minHeight: 360,
        overflow: "hidden",
      }}
      data-testid="patient-info-panel"
    >
      <Box sx={{ width: 190, flexShrink: 0, border: 1, borderColor: "divider", borderRadius: 1, alignSelf: "flex-start" }}>
        <List dense disablePadding aria-label="Patient info views">
          {VIEWS.map((x) => (
            <ListItemButton key={x.value} selected={view === x.value} onClick={() => setView(x.value)} data-testid={`pi-view-${x.value}`}>
              <ListItemText primary={x.label} primaryTypographyProps={{ fontSize: "0.85rem" }} />
            </ListItemButton>
          ))}
        </List>
      </Box>
      <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", overflow: view === "visit_history" ? "hidden" : "auto" }}>
        {view === "visit_history" ? (
          <VisitHistory patientId={patient.id} openVisitId={openVisitId} onOpenVisit={open} />
        ) : (
          <PatientRecord key={patient.id} id={patient.id} embedded onOpenNotes={onOpenNotes} />
        )}
      </Box>
    </Box>
  );
}
