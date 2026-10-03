import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Alert,
  Stack,
  TextField,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Chip,
  CircularProgress,
  ToggleButton,
  ToggleButtonGroup,
} from "@mui/material";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDownload, faPrint } from "@fortawesome/free-solid-svg-icons";
import axios from "axios";
import { apiEndpoints, getAuthHeaders } from "../config/api";
import { getAccessToken } from "../utils/tokenManager";

const REPORT_TYPES = [
  { value: "schedule", label: "Schedule (Day / Week / Month)" },
  { value: "unscheduled", label: "Staff With No Schedule" },
  { value: "labor_hours", label: "Labor Hours Summary" },
  { value: "coverage_compliance", label: "Coverage Compliance" },
  { value: "message_log", label: "Message Delivery Log" },
  { value: "shift_distribution", label: "Shift-Type Distribution" },
];

const SHIFT_TYPE_ORDER = ["day", "evening", "night", "custom"];
const SHIFT_TYPE_LABELS = { day: "Day", evening: "Evening", night: "Night", custom: "Custom" };

const REPORT_LABELS = REPORT_TYPES.reduce((acc, r) => {
  acc[r.value] = r.label;
  return acc;
}, {});

function formatLocalDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getPresetRange(preset) {
  const today = new Date();
  if (preset === "today") {
    const s = formatLocalDate(today);
    return { start: s, end: s };
  }
  if (preset === "week") {
    // Monday - Sunday of the current week.
    const dow = today.getDay(); // 0 = Sun
    const diffToMonday = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(today);
    monday.setDate(today.getDate() + diffToMonday);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { start: formatLocalDate(monday), end: formatLocalDate(sunday) };
  }
  if (preset === "month") {
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { start: formatLocalDate(firstDay), end: formatLocalDate(lastDay) };
  }
  // custom -- caller keeps whatever is already in state
  return null;
}

