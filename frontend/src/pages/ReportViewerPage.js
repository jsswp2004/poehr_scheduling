import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { jwtDecode } from "jwt-decode";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  IconButton,
  Paper,
  Snackbar,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import PrintOutlinedIcon from "@mui/icons-material/PrintOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import BackButton from "../components/BackButton";
import DocumentationDrawer from "../components/reports/DocumentationDrawer";
import ReportResultTable from "../components/reports/ReportResultTable";
import { SubscribeButton } from "../components/staffing/ReportSubscribe";
import { apiEndpoints } from "../config/api";
import { getAccessToken } from "../utils/tokenManager";
import {
  downloadText,
  errorText,
  formatCell,
  headers,
  presetRange,
  rangeText,
  resultToCsv,
  slug,
  stepRange,
} from "../components/reports/reportUtils";

const PRESETS = [
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "custom", label: "Custom" },
];

const STICKY_VAR = "--report-sticky-h";
const TABLE_TOP = `calc(64px + var(${STICKY_VAR}, 170px))`;

export default function ReportViewerPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [report, setReport] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [preset, setPreset] = useState("week");
  const [range, setRange] = useState(() => presetRange("week"));
  const [hidePhi, setHidePhi] = useState(false); // de-identified view and download
  const [people, setPeople] = useState([]);
  const [toast, setToast] = useState("");
  const [openRef, setOpenRef] = useState(null); // documentation reports: the document open in the side panel
  const isAdmin = (() => {
    try {
      const role = jwtDecode(getAccessToken()).role;
      return role === "admin" || role === "system_admin";
    } catch (e) {
      return false;
    }
  })();

  // Publish the pinned block's height so the table header can stick just under it.
  const pinRef = useCallback((node) => {
    if (!node) return;
    const publish = () => document.documentElement.style.setProperty(STICKY_VAR, `${node.offsetHeight}px`);
    publish();
    if (typeof ResizeObserver !== "undefined") new ResizeObserver(publish).observe(node);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setHidePhi(false);
    axios
      .get(apiEndpoints.staffingCustomReport(id), { headers: headers() })
      .then((res) => !cancelled && setReport(res.data))
      .catch((err) => {
        if (!cancelled) {
          setError(errorText(err, "Could not open this report."));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!isAdmin) return;
    axios
      .get(apiEndpoints.staffingStaff, { headers: headers() })
      .then((res) => setPeople(res.data.results || res.data || []))
      .catch(() => {});
  }, [isAdmin]);

  const dated = result ? result.source.dated : true;

  useEffect(() => {
    if (!report) return undefined;
    let cancelled = false;
    setLoading(true);
    setError("");
    axios
      .post(apiEndpoints.staffingCustomReportRun(id), { start: range.start, end: range.end, hide_phi: hidePhi }, { headers: headers() })
      .then((res) => !cancelled && setResult(res.data))
      .catch((err) => {
        if (!cancelled) {
          setResult(null);
          setError(errorText(err, "Could not run this report."));
        }
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [report, id, range.start, range.end, hidePhi]);

  const changePreset = (_e, value) => {
    if (!value) return;
    setPreset(value);
    if (value !== "custom") setRange(presetRange(value));
  };

  const exportCsv = () => {
    if (!result) return;
    const span = dated ? `-${range.start}-to-${range.end}` : "";
    downloadText(resultToCsv(result), `${slug(report?.name)}${span}${hidePhi ? "-deidentified" : ""}.csv`);
  };

  const subtitle = report ? `Custom report · ${report.source_label}${report.owner_name ? ` · by ${report.owner_name}` : ""}` : "";
  const flat = { width: 40, height: 40, border: "1px solid", borderColor: "divider", borderRadius: 2 };

  return (
    <Container maxWidth={false} sx={{ mt: 0, mb: 3, px: { xs: 2, md: 4 } }}>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .report-print-area, .report-print-area * { visibility: visible; }
          .report-print-area { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
          .report-print-title { display: block !important; margin-bottom: 8px; }
          @page { size: landscape; margin: 0.4in; }
        }
        .report-print-title { display: none; }
      `}</style>

      <Box
        ref={pinRef}
        className="no-print"
        sx={{
          position: "sticky",
          top: 64,
          zIndex: 1000,
          bgcolor: "background.paper",
          pt: "18px",
          mt: "-18px",
          pb: 1,
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 500, flex: 1 }}>
            Reports
          </Typography>
          <BackButton to="/reports" sx={{ mb: 0, py: 0.75 }} />
        </Box>

        <Stack direction="row" alignItems="flex-start" flexWrap="wrap" useFlexGap gap={1.5} sx={{ minWidth: 0, pt: 0.5 }}>
          <Box sx={{ minWidth: 0, flex: "0 1 auto", maxWidth: 320 }}>
            <Typography variant="h6" component="h2" noWrap title={report?.name} sx={{ fontWeight: 600 }}>
              {report?.name || " "}
            </Typography>
            <Typography variant="body2" color="text.secondary" noWrap title={report?.description || subtitle}>
              {report?.description || subtitle}
            </Typography>
          </Box>

          {dated && (
            <Stack direction="row" spacing={1} alignItems="center" flexWrap={{ xs: "wrap", xl: "nowrap" }} useFlexGap sx={{ mt: "-4px", flex: "none" }}>
              <Stack direction="row" spacing={0.5} alignItems="center">
                <IconButton aria-label="Previous range" sx={flat} onClick={() => setRange(stepRange(preset, range.start, range.end, -1))}>
                  <ChevronLeftIcon />
                </IconButton>
                <Typography sx={{ fontWeight: 500, whiteSpace: "nowrap", px: 0.5 }}>{rangeText(range.start, range.end)}</Typography>
                <IconButton aria-label="Next range" sx={flat} onClick={() => setRange(stepRange(preset, range.start, range.end, 1))}>
                  <ChevronRightIcon />
                </IconButton>
              </Stack>
              <ToggleButtonGroup size="small" exclusive value={preset} onChange={changePreset} aria-label="Date range" sx={{ height: 40 }}>
                {PRESETS.map((p) => (
                  <ToggleButton key={p.value} value={p.value} sx={{ textTransform: "none", px: 1.5 }}>
                    {p.label}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
              {preset === "custom" && (
                <>
                  <TextField size="small" type="date" label="Start" value={range.start} onChange={(e) => e.target.value && setRange((r) => ({ ...r, start: e.target.value }))} slotProps={{ inputLabel: { shrink: true } }} sx={{ width: 150 }} />
                  <TextField size="small" type="date" label="End" value={range.end} onChange={(e) => e.target.value && setRange((r) => ({ ...r, end: e.target.value }))} slotProps={{ inputLabel: { shrink: true } }} sx={{ width: 150 }} />
                </>
              )}
            </Stack>
          )}

          <Box sx={{ ml: "auto", display: "flex", alignItems: "center", gap: 1, flex: "none" }}>
            {result?.phi && (
              <Tooltip title={hidePhi ? "Show patient names and note text again" : "Replace patient names and note text, here and in the download"}>
                <Button
                  variant={hidePhi ? "contained" : "outlined"}
                  color={hidePhi ? "warning" : "inherit"}
                  startIcon={hidePhi ? <VisibilityOutlinedIcon /> : <VisibilityOffOutlinedIcon />}
                  onClick={() => setHidePhi((v) => !v)}
                  sx={{ minHeight: 40, whiteSpace: "nowrap" }}
                >
                  {hidePhi ? "Show PHI" : "Hide PHI"}
                </Button>
              </Tooltip>
            )}
            <Tooltip title="Export CSV">
              <span>
                <Button variant="outlined" color="inherit" aria-label="Export CSV" onClick={exportCsv} disabled={!result} sx={{ minWidth: 40, minHeight: 40, px: 1 }}>
                  <FileDownloadOutlinedIcon fontSize="small" />
                </Button>
              </span>
            </Tooltip>
            <Tooltip title="Print">
              <span>
                <Button variant="outlined" aria-label="Print" onClick={() => window.print()} disabled={!result} sx={{ minWidth: 40, minHeight: 40, px: 1 }}>
                  <PrintOutlinedIcon fontSize="small" />
                </Button>
              </span>
            </Tooltip>
            {isAdmin && report && (
              <SubscribeButton
                report="custom"
                reportLabel={report.name}
                customReportId={report.id}
                patientData={!!result?.phi}
                people={people}
                label="Email on a schedule"
                onSaved={() => setToast("Scheduled. Manage it under Reports > Subscriptions.")}
              />
            )}
            {report?.can_edit && (
              <Button variant="outlined" color="inherit" sx={{ minHeight: 40 }} onClick={() => navigate(report.source === "linked" ? `/reports/${id}/canvas` : report.source === "note_documentation" ? `/reports/${id}/documentation` : `/reports/${id}/edit`)}>
                Edit report
              </Button>
            )}
          </Box>
        </Stack>

        {result && result.tiles.length > 0 && (
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", pt: 1 }}>
            {result.tiles.map((t, i) => (
              <Paper key={i} variant="outlined" sx={{ px: 1.5, py: 0.5, flex: "1 1 140px", minWidth: 120 }}>
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.4, fontSize: 11 }}>
                  {t.label}
                </Typography>
                <Typography sx={{ fontSize: 24, fontWeight: 500, lineHeight: 1.15, color: t.tone === "bad" ? "error.main" : "text.primary" }}>
                  {formatCell(t.value, t.type)}
                </Typography>
              </Paper>
            ))}
          </Box>
        )}
      </Box>

      <Box sx={{ pt: 2 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 1.5 }}>
            {error}
          </Alert>
        )}
        {loading && <CircularProgress size={20} sx={{ m: 1 }} />}
        {result && (
          <Paper variant="outlined" className="report-print-area">
            <Box className="report-print-title" sx={{ p: 1 }}>
              <strong>{report?.name}</strong>
              {dated ? ` — ${rangeText(range.start, range.end)}` : ""}
              {result.tiles.length > 0 && (
                <div>{result.tiles.map((t) => `${t.label}: ${formatCell(t.value, t.type)}`).join("   ·   ")}</div>
              )}
            </Box>
            <ReportResultTable result={result} stickyTop={TABLE_TOP} onOpenRow={report?.source === "note_documentation" ? (r) => setOpenRef(r._ref) : null} />
            {report?.source === "note_documentation" && <DocumentationDrawer reference={openRef} hide={hidePhi} onClose={() => setOpenRef(null)} />}
            {result.truncated && (
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", p: 1 }}>
                Showing the first 5,000 rows. Narrow the dates or add a filter to see the rest.
              </Typography>
            )}
          </Paper>
        )}
      </Box>
      <Snackbar open={!!toast} autoHideDuration={5000} onClose={() => setToast("")} message={toast} />
    </Container>
  );
}
