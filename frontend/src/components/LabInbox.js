import { useState, useEffect, useCallback } from "react";
import { Link as RouterLink } from "react-router-dom";
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
  FormControlLabel,
  Link,
  MenuItem,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { api } from "../api/client";
import { apiEndpoints } from "../config/api";
import { toast } from "./SimpleToast";
import { ReportItemsTable, authHeader, errorText, fmt, openReportDocument } from "./LabResultsPanel";
import PatientChartHeader from "./patientHeader/PatientChartHeader";
import { readLastPatient } from "./tasks/lastPatient";

/**
 * Results inbox: every lab report waiting for review across the organization,
 * critical values first, then other abnormal results, then the oldest. Any
 * doctor or nurse can review any report here -- the ordering provider, a
 * covering provider or a nurse. "Mine only" narrows it to results for orders
 * you placed. "Patients" narrows it to the patient last selected on the Patients
 * page (their banner shows at the top) or shows everyone's. The server decides who
 * may see and review; this screen shows the list and relays its messages.
 */
function LabInbox() {
  const [data, setData] = useState({ results: [], count: 0, critical: 0, truncated: false });
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [mine, setMine] = useState(false);
  // the last patient picked on the Patients page; the list starts on that patient when there is one
  const [lastPatient] = useState(readLastPatient);
  const [whom, setWhom] = useState(() => (lastPatient ? "patient" : "")); // "" = all patients, or "patient"
  const picked = whom === "patient" ? lastPatient : null; // { id, name }: the patient the banner and list show
  const [open, setOpen] = useState(null); // report being looked at
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState([]); // lab messages that could not be matched to a patient
  const [resolve, setResolve] = useState(null); // { message, mode: "assign" | "dismiss" }
  const [mrn, setMrn] = useState("");
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await authHeader();
      const params = {};
      if (mine) params.mine = 1;
      if (picked) params.patient = picked.id;
      const res = await api.get(apiEndpoints.labReportsInbox, { headers, params });
      setData(res.data);
      setDenied(false);
      window.dispatchEvent(new Event("lab-inbox-changed")); // refreshes the badge on the menu icon
      if (res.data.unmatched > 0 && !picked) {
        try {
          const list = await api.get(apiEndpoints.labMessages, { headers });
          setWaiting(list.data.results || []);
        } catch (err) {
          toast.error(errorText(err, "Could not load results waiting for a patient."));
        }
      } else {
        setWaiting([]);
      }
    } catch (err) {
      if (err?.response?.status === 403) {
        setDenied(true);
      } else {
        toast.error(errorText(err, "Could not load the results inbox."));
      }
    } finally {
      setLoading(false);
    }
  }, [mine, picked]);

  useEffect(() => {
    load();
  }, [load]);

  const openReport = (report) => {
    setNote("");
    setOpen(report);
  };

  const markReviewed = async () => {
    setBusy(true);
    try {
      const headers = await authHeader();
      await api.post(apiEndpoints.labReportAction(open.id, "review"), { comment: note }, { headers });
      toast.success("Marked as reviewed.");
      setOpen(null);
      await load();
    } catch (err) {
      toast.error(errorText(err, "That did not go through."));
    } finally {
      setBusy(false);
    }
  };

  const startResolve = (message, mode) => {
    setMrn("");
    setReason("");
    setResolve({ message, mode });
  };

  const submitResolve = async () => {
    const { message, mode } = resolve;
    setBusy(true);
    try {
      const headers = await authHeader();
      const body = mode === "assign" ? { mrn: mrn.trim() } : { reason: reason.trim() };
      await api.post(apiEndpoints.labMessageAction(message.id, mode), body, { headers });
      toast.success(mode === "assign" ? "Filed to the patient's chart." : "Dismissed.");
      setResolve(null);
      await load();
    } catch (err) {
      toast.error(errorText(err, "That did not go through."));
    } finally {
      setBusy(false);
    }
  };

  const viewDocument = async (report) => {
    try {
      await openReportDocument(report);
    } catch (err) {
      toast.error(errorText(err, "Could not open the document."));
    }
  };

  if (denied) {
    return <Alert severity="info">You do not have access to the lab results inbox.</Alert>;
  }

  return (
    <Box data-testid="lab-inbox">
      {/* the patient banner sits flush at the top, above the heading, as on the Patients page */}
      {picked && (
        <Box data-testid="lab-patient-banner">
          <PatientChartHeader persistent patientId={picked.id} />
        </Box>
      )}

      <Box sx={{ px: 2, pb: 1 }}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 0.5 }} data-testid="lab-toolbar">
          <Typography variant="subtitle1" noWrap sx={{ fontWeight: 600, mr: 1 }}>
            Lab results to review
            {data.count > 0 && <Chip size="small" color="warning" sx={{ ml: 1 }} label={data.count} />}
          </Typography>
          <TextField
            select
            size="small"
            label="Patients"
            value={whom}
            onChange={(e) => setWhom(e.target.value)}
            sx={{ minWidth: 150 }}
            inputProps={{ "data-testid": "lab-filter-patients" }}
          >
            <MenuItem value="">All patients</MenuItem>
            {lastPatient && <MenuItem value="patient">{lastPatient.name || "Selected patient"}</MenuItem>}
          </TextField>
          <FormControlLabel
            control={<Switch size="small" checked={mine} onChange={(e) => setMine(e.target.checked)} />}
            label="Mine only (orders I placed)"
            sx={{ ml: 0.5 }}
          />
          <Box sx={{ flexGrow: 1 }} />
          <Button size="small" onClick={load} disabled={loading}>
            Refresh
          </Button>
        </Stack>

        {!picked && waiting.length > 0 && (
          <Paper variant="outlined" data-testid="lab-unmatched" sx={{ p: 1.5, mb: 2, borderColor: "warning.main", borderWidth: 2 }}>
            <Typography variant="subtitle1" sx={{ mb: 0.5 }}>
              Results waiting for a patient ({waiting.length})
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              These arrived from the lab but could not be matched safely to one patient, so they are not in any chart yet. Check the name and
              date of birth, then file each to the right patient by MRN, or dismiss it.
            </Typography>
            <Stack spacing={1}>
              {waiting.map((m) => (
                <Paper key={m.id} variant="outlined" data-testid={`unmatched-${m.id}`} sx={{ p: 1 }}>
                  <Stack direction={{ xs: "column", md: "row" }} spacing={1} justifyContent="space-between" alignItems={{ md: "center" }}>
                    <Box>
                      <Typography variant="subtitle2">{m.patient_hint || "No patient details"}</Typography>
                      <Typography variant="caption" color="text.secondary" display="block">
                        {[m.lab, `Received ${fmt(m.received_at)}`].filter(Boolean).join(" · ")}
                      </Typography>
                      <Typography variant="caption" color="warning.dark" display="block">
                        {m.detail}
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={0.5}>
                      <Button size="small" variant="contained" onClick={() => startResolve(m, "assign")}>
                        Assign to patient
                      </Button>
                      <Button size="small" onClick={() => startResolve(m, "dismiss")}>
                        Dismiss
                      </Button>
                    </Stack>
                  </Stack>
                </Paper>
              ))}
            </Stack>
          </Paper>
        )}

        {data.critical > 0 && (
          <Alert severity="error" sx={{ mb: 1 }}>
            {data.critical === 1 ? "1 critical result is" : `${data.critical} critical results are`} waiting for review.
          </Alert>
        )}
        {data.truncated && (
          <Alert severity="info" sx={{ mb: 1 }}>
            Showing the {data.results.length} most urgent of {data.count}. Review some to see the rest.
          </Alert>
        )}

        {loading ? (
          <Box sx={{ p: 4, textAlign: "center" }}>
            <CircularProgress size={28} />
          </Box>
        ) : data.results.length === 0 ? (
          <Paper variant="outlined" sx={{ p: 3 }}>
            <Typography color="text.secondary">
              {mine ? "Nothing waiting on your orders." : picked ? `Nothing waiting for review for ${picked.name || "this patient"}.` : "Nothing waiting for review."}
            </Typography>
          </Paper>
        ) : (
          <Stack spacing={1}>
            {data.results.map((report) => (
              <Paper
                key={report.id}
                variant="outlined"
                data-testid={`inbox-row-${report.id}`}
                sx={{ p: 1.5, borderColor: report.has_critical ? "error.main" : undefined, borderWidth: report.has_critical ? 2 : 1 }}
              >
                <Stack direction={{ xs: "column", md: "row" }} spacing={1} justifyContent="space-between" alignItems={{ md: "center" }}>
                  <Box>
                    <Typography variant="subtitle2">
                      <Link component={RouterLink} to={`/patients/${report.patient}/orders`} underline="hover">
                        {report.patient_name}
                      </Link>
                      {" — "}
                      {report.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {[
                        report.performing_lab,
                        report.resulted_at ? `Resulted ${fmt(report.resulted_at)}` : "",
                        report.order_name ? `Order: ${report.order_name}` : "",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
                    {report.has_critical && <Chip size="small" color="error" label="Critical value" />}
                    {report.has_abnormal && !report.has_critical && <Chip size="small" color="warning" variant="outlined" label="Abnormal" />}
                    {report.source === "scan" && <Chip size="small" variant="outlined" label="Scanned document" />}
                    <Button size="small" variant="contained" onClick={() => openReport(report)}>
                      Review
                    </Button>
                  </Stack>
                </Stack>
              </Paper>
            ))}
          </Stack>
        )}

      </Box>

      <Dialog open={!!resolve} onClose={() => !busy && setResolve(null)} fullWidth maxWidth="xs">
        {resolve && (
          <>
            <DialogTitle>{resolve.mode === "assign" ? "Assign to a patient" : "Dismiss this result"}</DialogTitle>
            <DialogContent>
              <Stack spacing={2} sx={{ pt: 1 }}>
                <Typography variant="body2">
                  The lab sent: <strong>{resolve.message.patient_hint || "no patient details"}</strong>
                </Typography>
                {resolve.mode === "assign" ? (
                  <TextField
                    autoFocus
                    size="small"
                    label="Patient MRN"
                    value={mrn}
                    onChange={(e) => setMrn(e.target.value)}
                    helperText="Confirm the name and date of birth on the chart match before filing."
                  />
                ) : (
                  <TextField
                    autoFocus
                    size="small"
                    multiline
                    minRows={2}
                    label="Why is it being dismissed?"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                )}
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button disabled={busy} onClick={() => setResolve(null)}>
                Cancel
              </Button>
              <Button
                variant="contained"
                disabled={busy || (resolve.mode === "assign" ? !mrn.trim() : !reason.trim())}
                onClick={submitResolve}
              >
                {resolve.mode === "assign" ? "File to chart" : "Dismiss"}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      <Dialog open={!!open} onClose={() => !busy && setOpen(null)} fullWidth maxWidth="md">
        {open && (
          <>
            <DialogTitle>
              {open.patient_name} — {open.title}
            </DialogTitle>
            <DialogContent>
              <Stack spacing={2}>
                <Typography variant="caption" color="text.secondary">
                  {[open.performing_lab, open.collected_at ? `Collected ${fmt(open.collected_at)}` : "", open.resulted_at ? `Resulted ${fmt(open.resulted_at)}` : ""]
                    .filter(Boolean)
                    .join(" · ")}
                </Typography>
                {open.has_critical && <Alert severity="error">This report has a critical value.</Alert>}
                {open.items.length > 0 ? (
                  <ReportItemsTable items={open.items} />
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    Scanned document. No values have been typed in. Open the document to read it.
                  </Typography>
                )}
                {open.comment && <Typography variant="body2">{open.comment}</Typography>}
                {open.has_file && (
                  <Box>
                    <Button size="small" variant="outlined" onClick={() => viewDocument(open)}>
                      View document
                    </Button>
                  </Box>
                )}
                <TextField
                  multiline
                  minRows={2}
                  size="small"
                  label="Note (optional), e.g. patient called, repeat ordered"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button disabled={busy} onClick={() => setOpen(null)}>
                Close
              </Button>
              <Button variant="contained" disabled={busy} onClick={markReviewed}>
                Mark reviewed
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
}

export default LabInbox;
