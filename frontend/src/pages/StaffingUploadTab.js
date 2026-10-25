import { useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleCheck,
  faCloudArrowUp,
  faDownload,
  faFileCsv,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import {
  alpha,
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  FormControlLabel,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import axios from "axios";
import { apiEndpoints, getAuthHeaders, getAuthHeadersForUpload } from "../config/api";
import { getAccessToken } from "../utils/tokenManager";
import { MONTH_NAMES } from "../utils/masterSchedule";
import StaffingTabHeader from "../components/staffing/StaffingTabHeader";

const TEMPLATE_HEADER =
  "first_name,last_name,profession,nursing_role,email,phone_number,shift,days,start,end\n";
const TEMPLATE_EXAMPLE =
  "Jane,Doe,Nurse,rn,jane.doe@example.com,555-0100,day,\"mon,wed,fri\",07:00,15:00\n" +
  "John,Smith,Physician,other,john.smith@example.com,555-0101,night,\"tue,thu,sat,sun\",19:00,07:00\n" +
  "Pat,Lee,CNA,cna,,,,,,\n";

const ROSTER_REQUIRED = ["first_name", "last_name", "profession"];
const ROSTER_OPTIONAL = ["email", "phone_number", "nursing_role"];
const ROSTER_SCHEDULE = ["shift", "days", "start", "end", "start_date", "end_date"];
const ROSTER_KNOWN = [...ROSTER_REQUIRED, ...ROSTER_OPTIONAL, ...ROSTER_SCHEDULE];

const MASTER_LEFT = ["section", "first_name", "last_name", "unit", "hp", "status"];
const MASTER_REQUIRED = ["first_name", "last_name"];
const DAY_CODES = ["7", "7A", "7P", "7p", "3", "11", "3 11", "R", "x"];

const monoChip = {
  fontFamily: "monospace",
  fontSize: 13,
  height: 26,
  borderRadius: 1,
};

// ---------- helpers ----------

async function errMessage(err, fallback) {
  let data = err.response?.data;
  if (data instanceof Blob) {
    try {
      data = JSON.parse(await data.text());
    } catch (e) {
      data = null;
    }
  }
  return data?.error || data?.message || err.message || fallback;
}

function saveBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

// Reads the header line and counts data rows, in the browser. It checks the
// file's shape only; the server still does the real validation on import.
async function inspectCsv(file) {
  const text = (await file.text()).replace(/^﻿/, "");
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  const header = (lines[0] || "").split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
  return { columns: header.filter(Boolean), rows: Math.max(lines.length - 1, 0) };
}

// Asks the server to run the import without saving anything (dry_run) and
// report what each row would do.
async function dryRunCheck(url, file, token, extra = {}) {
  const formData = new FormData();
  formData.append("file", file);
  Object.entries(extra).forEach(([k, v]) => formData.append(k, v));
  formData.append("dry_run", "true");
  const res = await axios.post(url, formData, { headers: getAuthHeadersForUpload(token) });
  return res.data;
}

const checkCounts = (check) => {
  const rows = (check && check.data && check.data.rows) || [];
  const skipped = rows.filter((r) => r.state === "skipped").length;
  return { total: rows.length, skipped, saved: rows.length - skipped };
};

function importSummary(file, info, check) {
  if (!file) return "Add a file to continue.";
  if (!info) return "Reading file...";
  if (check && check.loading) return "Checking rows...";
  if (check && check.data) {
    const { saved, skipped } = checkCounts(check);
    return `${saved} ${saved === 1 ? "row" : "rows"} will be saved${skipped ? `, ${skipped} will be skipped` : ""}.`;
  }
  return `${info.rows} ${info.rows === 1 ? "row" : "rows"} will be sent for import.`;
}

function importLabel(info, check) {
  const n = check && check.data ? checkCounts(check).saved : info ? info.rows : 0;
  return n ? `Import ${n} ${n === 1 ? "row" : "rows"}` : "Import";
}

const STATE_STYLE = {
  ready: { label: "Ready", color: "success.dark" },
  attention: { label: "Needs attention", color: "warning.dark" },
  skipped: { label: "Will be skipped", color: "error.main" },
};
const STATE_ORDER = { skipped: 0, attention: 1, ready: 2 };
const SHOW_ROWS = 100;

function CheckPanel({ check, mode }) {
  if (!check) return null;
  if (check.loading) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
        Checking rows...
      </Typography>
    );
  }
  if (check.error) {
    return (
      <Alert severity="warning" sx={{ mt: 2 }}>
        Could not check this file ({check.error}). You can still import; the server checks each row.
      </Alert>
    );
  }
  const rows = check.data.rows || [];
  const count = (state) => rows.filter((r) => r.state === state).length;
  const sorted = [...rows].sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || a.row - b.row);
  const heads = mode === "roster" ? ["Name", "Profession", "Role"] : ["Name", "Section", "Unit"];
  const cells = (r) => (mode === "roster" ? [r.profession, r.role] : [r.section, r.unit]);
  return (
    <Stack spacing={1.5} sx={{ mt: 2 }}>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <Typography sx={{ fontWeight: 600 }}>Check before importing</Typography>
        <Chip size="small" color="success" label={`${count("ready")} ready`} />
        {count("attention") > 0 && <Chip size="small" color="warning" label={`${count("attention")} needs attention`} />}
        {count("skipped") > 0 && <Chip size="small" color="error" label={`${count("skipped")} will be skipped`} />}
      </Stack>
      <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2, maxHeight: 420 }}>
        <Table size="small" stickyHeader aria-label="Rows found in the file and what an import would do">
          <TableHead>
            <TableRow>
              <TableCell>Line</TableCell>
              <TableCell>{heads[0]}</TableCell>
              <TableCell>{heads[1]}</TableCell>
              <TableCell>{heads[2]}</TableCell>
              <TableCell>Result</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sorted.slice(0, SHOW_ROWS).map((r) => {
              const st = STATE_STYLE[r.state];
              const [c1, c2] = cells(r);
              return (
                <TableRow key={r.row} sx={r.state === "ready" ? undefined : { bgcolor: (th) => alpha(r.state === "skipped" ? th.palette.error.main : th.palette.warning.main, 0.1) }}>
                  <TableCell>{r.row}</TableCell>
                  <TableCell>{r.name || "-"}</TableCell>
                  <TableCell>{c1 || "-"}</TableCell>
                  <TableCell>{c2 || "-"}</TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ color: st.color, fontWeight: 600 }}>
                      {st.label}
                    </Typography>
                    {r.schedule && (
                      <Typography variant="body2" color="text.secondary">
                        Schedule: {r.schedule}
                      </Typography>
                    )}
                    {mode === "master" && r.state !== "skipped" && (
                      <Typography variant="body2" color="text.secondary">
                        {r.cells} {r.cells === 1 ? "day" : "days"} set
                      </Typography>
                    )}
                    {(r.messages || []).map((m, i) => (
                      <Typography key={i} variant="body2">
                        {m}
                      </Typography>
                    ))}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
      {sorted.length > SHOW_ROWS && (
        <Typography variant="body2" color="text.secondary">
          Showing the first {SHOW_ROWS} of {sorted.length} rows (rows that need attention are listed first).
        </Typography>
      )}
    </Stack>
  );
}

