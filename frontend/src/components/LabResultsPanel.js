import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import { api } from "../api/client";
import { apiEndpoints } from "../config/api";
import { getValidToken } from "../utils/auth";
import { toast } from "./SimpleToast";

/**
 * Lab results for one patient: see every report with abnormal values called
 * out, enter a result by hand, and review (acknowledge) it. Any clinician with
 * the review right may review -- the ordering provider, a covering provider or
 * a nurse. All rules (who may enter or review, reviewed -> unreviewed when a
 * result changes, nothing is ever deleted) are enforced by the backend; this
 * screen shows the right buttons and relays the server's messages.
 */

export const authHeader = async () => {
  const token = await getValidToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token.access_token || token}` };
};

const listOf = (res) => (Array.isArray(res.data) ? res.data : res.data?.results || []);

export const errorText = (err, fallback) =>
  err?.response?.data?.detail ||
  (err?.response?.data && typeof err.response.data === "object"
    ? Object.values(err.response.data).flat().join(" ")
    : null) ||
  fallback;

export const ENTER_ROLES = ["doctor", "nurse", "admin", "system_admin"];
export const REVIEW_ROLES = ["doctor", "nurse", "system_admin"];
export const UPLOAD_ROLES = ["doctor", "nurse", "admin", "registrar", "receptionist", "system_admin"];
export const MAX_UPLOAD_MB = 10;

// Shown with a symbol and a word as well as colour, so it reads without colour.
export const FLAG_INFO = {
  H: { label: "High", symbol: "H ▲", color: "error.main", critical: false },
  HH: { label: "Critical high", symbol: "HH ▲▲", color: "error.main", critical: true },
  L: { label: "Low", symbol: "L ▼", color: "info.main", critical: false },
  LL: { label: "Critical low", symbol: "LL ▼▼", color: "error.main", critical: true },
  A: { label: "Abnormal", symbol: "A", color: "warning.main", critical: false },
};

const FLAG_OPTIONS = [
  { value: "", label: "Auto" },
  { value: "H", label: "High (H)" },
  { value: "L", label: "Low (L)" },
  { value: "HH", label: "Critical high (HH)" },
  { value: "LL", label: "Critical low (LL)" },
  { value: "A", label: "Abnormal (A)" },
];

const STATUS_OPTIONS = [
  { value: "final", label: "Final" },
  { value: "preliminary", label: "Preliminary" },
  { value: "corrected", label: "Corrected" },
];

const STATUS_COLORS = { final: "success", preliminary: "warning", corrected: "info", entered_in_error: "default" };

const EVENT_LABELS = {
  entered: "Entered",
  updated: "Changed",
  reviewed: "Reviewed",
  review_reset: "Review cleared (result changed)",
  uploaded: "Scan uploaded",
  file_viewed: "Document opened",
  entered_in_error: "Marked entered in error",
};

const LAB_NAMES = ["Quest Diagnostics", "Labcorp", "BioReference", "Sonic Healthcare", "ARUP Laboratories", "Mayo Clinic Laboratories"];

// Quick starts for common panels: names, units and LOINC codes only. Reference
// ranges differ from lab to lab, so they are always typed from the lab's report.
export const QUICK_PANELS = [
  {
    title: "Basic metabolic panel",
    items: [
      ["Sodium", "mmol/L", "2951-2"],
      ["Potassium", "mmol/L", "2823-3"],
      ["Chloride", "mmol/L", "2075-0"],
      ["Carbon dioxide", "mmol/L", "2028-9"],
      ["Urea nitrogen (BUN)", "mg/dL", "3094-0"],
      ["Creatinine", "mg/dL", "2160-0"],
      ["Glucose", "mg/dL", "2345-7"],
      ["Calcium", "mg/dL", "17861-6"],
    ],
  },
  {
    title: "CBC",
    items: [
      ["WBC", "10*3/uL", "6690-2"],
      ["Hemoglobin", "g/dL", "718-7"],
      ["Hematocrit", "%", "4544-3"],
      ["Platelets", "10*3/uL", "777-3"],
    ],
  },
  {
    title: "Lipid panel",
    items: [
      ["Cholesterol, total", "mg/dL", "2093-3"],
      ["HDL cholesterol", "mg/dL", "2085-9"],
      ["LDL cholesterol (calculated)", "mg/dL", "13457-7"],
      ["Triglycerides", "mg/dL", "2571-8"],
    ],
  },
  { title: "Hemoglobin A1c", items: [["Hemoglobin A1c", "%", "4548-4"]] },
  { title: "TSH", items: [["TSH", "uIU/mL", "3016-3"]] },
];

const blankItem = () => ({ test_name: "", value: "", units: "", reference_range: "", abnormal_flag: "", loinc_code: "" });

const pad = (n) => String(n).padStart(2, "0");
// ISO string -> value for <input type="datetime-local"> in the user's own time zone
export const toLocalInput = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const fromLocalInput = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

export const fmt = (iso) => (iso ? new Date(iso).toLocaleString() : "");

function FlagCell({ flag }) {
  const info = FLAG_INFO[flag];
  if (!info) return null;
  return (
    <Tooltip title={info.label}>
      <Typography component="span" variant="body2" fontWeight={700} sx={{ color: info.color }}>
        {info.symbol}
      </Typography>
    </Tooltip>
  );
}

/** The result lines of a report, abnormal values called out. Shared with the results inbox. */
export function ReportItemsTable({ items }) {
  return (
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Test</TableCell>
              <TableCell>Result</TableCell>
              <TableCell>Flag</TableCell>
              <TableCell>Units</TableCell>
              <TableCell>Reference range</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((item) => {
              const info = FLAG_INFO[item.abnormal_flag];
              return (
                <TableRow
                  key={item.id}
                  data-testid={`lab-item-${item.id}`}
                  sx={info ? { bgcolor: info.critical ? "rgba(211,47,47,0.14)" : "rgba(237,108,2,0.08)" } : undefined}
                >
                  <TableCell>{item.test_name}</TableCell>
                  <TableCell sx={info ? { color: info.color, fontWeight: 700 } : undefined}>{item.value}</TableCell>
                  <TableCell>
                    <FlagCell flag={item.abnormal_flag} />
                  </TableCell>
                  <TableCell>{item.units}</TableCell>
                  <TableCell>{item.reference_range}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
  );
}

/** Open a report's scanned document in a new tab (the opening is recorded by the server). */
export async function openReportDocument(report) {
  const headers = await authHeader();
  const res = await api.get(apiEndpoints.labReportFile(report.id), { headers, responseType: "blob" });
  const url = URL.createObjectURL(res.data);
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function LabResultsPanel({ patientId, orders = [], me = {}, entryRequest = null }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [onlyUnreviewed, setOnlyUnreviewed] = useState(false);
  const [dialog, setDialog] = useState(null); // { kind: "review" | "error" | "history", report }
  const [dialogText, setDialogText] = useState("");
  const [form, setForm] = useState(null); // entry/edit form, or null when closed
  const [upload, setUpload] = useState(null); // scan upload form, or null when closed
  const [duplicate, setDuplicate] = useState(null); // { title, uploaded_at } when the same file was already uploaded

  const canEnter = ENTER_ROLES.includes(me.role);
  const canReview = REVIEW_ROLES.includes(me.role);
  const canUpload = UPLOAD_ROLES.includes(me.role);

  const labOrders = useMemo(
    () => orders.filter((o) => o.orderable_category === "laboratory" && o.status !== "draft" && o.status !== "discontinued"),
    [orders]
  );

  const load = useCallback(async () => {
    if (!patientId) return;
    setLoading(true);
    try {
      const headers = await authHeader();
      const res = await api.get(apiEndpoints.labReports, { headers, params: { patient: patientId } });
      setReports(listOf(res));
      setDenied(false);
    } catch (err) {
      if (err?.response?.status === 403) {
        setDenied(true); // this user has no right to view lab results; show nothing
      } else {
        toast.error(errorText(err, "Could not load lab results."));
      }
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    load();
  }, [load]);

  const openNew = useCallback((orderId = "") => {
    setForm({
      id: null,
      title: "",
      order: orderId || "",
      performing_lab: "",
      accession_number: "",
      collected_at: "",
      resulted_at: toLocalInput(new Date().toISOString()),
      status: "final",
      comment: "",
      items: [blankItem()],
    });
  }, []);

  // "Enter results" pressed on an order row in the orders table
  useEffect(() => {
    if (entryRequest && entryRequest.nonce) openNew(entryRequest.orderId);
  }, [entryRequest, openNew]);

  const openEdit = (report) => {
    setForm({
      id: report.id,
      title: report.title,
      order: report.order || "",
      performing_lab: report.performing_lab || "",
      accession_number: report.accession_number || "",
      collected_at: toLocalInput(report.collected_at),
      resulted_at: toLocalInput(report.resulted_at),
      status: report.status === "entered_in_error" ? "final" : report.status,
      comment: report.comment || "",
      isScan: report.source === "scan",
      items: report.items.length === 0 && report.source === "scan" ? [blankItem()] : report.items.map((i) => ({
        test_name: i.test_name,
        value: i.value,
        units: i.units || "",
        reference_range: i.reference_range || "",
        abnormal_flag: i.abnormal_flag || "",
        loinc_code: i.loinc_code || "",
      })),
    });
  };

  const setField = (patch) => setForm((f) => ({ ...f, ...patch }));
  const setItem = (index, patch) =>
    setForm((f) => ({ ...f, items: f.items.map((it, i) => (i === index ? { ...it, ...patch } : it)) }));

  const applyQuickPanel = (panel) =>
    setForm((f) => ({
      ...f,
      title: f.title || panel.title,
      items: [
        ...f.items.filter((it) => it.test_name.trim() || it.value.trim()),
        ...panel.items.map(([test_name, units, loinc_code]) => ({ ...blankItem(), test_name, units, loinc_code })),
      ],
    }));

  const formProblem = () => {
    if (!form.title.trim()) return "Enter the panel or test name.";
    const lines = form.items.filter((it) => it.test_name.trim() || it.value.trim());
    if (!lines.length && !form.isScan) return "Add at least one result.";
    const bad = lines.find((it) => !it.test_name.trim() || !it.value.trim());
    if (bad) return "Each result needs a test name and a value.";
    return "";
  };

  const saveForm = async () => {
    const problem = formProblem();
    if (problem) {
      toast.error(problem);
      return;
    }
    const body = {
      title: form.title.trim(),
      order: form.order || null,
      performing_lab: form.performing_lab.trim(),
      accession_number: form.accession_number.trim(),
      collected_at: fromLocalInput(form.collected_at),
      resulted_at: fromLocalInput(form.resulted_at),
      status: form.status,
      comment: form.comment.trim(),
      items: form.items
        .filter((it) => it.test_name.trim() || it.value.trim())
        .map((it) => ({
          test_name: it.test_name.trim(),
          value: it.value.trim(),
          units: it.units.trim(),
          reference_range: it.reference_range.trim(),
          abnormal_flag: it.abnormal_flag,
          loinc_code: it.loinc_code,
        })),
    };
    // a scan can be saved without typed values; then leave its (empty) result lines alone
    if (form.isScan && body.items.length === 0) delete body.items;
    setBusy(true);
    try {
      const headers = await authHeader();
      if (form.id) {
        await api.patch(apiEndpoints.labReport(form.id), body, { headers });
        toast.success("Lab result updated.");
      } else {
        await api.post(apiEndpoints.labReports, { ...body, patient: patientId }, { headers });
        toast.success("Lab result saved.");
      }
      setForm(null);
      await load();
    } catch (err) {
      toast.error(errorText(err, "Could not save the lab result."));
    } finally {
      setBusy(false);
    }
  };

  const openDialog = (kind, report) => {
    setDialogText("");
    setDialog({ kind, report });
  };

  const submitDialog = async () => {
    const { kind, report } = dialog;
    setBusy(true);
    try {
      const headers = await authHeader();
      if (kind === "review") {
        await api.post(apiEndpoints.labReportAction(report.id, "review"), { comment: dialogText }, { headers });
        toast.success("Marked as reviewed.");
      } else {
        await api.post(apiEndpoints.labReportAction(report.id, "mark-error"), { reason: dialogText }, { headers });
        toast.success("Marked entered in error.");
      }
      setDialog(null);
      await load();
    } catch (err) {
      toast.error(errorText(err, "That did not go through."));
    } finally {
      setBusy(false);
    }
  };

  const openUpload = () => {
    setDuplicate(null);
    setUpload({ file: null, title: "", order: "", performing_lab: "", collected_at: "", comment: "" });
  };

  const submitUpload = async (allowDuplicate = false) => {
    if (!upload.file) {
      toast.error("Choose the scanned file first.");
      return;
    }
    if (upload.file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      toast.error(`That file is too large. The limit is ${MAX_UPLOAD_MB} MB.`);
      return;
    }
    const body = new FormData();
    body.append("patient", patientId);
    body.append("file", upload.file);
    if (upload.title.trim()) body.append("title", upload.title.trim());
    if (upload.order) body.append("order", upload.order);
    if (upload.performing_lab.trim()) body.append("performing_lab", upload.performing_lab.trim());
    const collected = fromLocalInput(upload.collected_at);
    if (collected) body.append("collected_at", collected);
    if (upload.comment.trim()) body.append("comment", upload.comment.trim());
    if (allowDuplicate) body.append("allow_duplicate", "true");
    setBusy(true);
    try {
      const headers = await authHeader();
      await api.post(apiEndpoints.labReportUpload, body, { headers });
      toast.success("Scan uploaded. A clinician will review it.");
      setUpload(null);
      setDuplicate(null);
      if (!denied) await load();
    } catch (err) {
      const dupe = err?.response?.status === 409 && err?.response?.data?.errors?.[0]?.duplicate_of;
      if (dupe) {
        setDuplicate(err.response.data.errors[0]);
      } else {
        toast.error(errorText(err, "Could not upload the scan."));
      }
    } finally {
      setBusy(false);
    }
  };

  const viewDocument = async (report) => {
    try {
      await openReportDocument(report);
      load(); // the opening is recorded in the report's history
    } catch (err) {
      toast.error(errorText(err, "Could not open the document."));
    }
  };

  const visible = reports.filter((r) => !onlyUnreviewed || (r.review_status === "unreviewed" && r.status !== "entered_in_error"));
  const needsReview = reports.filter((r) => r.review_status === "unreviewed" && r.status !== "entered_in_error");
  const criticalWaiting = needsReview.filter((r) => r.has_critical);

  const uploadDialogs = (
    <>
      <Dialog open={!!upload} onClose={() => !busy && setUpload(null)} fullWidth maxWidth="sm">
        {upload && (
          <>
            <DialogTitle>Upload a scanned lab result</DialogTitle>
            <DialogContent>
              <Stack spacing={2} sx={{ mt: 1 }}>
                <Box>
                  <Button component="label" variant="outlined" size="small">
                    {upload.file ? "Choose a different file" : "Choose file"}
                    <input
                      hidden
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                      aria-label="Scanned file"
                      onChange={(e) => {
                        const file = e.target.files && e.target.files[0];
                        if (file) setUpload((u) => ({ ...u, file, title: u.title || file.name.replace(/\.[^.]+$/, "") }));
                        setDuplicate(null);
                      }}
                    />
                  </Button>
                  <Typography variant="body2" sx={{ mt: 0.5 }} color={upload.file ? "text.primary" : "text.secondary"}>
                    {upload.file ? `${upload.file.name} (${Math.max(1, Math.round(upload.file.size / 1024))} KB)` : `PDF, JPEG or PNG, up to ${MAX_UPLOAD_MB} MB. Scan to one PDF when you can.`}
                  </Typography>
                </Box>
                <TextField
                  size="small"
                  label="Title (optional)"
                  value={upload.title}
                  onChange={(e) => setUpload({ ...upload, title: e.target.value })}
                />
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <Autocomplete
                    freeSolo
                    size="small"
                    options={LAB_NAMES}
                    inputValue={upload.performing_lab}
                    onInputChange={(_e, text) => setUpload((u) => ({ ...u, performing_lab: text }))}
                    sx={{ flex: 1 }}
                    renderInput={(params) => <TextField {...params} label="Lab (optional)" />}
                  />
                  <TextField
                    size="small"
                    type="datetime-local"
                    label="Collected (optional)"
                    InputLabelProps={{ shrink: true }}
                    value={upload.collected_at}
                    onChange={(e) => setUpload({ ...upload, collected_at: e.target.value })}
                    sx={{ flex: 1 }}
                  />
                </Stack>
                {labOrders.length > 0 && (
                  <TextField
                    size="small"
                    select
                    label="For order (optional)"
                    value={upload.order}
                    onChange={(e) => setUpload({ ...upload, order: e.target.value })}
                  >
                    <MenuItem value="">Not linked to an order</MenuItem>
                    {labOrders.map((o) => (
                      <MenuItem key={o.id} value={o.id}>
                        {o.orderable_name} ({o.placer_order_number})
                      </MenuItem>
                    ))}
                  </TextField>
                )}
                <TextField
                  size="small"
                  multiline
                  minRows={2}
                  label="Note (optional)"
                  value={upload.comment}
                  onChange={(e) => setUpload({ ...upload, comment: e.target.value })}
                />
                {duplicate && (
                  <Alert severity="warning">
                    This exact file was already uploaded for this patient
                    {duplicate.title ? ` as “${duplicate.title}”` : ""}
                    {duplicate.uploaded_at ? ` on ${fmt(duplicate.uploaded_at)}` : ""}. Upload it again only if that is intended.
                  </Alert>
                )}
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button disabled={busy} onClick={() => setUpload(null)}>
                Cancel
              </Button>
              {duplicate ? (
                <Button variant="contained" color="warning" disabled={busy} onClick={() => submitUpload(true)}>
                  Upload anyway
                </Button>
              ) : (
                <Button variant="contained" disabled={busy} onClick={() => submitUpload(false)}>
                  Upload
                </Button>
              )}
            </DialogActions>
          </>
        )}
      </Dialog>
    </>
  );

  if (denied) {
    // No right to read results (e.g. front desk): offer only the scan upload.
    if (!canUpload) return null;
    return (
      <Box sx={{ mt: 4 }} data-testid="lab-upload-only">
        <Typography variant="h6">Lab results</Typography>
        <Paper variant="outlined" sx={{ p: 2, mt: 1 }}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }} justifyContent="space-between">
            <Typography variant="body2" color="text.secondary">
              Scan paper lab results here. A clinician will review them.
            </Typography>
            <Button variant="contained" size="small" onClick={openUpload}>
              Upload scan
            </Button>
          </Stack>
        </Paper>
        {uploadDialogs}
      </Box>
    );
  }

  const renderReport = (report) => {
    const inError = report.status === "entered_in_error";
    return (
      <Paper key={report.id} variant="outlined" sx={{ p: 2, opacity: inError ? 0.65 : 1 }} data-testid={`lab-report-${report.id}`}>
        <Stack spacing={1.5}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={1} justifyContent="space-between">
            <Box>
              <Typography variant="subtitle1" fontWeight={700} sx={inError ? { textDecoration: "line-through" } : undefined}>
                {report.title}
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block">
                {[
                  report.performing_lab,
                  report.collected_at ? `Collected ${fmt(report.collected_at)}` : "",
                  report.resulted_at ? `Resulted ${fmt(report.resulted_at)}` : "",
                  report.accession_number ? `Accession ${report.accession_number}` : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Typography>
              {report.has_file && (
                <Typography variant="caption" color="text.secondary" display="block">
                  File: {report.file_name} ({Math.max(1, Math.round(report.file_size / 1024))} KB)
                </Typography>
              )}
              {report.order_name && (
                <Typography variant="caption" color="text.secondary" display="block">
                  For order: {report.order_name} ({report.placer_order_number})
                </Typography>
              )}
            </Box>
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap alignItems="flex-start">
              <Chip size="small" label={report.status_display} color={STATUS_COLORS[report.status]} />
              {report.source === "scan" && <Chip size="small" variant="outlined" label="Scanned document" />}
              {report.has_critical && <Chip size="small" color="error" label="Critical value" />}
              {report.has_abnormal && !report.has_critical && <Chip size="small" color="warning" variant="outlined" label="Abnormal" />}
              {!inError &&
                (report.review_status === "reviewed" ? (
                  <Chip
                    size="small"
                    color="success"
                    variant="outlined"
                    label={`Reviewed by ${report.reviewed_by_name || "staff"}${report.reviewed_at ? ` · ${fmt(report.reviewed_at)}` : ""}`}
                  />
                ) : (
                  <Chip size="small" color="warning" label="Needs review" />
                ))}
            </Stack>
          </Stack>

          {report.items.length === 0 && report.source === "scan" && (
            <Typography variant="body2" color="text.secondary">
              Scanned document. No values have been typed in yet{canEnter ? " — use Edit to enter them from the document." : "."}
            </Typography>
          )}
          {report.items.length > 0 && <ReportItemsTable items={report.items} />}

          {report.comment && <Typography variant="body2">{report.comment}</Typography>}
          {report.review_comment && (
            <Typography variant="body2" color="text.secondary">
              Review note: {report.review_comment}
            </Typography>
          )}
          {inError && report.error_reason && (
            <Typography variant="body2" color="text.secondary">
              Entered in error: {report.error_reason}
            </Typography>
          )}

          <Stack direction="row" spacing={1} justifyContent="flex-end" flexWrap="wrap" useFlexGap>
            {report.has_file && (
              <Button size="small" variant="outlined" onClick={() => viewDocument(report)}>
                View document
              </Button>
            )}
            <Button size="small" onClick={() => openDialog("history", report)}>
              History
            </Button>
            {canEnter && !inError && (
              <>
                <Button size="small" disabled={busy} onClick={() => openEdit(report)}>
                  Edit
                </Button>
                <Button size="small" color="warning" disabled={busy} onClick={() => openDialog("error", report)}>
                  Entered in error
                </Button>
              </>
            )}
            {canReview && !inError && report.review_status === "unreviewed" && (
              <Button size="small" variant="contained" disabled={busy} onClick={() => openDialog("review", report)}>
                Mark reviewed
              </Button>
            )}
          </Stack>
        </Stack>
      </Paper>
    );
  };

  return (
    <Box sx={{ mt: 4 }} data-testid="lab-results-panel">
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1} justifyContent="space-between" alignItems={{ sm: "center" }} sx={{ mb: 1 }}>
        <Typography variant="h6">
          Lab results
          {needsReview.length > 0 && <Chip size="small" color="warning" sx={{ ml: 1 }} label={`${needsReview.length} to review`} />}
        </Typography>
        <Stack direction="row" spacing={2} alignItems="center">
          <FormControlLabel
            control={<Switch size="small" checked={onlyUnreviewed} onChange={(e) => setOnlyUnreviewed(e.target.checked)} />}
            label="Needs review only"
          />
          {canUpload && (
            <Button variant="outlined" size="small" onClick={openUpload}>
              Upload scan
            </Button>
          )}
          {canEnter && (
            <Button variant="contained" size="small" onClick={() => openNew()}>
              Enter results
            </Button>
          )}
        </Stack>
      </Stack>

      {criticalWaiting.length > 0 && (
        <Alert severity="error" sx={{ mb: 1 }}>
          {criticalWaiting.length === 1 ? "A critical result is" : `${criticalWaiting.length} critical results are`} waiting for review.
        </Alert>
      )}

      {loading ? (
        <Box sx={{ p: 3, textAlign: "center" }}>
          <CircularProgress size={24} />
        </Box>
      ) : visible.length === 0 ? (
        <Typography color="text.secondary" sx={{ p: 2 }}>
          {onlyUnreviewed ? "Nothing waiting for review." : "No lab results yet."}
        </Typography>
      ) : (
        <Stack spacing={2}>{visible.map(renderReport)}</Stack>
      )}

      {/* Review / entered-in-error */}
      <Dialog open={!!dialog && dialog.kind !== "history"} onClose={() => !busy && setDialog(null)} fullWidth maxWidth="sm">
        {dialog && dialog.kind !== "history" && (
          <>
            <DialogTitle>
              {dialog.kind === "review" ? "Mark reviewed" : "Mark entered in error"}: {dialog.report.title}
            </DialogTitle>
            <DialogContent>
              <TextField
                autoFocus
                fullWidth
                multiline
                minRows={2}
                margin="dense"
                label={dialog.kind === "review" ? "Note (optional), e.g. patient called, repeat ordered" : "Reason (required)"}
                value={dialogText}
                onChange={(e) => setDialogText(e.target.value)}
              />
              {dialog.kind === "review" && dialog.report.has_critical && (
                <Alert severity="warning" sx={{ mt: 1 }}>
                  This report has a critical value.
                </Alert>
              )}
            </DialogContent>
            <DialogActions>
              <Button disabled={busy} onClick={() => setDialog(null)}>
                Cancel
              </Button>
              <Button
                variant="contained"
                disabled={busy || (dialog.kind === "error" && !dialogText.trim())}
                onClick={submitDialog}
              >
                {dialog.kind === "review" ? "Mark reviewed" : "Mark entered in error"}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* History */}
      <Dialog open={!!dialog && dialog.kind === "history"} onClose={() => setDialog(null)} fullWidth maxWidth="sm">
        {dialog && dialog.kind === "history" && (
          <>
            <DialogTitle>History: {dialog.report.title}</DialogTitle>
            <DialogContent>
              <Stack spacing={1}>
                {dialog.report.events.map((ev) => (
                  <Box key={ev.id}>
                    <Typography variant="body2" fontWeight={600}>
                      {EVENT_LABELS[ev.event_type] || ev.event_type}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {fmt(ev.created_at)}
                      {ev.user_name ? ` · ${ev.user_name}` : ""}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDialog(null)}>Close</Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* Enter / edit */}
      <Dialog open={!!form} onClose={() => !busy && setForm(null)} fullWidth maxWidth="md">
        {form && (
          <>
            <DialogTitle>{form.id ? "Edit lab result" : "Enter lab results"}</DialogTitle>
            <DialogContent>
              <Stack spacing={2} sx={{ mt: 1 }}>
                {!form.id && (
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
                    <Typography variant="caption" color="text.secondary">
                      Quick start:
                    </Typography>
                    {QUICK_PANELS.map((p) => (
                      <Chip key={p.title} size="small" label={p.title} onClick={() => applyQuickPanel(p)} />
                    ))}
                  </Stack>
                )}
                <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                  <TextField
                    size="small"
                    required
                    fullWidth
                    label="Panel or test name"
                    value={form.title}
                    onChange={(e) => setField({ title: e.target.value })}
                  />
                  <Autocomplete
                    freeSolo
                    size="small"
                    options={LAB_NAMES}
                    inputValue={form.performing_lab}
                    onInputChange={(_e, text) => setField({ performing_lab: text })}
                    sx={{ minWidth: 240 }}
                    renderInput={(params) => <TextField {...params} label="Performing lab" />}
                  />
                </Stack>
                <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                  <TextField
                    size="small"
                    select
                    fullWidth
                    label="For order (optional)"
                    value={form.order}
                    onChange={(e) => setField({ order: e.target.value })}
                  >
                    <MenuItem value="">Not linked to an order</MenuItem>
                    {labOrders.map((o) => (
                      <MenuItem key={o.id} value={o.id}>
                        {o.orderable_name} ({o.placer_order_number})
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    size="small"
                    label="Accession / specimen no."
                    value={form.accession_number}
                    onChange={(e) => setField({ accession_number: e.target.value })}
                    sx={{ minWidth: 220 }}
                  />
                  <TextField
                    size="small"
                    select
                    label="Status"
                    value={form.status}
                    onChange={(e) => setField({ status: e.target.value })}
                    sx={{ minWidth: 150 }}
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <MenuItem key={s.value} value={s.value}>
                        {s.label}
                      </MenuItem>
                    ))}
                  </TextField>
                </Stack>
                <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                  <TextField
                    size="small"
                    type="datetime-local"
                    label="Collected"
                    InputLabelProps={{ shrink: true }}
                    value={form.collected_at}
                    onChange={(e) => setField({ collected_at: e.target.value })}
                    fullWidth
                  />
                  <TextField
                    size="small"
                    type="datetime-local"
                    label="Resulted"
                    InputLabelProps={{ shrink: true }}
                    value={form.resulted_at}
                    onChange={(e) => setField({ resulted_at: e.target.value })}
                    fullWidth
                  />
                </Stack>

                <Typography variant="subtitle2">Results</Typography>
                {form.items.map((item, index) => (
                  <Stack key={index} direction={{ xs: "column", md: "row" }} spacing={1} alignItems={{ md: "center" }}>
                    <TextField
                      size="small"
                      label="Test"
                      value={item.test_name}
                      onChange={(e) => setItem(index, { test_name: e.target.value })}
                      sx={{ flex: 2 }}
                      inputProps={{ "aria-label": `Test ${index + 1}` }}
                    />
                    <TextField
                      size="small"
                      label="Value"
                      value={item.value}
                      onChange={(e) => setItem(index, { value: e.target.value })}
                      sx={{ flex: 1 }}
                      inputProps={{ "aria-label": `Value ${index + 1}` }}
                    />
                    <TextField
                      size="small"
                      label="Units"
                      value={item.units}
                      onChange={(e) => setItem(index, { units: e.target.value })}
                      sx={{ flex: 1 }}
                      inputProps={{ "aria-label": `Units ${index + 1}` }}
                    />
                    <TextField
                      size="small"
                      label="Reference range"
                      placeholder="3.5-5.0 or <5.7"
                      value={item.reference_range}
                      onChange={(e) => setItem(index, { reference_range: e.target.value })}
                      sx={{ flex: 1.2 }}
                      inputProps={{ "aria-label": `Reference range ${index + 1}` }}
                    />
                    <Select
                      size="small"
                      value={item.abnormal_flag}
                      displayEmpty
                      onChange={(e) => setItem(index, { abnormal_flag: e.target.value })}
                      sx={{ minWidth: 150 }}
                      inputProps={{ "aria-label": `Flag ${index + 1}` }}
                    >
                      {FLAG_OPTIONS.map((f) => (
                        <MenuItem key={f.value} value={f.value}>
                          {f.label}
                        </MenuItem>
                      ))}
                    </Select>
                    <Tooltip title="Remove this line">
                      <span>
                        <IconButton
                          size="small"
                          aria-label={`Remove result ${index + 1}`}
                          disabled={form.items.length === 1}
                          onClick={() => setField({ items: form.items.filter((_, i) => i !== index) })}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Stack>
                ))}
                <Box>
                  <Button size="small" startIcon={<AddIcon />} onClick={() => setField({ items: [...form.items, blankItem()] })}>
                    Add result line
                  </Button>
                </Box>
                <Typography variant="caption" color="text.secondary">
                  Leave Flag on Auto and it is worked out from the value and reference range (below the range = Low, above = High). Choose
                  Critical only when the lab reported it as critical.
                </Typography>
                <TextField
                  size="small"
                  multiline
                  minRows={2}
                  label="Comment (optional)"
                  value={form.comment}
                  onChange={(e) => setField({ comment: e.target.value })}
                />
                {form.id && (
                  <Alert severity="info">Changing the results sends this report back to “needs review”.</Alert>
                )}
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button disabled={busy} onClick={() => setForm(null)}>
                Cancel
              </Button>
              <Button variant="contained" disabled={busy} onClick={saveForm}>
                {form.id ? "Save changes" : "Save result"}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
      {uploadDialogs}
    </Box>
  );
}

export default LabResultsPanel;
