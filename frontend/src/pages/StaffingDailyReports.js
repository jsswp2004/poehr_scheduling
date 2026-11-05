import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Box, CircularProgress, MenuItem, Paper, Stack, TextField, Typography } from "@mui/material";
import { ReportActions, ReportMoreActions, useReportExport } from "../components/staffing/ReportActions";
import axios from "axios";
import { apiEndpoints, getAuthHeaders } from "../config/api";
import { getAccessToken } from "../utils/tokenManager";

const FORMS = [
  { value: "assignment", label: "Daily Staffing Assignment Sheet (by unit)", needsShift: true, needsUnit: true },
  { value: "shift-sheet", label: "Daily Staffing Sheet (11-7 / 7-3 / 3-11)", needsShift: true },
  { value: "hours", label: "Current Staffing Hours", needsShift: true },
  { value: "worksheet", label: "Nursing Staffing Worksheet (all shifts)" },
];

const SHIFTS = [
  { value: "day", label: "Days (7-3)" },
  { value: "evening", label: "Evenings (3-11)" },
  { value: "night", label: "Nights (11-7)" },
];

const todayIso = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/**
 * The facility's paper staffing forms, filled in from the calendar and printed
 * as PDFs (logo header; printed-by / time / page numbers in the footer).
 */
function StaffingDailyReports() {
  const [kind, setKind] = useState("assignment");
  const [date, setDate] = useState(todayIso());
  const [shift, setShift] = useState("day");
  const [unit, setUnit] = useState("all");
  const [units, setUnits] = useState([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const previewUrlRef = useRef("");

  const form = FORMS.find((f) => f.value === kind);

  useEffect(() => {
    axios
      .get(apiEndpoints.staffingUnits, { headers: getAuthHeaders(getAccessToken()) })
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : res.data?.results || [];
        setUnits(list.filter((u) => u.is_active));
      })
      .catch(() => setUnits([]));
  }, []);

  const fetchPdf = async () => {
    const params = { date, tz: Intl.DateTimeFormat().resolvedOptions().timeZone };
    if (form.needsShift) params.shift = shift;
    if (form.needsUnit) params.unit = unit;
    const res = await axios.get(apiEndpoints.staffingDailyReportPdf(kind), {
      headers: getAuthHeaders(getAccessToken()),
      params,
      responseType: "blob",
    });
    return URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
  };

  const errMessage = async (err) => {
    try {
      const text = await err.response.data.text();
      return JSON.parse(text).error || "Could not create the report.";
    } catch (e) {
      return "Could not create the report.";
    }
  };

  // Live preview: re-render the PDF shortly after any option changes, shown beside the options.
  const refreshPreview = useCallback(async () => {
    setPreviewing(true);
    setPreviewError("");
    try {
      const url = await fetchPdf();
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = url;
      setPreviewUrl(url);
    } catch (err) {
      setPreviewUrl("");
      setPreviewError(await errMessage(err));
    } finally {
      setPreviewing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, date, shift, unit]);

  useEffect(() => {
    if (!date) return undefined;
    const t = setTimeout(refreshPreview, 400);
    return () => clearTimeout(t);
  }, [refreshPreview, date]);

  useEffect(
    () => () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    },
    []
  );

  const run = async (mode) => {
    setError("");
    setBusy(mode);
    // Open the tab right away so the browser doesn't treat it as a popup.
    const win = mode === "print" ? window.open("", "_blank") : null;
    try {
      const url = await fetchPdf();
      if (mode === "print") {
        if (win) win.location.href = url;
        else window.open(url, "_blank");
      } else {
        const a = document.createElement("a");
        a.href = url;
        a.download = `${kind}_${date}${form.needsShift ? `_${shift}` : ""}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      if (win) win.close();
      setError(await errMessage(err));
    } finally {
      setBusy("");
    }
  };

  // Export (PDF only) and Print live in the Reports title row, next to Subscribe.
  useReportExport({
    formats: ["pdf"],
    disabled: !date,
    busy: busy,
    onExport: () => run("download"),
    onPrint: () => run("print"),
  });

  const unitName = unit === "all" ? "All units" : units.find((u) => String(u.id) === unit)?.name || "Unit";
  const summary = [date, form.needsShift ? SHIFTS.find((x) => x.value === shift)?.label : null, form.needsUnit ? unitName : null]
    .filter(Boolean)
    .join(" \u00b7 ");

  // Only the form picker stays on the title row; date / shift / unit open from the "⋮" at the end.
  const controls = (
    <Stack direction="row" spacing={1.5} alignItems="center" className="no-print" sx={{ minWidth: 0 }}>
      <TextField select size="small" label="Form" value={kind} onChange={(e) => setKind(e.target.value)} sx={{ minWidth: 250, maxWidth: 300 }}>
        {FORMS.map((f) => (
          <MenuItem key={f.value} value={f.value}>
            {f.label}
          </MenuItem>
        ))}
      </TextField>
      <Typography variant="body2" color="text.secondary" noWrap title={summary} sx={{ maxWidth: 260 }}>
        {summary}
      </Typography>
    </Stack>
  );

  const moreControls = (
    <Stack spacing={2} className="no-print">
      <TextField
        size="small"
        type="date"
        label="Date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        slotProps={{ inputLabel: { shrink: true } }}
        fullWidth
      />
      {form.needsShift && (
        <TextField select size="small" label="Shift" value={shift} onChange={(e) => setShift(e.target.value)} fullWidth>
          {SHIFTS.map((x) => (
            <MenuItem key={x.value} value={x.value}>
              {x.label}
            </MenuItem>
          ))}
        </TextField>
      )}
      {form.needsUnit && (
        <TextField select size="small" label="Unit" value={unit} onChange={(e) => setUnit(e.target.value)} fullWidth>
          <MenuItem value="all">All units (a page each)</MenuItem>
          {units.map((u) => (
            <MenuItem key={u.id} value={String(u.id)}>
              {u.name}
            </MenuItem>
          ))}
        </TextField>
      )}
    </Stack>
  );

  return (
    <Box className="no-print">
      <ReportActions>{controls}</ReportActions>
      <ReportMoreActions label="Date, shift and unit">{moreControls}</ReportMoreActions>
      {error && (
        <Alert severity="error" sx={{ mb: 1.5 }}>
          {error}
        </Alert>
      )}
      <Paper variant="outlined" sx={{ width: "100%", overflow: "hidden" }} aria-label="Form preview">
        <Box sx={{ px: 2, py: 1, borderBottom: "1px solid", borderColor: "divider", display: "flex", alignItems: "center", gap: 1 }}>
          <Typography sx={{ fontWeight: 600, flex: 1 }}>Preview</Typography>
          {previewing && <CircularProgress size={16} />}
        </Box>
        {previewError ? (
          <Alert severity="warning" sx={{ m: 2 }}>
            {previewError}
          </Alert>
        ) : previewUrl ? (
          <Box component="iframe" title="Form preview" src={previewUrl} sx={{ border: 0, width: "100%", height: "calc(100vh - 320px)", minHeight: 480, display: "block" }} />
        ) : (
          <Box sx={{ p: 4, color: "text.secondary" }}>{previewing ? "Preparing the preview..." : "Choose a form and date to preview it."}</Box>
        )}
      </Paper>
    </Box>
  );
}

export default StaffingDailyReports;
