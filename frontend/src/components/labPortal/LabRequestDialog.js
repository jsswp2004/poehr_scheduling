import { useCallback, useEffect, useState } from "react";
import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider,
  FormControlLabel, Grid, IconButton, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField,
  Tooltip, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { toast } from "react-toastify";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { FLAG_OPTIONS, LAB_STATUS_COLOR, authHeader, errorText, fmtDateTime, staffLicenseWord } from "./labShared";

/** The ordering provider's license as the server sends it: {prc} (PH) or {npi, license} (US); a plain string is shown as is. */
export const providerLicense = (lic) => {
  if (!lic) return "";
  if (typeof lic === "string") return lic;
  return [lic.prc && `PRC ${lic.prc}`, lic.npi && `NPI ${lic.npi}`, lic.license && `License ${lic.license}`].filter(Boolean).join(" · ");
};

export const WORKER_ROLES = ["ext_lab_tech", "ext_lab_pathologist"];
const RESULT_STATUSES = ["collected", "in_process", "preliminary", "final"];
const BLANK_LINE = { test_name: "", value: "", units: "", reference_range: "", abnormal_flag: "" };

const linesFrom = (item) => {
  const saved = (item.draft && item.draft.items) || [];
  return saved.length ? saved.map((l) => ({ ...BLANK_LINE, ...l })) : [{ ...BLANK_LINE, test_name: item.name }];
};

