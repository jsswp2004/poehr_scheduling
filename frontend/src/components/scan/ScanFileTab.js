import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  DialogActions,
  DialogContent,
  IconButton,
  LinearProgress,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import DocumentScannerIcon from "@mui/icons-material/DocumentScanner";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import { AgentMissingError, agentStatus, listScanners, runScan } from "./scanAgent";
import { fileScan, loadScanVisits } from "./scanApi";
import PatientVisitPicker from "./PatientVisitPicker";

const DEFAULT_SETTINGS = { source: "adf", sides: "two", color: "gray", dpi: "300" };

const errorOf = (err, fallback) => err?.response?.data?.detail || err?.message || fallback;

/**
 * The "Scan file" tab: connect to the scanner on this computer, confirm who and which visit the
 * scan is for (defaults to the open chart), press Scan, and the finished PDF is filed to
 * Results automatically.
 *
 *   patientId        the open chart's patient (the default MRN)
 *   defaultVisitId   the visit being charted (the default Visit ID), if known
 *   onFiled(report)  called after the scan is filed, so Results can refresh
 *   onClose()        close the dialog
 *   onViewResults()  close the dialog and show the new row (defaults to onClose)
 */
export default function ScanFileTab({ patientId, defaultVisitId = null, onFiled, onClose, onViewResults }) {
  const [agent, setAgent] = useState("idle"); // idle | connecting | connected | missing | error
  const [agentError, setAgentError] = useState("");
  const [scanners, setScanners] = useState([]);
  const [scannerId, setScannerId] = useState("");
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [title, setTitle] = useState("");
  const [context, setContext] = useState({ patient: null, visit: null });
  const [target, setTarget] = useState({ patient: null, visit: null });
  const [phase, setPhase] = useState("idle"); // idle | scanning | filing | filed | error
  const [pages, setPages] = useState(0);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(null); // { blob, pages } scanned but not yet filed (kept so a failed filing is not lost)
  const [duplicate, setDuplicate] = useState(false);
  const [filed, setFiled] = useState(null);
  const cancelled = useRef(false);
  const jobRef = useRef(null);

  // The open chart's patient and visit: the defaults for the two pickers.
  useEffect(() => {
    if (!patientId) return undefined;
    let alive = true;
    loadScanVisits(patientId)
      .then(({ patient, visits }) => {
        if (!alive || !patient) return;
        const visit = visits.find((v) => v.id === defaultVisitId) || visits[0] || null;
        setContext({ patient, visit });
        setTarget({ patient, visit });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [patientId, defaultVisitId]);

  const connect = useCallback(async () => {
    setAgent("connecting");
    setAgentError("");
    try {
      await agentStatus();
      const list = await listScanners();
      setScanners(list);
      setScannerId((current) => (list.some((s) => s.id === current) ? current : list[0]?.id || ""));
      setAgent("connected");
    } catch (err) {
      if (err instanceof AgentMissingError) {
        setAgent("missing");
      } else {
        setAgent("error");
        setAgentError(errorOf(err, "Could not list the scanners."));
      }
    }
  }, []);

  // Look for the agent as soon as the tab opens.
  useEffect(() => {
    connect();
  }, [connect]);

  const setSetting = (key) => (e) => setSettings((s) => ({ ...s, [key]: e.target.value }));
  const scanner = scanners.find((s) => s.id === scannerId);
  // A patient is required; a visit is picked for them automatically when they have any.
  const ready = agent === "connected" && !!scannerId && !!target.patient;
  const busy = phase === "scanning" || phase === "filing";

  const file = async (scan, allowDuplicate = false) => {
    setPhase("filing");
    setError("");
    setDuplicate(false);
    try {
      const report = await fileScan({
        blob: scan.blob,
        patientId: target.patient.id,
        visitId: target.visit?.id,
        title,
        allowDuplicate,
        scanMeta: {
          method: "scanner",
          device: scanner?.name,
          source: settings.source,
          sides: settings.sides,
          color: settings.color,
          dpi: Number(settings.dpi),
          pages: scan.pages,
        },
      });
      setPending(null);
      setFiled({ report, patient: target.patient, visit: target.visit, pages: scan.pages, size: scan.blob.size });
      setPhase("filed");
      if (onFiled) onFiled(report);
    } catch (err) {
      setPending(scan);
      setPhase("error");
      if (err?.response?.status === 409) {
        setDuplicate(true);
        setError("This exact scan was already filed for this patient.");
      } else {
        setError(errorOf(err, "The scan finished but could not be filed to Results."));
      }
    }
  };

  const start = async () => {
    cancelled.current = false;
    setPhase("scanning");
    setPages(0);
    setError("");
    setPending(null);
    try {
      const result = await runScan(
        { scannerId, ...settings, dpi: Number(settings.dpi) },
        {
          onJob: (id) => (jobRef.current = id),
          onProgress: (info) => setPages(info.pages || 0),
          isCancelled: () => cancelled.current,
        }
      );
      if (result.cancelled) {
        setPhase("idle");
        setPages(0);
        return;
      }
      await file(result);
    } catch (err) {
      setPhase("error");
      setError(err instanceof AgentMissingError ? "Lost contact with the scanner agent. Nothing was filed." : errorOf(err, "The scan failed. Nothing was filed."));
    }
  };

  const cancel = () => {
    cancelled.current = true;
  };

  const another = () => {
    setPhase("idle");
    setPages(0);
    setFiled(null);
    setTitle("");
    setError("");
  };

  const status = {
    connected: { color: "success.main", text: "Connected · POWER Scan Agent" },
    connecting: { color: "text.secondary", text: "Connecting…" },
    missing: { color: "text.secondary", text: "Not connected" },
    error: { color: "error.main", text: "Scanner problem" },
    idle: { color: "text.secondary", text: "Not connected" },
  }[agent];

  return (
    <>
      <DialogContent>
        <Stack direction={{ xs: "column", md: "row" }} spacing={3} sx={{ mt: 0.5 }}>
          <Stack spacing={2.5} sx={{ flex: 1, minWidth: 0 }}>
            {phase === "filed" && filed ? (
              <Alert severity="success" icon={<CheckCircleIcon />} role="status">
                <Typography fontWeight={700}>Filed to Results</Typography>
                <Typography variant="body2">
                  {filed.pages} page{filed.pages === 1 ? "" : "s"} · PDF · {Math.max(1, Math.round(filed.size / 1024))} KB ·{" "}
                  {filed.patient.name} · {filed.patient.mrn}
                  {filed.visit ? ` · ${filed.visit.code}` : ""}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  The report is marked not yet reviewed and the scan is recorded in the audit trail.
                </Typography>
              </Alert>
            ) : (
              <>
                <Box component="fieldset" sx={{ border: 0, p: 0, m: 0 }} disabled={busy}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                    <Typography component="legend" variant="subtitle2" fontWeight={700}>
                      1 · Scanner
                    </Typography>
                    <Typography variant="caption" sx={{ color: status.color, fontWeight: 500 }}>
                      ● {status.text}
                    </Typography>
                  </Stack>
                  {agent === "connecting" && (
                    <Stack direction="row" spacing={1} alignItems="center">
                      <CircularProgress size={16} />
                      <Typography variant="body2">Looking for scanners on this computer…</Typography>
                    </Stack>
                  )}
                  {(agent === "missing" || agent === "idle") && (
                    <Alert severity="warning" action={<Button size="small" onClick={connect}>Retry</Button>}>
                      <strong>POWER Scan Agent was not found on this computer.</strong> Scanning needs a small helper program that talks to
                      the scanner. Ask IT to install it, make sure the scanner is on and plugged in, then select Retry. You can still use
                      Attach file.
                    </Alert>
                  )}
                  {agent === "error" && (
                    <Alert severity="error" action={<Button size="small" onClick={connect}>Retry</Button>}>
                      {agentError}
                    </Alert>
                  )}
                  {agent === "connected" && !scanners.length && (
                    <Alert severity="warning" action={<Button size="small" onClick={connect}>Refresh</Button>}>
                      The agent is running but no scanner was found. Check that the scanner is on and plugged in.
                    </Alert>
                  )}
                  {agent === "connected" && scanners.length > 0 && (
                    <Stack spacing={1.5}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <TextField select size="small" fullWidth label="Scanner" value={scannerId} onChange={(e) => setScannerId(e.target.value)}>
                          {scanners.map((s) => (
                            <MenuItem key={s.id} value={s.id}>
                              {s.name}
                              {s.connection ? ` · ${s.connection}` : ""}
                            </MenuItem>
                          ))}
                        </TextField>
                        <Tooltip title="Refresh scanner list">
                          <IconButton aria-label="Refresh scanner list" onClick={connect}>
                            <RefreshIcon />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 1.5 }}>
                        <TextField select size="small" label="Source" value={settings.source} onChange={setSetting("source")}>
                          <MenuItem value="adf">Document feeder</MenuItem>
                          <MenuItem value="flatbed">Flatbed glass</MenuItem>
                        </TextField>
                        <TextField select size="small" label="Sides" value={settings.sides} onChange={setSetting("sides")}>
                          <MenuItem value="one">One-sided</MenuItem>
                          <MenuItem value="two">Two-sided</MenuItem>
                        </TextField>
                        <TextField select size="small" label="Color" value={settings.color} onChange={setSetting("color")}>
                          <MenuItem value="gray">Grayscale</MenuItem>
                          <MenuItem value="color">Color</MenuItem>
                          <MenuItem value="bw">Black and white</MenuItem>
                        </TextField>
                        <TextField select size="small" label="Resolution" value={settings.dpi} onChange={setSetting("dpi")}>
                          <MenuItem value="200">200 dpi</MenuItem>
                          <MenuItem value="300">300 dpi</MenuItem>
                          <MenuItem value="600">600 dpi</MenuItem>
                        </TextField>
                      </Box>
                    </Stack>
                  )}
                </Box>

                <Box component="fieldset" sx={{ border: 0, p: 0, m: 0 }} disabled={busy}>
                  <Typography component="legend" variant="subtitle2" fontWeight={700}>
                    2 · File to
                  </Typography>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                    Defaults to the open chart. Type to search by MRN or name.
                  </Typography>
                  {context.patient ? (
                    <PatientVisitPicker value={target} onChange={setTarget} context={context} disabled={busy} />
                  ) : (
                    <Stack direction="row" spacing={1} alignItems="center">
                      <CircularProgress size={16} />
                      <Typography variant="body2">Loading the open chart…</Typography>
                    </Stack>
                  )}
                  <TextField
                    size="small"
                    fullWidth
                    sx={{ mt: 1.5 }}
                    label="Title (optional)"
                    placeholder="Defaults to Scan + date"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </Box>
              </>
            )}

            {phase === "error" && (
              <Alert
                severity="error"
                role="alert"
                action={
                  pending ? (
                    duplicate ? (
                      <Button size="small" color="inherit" onClick={() => file(pending, true)}>
                        File anyway
                      </Button>
                    ) : (
                      <Button size="small" color="inherit" onClick={() => file(pending)}>
                        Try filing again
                      </Button>
                    )
                  ) : null
                }
              >
                {error}
                {pending && !duplicate ? " The scanned pages are kept here until you close this window." : ""}
              </Alert>
            )}
          </Stack>

          <Box sx={{ flex: "0 0 240px", maxWidth: "100%" }}>
            <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
              <Typography variant="subtitle2" fontWeight={700}>
                Scanned pages
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {pages ? `${pages} page${pages === 1 ? "" : "s"}` : "None yet"}
              </Typography>
            </Stack>
            <Box
              sx={{
                border: "1px dashed",
                borderColor: "divider",
                borderRadius: 1,
                bgcolor: "action.hover",
                minHeight: 260,
                p: 1.5,
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 1,
                alignContent: pages ? "start" : "center",
              }}
            >
              {!pages && (
                <Typography variant="body2" color="text.secondary" sx={{ gridColumn: "1 / -1", textAlign: "center", p: 2 }}>
                  Pages appear here as they are scanned.
                </Typography>
              )}
              {Array.from({ length: pages }, (_, i) => (
                <Box
                  key={i}
                  data-testid="scan-page"
                  sx={{ bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: 0.5, aspectRatio: "8.5 / 11", position: "relative" }}
                >
                  <Typography variant="caption" sx={{ position: "absolute", right: 6, bottom: 4, fontWeight: 500 }}>
                    {i + 1}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>
        </Stack>
        {busy && (
          <Box sx={{ mt: 2 }} role="status">
            <Typography variant="body2" fontWeight={500} sx={{ mb: 0.5 }}>
              {phase === "filing" ? "Building PDF and filing to Results…" : `Scanning… ${pages} page${pages === 1 ? "" : "s"} received`}
            </Typography>
            <LinearProgress />
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ justifyContent: "space-between", px: 3, pb: 2 }}>
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1, pr: 2 }}>
          {phase === "filed"
            ? ""
            : phase === "scanning"
            ? "Keep the pages in the scanner until it stops."
            : agent === "connected"
            ? "Pages are filed to Results automatically when the scan finishes."
            : "Connect a scanner to start scanning."}
        </Typography>
        <Stack direction="row" spacing={1}>
          {phase === "scanning" && (
            <Button color="error" variant="outlined" onClick={cancel}>
              Cancel scan
            </Button>
          )}
          {phase === "filed" && (
            <>
              <Button variant="outlined" onClick={another}>
                Scan another
              </Button>
              <Button variant="contained" onClick={onViewResults || onClose}>
                View in Results
              </Button>
            </>
          )}
          {(phase === "idle" || phase === "error") && (
            <>
              <Button onClick={onClose}>Cancel</Button>
              <Button variant="contained" startIcon={<DocumentScannerIcon />} disabled={!ready} onClick={start}>
                Scan
              </Button>
            </>
          )}
        </Stack>
      </DialogActions>
    </>
  );
}
