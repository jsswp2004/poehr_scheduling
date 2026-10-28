import { useState, useEffect, useCallback, useMemo, useContext } from "react";
import { createPortal } from "react-dom";
import {
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  IconButton,
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
  TablePagination,
  Paper,
  LinearProgress,
  Snackbar,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronLeft, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import axios from "axios";
import { apiEndpoints, getAuthHeaders } from "../config/api";
import { getAccessToken } from "../utils/tokenManager";
import StaffingMasterReport from "./StaffingMasterReport";
import StaffingDailyReports from "./StaffingDailyReports";
import { StaffingHeaderSlotContext } from "../components/staffing/StaffingTabHeader";
import {
  ReportActionsSlotContext,
  ReportExportContext,
  ReportExportMenu,
  ReportPrintButton,
} from "../components/staffing/ReportActions";
import { SubscribeButton } from "../components/staffing/ReportSubscribe";
import { blobErrorMessage, downloadReportFile } from "../components/staffing/reportFiles";
import StaffingSubscriptionsPanel from "./StaffingSubscriptionsPanel";

const REPORT_GROUPS = [
  {
    label: "Compliance",
    items: [
      {
        value: "coverage_compliance",
        label: "Coverage compliance",
        description: "Each unit and shift checked against its staffing standard and coverage requirements.",
      },
    ],
  },
  {
    label: "Schedules",
    items: [
      {
        value: "schedule",
        label: "Schedule",
        description: "Every scheduled shift in the date range.",
      },
      {
        value: "master_schedule",
        label: "Master schedule",
        printable: true,
        description: "A printable month view of the whole schedule.",
      },
      {
        value: "daily_forms",
        label: "Daily staffing forms",
        printable: true,
        description: "Printable daily forms from the calendar, unit beds and census.",
      },
    ],
  },
  {
    label: "People",
    items: [
      {
        value: "unscheduled",
        label: "Staff with no schedule",
        description: "Active staff who have no shifts in the date range.",
      },
      {
        value: "labor_hours",
        label: "Labor hours",
        description: "Total scheduled hours for each person in the date range.",
      },
      {
        value: "shift_distribution",
        label: "Shift-type distribution",
        description: "How many day, evening, night and custom shifts each person works.",
      },
    ],
  },
  {
    label: "Automation",
    items: [
      {
        value: "subscriptions",
        label: "Subscriptions",
        description: "Reports emailed to you and your team on a schedule.",
      },
    ],
  },
  {
    label: "Messages",
    items: [
      {
        value: "message_log",
        label: "Message delivery log",
        description: "Texts and emails sent to staff, and whether they were delivered.",
      },
    ],
  },
];

const ALL_REPORTS = REPORT_GROUPS.flatMap((g) => g.items);
const REPORT_BY_VALUE = ALL_REPORTS.reduce((acc, r) => {
  acc[r.value] = r;
  return acc;
}, {});
const NO_DATE_REPORTS = ["master_schedule", "daily_forms", "subscriptions"];

const REPORT_PAGE_SIZE = 14; // rows shown per page in every report table

const SHIFT_TYPE_ORDER = ["day", "evening", "night", "custom"];
const SHIFT_TYPE_LABELS = { day: "Day", evening: "Evening", night: "Night", custom: "Custom" };

const STATUS_COLORS = { Met: "success", "At risk": "warning", Understaffed: "error" };

function formatLocalDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseISO(s) {
  const [y, m, d] = String(s).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function addDays(d, n) {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

function formatRange(startStr, endStr) {
  if (!startStr || !endStr) return "Choose dates";
  const s = parseISO(startStr);
  const e = parseISO(endStr);
  const md = { month: "short", day: "numeric" };
  const mdy = { month: "short", day: "numeric", year: "numeric" };
  if (startStr === endStr) return s.toLocaleDateString(undefined, mdy);
  if (s.getFullYear() === e.getFullYear()) {
    return `${s.toLocaleDateString(undefined, md)} – ${e.toLocaleDateString(undefined, mdy)}`;
  }
  return `${s.toLocaleDateString(undefined, mdy)} – ${e.toLocaleDateString(undefined, mdy)}`;
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

// ---------------------------------------------------------------------------
// Small presentational pieces
// ---------------------------------------------------------------------------

function SummaryTile({ label, value, hint, color, selected, onClick }) {
  const interactive = typeof onClick === "function";
  return (
    <Box
      component={interactive ? "button" : "div"}
      type={interactive ? "button" : undefined}
      onClick={onClick}
      title={hint || undefined}
      aria-pressed={interactive ? !!selected : undefined}
      sx={(theme) => ({
        flex: "1 1 140px",
        minWidth: 120,
        boxSizing: "border-box",
        textAlign: "left",
        font: "inherit",
        color: "text.primary",
        display: "flex",
        flexDirection: "column",
        gap: 0,
        px: 1.5,
        py: 0.5,
        borderRadius: 2,
        bgcolor: "background.paper",
        border: "1px solid",
        borderColor: selected ? "primary.main" : "divider",
        boxShadow: selected ? `0 0 0 3px ${alpha(theme.palette.primary.main, 0.18)}` : "none",
        cursor: interactive ? "pointer" : "default",
        "&:hover": interactive ? { borderColor: "primary.main" } : undefined,
        "&:focus-visible": { outline: `3px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
      })}
    >
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography
        sx={{ fontSize: 24, fontWeight: 600, lineHeight: 1.15 }}
        color={color || "text.primary"}
      >
        {value}
      </Typography>
    </Box>
  );
}

function StatusChip({ status }) {
  const color = STATUS_COLORS[status] || "default";
  return (
    <Chip
      size="small"
      label={status}
      sx={(theme) =>
        color === "default"
          ? { fontWeight: 600 }
          : {
              fontWeight: 600,
              bgcolor: alpha(theme.palette[color].main, 0.12),
              color: theme.palette[color].dark,
            }
      }
    />
  );
}

function TableShell({ children, minWidth = 640 }) {
  return (
    <Paper variant="outlined" sx={{ overflowX: "auto", borderRadius: 2 }}>
      <Table
        size="small"
        sx={{
          minWidth,
          "& thead th": {
            bgcolor: "action.hover",
            fontWeight: 600,
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            color: "text.secondary",
            py: 1.25,
          },
          "& tbody td": { py: 1.25 },
        }}
      >
        {children}
      </Table>
    </Paper>
  );
}

function EmptyNote({ children }) {
  return (
    <Paper variant="outlined" sx={{ p: 4, textAlign: "center", borderRadius: 2 }}>
      <Typography variant="body2" color="text.secondary">
        {children}
      </Typography>
    </Paper>
  );
}

function TileRow({ children }) {
  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5 }} className="no-print-tiles">
      {children}
    </Box>
  );
}

function StaffingReportsTab() {
  const token = getAccessToken();

  const [reportType, setReportType] = useState("coverage_compliance");
  const [preset, setPreset] = useState("week");
  const [startDate, setStartDate] = useState(() => getPresetRange("week").start);
  const [endDate, setEndDate] = useState(() => getPresetRange("week").end);
  const [profession, setProfession] = useState("");
  const [staffFilterId, setStaffFilterId] = useState("");
  // Coverage Compliance only: filter the rows by unit, shift and status (done in the browser).
  const [unitFilterId, setUnitFilterId] = useState("");
  const [shiftFilter, setShiftFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [unitList, setUnitList] = useState([]);
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
  const [page, setPage] = useState(0);
  const [printing, setPrinting] = useState(false); // print shows every row, not just this page
  const [childExport, setChildExport] = useState(null); // Export/Print behaviour of Master schedule / Daily forms
  const [exporting, setExporting] = useState(false);
  const [subscriptionToast, setSubscriptionToast] = useState("");
  const [subscriptionsKey, setSubscriptionsKey] = useState(0);

  // Load the full staff roster once, to populate the profession/staff filters.
  useEffect(() => {
    axios
      .get(apiEndpoints.staffingStaff, { headers: getAuthHeaders(token) })
      .then((res) => setStaffList(res.data.results || res.data || []))
      .catch((err) => console.error("Failed to load staff for report filters", err));
    axios
      .get(apiEndpoints.staffingUnits, { headers: getAuthHeaders(token) })
      .then((res) => setUnitList(res.data.results || res.data || []))
      .catch((err) => console.error("Failed to load units for report filters", err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Unit + shift filters apply first; the status tiles then narrow what is left.
  const unitShiftCompliance = useMemo(
    () =>
      complianceRows.filter(
        (r) =>
          (unitFilterId === "" || String(r.unit_id) === String(unitFilterId)) &&
          (shiftFilter === "" || r.shift_type === shiftFilter)
      ),
    [complianceRows, unitFilterId, shiftFilter]
  );
  const shownCompliance = useMemo(
    () =>
      statusFilter === "all"
        ? unitShiftCompliance
        : unitShiftCompliance.filter((r) => r.status === statusFilter),
    [unitShiftCompliance, statusFilter]
  );
  const complianceFiltering = unitFilterId !== "" || shiftFilter !== "" || statusFilter !== "all";
  const countStatus = (st) => unitShiftCompliance.filter((r) => r.status === st).length;
  const complianceUnitName = unitList.find((u) => String(u.id) === String(unitFilterId))?.name;
  const complianceWarnings = (complianceSummary?.warnings || []).filter(
    (w) => !complianceUnitName || !w.startsWith("No census on file for") || w.includes(complianceUnitName)
  );

  const sortedLabor = useMemo(
    () => [...laborRows].sort((a, b) => Number(b.total_hours || 0) - Number(a.total_hours || 0)),
    [laborRows]
  );
  const laborTotal = laborRows.reduce((a, r) => a + Number(r.total_hours || 0), 0);
  const laborMax = sortedLabor.length ? Number(sortedLabor[0].total_hours || 0) : 0;

  // Back to page 1 whenever the report, its data or its filters change.
  useEffect(() => {
    setPage(0);
  }, [
    reportType,
    shifts,
    unscheduled,
    laborRows,
    complianceRows,
    messageRows,
    distributionRows,
    unitFilterId,
    shiftFilter,
    statusFilter,
    staffFilterId,
  ]);

  const pageOf = (rows) => {
    if (printing) return rows;
    const last = Math.max(0, Math.ceil(rows.length / REPORT_PAGE_SIZE) - 1);
    const p = Math.min(page, last);
    return rows.slice(p * REPORT_PAGE_SIZE, p * REPORT_PAGE_SIZE + REPORT_PAGE_SIZE);
  };

  // Page arrows under each report table.
  const pager = (count) => {
    if (count <= REPORT_PAGE_SIZE) return null;
    const last = Math.max(0, Math.ceil(count / REPORT_PAGE_SIZE) - 1);
    return (
      <TablePagination
        component="div"
        count={count}
        page={Math.min(page, last)}
        onPageChange={(e, p) => setPage(p)}
        rowsPerPage={REPORT_PAGE_SIZE}
        rowsPerPageOptions={[]}
        className="no-print"
        sx={{ borderBottom: 0 }}
      />
    );
  };

  const professions = useMemo(
    () => Array.from(new Set(staffList.map((s) => s.profession))).sort(),
    [staffList]
  );

  const showProfessionFilter = ["schedule", "unscheduled", "labor_hours", "shift_distribution"].includes(
    reportType
  );
  const hasDates = !NO_DATE_REPORTS.includes(reportType);

  const handlePresetChange = (_e, value) => {
    if (!value) return;
    setPreset(value);
    if (value !== "custom") {
      const range = getPresetRange(value);
      setStartDate(range.start);
      setEndDate(range.end);
    }
  };

  // Previous / next day, week, month or custom-length range.
  const stepRange = (dir) => {
    if (!startDate || !endDate) return;
    const s = parseISO(startDate);
    const e = parseISO(endDate);
    let ns;
    let ne;
    if (preset === "today") {
      ns = addDays(s, dir);
      ne = ns;
    } else if (preset === "week") {
      ns = addDays(s, 7 * dir);
      ne = addDays(ns, 6);
    } else if (preset === "month") {
      ns = new Date(s.getFullYear(), s.getMonth() + dir, 1);
      ne = new Date(ns.getFullYear(), ns.getMonth() + 1, 0);
    } else {
      const span = Math.round((e - s) / 86400000) + 1;
      ns = addDays(s, span * dir);
      ne = addDays(e, span * dir);
    }
    setStartDate(formatLocalDate(ns));
    setEndDate(formatLocalDate(ne));
  };

  const runReport = useCallback(async () => {
    if (!startDate || !endDate || reportType === "master_schedule" || reportType === "daily_forms" || reportType === "subscriptions") return;
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
      shownCompliance.map((r) => [
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

  const handlePrint = () => {
    setPrinting(true);
    setTimeout(() => {
      window.print();
      setPrinting(false);
    }, 150);
  };

  // The filters on screen travel with an export or a new subscription.
  const reportParams = () => {
    switch (reportType) {
      case "schedule":
        return { profession, staff: staffFilterId };
      case "message_log":
        return { staff: staffFilterId };
      case "labor_hours":
      case "unscheduled":
      case "shift_distribution":
        return { profession };
      case "coverage_compliance":
        return { unit: unitFilterId, shift: shiftFilter, status: statusFilter === "all" ? "" : statusFilter };
      default:
        return {};
    }
  };

  const handleExportFile = async (fmt) => {
    if (fmt === "csv") {
      exportInfo?.run();
      return;
    }
    setExporting(true);
    setError("");
    try {
      await downloadReportFile({ kind: reportType, file: "pdf", params: { start: startDate, end: endDate, ...reportParams() } });
    } catch (err) {
      setError(await blobErrorMessage(err, "Could not create the PDF."));
    } finally {
      setExporting(false);
    }
  };

  const meta = REPORT_BY_VALUE[reportType];
  const exportInfo = {
    schedule: { count: shifts.length, run: handleExportSchedule },
    unscheduled: { count: unscheduled.length, run: handleExportUnscheduled },
    labor_hours: { count: laborRows.length, run: handleExportLaborHours },
    coverage_compliance: { count: shownCompliance.length, run: handleExportCompliance },
    message_log: { count: messageRows.length, run: handleExportMessageLog },
    shift_distribution: { count: distributionRows.length, run: handleExportDistribution },
  }[reportType];
  const exportState = exportInfo
    ? {
        formats: ["pdf", "csv"],
        disabled: exportInfo.count === 0,
        busy: exporting,
        onExport: handleExportFile,
        onPrint: handlePrint,
      }
    : childExport;

  const clearComplianceFilters = () => {
    setUnitFilterId("");
    setShiftFilter("");
    setStatusFilter("all");
  };

  const staffFilterControl = (
    <FormControl size="small" sx={{ minWidth: 200 }}>
      <InputLabel id="report-staff-label">Staff</InputLabel>
      <Select
        labelId="report-staff-label"
        label="Staff"
        value={staffFilterId}
        onChange={(e) => setStaffFilterId(e.target.value)}
      >
        <MenuItem value="">All staff</MenuItem>
        {staffList.map((s) => (
          <MenuItem key={s.id} value={s.id}>
            {s.full_name}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );

  const professionFilterControl = (
    <FormControl size="small" sx={{ minWidth: 200 }}>
      <InputLabel id="report-profession-label">Profession</InputLabel>
      <Select
        labelId="report-profession-label"
        label="Profession"
        value={profession}
        onChange={(e) => setProfession(e.target.value)}
      >
        <MenuItem value="">All professions</MenuItem>
        {professions.map((p) => (
          <MenuItem key={p} value={p}>
            {p}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );

  const distributionCount = (t) =>
    distributionTotals && distributionTotals[t] != null
      ? distributionTotals[t]
      : distributionRows.reduce((a, r) => a + (r[t] || 0), 0);

  // Title, description, date controls and Export/Print share the frozen row with the page title.
  const headerSlot = useContext(StaffingHeaderSlotContext);
  const [actionsSlot, setActionsSlot] = useState(null);
  const [summarySlot, setSummarySlot] = useState(null);

  // A report's summary tiles and filter row sit in the frozen header, under the date range and Export, so they
  // stay put while the table scrolls. Printing still includes the tiles through a print-only copy in the report.
  const pinSummary = (tiles, bar) => (
    <>
      {summarySlot ? (
        createPortal(
          <Box className="no-print" sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {tiles}
            {bar}
          </Box>,
          summarySlot
        )
      ) : (
        <>
          {tiles}
          {bar}
        </>
      )}
      {summarySlot && <Box className="print-only-tiles">{tiles}</Box>}
    </>
  );
  const reportHeader = (
    <Box
      className="no-print"
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "274px minmax(0, 1fr)" },
        alignItems: "start",
        pb: 1.5,
      }}
    >
      <Typography variant="h5" component="h2" sx={{ fontWeight: 600 }}>
        Reports
      </Typography>
      <Stack direction="row" alignItems="flex-start" flexWrap="wrap" useFlexGap gap={1.5} sx={{ minWidth: 0 }}>
        <Box sx={{ minWidth: 0, flex: "0 1 auto", maxWidth: 300 }}>
          <Typography variant="h5" component="h3" noWrap title={meta.label} sx={{ fontWeight: 600 }}>
            {meta.label}
          </Typography>
          <Typography variant="body2" color="text.secondary" title={meta.description} noWrap>
            {meta.description}
          </Typography>
        </Box>
          {hasDates && (
          <Stack direction="row" spacing={1} alignItems="center" flexWrap={{ xs: "wrap", xl: "nowrap" }} useFlexGap sx={{ mt: "-4px", flex: "none" }}>
            <Stack direction="row" spacing={0.5} alignItems="center">
              <IconButton
                aria-label="Previous range"
                onClick={() => stepRange(-1)}
                sx={{ width: 40, height: 40, border: "1px solid", borderColor: "divider", borderRadius: 2 }}
              >
                <FontAwesomeIcon icon={faChevronLeft} size="sm" />
              </IconButton>
              {preset !== "custom" && (
                <Typography sx={{ minWidth: 150, textAlign: "center", fontWeight: 600, whiteSpace: "nowrap" }}>
                  {formatRange(startDate, endDate)}
                </Typography>
              )}
              <IconButton
                aria-label="Next range"
                onClick={() => stepRange(1)}
                sx={{ width: 40, height: 40, border: "1px solid", borderColor: "divider", borderRadius: 2 }}
              >
                <FontAwesomeIcon icon={faChevronRight} size="sm" />
              </IconButton>
            </Stack>

            <ToggleButtonGroup size="small" value={preset} exclusive onChange={handlePresetChange} aria-label="Date range">
              <ToggleButton value="today">Today</ToggleButton>
              <ToggleButton value="week">This week</ToggleButton>
              <ToggleButton value="month">This month</ToggleButton>
              <ToggleButton value="custom">Custom</ToggleButton>
            </ToggleButtonGroup>

            {preset === "custom" && (
              <>
                <TextField
                  label="Start"
                  type="date"
                  size="small"
                  sx={{ width: 138 }}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
                <TextField
                  label="End"
                  type="date"
                  size="small"
                  sx={{ width: 138 }}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
              </>
            )}
          </Stack>
        )}
        <Box sx={{ ml: "auto", display: "flex", alignItems: "center", gap: 1, flexWrap: "nowrap", flex: "none", mt: "-6px", "& .MuiButton-root": { minHeight: 40 } }}>
          {/* Master schedule and Daily staffing forms put their own controls here. */}
          <Box ref={setActionsSlot} sx={{ display: "contents" }} />
          {reportType !== "subscriptions" && (
            <>
              <SubscribeButton
                key={reportType}
                report={reportType}
                reportLabel={meta.label}
                iconOnly
                params={reportParams()}
                people={staffList}
                units={unitList}
                onSaved={() => {
                  setSubscriptionToast(`Subscribed to ${meta.label}. Manage it under Subscriptions.`);
                  setSubscriptionsKey((k) => k + 1);
                }}
              />
              {exportState && (
                <>
                  <ReportExportMenu
                    formats={exportState.formats}
                    onExport={exportState.onExport}
                    disabled={exportState.disabled}
                    busy={exportState.busy}
                    iconOnly
                  />
                  <ReportPrintButton iconOnly onClick={exportState.onPrint} disabled={exportState.disabled} />
                </>
              )}
            </>
          )}
        </Box>
      </Stack>
      <Box ref={setSummarySlot} sx={{ gridColumn: "1 / -1" }} />
    </Box>
  );

  return (
    <Box>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
          .print-only-header { display: block !important; margin-bottom: 12px; }
          .print-only-tiles { display: block !important; margin-bottom: 12px; }
        }
        .print-only-header { display: none; }
        .print-only-tiles { display: none; }
      `}</style>

      {headerSlot ? createPortal(reportHeader, headerSlot) : reportHeader}

      <ReportActionsSlotContext.Provider value={actionsSlot}>
      <ReportExportContext.Provider value={setChildExport}>
      <Box sx={{ display: "flex", flexDirection: { xs: "column", md: "row" }, gap: 3, alignItems: "flex-start" }}>
        {/* Report picker: a grouped list on wide screens, a select on narrow ones */}
        <Box
          className="no-print"
          sx={{
            width: { xs: "100%", md: 250 },
            flex: "none",
            // The report list stays in place while the page scrolls (under the frozen header).
            position: { md: "sticky" },
            top: { md: "calc(64px + var(--staffing-sticky-h, 130px) + 16px)" },
            maxHeight: { md: "calc(100vh - 64px - var(--staffing-sticky-h, 130px) - 32px)" },
            overflowY: { md: "auto" },
          }}
        >
          <FormControl size="small" fullWidth sx={{ display: { xs: "flex", md: "none" } }}>
            <InputLabel id="report-type-label">Report</InputLabel>
            <Select
              labelId="report-type-label"
              label="Report"
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
            >
              {ALL_REPORTS.map((r) => (
                <MenuItem key={r.value} value={r.value}>
                  {r.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Paper
            component="nav"
            aria-label="Reports"
            variant="outlined"
            sx={{ display: { xs: "none", md: "flex" }, flexDirection: "column", gap: 0.25, p: 1, borderRadius: 2 }}
          >
            {REPORT_GROUPS.map((group, gi) => (
              <Box key={group.label} sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
                <Typography
                  variant="caption"
                  sx={{
                    px: 1.5,
                    pt: gi === 0 ? 1 : 1.75,
                    pb: 0.5,
                    fontWeight: 600,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    color: "text.secondary",
                  }}
                >
                  {group.label}
                </Typography>
                {group.items.map((item) => {
                  const selected = item.value === reportType;
                  return (
                    <Box
                      key={item.value}
                      component="button"
                      type="button"
                      aria-current={selected ? "page" : undefined}
                      onClick={() => setReportType(item.value)}
                      sx={(theme) => ({
                        minHeight: 44,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 1,
                        px: 1.5,
                        border: 0,
                        borderRadius: 1.5,
                        font: "inherit",
                        fontSize: 15,
                        fontWeight: selected ? 600 : 400,
                        textAlign: "left",
                        cursor: "pointer",
                        bgcolor: selected ? alpha(theme.palette.primary.main, 0.12) : "transparent",
                        color: selected ? "primary.dark" : "text.primary",
                        "&:hover": {
                          bgcolor: selected
                            ? alpha(theme.palette.primary.main, 0.16)
                            : theme.palette.action.hover,
                        },
                        "&:focus-visible": {
                          outline: `3px solid ${theme.palette.primary.main}`,
                          outlineOffset: 1,
                        },
                      })}
                    >
                      <span>{item.label}</span>
                      {item.printable && (
                        <Chip
                          size="small"
                          variant="outlined"
                          label="Printable"
                          sx={{ height: 20, fontSize: 11 }}
                        />
                      )}
                    </Box>
                  );
                })}
              </Box>
            ))}
          </Paper>
        </Box>

        {/* The report */}
        <Box sx={{ flex: "1 1 0", minWidth: 0, width: "100%" }}>
          {error && (
            <Alert severity="error" sx={{ mb: 1.5 }} className="no-print">
              {error}
            </Alert>
          )}

          {loading && (
            <Box sx={{ display: "flex", justifyContent: "center", py: 3 }} className="no-print">
              <CircularProgress />
            </Box>
          )}

          <Box className="print-area">
            {reportType === "master_schedule" ? (
              <StaffingMasterReport />
            ) : reportType === "daily_forms" ? (
              <StaffingDailyReports />
            ) : reportType === "subscriptions" ? (
              <StaffingSubscriptionsPanel
                people={staffList}
                units={unitList}
                refreshKey={subscriptionsKey}
                onOpenReport={setReportType}
              />
            ) : (
              <Typography variant="h6" className="print-only-header">
                {meta.label} — {formatRange(startDate, endDate)}
                <br />
                <Typography component="span" variant="body2" color="text.secondary">
                  Printed {new Date().toLocaleString()}
                </Typography>
              </Typography>
            )}

            {/* ------------------------------------------------ Coverage compliance */}
            {!loading && reportType === "coverage_compliance" && (
              <Stack spacing={2}>
                {pinSummary(
                <TileRow>
                  <SummaryTile
                    label="Checks run"
                    value={unitShiftCompliance.length}
                    hint="Unit and shift combinations"
                    selected={statusFilter === "all"}
                    onClick={() => setStatusFilter("all")}
                  />
                  <SummaryTile
                    label="Understaffed"
                    value={countStatus("Understaffed")}
                    hint="Fewer staff than required"
                    color="error.main"
                    selected={statusFilter === "Understaffed"}
                    onClick={() => setStatusFilter("Understaffed")}
                  />
                  <SummaryTile
                    label="At risk"
                    value={countStatus("At risk")}
                    hint="Met with no spare staff"
                    color="warning.dark"
                    selected={statusFilter === "At risk"}
                    onClick={() => setStatusFilter("At risk")}
                  />
                  <SummaryTile
                    label="Met"
                    value={countStatus("Met")}
                    hint="Fully covered"
                    color="success.dark"
                    selected={statusFilter === "Met"}
                    onClick={() => setStatusFilter("Met")}
                  />
                </TileRow>,
                <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap className="no-print">
                  <FormControl size="small" sx={{ minWidth: 170 }}>
                    <InputLabel id="report-unit-label">Unit</InputLabel>
                    <Select
                      labelId="report-unit-label"
                      label="Unit"
                      value={unitFilterId}
                      onChange={(e) => setUnitFilterId(e.target.value)}
                    >
                      <MenuItem value="">All units</MenuItem>
                      {unitList.map((u) => (
                        <MenuItem key={u.id} value={u.id}>
                          {u.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <FormControl size="small" sx={{ minWidth: 150 }}>
                    <InputLabel id="report-shift-label">Shift</InputLabel>
                    <Select
                      labelId="report-shift-label"
                      label="Shift"
                      value={shiftFilter}
                      onChange={(e) => setShiftFilter(e.target.value)}
                    >
                      <MenuItem value="">All shifts</MenuItem>
                      <MenuItem value="day">Day</MenuItem>
                      <MenuItem value="evening">Evening</MenuItem>
                      <MenuItem value="night">Night</MenuItem>
                      {complianceRows.some((r) => r.shift_type === "custom") && (
                        <MenuItem value="custom">Custom</MenuItem>
                      )}
                    </Select>
                  </FormControl>
                  <Typography variant="body2" color="text.secondary">
                    Showing {shownCompliance.length} of {complianceRows.length} checks
                  </Typography>
                  {complianceFiltering && (
                    <Button size="small" onClick={clearComplianceFilters}>
                      Clear filters
                    </Button>
                  )}
                </Stack>
                )}

                {complianceWarnings.map((w) => (
                  <Alert key={w} severity="warning">
                    {w}
                  </Alert>
                ))}

                {shownCompliance.length > 0 && (
                  <>
                    <TableShell minWidth={900}>
                      <TableHead>
                        <TableRow>
                          <TableCell>Date</TableCell>
                          <TableCell>Unit and shift</TableCell>
                          <TableCell align="right">Census</TableCell>
                          <TableCell>Staff assigned</TableCell>
                          <TableCell>Care hours</TableCell>
                          <TableCell>Status</TableCell>
                          <TableCell>Details</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {pageOf(shownCompliance).map((r, idx) => {
                          const sched = Number(r.hours_scheduled ?? 0);
                          const req = Number(r.required_hours ?? 0);
                          const pct = req > 0 ? Math.min(100, Math.round((sched / req) * 100)) : 100;
                          const short = Number(r.assigned) < Number(r.required);
                          return (
                            <TableRow key={idx} sx={{ verticalAlign: "top" }}>
                              <TableCell sx={{ whiteSpace: "nowrap" }}>{r.date}</TableCell>
                              <TableCell>
                                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                  {r.unit_name || "—"}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {r.shift_type_display}
                                  {r.mode === "hppd" ? "" : " (fixed requirement)"}
                                </Typography>
                              </TableCell>
                              <TableCell align="right">
                                {r.mode === "hppd" && r.census != null
                                  ? `${r.census}${r.census_source === "carried_forward" ? "*" : ""}`
                                  : "—"}
                              </TableCell>
                              <TableCell>
                                <Box component="span" sx={{ fontWeight: 600, color: short ? "error.main" : "text.primary" }}>
                                  {r.assigned}
                                </Box>
                                <Box component="span" sx={{ color: "text.secondary" }}>
                                  {" "}of {r.required} needed
                                </Box>
                              </TableCell>
                              <TableCell sx={{ minWidth: 150 }}>
                                {r.mode === "hppd" ? (
                                  <>
                                    <Typography variant="body2">
                                      {sched.toFixed(1)} of {req.toFixed(1)}
                                    </Typography>
                                    <LinearProgress
                                      variant="determinate"
                                      value={pct}
                                      color={sched >= req ? "success" : "error"}
                                      sx={{ mt: 0.75, height: 6, borderRadius: 3, width: 120 }}
                                    />
                                  </>
                                ) : (
                                  "—"
                                )}
                              </TableCell>
                              <TableCell>
                                <StatusChip status={r.status} />
                                {r.alert_sent && (
                                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                                    Alert sent
                                  </Typography>
                                )}
                              </TableCell>
                              <TableCell sx={{ maxWidth: 300 }}>
                                {[...(r.shortfalls || []), r.note].filter(Boolean).join("; ") || "—"}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </TableShell>
                    {pager(shownCompliance.length)}
                  </>
                )}

                {complianceRows.length > 0 && shownCompliance.length === 0 && (
                  <EmptyNote>No checks match these filters.</EmptyNote>
                )}
                {complianceRows.length === 0 && (
                  <EmptyNote>
                    Nothing to check for this date range. The report uses your state's staffing standard for every unit
                    that has a census (set the clinic location on the Calendar tab and enter a census on the Units & Census
                    tab), plus any coverage requirements added on the Assign Schedule tab.
                  </EmptyNote>
                )}
                {shownCompliance.some((r) => r.census_source === "carried_forward") && (
                  <Typography variant="caption" color="text.secondary">
                    * Census carried forward from the most recent entry (no census was entered for that date).
                  </Typography>
                )}
              </Stack>
            )}

            {/* ------------------------------------------------ Schedule */}
            {!loading && reportType === "schedule" && (
              <Stack spacing={2}>
                {pinSummary(
                <TileRow>
                  <SummaryTile label="Shifts" value={shifts.length} hint="In this date range" />
                  <SummaryTile
                    label="People scheduled"
                    value={new Set(shifts.map((s) => s.staff_name)).size}
                    hint="With at least one shift"
                  />
                  <SummaryTile
                    label="Days with shifts"
                    value={new Set(shifts.map((s) => s.date)).size}
                    hint="Out of the days shown"
                  />
                </TileRow>,
                <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap className="no-print">
                  {staffFilterControl}
                  {showProfessionFilter && professionFilterControl}
                </Stack>
                )}
                {shifts.length === 0 ? (
                  <EmptyNote>No shifts in this date range.</EmptyNote>
                ) : (
                  <>
                    <TableShell>
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
                        {pageOf(shifts).map((s) => (
                          <TableRow key={s.id}>
                            <TableCell sx={{ whiteSpace: "nowrap" }}>{s.date}</TableCell>
                            <TableCell sx={{ fontWeight: 500 }}>{s.staff_name}</TableCell>
                            <TableCell>{s.profession}</TableCell>
                            <TableCell>{s.shift_type_display || s.shift_type}</TableCell>
                            <TableCell>{s.start_time || "—"}</TableCell>
                            <TableCell>{s.end_time || "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </TableShell>
                    {pager(shifts.length)}
                  </>
                )}
              </Stack>
            )}

            {/* ------------------------------------------------ Unscheduled staff */}
            {!loading && reportType === "unscheduled" && (
              <Stack spacing={2}>
                {pinSummary(
                <TileRow>
                  <SummaryTile
                    label="Staff with no schedule"
                    value={unscheduled.length}
                    hint="Active staff with no shifts in this range"
                    color={unscheduled.length ? "warning.dark" : undefined}
                  />
                </TileRow>,
                <Stack direction="row" spacing={1.5} className="no-print">
                  {professionFilterControl}
                </Stack>
                )}
                {unscheduled.length === 0 ? (
                  <EmptyNote>Everyone active has at least one shift in this date range.</EmptyNote>
                ) : (
                  <>
                    <TableShell>
                      <TableHead>
                        <TableRow>
                          <TableCell>Name</TableCell>
                          <TableCell>Profession</TableCell>
                          <TableCell>Email</TableCell>
                          <TableCell>Phone</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {pageOf(unscheduled).map((s) => (
                          <TableRow key={s.id}>
                            <TableCell sx={{ fontWeight: 500 }}>{s.full_name}</TableCell>
                            <TableCell>{s.profession_display || s.profession}</TableCell>
                            <TableCell>{s.email || "—"}</TableCell>
                            <TableCell>{s.phone_number || "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </TableShell>
                    {pager(unscheduled.length)}
                  </>
                )}
              </Stack>
            )}

            {/* ------------------------------------------------ Labor hours */}
            {!loading && reportType === "labor_hours" && (
              <Stack spacing={2}>
                {pinSummary(
                <TileRow>
                  <SummaryTile label="Total scheduled hours" value={laborTotal.toFixed(1)} hint="All shifts in the range" />
                  <SummaryTile label="People scheduled" value={laborRows.length} hint="With at least one shift" />
                  <SummaryTile
                    label="Average per person"
                    value={laborRows.length ? (laborTotal / laborRows.length).toFixed(1) : "0.0"}
                    hint="Hours in this range"
                  />
                  <SummaryTile
                    label="Most hours"
                    value={sortedLabor.length ? Number(sortedLabor[0].total_hours || 0).toFixed(1) : "0.0"}
                    hint={sortedLabor.length ? sortedLabor[0].full_name : "No one scheduled"}
                  />
                </TileRow>,
                <Stack direction="row" spacing={1.5} alignItems="center" className="no-print">
                  {professionFilterControl}
                  <Typography variant="body2" color="text.secondary">
                    Sorted by most hours
                  </Typography>
                </Stack>
                )}
                {sortedLabor.length === 0 ? (
                  <EmptyNote>No scheduled hours in this date range.</EmptyNote>
                ) : (
                  <>
                    <TableShell minWidth={620}>
                      <TableHead>
                        <TableRow>
                          <TableCell>Staff</TableCell>
                          <TableCell>Profession</TableCell>
                          <TableCell align="right">Shifts</TableCell>
                          <TableCell sx={{ minWidth: 220 }}>Total hours</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {pageOf(sortedLabor).map((r) => {
                          const hrs = Number(r.total_hours || 0);
                          return (
                            <TableRow key={r.staff_id}>
                              <TableCell sx={{ fontWeight: 500 }}>{r.full_name}</TableCell>
                              <TableCell>{r.profession}</TableCell>
                              <TableCell align="right">{r.shift_count}</TableCell>
                              <TableCell>
                                <Stack direction="row" spacing={1.5} alignItems="center">
                                  <Box sx={{ width: 52, textAlign: "right" }}>{hrs.toFixed(1)}</Box>
                                  <LinearProgress
                                    variant="determinate"
                                    value={laborMax > 0 ? Math.round((hrs / laborMax) * 100) : 0}
                                    sx={{ flex: 1, height: 8, borderRadius: 4 }}
                                  />
                                </Stack>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </TableShell>
                    {pager(sortedLabor.length)}
                  </>
                )}
              </Stack>
            )}

            {/* ------------------------------------------------ Message log */}
            {!loading && reportType === "message_log" && (
              <Stack spacing={2}>
                {pinSummary(
                <TileRow>
                  <SummaryTile label="Messages sent" value={messageRows.length} hint="In this date range" />
                  <SummaryTile
                    label="Texts"
                    value={messageRows.filter((r) => String(r.channel).toLowerCase().startsWith("sms") || String(r.channel).toLowerCase() === "text").length}
                    hint="Sent by SMS"
                  />
                  <SummaryTile
                    label="Emails"
                    value={messageRows.filter((r) => String(r.channel).toLowerCase() === "email").length}
                    hint="Sent by email"
                  />
                </TileRow>,
                <Stack direction="row" spacing={1.5} alignItems="center" className="no-print">
                  {staffFilterControl}
                </Stack>
                )}
                {messageTruncated && (
                  <Alert severity="info">
                    Showing the most recent 1000 messages. Narrow the date range to see the full list.
                  </Alert>
                )}
                {messageRows.length === 0 ? (
                  <EmptyNote>No messages were sent in this date range.</EmptyNote>
                ) : (
                  <>
                    <TableShell minWidth={820}>
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
                        {pageOf(messageRows).map((r, idx) => (
                          <TableRow key={idx}>
                            <TableCell sx={{ whiteSpace: "nowrap" }}>{new Date(r.sent_at).toLocaleString()}</TableCell>
                            <TableCell>{r.channel}</TableCell>
                            <TableCell>{r.category}</TableCell>
                            <TableCell>{r.recipient}</TableCell>
                            <TableCell>{r.staff_name || "—"}</TableCell>
                            <TableCell>{r.subject || "—"}</TableCell>
                            <TableCell>{r.status || "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </TableShell>
                    {pager(messageRows.length)}
                  </>
                )}
              </Stack>
            )}

            {/* ------------------------------------------------ Shift distribution */}
            {!loading && reportType === "shift_distribution" && (
              <Stack spacing={2}>
                {pinSummary(
                <TileRow>
                  {SHIFT_TYPE_ORDER.map((t) => (
                    <SummaryTile
                      key={t}
                      label={`${SHIFT_TYPE_LABELS[t]} shifts`}
                      value={distributionCount(t)}
                      hint="Across all staff"
                    />
                  ))}
                </TileRow>,
                <Stack direction="row" spacing={1.5} className="no-print">
                  {professionFilterControl}
                </Stack>
                )}
                {distributionRows.length === 0 ? (
                  <EmptyNote>No shifts in this date range.</EmptyNote>
                ) : (
                  <>
                    <TableShell minWidth={620}>
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
                        {pageOf(distributionRows).map((r) => (
                          <TableRow key={r.staff_id}>
                            <TableCell sx={{ fontWeight: 500 }}>{r.full_name}</TableCell>
                            <TableCell>{r.profession}</TableCell>
                            {SHIFT_TYPE_ORDER.map((t) => (
                              <TableCell key={t} align="right">
                                {r[t] || 0}
                              </TableCell>
                            ))}
                            <TableCell align="right" sx={{ fontWeight: 600 }}>
                              {r.total}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </TableShell>
                    {pager(distributionRows.length)}
                  </>
                )}
              </Stack>
            )}
          </Box>
        </Box>
      </Box>
      </ReportExportContext.Provider>
      </ReportActionsSlotContext.Provider>
      <Snackbar
        open={!!subscriptionToast}
        autoHideDuration={5000}
        onClose={() => setSubscriptionToast("")}
        message={subscriptionToast}
      />
    </Box>
  );
}

export default StaffingReportsTab;