/** One test's result lines: analyte, value, units, reference range and flag. */
function ResultLines({ item, lines, onChange, disabled }) {
  const set = (i, key) => (e) => onChange(lines.map((l, j) => (j === i ? { ...l, [key]: e.target.value } : l)));
  return (
    <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5 }} data-testid={`lab-results-${item.id}`}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <Typography variant="subtitle2">{item.name}</Typography>
        {item.code && <Typography variant="caption" color="text.secondary">{item.code_system} {item.code}</Typography>}
        <Chip size="small" label={item.status} />
        {item.draft_saved_at && <Typography variant="caption" color="text.secondary">saved {fmtDateTime(item.draft_saved_at)}</Typography>}
      </Stack>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Test</TableCell>
            <TableCell>Value</TableCell>
            <TableCell>Units</TableCell>
            <TableCell>Reference range</TableCell>
            <TableCell>Flag</TableCell>
            <TableCell />
          </TableRow>
        </TableHead>
        <TableBody>
          {lines.map((l, i) => (
            <TableRow key={i}>
              <TableCell><TextField size="small" variant="standard" value={l.test_name} onChange={set(i, "test_name")} disabled={disabled} inputProps={{ "data-testid": `line-name-${item.id}-${i}` }} /></TableCell>
              <TableCell><TextField size="small" variant="standard" value={l.value} onChange={set(i, "value")} disabled={disabled} inputProps={{ "data-testid": `line-value-${item.id}-${i}` }} /></TableCell>
              <TableCell><TextField size="small" variant="standard" value={l.units} onChange={set(i, "units")} disabled={disabled} sx={{ width: 80 }} /></TableCell>
              <TableCell><TextField size="small" variant="standard" value={l.reference_range} onChange={set(i, "reference_range")} disabled={disabled} sx={{ width: 110 }} /></TableCell>
              <TableCell>
                <TextField select size="small" variant="standard" value={l.abnormal_flag || ""} onChange={set(i, "abnormal_flag")} disabled={disabled} sx={{ width: 120 }}
                  SelectProps={{ "data-testid": `line-flag-${item.id}-${i}` }}>
                  {FLAG_OPTIONS.map((f) => <MenuItem key={f.value} value={f.value}>{f.label}</MenuItem>)}
                </TextField>
              </TableCell>
              <TableCell>
                <IconButton size="small" aria-label="Remove line" disabled={disabled || lines.length === 1} onClick={() => onChange(lines.filter((_, j) => j !== i))}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {!disabled && (
        <Button size="small" startIcon={<AddIcon />} onClick={() => onChange([...lines, { ...BLANK_LINE }])} sx={{ mt: 0.5 }}>Add a line</Button>
      )}
    </Paper>
  );
}

/**
 * One lab request in the partner lab's portal: who and what, then the lab's steps (accept, decline, collect, start,
 * recollect), result entry per test, the signed PDF, the critical-value call log and release (preliminary or final).
 * The server enforces every rule; this shows the right buttons and relays its messages.
 */
export default function LabRequestDialog({ open, requestId, me, onClose, onChanged }) {
  const [req, setReq] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState({}); // { [itemId]: [line, ...] }
  const [ask, setAsk] = useState(null); // { action: decline|recollect|collect }
  const [reason, setReason] = useState("");
  const [accession, setAccession] = useState("");
  const [specimenNote, setSpecimenNote] = useState("");
  const [call, setCall] = useState({ called_name: "", called_number: "", read_back_confirmed: false });
  const [reading, setReading] = useState(false);
  const [filledFromPdf, setFilledFromPdf] = useState(false);

  const role = me?.user?.role || "";
  const isWorker = WORKER_ROLES.includes(role);
  const canRelease = isWorker && !!me?.user?.can_release;
  const country = req?.country || me?.lab?.country || "PH";

  const show = useCallback((data) => {
    setReq(data);
    setFilledFromPdf(false);
    const next = {};
    (data.items || []).forEach((i) => { next[i.id] = linesFrom(i); });
    setLines(next);
  }, []);

  const load = useCallback(async () => {
    if (!requestId) return;
    setError("");
    try {
      const res = await api.get(apiEndpoints.labPortalRequest(requestId), { headers: await authHeader() });
      show(res.data);
    } catch (err) {
      setError(errorText(err, "Could not load the lab request."));
    }
  }, [requestId, show]);

  useEffect(() => {
    if (open) {
      setReq(null);
      setAsk(null);
      load();
    }
  }, [open, load]);

  const run = async (fn, ok) => {
    setBusy(true);
    setError("");
    try {
      const res = await fn();
      if (res?.data?.id) show(res.data);
      else await load();
      if (ok) toast.success(ok);
      onChanged && onChanged();
      return true;
    } catch (err) {
      setError(errorText(err, "That did not work."));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const act = async (action, extra = {}, ok = "") => {
    const done = await run(async () => api.post(apiEndpoints.labPortalAction(req.id), { action, ...extra }, { headers: await authHeader() }), ok);
    if (done) {
      setAsk(null);
      setReason("");
    }
  };

  const saveResults = () => run(async () => api.post(apiEndpoints.labPortalResults(req.id), {
    // a test with no value entered yet is left out, so the ready tests can be saved (and released as preliminary);
    // once any value is entered, every line with a name or value goes, and the server checks them all
    items: (req.items || []).filter((i) => i.status !== "cancelled")
      .filter((i) => (lines[i.id] || []).some((l) => String(l.value ?? "").trim()))
      .map((i) => ({
        item: i.id,
        results: (lines[i.id] || []).filter((l) => String(l.test_name).trim() || String(l.value ?? "").trim()),
      })),
  }, { headers: await authHeader() }), "Results saved. They are not sent to the clinic until you release them.");

  // Read the values out of the attached PDF into the form. Nothing is saved: the person checks them, then saves.
  const readPdf = async () => {
    setReading(true);
    setError("");
    try {
      const res = await api.post(apiEndpoints.labPortalReportFileRead(req.id), {}, { headers: await authHeader() });
      const found = res.data?.items || [];
      if (!found.length) {
        toast.info("No values for these tests were found in the PDF. Enter them by hand.");
        return;
      }
      setLines((all) => {
        const next = { ...all };
        found.forEach((f) => { next[f.item] = f.results.map((l) => ({ ...BLANK_LINE, ...l })); });
        return next;
      });
      setFilledFromPdf(true);
    } catch (err) {
      const msg = errorText(err, "Could not read the PDF. Enter the values by hand.");
      setError(msg);
      toast.error(msg); // the error banner is at the top of the dialog, out of sight down here
    } finally {
      setReading(false);
    }
  };

  const uploadPdf = async (file) => {
    if (!file) return;
    const body = new FormData();
    body.append("file", file);
    const done = await run(async () => api.post(apiEndpoints.labPortalReportFile(req.id), body, { headers: await authHeader() }), "Signed report attached.");
    if (done && req.can_read_pdf) await readPdf();
  };

  const viewPdf = async () => {
    try {
      const res = await api.get(apiEndpoints.labPortalReportFileView(req.id), { headers: await authHeader(), responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      toast.error(errorText(err, "Could not open the report."));
    }
  };

  const logCall = async () => {
    const done = await run(async () => api.post(apiEndpoints.labPortalCriticalCall(req.id), call, { headers: await authHeader() }), "Critical value call logged.");
    if (done) setCall({ called_name: "", called_number: "", read_back_confirmed: false });
  };

  const release = (status) => run(async () => api.post(apiEndpoints.labPortalRelease(req.id), { status }, { headers: await authHeader() }),
    status === "final" ? "Final results released to the clinic." : "Preliminary results released to the clinic.");

  const status = req?.status;
  const canEnter = isWorker && RESULT_STATUSES.includes(status);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth data-testid="lab-request-dialog">
      <DialogTitle>
        {req ? (
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <span>Lab request {req.number}</span>
            <Chip size="small" color={LAB_STATUS_COLOR[req.status] || "default"} label={req.status_label} data-testid="lab-request-status" />
            {req.priority === "stat" && <Chip size="small" color="error" label="STAT" />}
            {req.fasting_required && <Chip size="small" variant="outlined" label="Fasting" />}
            {req.how === "claimed" && <Chip size="small" variant="outlined" label="Walk-in (claimed)" />}
          </Stack>
        ) : "Lab request"}
      </DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 1.5 }} data-testid="lab-request-error">{error}</Alert>}
        {!req && !error && <CircularProgress size={24} />}
        {req && (
          <Stack spacing={2}>
            {status === "cancelled" && <Alert severity="error">The clinic cancelled this request. Do not collect. {req.cancel_reason}</Alert>}
            {status === "declined" && <Alert severity="warning">Declined: {req.decline_reason}</Alert>}
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 4 }}>
                <Typography variant="overline">Patient</Typography>
                <Typography variant="body1" fontWeight={600} data-testid="lab-request-patient">{req.patient.name}</Typography>
                <Typography variant="body2" color="text.secondary">
                  Born {req.patient.birthdate || "?"}{req.patient.age != null ? ` (${req.patient.age} y)` : ""}{req.patient.sex ? ` · ${req.patient.sex}` : ""}
                </Typography>
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <Typography variant="overline">Ordered by</Typography>
                <Typography variant="body2">{req.provider}{providerLicense(req.provider_license) ? ` · ${providerLicense(req.provider_license)}` : ""}</Typography>
                <Typography variant="body2" color="text.secondary">{req.clinic}{req.clinic_phone ? ` · ${req.clinic_phone}` : ""}</Typography>
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <Typography variant="overline">Collection</Typography>
                <Typography variant="body2">{req.collection_label}{req.location ? ` · ${req.location}` : ""}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {req.care_setting === "inpatient" ? "Inpatient" : "Outpatient"}{req.collect_by ? ` · collect by ${fmtDateTime(req.collect_by)}` : ""}
                </Typography>
              </Grid>
            </Grid>
            {req.note_to_lab && <Alert severity="info" icon={false}>Note from the clinic: {req.note_to_lab}</Alert>}

            <Box>
              <Typography variant="overline">Tests</Typography>
              {(req.items || []).map((i) => (
                <Typography key={i.id} variant="body2">
                  {i.name} <Typography component="span" variant="caption" color="text.secondary">{i.order_number}{i.indication ? ` · ${i.indication}` : ""}{i.diagnoses.length ? ` · Dx ${i.diagnoses.map((d) => d.code || d).join(", ")}` : ""}</Typography>
                </Typography>
              ))}
            </Box>

            {req.collected_at && (
              <Typography variant="body2" color="text.secondary">
                Collected {fmtDateTime(req.collected_at)} by {req.collected_by_name}{req.accession_number ? ` · accession ${req.accession_number}` : ""}{req.specimen_note ? ` · ${req.specimen_note}` : ""}
              </Typography>
            )}
            {!req.collected_at && req.specimen_note && <Alert severity="warning">{req.specimen_note}</Alert>}

            {isWorker && ["new", "accepted"].includes(status) && (
              <Stack direction="row" spacing={1}>
                {status === "new" && <Button variant="contained" disabled={busy} onClick={() => act("accept", {}, "Accepted.")} data-testid="lab-accept">Accept</Button>}
                <Button variant={status === "accepted" ? "contained" : "outlined"} disabled={busy} onClick={() => { setAccession(""); setSpecimenNote(""); setAsk({ action: "collect" }); }} data-testid="lab-collect">Specimen collected</Button>
                <Button color="error" disabled={busy} onClick={() => { setReason(""); setAsk({ action: "decline" }); }} data-testid="lab-decline">Decline</Button>
              </Stack>
            )}
            {isWorker && ["collected", "in_process"].includes(status) && (
              <Stack direction="row" spacing={1}>
                {status === "collected" && <Button variant="outlined" disabled={busy} onClick={() => act("start", {}, "Processing.")} data-testid="lab-start">Start processing</Button>}
                <Button color="warning" disabled={busy} onClick={() => { setReason(""); setAsk({ action: "recollect" }); }} data-testid="lab-recollect">Reject specimen (recollect)</Button>
              </Stack>
            )}

            {canEnter && (
              <>
                <Divider />
                <Typography variant="subtitle1">Results</Typography>
                {(req.items || []).filter((i) => i.status !== "cancelled").map((i) => (
                  <ResultLines key={i.id} item={i} lines={lines[i.id] || []} disabled={busy} onChange={(next) => setLines((all) => ({ ...all, [i.id]: next }))} />
                ))}
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                  <Button variant="outlined" disabled={busy} onClick={saveResults} data-testid="lab-save-results">Save results</Button>
                  <Button component="label" disabled={busy} data-testid="lab-upload-pdf">
                    {req.report_file ? "Replace signed PDF" : "Attach signed PDF"}
                    <input hidden type="file" accept="application/pdf" onChange={(e) => uploadPdf(e.target.files && e.target.files[0])} />
                  </Button>
                  {req.report_file && (
                    <Button size="small" onClick={viewPdf} data-testid="lab-view-pdf">{req.report_file.file_name}</Button>
                  )}
                  {req.report_file && req.can_read_pdf && (
                    <Button size="small" variant="outlined" disabled={busy || reading} onClick={readPdf} data-testid="lab-read-pdf"
                      startIcon={reading ? <CircularProgress size={14} /> : null}>
                      {reading ? "Reading the PDF..." : "Fill values from PDF"}
                    </Button>
                  )}
                </Stack>
                {filledFromPdf && (
                  <Alert severity="warning" data-testid="lab-pdf-filled">
                    Values filled in from the PDF. Check every value, unit and flag against the report, then Save results. Nothing is saved or sent yet.
                  </Alert>
                )}

                {req.has_critical && (
                  <Paper variant="outlined" sx={{ p: 1.5, borderColor: "error.main" }} data-testid="lab-critical">
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                      <WarningAmberIcon color="error" />
                      <Typography variant="subtitle2" color="error">Critical value: call the clinic before you release</Typography>
                    </Stack>
                    <Typography variant="body2" sx={{ mb: 1 }}>
                      Call {req.provider} or the clinic ({req.clinic_phone || "number on the request"}), give the value, and have them read it back.
                      {country === "PH" ? " In the Philippines a pathologist releases a critical result." : ""}
                    </Typography>
                    {(req.critical_calls || []).map((c, n) => (
                      <Typography key={n} variant="body2" color="text.secondary">
                        Called {c.called_name}{c.called_number ? ` (${c.called_number})` : ""} at {fmtDateTime(c.called_at)}, read back confirmed, by {c.called_by}
                      </Typography>
                    ))}
                    {isWorker && (
                      <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }} sx={{ mt: 1 }}>
                        <TextField size="small" label="Who took the call" value={call.called_name} onChange={(e) => setCall({ ...call, called_name: e.target.value })} inputProps={{ "data-testid": "call-name" }} />
                        <TextField size="small" label="Number called" value={call.called_number} onChange={(e) => setCall({ ...call, called_number: e.target.value })} />
                        <FormControlLabel control={<Checkbox checked={call.read_back_confirmed} onChange={(e) => setCall({ ...call, read_back_confirmed: e.target.checked })} inputProps={{ "data-testid": "call-readback" }} />} label="They read the value back" />
                        <Button variant="outlined" color="error" disabled={busy || !call.called_name.trim() || !call.read_back_confirmed} onClick={logCall} data-testid="call-log">Log the call</Button>
                      </Stack>
                    )}
                  </Paper>
                )}

                <Stack direction="row" spacing={1} alignItems="center">
                  <Tooltip title={canRelease ? "" : "Your lab administrator has not set you up to release results"}>
                    <span>
                      <Button variant="outlined" disabled={busy || !canRelease} onClick={() => release("preliminary")} data-testid="lab-release-prelim">Release preliminary</Button>
                    </span>
                  </Tooltip>
                  <Tooltip title={canRelease ? "Every test needs results and the signed PDF" : "Your lab administrator has not set you up to release results"}>
                    <span>
                      <Button variant="contained" color="success" disabled={busy || !canRelease} onClick={() => release("final")} data-testid="lab-release-final">Release final</Button>
                    </span>
                  </Tooltip>
                  {req.released_at && <Typography variant="caption" color="text.secondary">Last released {fmtDateTime(req.released_at)} by {req.released_by_name}</Typography>}
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  Released results go straight to the ordering provider's POWER inbox. A change after a final release goes out as a corrected result.
                  Releasing needs a {staffLicenseWord(country)} on file.
                </Typography>
              </>
            )}

            {(req.events || []).length > 0 && (
              <Box>
                <Divider sx={{ mb: 1 }} />
                <Typography variant="overline">History</Typography>
                {req.events.map((e, n) => (
                  <Typography key={n} variant="caption" display="block" color="text.secondary">
                    {fmtDateTime(e.at)} · {e.type.replace(/_/g, " ")}{e.by ? ` · ${e.by}` : ""}
                  </Typography>
                ))}
              </Box>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Close</Button></DialogActions>

      <Dialog open={!!ask} onClose={() => setAsk(null)} maxWidth="xs" fullWidth>
        <DialogTitle>
          {ask?.action === "decline" ? "Decline this lab request" : ask?.action === "recollect" ? "Reject the specimen" : "Specimen collected"}
        </DialogTitle>
        <DialogContent dividers>
          {ask?.action === "collect" ? (
            <Stack spacing={1.5}>
              <TextField size="small" label="Accession / specimen number" value={accession} onChange={(e) => setAccession(e.target.value)} inputProps={{ "data-testid": "collect-accession" }} />
              <TextField size="small" label="Specimen note (optional)" value={specimenNote} onChange={(e) => setSpecimenNote(e.target.value)} />
            </Stack>
          ) : (
            <TextField autoFocus fullWidth multiline minRows={2} size="small"
              label={ask?.action === "decline" ? "Reason (the provider sees it)" : "Why (hemolyzed, clotted, not enough...)"}
              value={reason} onChange={(e) => setReason(e.target.value)} inputProps={{ "data-testid": "ask-reason" }} />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAsk(null)}>Back</Button>
          {ask?.action === "collect" ? (
            <Button variant="contained" disabled={busy} onClick={() => act("collect", { accession_number: accession, specimen_note: specimenNote }, "Specimen collected.")} data-testid="ask-confirm">Save</Button>
          ) : (
            <Button variant="contained" color="error" disabled={busy || !reason.trim()} onClick={() => act(ask.action, { reason }, ask.action === "decline" ? "Declined. The provider was told." : "Specimen rejected. The clinic and patient were told.")} data-testid="ask-confirm">
              {ask?.action === "decline" ? "Decline" : "Reject specimen"}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