// ---------- shared pieces ----------

function Step({ number, title, children }) {
  return (
    <Paper variant="outlined" sx={{ p: 3, borderRadius: 2 }}>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
        <Box
          sx={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            bgcolor: "primary.main",
            color: "primary.contrastText",
            fontWeight: 600,
            fontSize: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {number}
        </Box>
        <Typography variant="h6" component="h3" sx={{ fontSize: 18, fontWeight: 600 }}>
          {title}
        </Typography>
      </Stack>
      {children}
    </Paper>
  );
}

function ChipRow({ items, color = "default", variant = "filled" }) {
  return (
    <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
      {items.map((c) => (
        <Chip key={c} label={c} size="small" color={color} variant={variant} sx={monoChip} />
      ))}
    </Stack>
  );
}

function GuideLabel({ children, color = "text.secondary" }) {
  return (
    <Typography
      variant="caption"
      sx={{ display: "block", mb: 0.75, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", color }}
    >
      {children}
    </Typography>
  );
}

function Dropzone({ file, info, onFile, onClear, requiredColumns, knownColumns }) {
  const inputRef = useRef(null);
  const [over, setOver] = useState(false);

  const pick = (f) => {
    if (f) onFile(f);
  };

  if (file) {
    const columns = info?.columns || [];
    const lower = columns.map((c) => c.toLowerCase());
    const missing = requiredColumns.filter((c) => !lower.includes(c));
    const unknown = knownColumns ? columns.filter((c) => !knownColumns.includes(c.toLowerCase())) : [];
    return (
      <Stack spacing={1.5}>
        <Paper
          variant="outlined"
          sx={{ p: 1.5, borderRadius: 2, bgcolor: "grey.50", display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}
        >
          <Box sx={{ color: "primary.main", fontSize: 24, display: "flex" }}>
            <FontAwesomeIcon icon={faFileCsv} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontFamily: "monospace", fontSize: 14, overflowWrap: "anywhere" }}>{file.name}</Typography>
            <Typography variant="body2" color="text.secondary">
              {info ? `${info.rows} ${info.rows === 1 ? "row" : "rows"} found` : "Reading file..."}
            </Typography>
          </Box>
          <Button variant="outlined" color="inherit" onClick={onClear} sx={{ minHeight: 44 }}>
            Remove
          </Button>
        </Paper>
        {info && missing.length > 0 && (
          <Alert severity="error" icon={<FontAwesomeIcon icon={faTriangleExclamation} />}>
            Missing required {missing.length === 1 ? "column" : "columns"}: <strong>{missing.join(", ")}</strong>. Download
            the template to see the expected header.
          </Alert>
        )}
        {info && missing.length === 0 && (
          <Alert severity="success" icon={<FontAwesomeIcon icon={faCircleCheck} />}>
            Required columns found. The server checks each row when you import.
          </Alert>
        )}
        {info && unknown.length > 0 && (
          <Alert severity="info">
            {unknown.length === 1 ? "This column is" : "These columns are"} not recognized and will be ignored:{" "}
            <strong>{unknown.join(", ")}</strong>.
          </Alert>
        )}
      </Stack>
    );
  }

  return (
    <Box
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        pick(e.dataTransfer.files && e.dataTransfer.files[0]);
      }}
      sx={{
        border: "2px dashed",
        borderColor: over ? "primary.main" : "grey.400",
        bgcolor: over ? "action.hover" : "grey.50",
        borderRadius: 2,
        py: 5,
        px: 3,
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 1.5,
      }}
    >
      <Box sx={{ color: "primary.main", fontSize: 34, display: "flex" }}>
        <FontAwesomeIcon icon={faCloudArrowUp} />
      </Box>
      <Typography sx={{ fontWeight: 500 }}>Drop a .csv file here</Typography>
      <Button variant="contained" onClick={() => inputRef.current && inputRef.current.click()} sx={{ minHeight: 44, px: 3 }}>
        Choose file
      </Button>
      <Typography variant="body2" color="text.secondary">
        CSV only. From Excel, use Save As, CSV.
      </Typography>
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        hidden
        onChange={(e) => {
          pick(e.target.files[0]);
          e.target.value = "";
        }}
      />
    </Box>
  );
}