function downloadCsv(filename, headers, rows) {
  const escape = (val) => {
    const str = String(val ?? "");
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const lines = [headers.join(",")].concat(
    rows.map((row) => row.map(escape).join(","))
  );
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

function StaffingReportsTab() {
  const token = getAccessToken();

  const [reportType, setReportType] = useState("schedule");
  const [preset, setPreset] = useState("week");
  const [startDate, setStartDate] = useState(() => getPresetRange("week").start);
  const [endDate, setEndDate] = useState(() => getPresetRange("week").end);
  const [profession, setProfession] = useState("");
  const [staffFilterId, setStaffFilterId] = useState("");

  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Per-report-type result state.
  const [shifts, setShifts] = useState([]);
  const [unscheduled, setUnscheduled] = useState([]);
  const [laborRows, setLaborRows] = useState([]);
  const [complianceRows, setComplianceRows] = useState([]);
  const [complianceSummary, setComplianceSummary] = useState(null);
  const [messageRows, setMessageRows] = useState([]);
  const [messageTruncated, setMessageTruncated] = useState(false);
  const [distributionRows, setDistributionRows] = useState([]);
  const [distributionTotals, setDistributionTotals] = useState(null);

  // Load the full staff roster once, to populate the profession/staff filters.
  useEffect(() => {
    axios
      .get(apiEndpoints.staffingStaff, { headers: getAuthHeaders(token) })
      .then((res) => setStaffList(res.data.results || res.data || []))
      .catch((err) => console.error("Failed to load staff for report filters", err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const professions = useMemo(
    () => Array.from(new Set(staffList.map((s) => s.profession))).sort(),
    [staffList]
  );

  const showProfessionFilter = ["schedule", "unscheduled", "labor_hours", "shift_distribution"].includes(
    reportType
  );
  const showStaffFilter = ["schedule", "message_log"].includes(reportType);

  const handlePresetChange = (_e, value) => {
    if (!value) return;
    setPreset(value);
    if (value !== "custom") {
      const range = getPresetRange(value);
      setStartDate(range.start);
      setEndDate(range.end);
    }
  };

  const runReport = useCallback(async () => {
    if (!startDate || !endDate) return;
    setLoading(true);
    setError("");
    try {
      const baseParams = {
        start: startDate,
        end: endDate,
        ...(profession ? { profession } : {}),
      };

      if (reportType === "schedule") {
        const res = await axios.get(apiEndpoints.staffingShifts, {
          headers: getAuthHeaders(token),
          params: { ...baseParams, ...(staffFilterId ? { staff: staffFilterId } : {}) },
        });
        const rows = res.data.results || res.data || [];
        rows.sort((a, b) =>
          a.date === b.date ? a.staff_name.localeCompare(b.staff_name) : a.date.localeCompare(b.date)
        );
        setShifts(rows);
      } else if (reportType === "unscheduled") {
        const res = await axios.get(apiEndpoints.staffingReportUnscheduled, {
          headers: getAuthHeaders(token),
          params: baseParams,
        });
        setUnscheduled(res.data.staff || []);
      } else if (reportType === "labor_hours") {
        const res = await axios.get(apiEndpoints.staffingReportLaborHours, {
          headers: getAuthHeaders(token),
          params: baseParams,
        });
        setLaborRows(res.data.rows || []);
      } else if (reportType === "coverage_compliance") {
        const res = await axios.get(apiEndpoints.staffingReportCoverageCompliance, {
          headers: getAuthHeaders(token),
          params: { start: startDate, end: endDate },
        });
        setComplianceRows(res.data.rows || []);
        setComplianceSummary({
          checked: res.data.checked_count || 0,
          understaffed: res.data.understaffed_count || 0,
          atRisk: res.data.at_risk_count || 0,
          warnings: res.data.warnings || [],
        });
      } else if (reportType === "message_log") {
        const res = await axios.get(apiEndpoints.staffingReportMessageLog, {
          headers: getAuthHeaders(token),
          params: { start: startDate, end: endDate, ...(staffFilterId ? { staff: staffFilterId } : {}) },
        });
        setMessageRows(res.data.rows || []);
        setMessageTruncated(!!res.data.truncated);
      } else if (reportType === "shift_distribution") {
        const res = await axios.get(apiEndpoints.staffingReportShiftDistribution, {
          headers: getAuthHeaders(token),
          params: baseParams,
        });
        setDistributionRows(res.data.rows || []);
        setDistributionTotals(res.data.totals || null);
      }
    } catch (err) {
      console.error("Failed to run report", err);
      setError(err.response?.data?.error || "Failed to run that report.");
    } finally {
      setLoading(false);
    }
  }, [reportType, startDate, endDate, profession, staffFilterId, token]);

  useEffect(() => {
    runReport();
  }, [runReport]);

  const handleExportSchedule = () => {
    downloadCsv(
      `staffing_schedule_${startDate}_to_${endDate}.csv`,
      ["Date", "Staff", "Profession", "Shift", "Start", "End"],
      shifts.map((s) => [s.date, s.staff_name, s.profession, s.shift_type_display || s.shift_type, s.start_time || "", s.end_time || ""])
    );
  };

  const handleExportUnscheduled = () => {
    downloadCsv(
      `staffing_unscheduled_${startDate}_to_${endDate}.csv`,
      ["Name", "Profession", "Email", "Phone"],
      unscheduled.map((s) => [s.full_name, s.profession_display || s.profession, s.email || "", s.phone_number || ""])
    );
  };

  const handleExportLaborHours = () => {
    downloadCsv(
      `staffing_labor_hours_${startDate}_to_${endDate}.csv`,
      ["Staff", "Profession", "Shift Count", "Total Hours"],
      laborRows.map((r) => [r.full_name, r.profession, r.shift_count, r.total_hours])
    );
  };

  const handleExportCompliance = () => {
    downloadCsv(
      `staffing_coverage_compliance_${startDate}_to_${endDate}.csv`,
      ["Date", "Unit", "Shift", "Type", "Census", "Required Staff", "Assigned", "Required Care Hours", "Scheduled Care Hours", "Status", "Details", "Alert Sent"],
      complianceRows.map((r) => [
        r.date,
        r.unit_name || "",
        r.shift_type_display,
        r.mode === "hppd" ? "HPPD" : "Fixed",
        r.mode === "hppd" ? r.census ?? "" : "",
        r.required,
        r.assigned,
        r.mode === "hppd" ? r.required_hours : "",
        r.mode === "hppd" ? r.hours_scheduled : "",
        r.status,
        [...(r.shortfalls || []), r.note].filter(Boolean).join("; "),
        r.alert_sent ? "Yes" : "No",
      ])
    );
  };

  const handleExportMessageLog = () => {
    downloadCsv(
      `staffing_message_log_${startDate}_to_${endDate}.csv`,
      ["Sent At", "Channel", "Category", "Recipient", "Staff", "Subject", "Status"],
      messageRows.map((r) => [r.sent_at, r.channel, r.category, r.recipient, r.staff_name || "", r.subject, r.status])
    );
  };

  const handleExportDistribution = () => {
    downloadCsv(
      `staffing_shift_distribution_${startDate}_to_${endDate}.csv`,
      ["Staff", "Profession", ...SHIFT_TYPE_ORDER.map((t) => SHIFT_TYPE_LABELS[t]), "Total"],
      distributionRows.map((r) => [r.full_name, r.profession, ...SHIFT_TYPE_ORDER.map((t) => r[t] || 0), r.total])
    );
  };

  const handlePrint = () => window.print();

  return (
    <Box>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
          .print-only-header { display: block !important; margin-bottom: 12px; }
        }
        .print-only-header { display: none; }
      `}</style>

      <Typography variant="h6" sx={{ mb: 1 }} className="no-print">
        Reports
      </Typography>

      <Stack spacing={1.5} sx={{ mb: 1.5, maxWidth: 1000 }} className="no-print">
        <FormControl size="small" sx={{ minWidth: 280 }}>
          <InputLabel id="report-type-label">Report</InputLabel>
          <Select
            labelId="report-type-label"
            label="Report"
            value={reportType}
            onChange={(e) => setReportType(e.target.value)}
          >
            {REPORT_TYPES.map((r) => (
              <MenuItem key={r.value} value={r.value}>
                {r.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
          <ToggleButtonGroup size="small" value={preset} exclusive onChange={handlePresetChange}>
            <ToggleButton value="today">Day</ToggleButton>
            <ToggleButton value="week">Week</ToggleButton>
            <ToggleButton value="month">Month</ToggleButton>
            <ToggleButton value="custom">Custom</ToggleButton>
          </ToggleButtonGroup>

          <TextField
            label="Start"
            type="date"
            size="small"
            value={startDate}
            onChange={(e) => {
              setPreset("custom");
              setStartDate(e.target.value);
            }}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="End"
            type="date"
            size="small"
            value={endDate}
            onChange={(e) => {
              setPreset("custom");
              setEndDate(e.target.value);
            }}
            InputLabelProps={{ shrink: true }}
          />

          {showProfessionFilter && (
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel id="report-profession-label">Profession (all)</InputLabel>
              <Select
                labelId="report-profession-label"
                label="Profession (all)"
                value={profession}
                onChange={(e) => setProfession(e.target.value)}
              >
                <MenuItem value="">All</MenuItem>
                {professions.map((p) => (
                  <MenuItem key={p} value={p}>
                    {p}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {showStaffFilter && (
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel id="report-staff-label">Staff (all)</InputLabel>
              <Select
                labelId="report-staff-label"
                label="Staff (all)"
                value={staffFilterId}
                onChange={(e) => setStaffFilterId(e.target.value)}
              >
                <MenuItem value="">All</MenuItem>
                {staffList.map((s) => (
                  <MenuItem key={s.id} value={s.id}>
                    {s.full_name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
        </Stack>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 1 }} className="no-print">
          {error}
        </Alert>
      )}

      {loading && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 2 }} className="no-print">
          <CircularProgress />
        </Box>
      )}

      <Box className="print-area">
      <Typography variant="h6" className="print-only-header">
        {REPORT_LABELS[reportType]} — {startDate} to {endDate}
        <br />
        <Typography component="span" variant="body2" color="text.secondary">
          Printed {new Date().toLocaleString()}
        </Typography>
      </Typography>

      {!loading && reportType === "schedule" && (
        <>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {shifts.length} shift{shifts.length === 1 ? "" : "s"} from {startDate} to {endDate}
            </Typography>
            <Stack direction="row" spacing={1} className="no-print">
              <Button size="small" startIcon={<FontAwesomeIcon icon={faDownload} />} onClick={handleExportSchedule} disabled={shifts.length === 0}>
                Export CSV
              </Button>
              <Button size="small" startIcon={<FontAwesomeIcon icon={faPrint} />} onClick={handlePrint} disabled={shifts.length === 0}>
                Print
              </Button>
            </Stack>
          </Stack>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Staff</TableCell>
                <TableCell>Profession</TableCell>
                <TableCell>Shift</TableCell>
                <TableCell>Start</TableCell>
                <TableCell>End</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {shifts.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{s.date}</TableCell>
                  <TableCell>{s.staff_name}</TableCell>
                  <TableCell>{s.profession}</TableCell>
                  <TableCell>{s.shift_type_display || s.shift_type}</TableCell>
                  <TableCell>{s.start_time || "—"}</TableCell>
                  <TableCell>{s.end_time || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}

      {!loading && reportType === "unscheduled" && (
        <>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {unscheduled.length} active staff member{unscheduled.length === 1 ? "" : "s"} with no shifts from {startDate} to {endDate}
            </Typography>
            <Stack direction="row" spacing={1} className="no-print">
              <Button size="small" startIcon={<FontAwesomeIcon icon={faDownload} />} onClick={handleExportUnscheduled} disabled={unscheduled.length === 0}>
                Export CSV
              </Button>
              <Button size="small" startIcon={<FontAwesomeIcon icon={faPrint} />} onClick={handlePrint} disabled={unscheduled.length === 0}>
                Print
              </Button>
            </Stack>
          </Stack>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Profession</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Phone</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {unscheduled.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{s.full_name}</TableCell>
                  <TableCell>{s.profession_display || s.profession}</TableCell>
                  <TableCell>{s.email || "—"}</TableCell>
                  <TableCell>{s.phone_number || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}

      {!loading && reportType === "labor_hours" && (
        <>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Total scheduled hours from {startDate} to {endDate}
            </Typography>
            <Stack direction="row" spacing={1} className="no-print">
              <Button size="small" startIcon={<FontAwesomeIcon icon={faDownload} />} onClick={handleExportLaborHours} disabled={laborRows.length === 0}>
                Export CSV
              </Button>
              <Button size="small" startIcon={<FontAwesomeIcon icon={faPrint} />} onClick={handlePrint} disabled={laborRows.length === 0}>
                Print
              </Button>
            </Stack>
          </Stack>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Staff</TableCell>
                <TableCell>Profession</TableCell>
                <TableCell align="right">Shifts</TableCell>
                <TableCell align="right">Total Hours</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {laborRows.map((r) => (
                <TableRow key={r.staff_id}>
                  <TableCell>{r.full_name}</TableCell>
                  <TableCell>{r.profession}</TableCell>
                  <TableCell align="right">{r.shift_count}</TableCell>
                  <TableCell align="right">{r.total_hours}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}

      {!loading && reportType === "coverage_compliance" && (
        <>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {complianceSummary
                ? `${complianceSummary.checked} shift/date combinations checked, ${complianceSummary.understaffed} understaffed${
                    complianceSummary.atRisk ? `, ${complianceSummary.atRisk} at risk` : ""
                  }`
                : ""}{" "}
              from {startDate} to {endDate}
            </Typography>
            <Stack direction="row" spacing={1} className="no-print">
              <Button size="small" startIcon={<FontAwesomeIcon icon={faDownload} />} onClick={handleExportCompliance} disabled={complianceRows.length === 0}>
                Export CSV
              </Button>
              <Button size="small" startIcon={<FontAwesomeIcon icon={faPrint} />} onClick={handlePrint} disabled={complianceRows.length === 0}>
                Print
              </Button>
            </Stack>
          </Stack>
          {(complianceSummary?.warnings || []).map((w) => (
            <Alert key={w} severity="warning" sx={{ mb: 1 }}>
              {w}
            </Alert>
          ))}
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Unit</TableCell>
                <TableCell>Shift</TableCell>
                <TableCell align="right">Census</TableCell>
                <TableCell align="right">Required</TableCell>
                <TableCell align="right">Assigned</TableCell>
                <TableCell align="right">Care Hours (sched / req)</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Details</TableCell>
                <TableCell>Alert Sent</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {complianceRows.map((r, idx) => (
                <TableRow key={idx}>
                  <TableCell>{r.date}</TableCell>
                  <TableCell>{r.unit_name || "—"}</TableCell>
                  <TableCell>{r.shift_type_display}</TableCell>
                  <TableCell align="right">
                    {r.mode === "hppd" && r.census != null
                      ? `${r.census}${r.census_source === "carried_forward" ? "*" : ""}`
                      : "—"}
                  </TableCell>
                  <TableCell align="right">{r.required}</TableCell>
                  <TableCell align="right">{r.assigned}</TableCell>
                  <TableCell align="right">
                    {r.mode === "hppd"
                      ? `${Number(r.hours_scheduled ?? 0).toFixed(1)} / ${Number(r.required_hours ?? 0).toFixed(1)}`
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={r.status}
                      color={r.status === "Met" ? "success" : r.status === "At risk" ? "warning" : "error"}
                    />
                  </TableCell>
                  <TableCell sx={{ maxWidth: 320 }}>
                    {[...(r.shortfalls || []), r.note].filter(Boolean).join("; ") || "—"}
                  </TableCell>
                  <TableCell>{r.alert_sent ? "Yes" : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {complianceRows.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Nothing to check for this date range. The report uses your state's staffing rule for every unit that has a census
              (set the clinic location on the Calendar tab and enter a census on the Units & Census tab), plus any Coverage
              Requirements added on the Assign Schedule tab.
            </Typography>
          )}
          {complianceRows.some((r) => r.census_source === "carried_forward") && (
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
              * Census carried forward from the most recent entry (no census was entered for that date).
            </Typography>
          )}
        </>
      )}

      {!loading && reportType === "message_log" && (
        <>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {messageRows.length} message{messageRows.length === 1 ? "" : "s"} from {startDate} to {endDate}
              {messageTruncated ? " (showing the most recent 1000 -- narrow the date range for the full list)" : ""}
            </Typography>
            <Stack direction="row" spacing={1} className="no-print">
              <Button size="small" startIcon={<FontAwesomeIcon icon={faDownload} />} onClick={handleExportMessageLog} disabled={messageRows.length === 0}>
                Export CSV
              </Button>
              <Button size="small" startIcon={<FontAwesomeIcon icon={faPrint} />} onClick={handlePrint} disabled={messageRows.length === 0}>
                Print
              </Button>
            </Stack>
          </Stack>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Sent</TableCell>
                <TableCell>Channel</TableCell>
                <TableCell>Category</TableCell>
                <TableCell>Recipient</TableCell>
                <TableCell>Staff</TableCell>
                <TableCell>Subject</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {messageRows.map((r, idx) => (
                <TableRow key={idx}>
                  <TableCell>{new Date(r.sent_at).toLocaleString()}</TableCell>
                  <TableCell>{r.channel}</TableCell>
                  <TableCell>{r.category}</TableCell>
                  <TableCell>{r.recipient}</TableCell>
                  <TableCell>{r.staff_name || "—"}</TableCell>
                  <TableCell>{r.subject || "—"}</TableCell>
                  <TableCell>{r.status || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}

      {!loading && reportType === "shift_distribution" && (
        <>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Shift breakdown from {startDate} to {endDate}
              {distributionTotals
                ? ` — org totals: ${SHIFT_TYPE_ORDER.map((t) => `${SHIFT_TYPE_LABELS[t]} ${distributionTotals[t] || 0}`).join(", ")}`
                : ""}
            </Typography>
            <Stack direction="row" spacing={1} className="no-print">
              <Button size="small" startIcon={<FontAwesomeIcon icon={faDownload} />} onClick={handleExportDistribution} disabled={distributionRows.length === 0}>
                Export CSV
              </Button>
              <Button size="small" startIcon={<FontAwesomeIcon icon={faPrint} />} onClick={handlePrint} disabled={distributionRows.length === 0}>
                Print
              </Button>
            </Stack>
          </Stack>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Staff</TableCell>
                <TableCell>Profession</TableCell>
                {SHIFT_TYPE_ORDER.map((t) => (
                  <TableCell key={t} align="right">
                    {SHIFT_TYPE_LABELS[t]}
                  </TableCell>
                ))}
                <TableCell align="right">Total</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {distributionRows.map((r) => (
                <TableRow key={r.staff_id}>
                  <TableCell>{r.full_name}</TableCell>
                  <TableCell>{r.profession}</TableCell>
                  {SHIFT_TYPE_ORDER.map((t) => (
                    <TableCell key={t} align="right">
                      {r[t] || 0}
                    </TableCell>
                  ))}
                  <TableCell align="right">{r.total}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
      </Box>
    </Box>
  );
}

export default StaffingReportsTab;