function SummaryTiles({ tiles }) {
  return (
    <Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap" sx={{ mb: 1 }}>
      {tiles.map((t) => (
        <Paper
          key={t.label}
          variant="outlined"
          sx={{
            flex: "1 1 130px",
            p: 1.5,
            borderRadius: 2,
            bgcolor: t.warn ? (th) => alpha(th.palette.warning.main, 0.14) : "background.paper",
          }}
        >
          <Typography variant="body2" color={t.warn ? "warning.dark" : "text.secondary"}>
            {t.label}
          </Typography>
          <Typography sx={{ fontSize: 28, fontWeight: 600, lineHeight: 1.2, color: t.warn ? "warning.dark" : "text.primary" }}>
            {t.value}
          </Typography>
        </Paper>
      ))}
    </Stack>
  );
}

function ErrorList({ errors, limit = 50 }) {
  if (!errors || errors.length === 0) return null;
  return (
    <Paper variant="outlined" sx={{ borderRadius: 2, p: 2 }}>
      <Typography sx={{ fontWeight: 600, mb: 0.5 }}>
        To review ({errors.length})
      </Typography>
      <List dense disablePadding>
        {errors.slice(0, limit).map((err, idx) => (
          <ListItem key={idx} divider={idx < Math.min(errors.length, limit) - 1} sx={{ py: 0.75, alignItems: "flex-start", gap: 1.25 }}>
            <Box sx={{ color: "warning.main", mt: "3px", display: "flex" }}>
              <FontAwesomeIcon icon={faTriangleExclamation} />
            </Box>
            <ListItemText primary={err} />
          </ListItem>
        ))}
        {errors.length > limit && (
          <ListItem sx={{ py: 0.75 }}>
            <ListItemText primary={`...and ${errors.length - limit} more.`} />
          </ListItem>
        )}
      </List>
    </Paper>
  );
}

function PanelCard({ title, children, tone }) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 3,
        borderRadius: 2,
        ...(tone === "info" ? { bgcolor: (th) => alpha(th.palette.info.main, 0.08), borderColor: "info.main" } : {}),
      }}
    >
      <Typography variant="h6" component="h3" sx={{ fontSize: 16, fontWeight: 600, mb: 1.5 }}>
        {title}
      </Typography>
      {children}
    </Paper>
  );
}

// ---------- staff roster ----------

function RosterUpload() {
  const [file, setFile] = useState(null);
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const [check, setCheck] = useState(null); // { loading } | { data } | { error }
  const token = getAccessToken();

  const chooseFile = async (f) => {
    setFile(f);
    setInfo(null);
    setStatus(null);
    setCheck(null);
    let parsed = { columns: [], rows: 0 };
    try {
      parsed = await inspectCsv(f);
    } catch (e) {
      // keep the empty result; the server still validates
    }
    setInfo(parsed);
    if (ROSTER_REQUIRED.every((c) => parsed.columns.map((x) => x.toLowerCase()).includes(c))) {
      setCheck({ loading: true });
      try {
        setCheck({ data: await dryRunCheck(apiEndpoints.staffingStaffUploadCsv, f, token) });
      } catch (err) {
        setCheck({ error: await errMessage(err, "The check failed.") });
      }
    }
  };
  const clearFile = () => {
    setFile(null);
    setInfo(null);
    setCheck(null);
  };

  const columnsOk = info && ROSTER_REQUIRED.every((c) => info.columns.map((x) => x.toLowerCase()).includes(c));
  const canImport = !!file && !busy && !(check && check.loading) && (!info || columnsOk);

  const handleDownloadTemplate = () =>
    saveBlob(new Blob([TEMPLATE_HEADER + TEMPLATE_EXAMPLE], { type: "text/csv" }), "staffing_roster_template.csv");

  const handleUpload = async () => {
    if (!file) {
      setStatus({ ok: false, message: "Please select a CSV file to upload." });
      return;
    }
    const formData = new FormData();
    formData.append("file", file);
    setBusy(true);
    try {
      const res = await axios.post(apiEndpoints.staffingStaffUploadCsv, formData, {
        headers: getAuthHeadersForUpload(token),
      });
      setStatus({ ok: true, ...res.data });
      setCheck(null);
    } catch (err) {
      setStatus({ ok: false, message: await errMessage(err, "Upload failed.") });
    } finally {
      setBusy(false);
    }
  };

  const hasIssues = status && status.ok && ((status.errors && status.errors.length > 0) || status.not_counted > 0);

  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 3, alignItems: "flex-start" }}>
      <Stack spacing={2} sx={{ flex: "999 1 520px", minWidth: 0 }}>
        <Step number={1} title="Get the template">
          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap alignItems="center" justifyContent="space-between">
            <Typography color="text.secondary" sx={{ maxWidth: 480 }}>
              A blank roster sheet with two example rows. Only three columns are required, so you can start with names and
              add schedules later.
            </Typography>
            <Button
              variant="outlined"
              startIcon={<FontAwesomeIcon icon={faDownload} />}
              onClick={handleDownloadTemplate}
              sx={{ minHeight: 44 }}
            >
              Download roster template
            </Button>
          </Stack>
        </Step>

        <Step number={2} title="Add your file">
          <Dropzone
            file={file}
            info={info}
            onFile={chooseFile}
            onClear={clearFile}
            requiredColumns={ROSTER_REQUIRED}
            knownColumns={ROSTER_KNOWN}
          />
          <CheckPanel check={check} mode="roster" />
        </Step>

        <Step number={3} title="Import">
          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap alignItems="center" justifyContent="space-between">
            <Typography variant="body2" color="text.secondary">
              {importSummary(file, info, check)}
            </Typography>
            <Button variant="contained" size="large" onClick={handleUpload} disabled={!canImport} sx={{ minHeight: 48, px: 3.5 }}>
              {busy ? "Importing..." : importLabel(info, check)}
            </Button>
          </Stack>
        </Step>

        {status && status.ok && (
          <Paper variant="outlined" sx={{ p: 3, borderRadius: 2 }}>
            <Typography variant="h6" component="h3" sx={{ fontSize: 18, fontWeight: 600, mb: 1.5 }}>
              {hasIssues ? "Import finished, with items to review" : "Import finished"}
            </Typography>
            <SummaryTiles
              tiles={[
                { label: "Created", value: status.created ?? 0 },
                { label: "Updated", value: status.updated ?? 0 },
                { label: "Schedules set", value: (status.schedules_created || 0) + (status.schedules_updated || 0) },
                ...(hasIssues
                  ? [{ label: "Needs attention", value: (status.errors ? status.errors.length : 0) + (status.not_counted > 0 ? 1 : 0), warn: true }]
                  : []),
              ]}
            />
            {status.not_counted > 0 && (
              <Alert severity="warning" sx={{ mt: 1.5 }}>
                {status.not_counted} {status.not_counted === 1 ? "person has" : "people have"} the role Other, which does not
                count toward staffing compliance until a Nursing Role (RN, LPN or CNA) is set on the Roster tab.
              </Alert>
            )}
            {status.errors && status.errors.length > 0 && (
              <Box sx={{ mt: 1.5 }}>
                <ErrorList errors={status.errors} />
              </Box>
            )}
          </Paper>
        )}
        {status && !status.ok && <Alert severity="error">{status.message}</Alert>}
      </Stack>

      <Stack spacing={2} sx={{ flex: "1 1 300px", minWidth: 0 }}>
        <PanelCard title="Columns">
          <Stack spacing={2}>
            <Box>
              <GuideLabel color="success.dark">Required</GuideLabel>
              <ChipRow items={ROSTER_REQUIRED} color="success" />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                Profession is a free-text label: Nurse, CNA, Tech, whatever roles you schedule.
              </Typography>
            </Box>
            <Box>
              <GuideLabel>Optional</GuideLabel>
              <ChipRow items={ROSTER_OPTIONAL} />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                <strong>nursing_role</strong> is what compliance counts: rn, lpn, cna (CNA, GNA, nursing assistant) or other.
                Only RN, LPN and CNA count toward care hours, the staff ratio and the RN requirement. Blank keeps a person's
                current role; new people start as Other.
              </Typography>
            </Box>
            <Box>
              <GuideLabel>Add a recurring schedule</GuideLabel>
              <ChipRow items={ROSTER_SCHEDULE} />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                Fill all four of shift, days, start and end, or leave all four blank. shift: day, evening, night or custom.
                days: like "mon,wed,fri" (full names work). start and end: 24-hour, like 19:00. start_date defaults to today;
                a blank end_date is ongoing. Schedules show on the calendar right after upload.
              </Typography>
            </Box>
          </Stack>
        </PanelCard>
        <PanelCard title="Good to know" tone="info">
          <Typography variant="body2">Uploading the same names again updates their record. It never creates duplicates.</Typography>
        </PanelCard>
      </Stack>
    </Box>
  );
}

// ---------- master schedule ----------

function MasterUpload() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [file, setFile] = useState(null);
  const [info, setInfo] = useState(null);
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const [check, setCheck] = useState(null); // { loading } | { data } | { error }
  const token = getAccessToken();
  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1, now.getFullYear() + 2];
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;

  const runCheck = async (f, replaceFlag) => {
    setCheck({ loading: true });
    try {
      setCheck({
        data: await dryRunCheck(apiEndpoints.staffingMasterScheduleUploadCsv, f, token, {
          replace: replaceFlag ? "true" : "false",
        }),
      });
    } catch (err) {
      setCheck({ error: await errMessage(err, "The check failed.") });
    }
  };

  const chooseFile = async (f) => {
    setFile(f);
    setInfo(null);
    setStatus(null);
    setCheck(null);
    let parsed = { columns: [], rows: 0 };
    try {
      parsed = await inspectCsv(f);
    } catch (e) {
      // keep the empty result; the server still validates
    }
    setInfo(parsed);
    if (MASTER_REQUIRED.every((c) => parsed.columns.map((x) => x.toLowerCase()).includes(c))) {
      await runCheck(f, replace);
    }
  };
  const clearFile = () => {
    setFile(null);
    setInfo(null);
    setCheck(null);
  };

  const columnsOk = info && MASTER_REQUIRED.every((c) => info.columns.map((x) => x.toLowerCase()).includes(c));
  const canImport = !!file && !busy && !(check && check.loading) && (!info || columnsOk);

  const handleDownload = async () => {
    setStatus(null);
    try {
      const res = await axios.get(apiEndpoints.staffingMasterScheduleCsv, {
        headers: getAuthHeaders(token),
        params: { month: monthKey },
        responseType: "blob",
      });
      saveBlob(new Blob([res.data], { type: "text/csv" }), `master_schedule_${monthKey}.csv`);
    } catch (err) {
      setStatus({ ok: false, message: await errMessage(err, "Could not download the template.") });
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setStatus({ ok: false, message: "Please select a CSV file to upload." });
      return;
    }
    if (replace && !window.confirm("Replace the whole Master Schedule with this file? Every existing row and day entry will be deleted first.")) {
      return;
    }
    const formData = new FormData();
    formData.append("file", file);
    formData.append("replace", replace ? "true" : "false");
    setBusy(true);
    try {
      const res = await axios.post(apiEndpoints.staffingMasterScheduleUploadCsv, formData, {
        headers: getAuthHeadersForUpload(token),
      });
      setStatus({ ok: true, ...res.data });
      setCheck(null);
    } catch (err) {
      setStatus({ ok: false, message: await errMessage(err, "Upload failed.") });
    } finally {
      setBusy(false);
    }
  };

  const hasErrors = status && status.ok && status.errors && status.errors.length > 0;

  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 3, alignItems: "flex-start" }}>
      <Stack spacing={2} sx={{ flex: "999 1 520px", minWidth: 0 }}>
        <Step number={1} title="Get the sheet for a month">
          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap alignItems="flex-end" justifyContent="space-between">
            <Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap">
              <TextField select size="small" label="Month" value={month} onChange={(e) => setMonth(Number(e.target.value))} sx={{ minWidth: 150 }}>
                {MONTH_NAMES.map((m, i) => (
                  <MenuItem key={m} value={i}>
                    {m}
                  </MenuItem>
                ))}
              </TextField>
              <TextField select size="small" label="Year" value={year} onChange={(e) => setYear(Number(e.target.value))} sx={{ minWidth: 110 }}>
                {years.map((y) => (
                  <MenuItem key={y} value={y}>
                    {y}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
            <Button variant="outlined" startIcon={<FontAwesomeIcon icon={faDownload} />} onClick={handleDownload} sx={{ minHeight: 44 }}>
              Download {MONTH_NAMES[month]} {year} sheet
            </Button>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
            The sheet is pre-filled with every section and everyone already on the schedule, one column per day of that month.
          </Typography>
        </Step>

        <Step number={2} title="Add your file">
          <Dropzone file={file} info={info} onFile={chooseFile} onClear={clearFile} requiredColumns={MASTER_REQUIRED} />
          <CheckPanel check={check} mode="master" />
        </Step>

        <Step number={3} title="Import">
          <Box
            sx={{
              border: "1px solid",
              borderColor: replace ? "error.main" : "divider",
              bgcolor: replace ? (th) => alpha(th.palette.error.main, 0.08) : "grey.50",
              borderRadius: 2,
              p: 2,
              mb: 2,
            }}
          >
            <FormControlLabel
              sx={{ alignItems: "flex-start", m: 0 }}
              control={<Checkbox color="error" checked={replace} onChange={(e) => {
                    setReplace(e.target.checked);
                    if (file && columnsOk) runCheck(file, e.target.checked);
                  }}
                  sx={{ pt: 0 }}
                />}
              label={
                <Box>
                  <Typography sx={{ fontWeight: 600 }}>Start from scratch</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Delete every current row and day entry first, then load this file.
                  </Typography>
                </Box>
              }
            />
            <Typography variant="body2" sx={{ mt: 1, ml: 4, color: replace ? "error.dark" : "text.secondary", fontWeight: replace ? 500 : 400 }}>
              {replace
                ? "Replace is on. You will be asked to confirm before anything is deleted."
                : "Replace is off. Blank cells never change what is already there, so this file is safe to upload again."}
            </Typography>
          </Box>
          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap alignItems="center" justifyContent="space-between">
            <Typography variant="body2" color="text.secondary">
              {importSummary(file, info, check)}
            </Typography>
            <Button
              variant="contained"
              size="large"
              color={replace ? "error" : "primary"}
              onClick={handleUpload}
              disabled={!canImport}
              sx={{ minHeight: 48, px: 3.5 }}
            >
              {busy ? "Importing..." : replace ? "Replace and import" : importLabel(info, check)}
            </Button>
          </Stack>
        </Step>

        {status && status.ok && (
          <Paper variant="outlined" sx={{ p: 3, borderRadius: 2 }}>
            <Typography variant="h6" component="h3" sx={{ fontSize: 18, fontWeight: 600, mb: 1.5 }}>
              {status.replaced ? "Master Schedule replaced. " : ""}
              {hasErrors ? "Import finished, with items to review" : "Import finished"}
            </Typography>
            <SummaryTiles
              tiles={[
                { label: "Rows added", value: status.rows_created ?? 0 },
                { label: "Rows updated", value: status.rows_updated ?? 0 },
                { label: "Days set", value: status.cells_set ?? 0 },
                ...(hasErrors ? [{ label: "Needs attention", value: status.errors.length, warn: true }] : []),
              ]}
            />
            <Stack spacing={0.5} sx={{ mt: 1 }}>
              {status.rows_moved > 0 && (
                <Typography variant="body2" color="text.secondary">
                  {status.rows_moved} moved to another section.
                </Typography>
              )}
              {status.skipped_blank > 0 && (
                <Typography variant="body2" color="text.secondary">
                  {status.skipped_blank} blank {status.skipped_blank === 1 ? "line" : "lines"} skipped.
                </Typography>
              )}
              {status.sections_added && status.sections_added.length > 0 && (
                <Typography variant="body2" color="text.secondary">
                  New {status.sections_added.length === 1 ? "section" : "sections"}: {status.sections_added.join(", ")}.
                </Typography>
              )}
              {status.ignored_columns && status.ignored_columns.length > 0 && (
                <Typography variant="body2" color="text.secondary">
                  Ignored {status.ignored_columns.length === 1 ? "column" : "columns"}: {status.ignored_columns.join(", ")}.
                </Typography>
              )}
            </Stack>
            {hasErrors && (
              <Box sx={{ mt: 1.5 }}>
                <ErrorList errors={status.errors} />
              </Box>
            )}
          </Paper>
        )}
        {status && !status.ok && <Alert severity="error">{status.message}</Alert>}
      </Stack>

      <Stack spacing={2} sx={{ flex: "1 1 300px", minWidth: 0 }}>
        <PanelCard title="Columns">
          <Stack spacing={2}>
            <Box>
              <GuideLabel>Left of the days</GuideLabel>
              <ChipRow items={MASTER_LEFT} />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                <strong>section</strong> must name a section on the Master Schedule tab. Leave it blank to stay in the section
                above; a new name adds a section. <strong>unit</strong> (Unit 2, Unit 3, Unit 1A/1B...) decides where that
                person's calendar shifts go when you click Create schedule. Rows with no name are skipped.
              </Typography>
            </Box>
            <Box>
              <GuideLabel>Day codes</GuideLabel>
              <ChipRow items={DAY_CODES} />
            </Box>
          </Stack>
        </PanelCard>
        <PanelCard title="Good to know" tone="info">
          <Typography variant="body2">
            People are matched to the roster by first and last name. Upload the roster first; anyone not on it is reported and
            skipped.
          </Typography>
        </PanelCard>
      </Stack>
    </Box>
  );
}

// ---------- tab ----------

function StaffingUploadTab() {
  const [mode, setMode] = useState("roster");

  return (
    <Box>
      <StaffingTabHeader title="Upload CSV" subtitle="Bring in your staff roster or fill a month of the Master Schedule from a spreadsheet.">
        <ToggleButtonGroup
          exclusive
          size="small"
          color="primary"
          value={mode}
          onChange={(e, v) => v && setMode(v)}
          aria-label="What are you importing"
        >
          <ToggleButton value="roster" sx={{ minHeight: 44, px: 2.5, textTransform: "none" }}>
            Staff roster
          </ToggleButton>
          <ToggleButton value="master" sx={{ minHeight: 44, px: 2.5, textTransform: "none" }}>
            Master schedule
          </ToggleButton>
        </ToggleButtonGroup>
      </StaffingTabHeader>
      {mode === "roster" ? <RosterUpload /> : <MasterUpload />}
    </Box>
  );
}

export default StaffingUploadTab;
