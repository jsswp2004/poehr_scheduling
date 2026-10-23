import React, { useState } from "react";
import { API_BASE_URL } from "../../config/api";
import { getAccessToken } from "../../utils/tokenManager";
import { useSubscriptionAccess } from "../../hooks/useSubscriptionAccess";
import {
  Box,
  Typography,
  Button,
  FormControl,
  InputLabel,
  Select as MUISelect,
  MenuItem,
  Menu,
  Chip,
  Skeleton,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
} from "@mui/material";
import { LocalizationProvider, DatePicker } from "@mui/x-date-pickers";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faDownload,
  faPrint,
  faEllipsisVertical,
  faChartColumn,
  faMagnifyingGlass,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";

const BORDER = "#dfe4ec";
const cardSx = {
  bgcolor: "#fff",
  border: `1px solid ${BORDER}`,
  borderRadius: "10px",
};

// How the reports are grouped in the list. A report that is not listed here
// still shows up, under "Other", so nothing is ever hidden.
const GROUPS = {
  standard: [
    ["Appointments", ["Upcoming Appointments Report", "Past Appointments Report", "Appointment Status Report", "Appointment Duration Summary", "Appointment Recurrence Report"]],
    ["Schedule", ["Provider Schedule Report", "Blocked Time Slots"]],
    ["Patients", ["New Patient Registrations"]],
  ],
  advanced: [
    ["Volume and flow", ["Appointment Volume Trends", "Appointment Lead Time Analysis", "Blocked vs. Booked Time Comparison"]],
    ["Attendance", ["No-Show & Cancellation Rate", "Patient Visit Frequency"]],
    ["Providers and patients", ["Provider Utilization Report", "New vs. Returning Patients", "Patient Demographic Breakdown"]],
  ],
};

export const groupReports = (kind, reports = []) => {
  const known = new Set();
  const out = [];
  (GROUPS[kind] || []).forEach(([label, names]) => {
    const items = names.filter((n) => reports.includes(n));
    items.forEach((n) => known.add(n));
    if (items.length) out.push({ label, items });
  });
  const rest = reports.filter((n) => !known.has(n));
  if (rest.length) out.push({ label: "Other", items: rest });
  return out;
};

const noon = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12);
export const QUICK_RANGES = [
  { key: "today", label: "Today", range: (n) => [noon(n), noon(n)] },
  { key: "7d", label: "Last 7 days", range: (n) => [noon(new Date(n.getFullYear(), n.getMonth(), n.getDate() - 6)), noon(n)] },
  { key: "month", label: "This month", range: (n) => [noon(new Date(n.getFullYear(), n.getMonth(), 1)), noon(new Date(n.getFullYear(), n.getMonth() + 1, 0))] },
  { key: "last", label: "Last month", range: (n) => [noon(new Date(n.getFullYear(), n.getMonth() - 1, 1)), noon(new Date(n.getFullYear(), n.getMonth(), 0))] },
];
const sameDay = (a, b) =>
  !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
export const activeQuickRange = (start, end, now = new Date()) => {
  const hit = QUICK_RANGES.find((q) => {
    const [s, e] = q.range(now);
    return sameDay(s, start) && sameDay(e, end);
  });
  return hit ? hit.key : null;
};

const shortDate = (d) =>
  d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Not set";

const headerLabel = (header) =>
  header
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase())
    .replace(/_/g, " ");

const cellValue = (key, raw) => {
  let value = raw || "N/A";
  if (key.toLowerCase().includes("date") || key.toLowerCase().includes("time")) {
    if (value && value !== "N/A" && typeof value === "string" && value.includes("T")) {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        value = date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
      }
    }
  }
  return value;
};

function CenterState({ icon, title, children, action, color = "text.secondary", testId }) {
  return (
    <Box data-testid={testId} sx={{ textAlign: "center", py: 8, px: 2, color }}>
      <Box sx={{ fontSize: 28, mb: 1 }}><FontAwesomeIcon icon={icon} /></Box>
      <Typography sx={{ fontWeight: 600, fontSize: 15, color: "text.primary" }}>{title}</Typography>
      <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5 }}>{children}</Typography>
      {action && <Box sx={{ mt: 1.5 }}>{action}</Box>}
    </Box>
  );
}

function Tile({ label, value }) {
  return (
    <Box sx={{ flex: 1, minWidth: 120, bgcolor: "#f8fafc", border: `1px solid ${BORDER}`, borderRadius: "8px", px: 1.75, py: 1.25 }}>
      <Typography variant="caption" sx={{ color: "text.secondary" }}>{label}</Typography>
      <Typography sx={{ fontSize: 18, fontWeight: 600, lineHeight: 1.3 }}>{value}</Typography>
    </Box>
  );
}

function AnalyticsSection({
  analyticsTab,
  setAnalyticsTab,
  reportStartDate,
  setReportStartDate,
  reportEndDate,
  setReportEndDate,
  reportProvider,
  setReportProvider,
  providers,
  analyticsReports,
  advancedAnalyticsReports,
  onDownloadReport,
  organizationData,
  organizationLogo,
}) {
  // Subscription access control
  const { permissions, tier } = useSubscriptionAccess();
  
  // State for report preview functionality
  const [previewData, setPreviewData] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(null);
  const [selectedReportName, setSelectedReportName] = useState(null);

  const formatDate = (date) => {
    if (!date) return "Not set";
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const getProviderName = () => {
    if (reportProvider === "all") return "All Providers";
    const provider = providers.find(
      (p) => p.id.toString() === reportProvider.toString()
    );
    return provider
      ? `Dr. ${provider.first_name} ${provider.last_name}`
      : "Unknown Provider";
  };

  // Handle running a report for preview
  const handleRunReport = async (reportName) => {
    setPreviewLoading(true);
    setPreviewError(null);
    setSelectedReportName(reportName);

    try {
      console.log(`🚀 Running report for preview: ${reportName}`);
      const reportData = await fetchReportData(reportName);

      if (reportData.error) {
        setPreviewError(
          reportData.summary.message || "Failed to fetch report data"
        );
        setPreviewData(null);
      } else {
        setPreviewData(reportData);
        setPreviewError(null);
      }
    } catch (error) {
      console.error("Error running report for preview:", error);
      setPreviewError(error.message || "Failed to load report");
      setPreviewData(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  // Render the report preview panel

  // Row menu (Download / Print / Delete) for the report list
  const [menu, setMenu] = useState({ anchor: null, report: null });
  const closeMenu = () => setMenu({ anchor: null, report: null });
  const kind = analyticsTab === "advanced" ? "advanced" : "standard";
  const reportList = kind === "advanced" ? advancedAnalyticsReports : analyticsReports;

  const changeTab = (value) => {
    setAnalyticsTab(value);
    setPreviewData(null);
    setPreviewError(null);
    setSelectedReportName(null);
  };

  // Re-run the open report when its filters change, so the table never
  // disagrees with the dates shown above it.
  const applyQuickRange = (q) => {
    const [s, e] = q.range(new Date());
    setReportStartDate(s);
    setReportEndDate(e);
  };

  // Render the report preview panel
  const renderReportPreview = () => {
    if (previewLoading) {
      return (
        <Box data-testid="preview-loading">
          <Typography sx={{ fontSize: 16, fontWeight: 600 }}>{selectedReportName}</Typography>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>Running…</Typography>
          <Box sx={{ mt: 2 }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} variant="rounded" height={14} sx={{ my: 2.25, width: `${90 - i * 6}%` }} />
            ))}
          </Box>
        </Box>
      );
    }

    if (previewError) {
      return (
        <CenterState
          testId="preview-error"
          icon={faTriangleExclamation}
          color="error.main"
          title="Could not run this report"
          action={
            <Button
              variant="contained"
              size="small"
              onClick={() => selectedReportName && handleRunReport(selectedReportName)}
            >
              Try again
            </Button>
          }
        >
          {previewError}. Your filters are kept.
        </CenterState>
      );
    }

    if (previewData) {
      const records = previewData.records || [];
      return (
        <Box data-testid="preview-report">
          <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.5, flexWrap: "wrap", mb: 1.5 }}>
            <Box sx={{ flex: 1, minWidth: 200 }}>
              <Typography sx={{ fontSize: 16, fontWeight: 600 }}>{selectedReportName}</Typography>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                Generated{" "}
                {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })}
              </Typography>
            </Box>
            <Button
              variant="contained"
              size="small"
              startIcon={<FontAwesomeIcon icon={faDownload} size="sm" />}
              onClick={() => onDownloadReport(selectedReportName)}
            >
              Download
            </Button>
            <Button
              variant="outlined"
              size="small"
              startIcon={<FontAwesomeIcon icon={faPrint} size="sm" />}
              onClick={() => handlePrintReport(selectedReportName)}
            >
              Print
            </Button>
          </Box>

          <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", mb: 2 }}>
            <Tile label="Records" value={records.length} />
            <Tile label="Date range" value={`${shortDate(reportStartDate)} – ${shortDate(reportEndDate)}`} />
            <Tile label="Provider" value={getProviderName()} />
          </Box>

          {records.length > 0 ? (
            <TableContainer sx={{ maxHeight: 520, border: `1px solid ${BORDER}`, borderRadius: "8px" }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    {Object.keys(records[0]).map((header) => (
                      <TableCell key={header} sx={{ fontWeight: 700, bgcolor: "#f3f5f9", color: "text.primary" }}>
                        {headerLabel(header)}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {records.map((record, index) => (
                    <TableRow key={index} hover>
                      {Object.keys(record).map((key) => (
                        <TableCell key={key} sx={{ fontSize: "0.875rem" }}>
                          {cellValue(key, record[key])}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <CenterState
              testId="preview-empty-data"
              icon={faMagnifyingGlass}
              title="No records found"
              action={
                reportProvider !== "all" ? (
                  <Button variant="outlined" size="small" onClick={() => setReportProvider("all")}>
                    Show all providers
                  </Button>
                ) : null
              }
            >
              No records for {shortDate(reportStartDate)} – {shortDate(reportEndDate)}
              {reportProvider !== "all" ? ` and ${getProviderName()}` : ""}. Try a wider date range.
            </CenterState>
          )}
        </Box>
      );
    }

    return (
      <CenterState testId="preview-idle" icon={faChartColumn} title="Pick a report">
        Choose a report on the left to see it here. Your dates and provider apply to every report.
      </CenterState>
    );
  };

  const fetchReportData = async (reportType) => {
    try {
      console.log(`📊 Fetching real data for report: ${reportType}`);

      // Use the same API endpoint that works for downloads
      const params = new URLSearchParams();
      params.append("report_type", reportType);

      if (reportStartDate) {
        params.append(
          "start_date",
          reportStartDate.toISOString().split("T")[0]
        );
      }
      if (reportEndDate) {
        params.append("end_date", reportEndDate.toISOString().split("T")[0]);
      }
      if (reportProvider && reportProvider !== "all") {
        params.append("provider_id", reportProvider);
      }

      // Use the working backend endpoint (same as download functionality)
      const backendUrl = process.env.REACT_APP_BACKEND_URL || API_BASE_URL;
      const endpoint = `${backendUrl}/api/analytics/reports/?${params.toString()}`;

      console.log(`🌐 Backend URL: ${backendUrl}`);
      console.log(`🔗 Full endpoint: ${endpoint}`);
      console.log(
        `🔑 Access token: ${getAccessToken() ? "Available" : "Missing"}`
      );

      const response = await fetch(endpoint, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAccessToken()}`,
        },
      });

      if (!response.ok) {
        throw new Error(
          `HTTP error! status: ${response.status} - ${response.statusText}`
        );
      }

      const result = await response.json();
      console.log(`✅ Successfully fetched data for ${reportType}:`, result);

      // The API returns data in result.data format
      const reportData = result.data;

      // Handle different data structures returned by the API
      const buildFilters = () => ({
        startDate:
          reportStartDate?.toISOString().split("T")[0] || "Not set",
        endDate: reportEndDate?.toISOString().split("T")[0] || "Not set",
        provider:
          reportProvider === "all" ? "All Providers" : reportProvider,
      });

      if (Array.isArray(reportData)) {
        return {
          summary: {
            totalRecords: reportData.length,
            reportGenerated: new Date().toISOString(),
            filters: buildFilters(),
          },
          records: reportData,
        };
      } else if (reportType === "Provider Schedule Report") {
        // Backend groups this report by provider name instead of returning
        // a flat list: { "Dr. Smith": [ {...appt}, ... ], "Dr. Jones": [...] }
        // Flatten it into one record array (tagging each row with its
        // provider) so the preview table -- which only knows how to render
        // previewData.records -- actually shows the data.
        const flatRecords = Object.entries(reportData || {}).flatMap(
          ([providerName, appts]) =>
            (appts || []).map((apt) => ({ provider: providerName, ...apt }))
        );
        return {
          summary: {
            totalRecords: flatRecords.length,
            reportGenerated: new Date().toISOString(),
            filters: buildFilters(),
          },
          records: flatRecords,
        };
      } else if (reportType === "Appointment Status Report") {
        // Backend returns { summary: [ {status, count, percentage}, ... ], total }
        // rather than a "records" array. Use the status breakdown itself as
        // the preview table's records so it's not left empty.
        const statusRecords = reportData?.summary || [];
        return {
          summary: {
            totalRecords: reportData?.total ?? statusRecords.length,
            reportGenerated: new Date().toISOString(),
            filters: buildFilters(),
          },
          records: statusRecords,
        };
      } else if (reportType === "Appointment Duration Summary") {
        // Backend returns { statistics: {...}, distribution: {...} } -- pure
        // aggregate numbers, no list. Flatten into Metric/Value rows.
        const stats = reportData?.statistics || {};
        const distribution = reportData?.distribution || {};
        const records = [
          { metric: "Average Duration (min)", value: stats.average_duration ?? "N/A" },
          { metric: "Total Duration (hours)", value: stats.total_duration_hours ?? "N/A" },
          { metric: "Min Duration (min)", value: stats.min_duration ?? "N/A" },
          { metric: "Max Duration (min)", value: stats.max_duration ?? "N/A" },
          { metric: "Total Appointments", value: stats.total_appointments ?? "N/A" },
          ...Object.entries(distribution).map(([range, count]) => ({
            metric: range,
            value: count,
          })),
        ];
        return {
          summary: {
            totalRecords: records.length,
            reportGenerated: new Date().toISOString(),
            filters: buildFilters(),
          },
          records,
        };
      } else if (reportType === "Appointment Volume Trends") {
        // Backend returns { trend_data: [ {date, count}, ... ], total_appointments, average_daily }
        const trendRecords = reportData?.trend_data || [];
        return {
          summary: {
            totalRecords: trendRecords.length,
            reportGenerated: new Date().toISOString(),
            filters: buildFilters(),
            totalAppointments: reportData?.total_appointments,
            averageDaily: reportData?.average_daily,
          },
          records: trendRecords,
        };
      } else if (reportType === "No-Show & Cancellation Rate") {
        // Backend returns { totals: {...}, rates: {...} } -- pure aggregate,
        // no list. Flatten into Metric/Value rows.
        const totals = reportData?.totals || {};
        const rates = reportData?.rates || {};
        const records = [
          { metric: "Total Appointments", value: totals.total_appointments ?? "N/A" },
          { metric: "Scheduled", value: totals.scheduled ?? "N/A" },
          { metric: "Completed", value: totals.completed ?? "N/A" },
          { metric: "Cancelled", value: totals.cancelled ?? "N/A" },
          { metric: "No Show", value: totals.no_show ?? "N/A" },
          { metric: "Completion Rate", value: `${rates.completion_rate ?? "N/A"}%` },
          { metric: "Cancellation Rate", value: `${rates.cancellation_rate ?? "N/A"}%` },
          { metric: "No-Show Rate", value: `${rates.no_show_rate ?? "N/A"}%` },
          { metric: "Scheduled Rate", value: `${rates.scheduled_rate ?? "N/A"}%` },
        ];
        return {
          summary: {
            totalRecords: records.length,
            reportGenerated: new Date().toISOString(),
            filters: buildFilters(),
          },
          records,
        };
      } else if (reportType === "Provider Utilization Report") {
        // Backend returns { provider_utilization: [ {...}, ... ] }
        const providerRecords = reportData?.provider_utilization || [];
        return {
          summary: {
            totalRecords: providerRecords.length,
            reportGenerated: new Date().toISOString(),
            filters: buildFilters(),
          },
          records: providerRecords,
        };
      } else if (reportType === "Patient Visit Frequency") {
        // Backend returns { frequency_distribution: {...}, top_frequent_patients: [...], total_unique_patients }
        const distribution = reportData?.frequency_distribution || {};
        const topPatients = reportData?.top_frequent_patients || [];
        const records = [
          ...Object.entries(distribution).map(([range, count]) => ({
            category: "Visit Frequency",
            label: range,
            value: count,
          })),
          ...topPatients.map((p) => ({
            category: "Top Patient",
            label: p.patient_name,
            value: p.visit_count,
          })),
        ];
        return {
          summary: {
            totalRecords: records.length,
            reportGenerated: new Date().toISOString(),
            filters: buildFilters(),
            totalUniquePatients: reportData?.total_unique_patients,
          },
          records,
        };
      } else if (reportType === "New vs. Returning Patients") {
        // Backend returns { new_patients: {count, patients:[...]}, returning_patients: {count, patients:[...]}, ratio }
        const newPatients = reportData?.new_patients?.patients || [];
        const returningPatients = reportData?.returning_patients?.patients || [];
        const records = [
          ...newPatients.map((p) => ({
            type: "New",
            patient_id: p.patient_id,
            appointment_info: `First appt ${p.first_appointment}, ${p.total_appointments} total`,
          })),
          ...returningPatients.map((p) => ({
            type: "Returning",
            patient_id: p.patient_id,
            appointment_info: `${p.appointments_in_period} appointment(s) in period`,
          })),
        ];
        return {
          summary: {
            totalRecords: records.length,
            reportGenerated: new Date().toISOString(),
            filters: buildFilters(),
            newPercentage: reportData?.ratio?.new_percentage,
            returningPercentage: reportData?.ratio?.returning_percentage,
          },
          records,
        };
      } else if (reportType === "Appointment Lead Time Analysis") {
        // Backend returns { average_lead_time_days, lead_time_distribution: {...}, total_analyzed } -- pure aggregate, no list.
        const distribution = reportData?.lead_time_distribution || {};
        const records = [
          { metric: "Average Lead Time (days)", value: reportData?.average_lead_time_days ?? "N/A" },
          { metric: "Total Analyzed", value: reportData?.total_analyzed ?? "N/A" },
          ...Object.entries(distribution).map(([range, count]) => ({
            metric: range,
            value: count,
          })),
        ];
        return {
          summary: {
            totalRecords: records.length,
            reportGenerated: new Date().toISOString(),
            filters: buildFilters(),
          },
          records,
        };
      } else if (reportType === "Patient Demographic Breakdown") {
        // Backend returns { total_patients, age_distribution: {...}, appointment_frequency: {...} } -- pure aggregate, no list.
        const ageDistribution = reportData?.age_distribution || {};
        const apptFrequency = reportData?.appointment_frequency || {};
        const records = [
          { metric: "Total Patients", value: reportData?.total_patients ?? "N/A" },
          ...Object.entries(ageDistribution).map(([range, count]) => ({
            metric: `Age: ${range}`,
            value: count,
          })),
          { metric: "Single Visit Patients", value: apptFrequency.single_visit ?? "N/A" },
          { metric: "Multiple Visit Patients", value: apptFrequency.multiple_visits ?? "N/A" },
        ];
        return {
          summary: {
            totalRecords: records.length,
            reportGenerated: new Date().toISOString(),
            filters: buildFilters(),
          },
          records,
        };
      } else if (reportType === "Blocked vs. Booked Time Comparison") {
        // Backend returns { booked_time: {...}, blocked_time: {...}, total_time_hours, efficiency_ratio } -- pure aggregate, no list.
        const booked = reportData?.booked_time || {};
        const blocked = reportData?.blocked_time || {};
        const records = [
          { metric: "Booked Minutes", value: booked.minutes ?? "N/A" },
          { metric: "Booked Hours", value: booked.hours ?? "N/A" },
          { metric: "Booked %", value: `${booked.percentage ?? "N/A"}%` },
          { metric: "Blocked Minutes", value: blocked.minutes ?? "N/A" },
          { metric: "Blocked Hours", value: blocked.hours ?? "N/A" },
          { metric: "Blocked %", value: `${blocked.percentage ?? "N/A"}%` },
          { metric: "Total Time (hours)", value: reportData?.total_time_hours ?? "N/A" },
          { metric: "Efficiency Ratio", value: reportData?.efficiency_ratio ?? "N/A" },
        ];
        return {
          summary: {
            totalRecords: records.length,
            reportGenerated: new Date().toISOString(),
            filters: buildFilters(),
          },
          records,
        };
      } else if (typeof reportData === "object" && reportData !== null) {
        // Handle object data (like status reports with summary)
        return {
          summary: reportData.summary || reportData,
          records: reportData.details || reportData.records || [],
          ...reportData,
        };
      } else {
        throw new Error("Unexpected data format received from API");
      }
    } catch (error) {
      console.error(`❌ Error fetching report data for ${reportType}:`, error);

      // Return empty structure with error info
      return {
        summary: {
          error: `Unable to fetch ${reportType}`,
          message: error.message,
          timestamp: new Date().toISOString(),
        },
        records: [],
        error: true,
      };
    }
  };

  const handlePrintReport = async (report) => {
    try {
      console.log(`🖨️ Generating print preview for: ${report}`);

      // Get report data from API
      const reportData = await fetchReportData(report);
      const currentDate = new Date();

      // Check if there was an error fetching data
      if (reportData.error) {
        const errorContent = `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>Error - ${report}</title>
                        <style>
                            body {
                                font-family: Arial, sans-serif;
                                margin: 20px;
                                text-align: center;
                                color: #dc2626;
                            }
                            .error-container {
                                padding: 40px;
                                border: 2px solid #dc2626;
                                border-radius: 10px;
                                background-color: #fee2e2;
                                margin: 50px auto;
                                max-width: 600px;
                            }
                            .error-title {
                                font-size: 24px;
                                font-weight: bold;
                                margin-bottom: 20px;
                            }
                            .error-message {
                                font-size: 16px;
                                margin-bottom: 20px;
                                color: #666;
                            }
                            button {
                                padding: 12px 24px;
                                background-color: #dc2626;
                                color: white;
                                border: none;
                                border-radius: 5px;
                                cursor: pointer;
                                font-size: 14px;
                            }
                        </style>
                    </head>
                    <body>
                        <div class="error-container">
                            <div class="error-title">❌ Error Loading ${report}</div>
                            <div class="error-message">${
                              reportData.summary.message ||
                              "Unable to fetch report data from the server."
                            }</div>
                            <div class="error-message">Please check your connection and try again, or contact your system administrator.</div>
                            <button onclick="window.close()">Close Window</button>
                        </div>
                    </body>
                    </html>
                `;

        const printWindow = window.open("", "_blank", "width=800,height=600");
        printWindow.document.write(errorContent);
        printWindow.document.close();
        printWindow.focus();
        return;
      }

      // Check if there are no records
      if (!reportData.records || reportData.records.length === 0) {
        const noDataContent = `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>No Data - ${report}</title>
                        <style>
                            body {
                                font-family: Arial, sans-serif;
                                margin: 20px;
                                line-height: 1.6;
                                color: #333;
                            }
                            .header {
                                text-align: center;
                                border-bottom: 2px solid #2563eb;
                                padding-bottom: 20px;
                                margin-bottom: 30px;
                            }
                            .report-title {
                                font-size: 24px;
                                font-weight: bold;
                                color: #2563eb;
                                margin-bottom: 10px;
                            }
                            .report-info {
                                font-size: 14px;
                                color: #666;
                            }
                            .filters {
                                background-color: #f8fafc;
                                padding: 15px;
                                border-radius: 5px;
                                margin-bottom: 20px;
                            }
                            .filters h3 {
                                margin-top: 0;
                                color: #2563eb;
                                font-size: 16px;
                            }
                            .no-data-container {
                                text-align: center;
                                padding: 60px 20px;
                                background-color: #f8fafc;
                                border-radius: 10px;
                                border: 2px dashed #ccc;
                            }
                            .no-data-title {
                                font-size: 24px;
                                color: #666;
                                margin-bottom: 15px;
                            }
                            .no-data-message {
                                font-size: 16px;
                                color: #888;
                                margin-bottom: 30px;
                            }
                            .no-print {
                                text-align: center;
                                margin-top: 30px;
                                border-top: 1px solid #ddd;
                                padding-top: 20px;
                            }
                            button {
                                padding: 12px 24px;
                                color: white;
                                border: none;
                                border-radius: 5px;
                                cursor: pointer;
                                margin-right: 10px;
                                font-size: 14px;
                            }
                            .print-btn {
                                background-color: #2563eb;
                            }
                            .close-btn {
                                background-color: #666;
                            }
                            @media print {
                                .no-print { display: none; }
                            }
                        </style>
                    </head>
                    <body>
                        <div class="header">
                            <div class="report-title">${report}</div>
                            <div class="report-info">Generated on ${currentDate.toLocaleDateString(
                              "en-US",
                              {
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              }
                            )}</div>
                            ${
                              organizationData
                                ? `<div class="report-info">Organization: ${
                                    organizationData.name ||
                                    "Healthcare Organization"
                                  }</div>`
                                : ""
                            }
                        </div>
                        
                        <div class="filters">
                            <h3>Report Filters</h3>
                            <p><strong>Date Range:</strong> ${formatDate(
                              reportStartDate
                            )} - ${formatDate(reportEndDate)}</p>
                            <p><strong>Provider:</strong> ${getProviderName()}</p>
                            <p><strong>Report Type:</strong> ${report}</p>
                        </div>
                        
                        <div class="no-data-container">
                            <div class="no-data-title">📊 No Data Available</div>
                            <div class="no-data-message">
                                No records found for this report with the current filters.<br>
                                Try adjusting your date range or provider selection.
                            </div>
                        </div>
                        
                        <div class="no-print">
                            <button class="print-btn" onclick="window.print()">Print Report</button>
                            <button class="close-btn" onclick="window.close()">Close Window</button>
                        </div>
                    </body>
                    </html>
                `;

        const printWindow = window.open("", "_blank", "width=800,height=600");
        printWindow.document.write(noDataContent);
        printWindow.document.close();
        printWindow.focus();
        return;
      }

      // Generate content with actual data
      let detailedContent = generateReportContent(report, reportData);

      // Generate printable HTML content
      const printContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>${report} - Report</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        margin: 20px;
                        line-height: 1.6;
                        color: #333;
                    }
                    .header {
                        text-align: center;
                        border-bottom: 2px solid #2563eb;
                        padding-bottom: 20px;
                        margin-bottom: 30px;
                    }
                    .report-title {
                        font-size: 24px;
                        font-weight: bold;
                        color: #2563eb;
                        margin-bottom: 10px;
                    }
                    .report-info {
                        font-size: 14px;
                        color: #666;
                    }
                    .filters {
                        background-color: #f8fafc;
                        padding: 15px;
                        border-radius: 5px;
                        margin-bottom: 20px;
                    }
                    .filters h3 {
                        margin-top: 0;
                        color: #2563eb;
                        font-size: 16px;
                    }
                    .summary-section, .details-section, .records-section {
                        margin: 30px 0;
                        page-break-inside: avoid;
                    }
                    .summary-section h3, .details-section h3, .records-section h3 {
                        color: #2563eb;
                        border-bottom: 1px solid #ddd;
                        padding-bottom: 10px;
                        margin-bottom: 20px;
                    }
                    .stats-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                        gap: 15px;
                        margin-bottom: 20px;
                    }
                    .stat-item {
                        display: flex;
                        justify-content: space-between;
                        padding: 10px;
                        background-color: #f8fafc;
                        border-radius: 5px;
                        border-left: 4px solid #2563eb;
                    }
                    .stat-label {
                        font-weight: 500;
                        color: #555;
                    }
                    .stat-value {
                        font-weight: bold;
                        color: #2563eb;
                    }
                    .data-table {
                        width: 100%;
                        border-collapse: collapse;
                        margin-top: 10px;
                    }
                    .data-table th,
                    .data-table td {
                        border: 1px solid #ddd;
                        padding: 12px;
                        text-align: left;
                        font-size: 12px;
                    }
                    .data-table th {
                        background-color: #2563eb;
                        color: white;
                        font-weight: bold;
                    }
                    .data-table tr:nth-child(even) {
                        background-color: #f8fafc;
                    }
                    .status-badge {
                        padding: 2px 6px;
                        border-radius: 3px;
                        font-size: 11px;
                        font-weight: bold;
                    }
                    .status-completed { background-color: #d1fae5; color: #065f46; }
                    .status-cancelled { background-color: #fee2e2; color: #991b1b; }
                    .status-no-show { background-color: #fef3c7; color: #92400e; }
                    .status-paid { background-color: #d1fae5; color: #065f46; }
                    .status-pending { background-color: #fef3c7; color: #92400e; }
                    .status-processed { background-color: #d1ecf1; color: #0c5460; }
                    .status-blocked { background-color: #fee2e2; color: #991b1b; }
                    .frequency-high { background-color: #d1fae5; color: #065f46; }
                    .frequency-medium { background-color: #fef3c7; color: #92400e; }
                    .frequency-low { background-color: #fee2e2; color: #991b1b; }
                    @media print {
                        body { margin: 0; }
                        .no-print { display: none; }
                        .stats-grid {
                            grid-template-columns: repeat(2, 1fr);
                        }
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <div class="report-title">${report}</div>
                    <div class="report-info">Generated on ${currentDate.toLocaleDateString(
                      "en-US",
                      {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      }
                    )}</div>
                    ${
                      organizationData
                        ? `<div class="report-info">Organization: ${
                            organizationData.name || "Healthcare Organization"
                          }</div>`
                        : ""
                    }
                </div>
                
                <div class="filters">
                    <h3>Report Filters</h3>
                    <p><strong>Date Range:</strong> ${formatDate(
                      reportStartDate
                    )} - ${formatDate(reportEndDate)}</p>
                    <p><strong>Provider:</strong> ${getProviderName()}</p>
                    <p><strong>Report Type:</strong> ${report}</p>
                </div>
                
                ${detailedContent}
                
                <div class="no-print" style="text-align: center; margin-top: 30px; border-top: 1px solid #ddd; padding-top: 20px;">
                    <button onclick="window.print()" style="padding: 12px 24px; background-color: #2563eb; color: white; border: none; border-radius: 5px; cursor: pointer; margin-right: 10px; font-size: 14px;">Print Report</button>
                    <button onclick="window.close()" style="padding: 12px 24px; background-color: #666; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 14px;">Close Window</button>
                </div>
            </body>
            </html>
        `;

      // Open new window and write content
      const printWindow = window.open("", "_blank", "width=800,height=600");
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.focus();
    } catch (error) {
      console.error("Error generating print report:", error);
      alert("Error generating report: " + error.message);
    }
  };

  const generateReportContent = (reportType, reportData) => {
    // Skip summary section for standard reports - only show detailed records

    // Generate records section if data exists
    let recordsContent = "";
    if (reportData.records && reportData.records.length > 0) {
      const firstRecord = reportData.records[0];
      const headers = Object.keys(firstRecord);

      recordsContent = `
                <div class="records-section">
                    <h3>${reportType} Details</h3>
                    <table class="data-table">
                        <thead>
                            <tr>
                                ${headers
                                  .map(
                                    (header) => `
                                    <th>${header
                                      .replace(/([A-Z])/g, " $1")
                                      .replace(/^./, (str) => str.toUpperCase())
                                      .replace(/_/g, " ")}</th>
                                `
                                  )
                                  .join("")}
                            </tr>
                        </thead>
                        <tbody>
                            ${reportData.records
                              .map(
                                (record) => `
                                <tr>
                                    ${headers
                                      .map((header) => {
                                        let value = record[header] || "N/A";

                                        // Format date/time fields
                                        if (
                                          header
                                            .toLowerCase()
                                            .includes("date") ||
                                          header.toLowerCase().includes("time")
                                        ) {
                                          if (
                                            value &&
                                            value !== "N/A" &&
                                            typeof value === "string" &&
                                            value.includes("T")
                                          ) {
                                            try {
                                              const date = new Date(value);
                                              if (!isNaN(date.getTime())) {
                                                value = date.toLocaleDateString(
                                                  "en-US",
                                                  {
                                                    year: "numeric",
                                                    month: "long",
                                                    day: "numeric",
                                                    hour: "2-digit",
                                                    minute: "2-digit",
                                                  }
                                                );
                                              }
                                            } catch (e) {
                                              // Keep original value if parsing fails
                                            }
                                          }
                                        }

                                        // Add status badge styling for status fields
                                        if (
                                          header
                                            .toLowerCase()
                                            .includes("status") ||
                                          header
                                            .toLowerCase()
                                            .includes("frequency")
                                        ) {
                                          value = `<span class="status-badge status-${value
                                            .toString()
                                            .toLowerCase()
                                            .replace(
                                              /\s+/g,
                                              "-"
                                            )}">${value}</span>`;
                                        }
                                        return `<td>${value}</td>`;
                                      })
                                      .join("")}
                                </tr>
                            `
                              )
                              .join("")}
                        </tbody>
                    </table>
                </div>
            `;
    }

    return recordsContent;
  };

  const handleDeleteReport = (report) => {
    // Show confirmation dialog
    const isConfirmed = window.confirm(
      `Are you sure you want to delete the report "${report}"?\n\nThis action cannot be undone.`
    );

    if (isConfirmed) {
      console.log("Deleting report:", report);
      // Implement actual delete functionality here
      // You might want to call an API to delete the report
      alert(`Report "${report}" has been deleted.`);
    }
  };

  const quickActive = activeQuickRange(reportStartDate, reportEndDate);
  const hasAdvanced = !!permissions?.advancedAnalytics;

  const filterCard = (
    <Box sx={{ ...cardSx, p: 2.25, display: "flex", gap: 1.75, flexWrap: "wrap", alignItems: "center" }}>
      <DatePicker
        label="Start date"
        value={reportStartDate}
        onChange={setReportStartDate}
        slotProps={{ textField: { size: "small", sx: { width: 170 } } }}
      />
      <DatePicker
        label="End date"
        value={reportEndDate}
        onChange={setReportEndDate}
        slotProps={{ textField: { size: "small", sx: { width: 170 } } }}
      />
      <FormControl size="small" sx={{ width: 230 }}>
        <InputLabel id="analytics-provider-label">Provider</InputLabel>
        <MUISelect
          labelId="analytics-provider-label"
          value={reportProvider}
          label="Provider"
          onChange={(e) => setReportProvider(e.target.value)}
        >
          <MenuItem value="all">All providers</MenuItem>
          {providers.map((provider) => (
            <MenuItem key={provider.id} value={provider.id}>
              Dr. {provider.first_name} {provider.last_name}
            </MenuItem>
          ))}
        </MUISelect>
      </FormControl>
      <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", ml: { md: 1 } }}>
        {QUICK_RANGES.map((q) => (
          <Chip
            key={q.key}
            data-testid={`quick-${q.key}`}
            label={q.label}
            size="small"
            clickable
            color={quickActive === q.key ? "primary" : "default"}
            variant={quickActive === q.key ? "filled" : "outlined"}
            onClick={() => applyQuickRange(q)}
          />
        ))}
      </Box>
    </Box>
  );

  const reportListCard = (
    <Box sx={{ ...cardSx, py: 0.75, overflow: "hidden" }}>
      {groupReports(kind, reportList).map((group) => (
        <Box key={group.label}>
          <Typography
            sx={{ px: 2, pt: 1.5, pb: 0.5, fontSize: 11.5, fontWeight: 700, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.05em" }}
          >
            {group.label}
          </Typography>
          {group.items.map((report) => {
            const on = selectedReportName === report;
            return (
              <Box
                key={report}
                data-testid={`report-row-${report}`}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  minHeight: 40,
                  pl: 1.75,
                  pr: 0.5,
                  borderLeft: `3px solid ${on ? "#1d4ed8" : "transparent"}`,
                  bgcolor: on ? "#e8f0fe" : "#fff",
                  "&:hover": { bgcolor: on ? "#e8f0fe" : "#f5f7fb" },
                }}
              >
                <Box
                  component="button"
                  type="button"
                  onClick={() => handleRunReport(report)}
                  aria-pressed={on}
                  sx={{
                    flex: 1,
                    textAlign: "left",
                    border: 0,
                    background: "transparent",
                    font: "inherit",
                    fontSize: 13.5,
                    fontWeight: on ? 600 : 400,
                    color: on ? "#0f3a9e" : "text.primary",
                    cursor: "pointer",
                    py: 1.25,
                    px: 0,
                  }}
                >
                  {report}
                </Box>
                <IconButton
                  size="small"
                  aria-label={`More actions for ${report}`}
                  onClick={(e) => setMenu({ anchor: e.currentTarget, report })}
                >
                  <FontAwesomeIcon icon={faEllipsisVertical} size="sm" />
                </IconButton>
              </Box>
            );
          })}
        </Box>
      ))}
    </Box>
  );

  const upgradeCard = (
    <Box sx={{ ...cardSx, p: 5, textAlign: "center" }} data-testid="advanced-upgrade">
      <Box sx={{ width: 52, height: 52, borderRadius: "14px", bgcolor: "#e8f0fe", color: "#1d4ed8", fontSize: 24, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        <FontAwesomeIcon icon={faChartColumn} />
      </Box>
      <Typography sx={{ fontSize: 18, fontWeight: 600, mt: 1.75 }}>Advanced Analytics</Typography>
      <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.75, maxWidth: 460, mx: "auto" }}>
        Volume trends, no-show and cancellation rates, provider utilization and more.
      </Typography>
      <Typography variant="body2" sx={{ mt: 1.75 }}>
        Your plan: <b>{tier === "basic" ? "Professional" : String(tier || "").charAt(0).toUpperCase() + String(tier || "").slice(1)}</b>
      </Typography>
      <Button variant="contained" sx={{ mt: 1.75 }} onClick={() => console.log("Navigate to upgrade page")}>
        Upgrade to Clinic Plan
      </Button>
      <Typography variant="caption" display="block" sx={{ mt: 1.25, color: "text.secondary" }}>
        Included with Clinic and Group plans
      </Typography>
    </Box>
  );

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Box>
        <Typography variant="body2" sx={{ color: "text.secondary", mb: 1.5 }}>
          Run clinic reports for a date range and provider
        </Typography>

        <Tabs
          value={analyticsTab === "advanced" ? "advanced" : "standard"}
          onChange={(e, v) => changeTab(v)}
          sx={{ borderBottom: `1px solid ${BORDER}`, mb: 2 }}
        >
          <Tab label="Standard Reports" value="standard" />
          <Tab label="Advanced Analytics" value="advanced" />
        </Tabs>

        {analyticsTab === "advanced" && !hasAdvanced ? (
          upgradeCard
        ) : (
          <>
            {filterCard}
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", md: "340px minmax(0, 1fr)" },
                gap: 2.5,
                mt: 2,
                alignItems: "start",
              }}
            >
              {reportListCard}
              <Box sx={{ ...cardSx, p: 2.5, minHeight: 420 }}>{renderReportPreview()}</Box>
            </Box>
          </>
        )}

        <Menu anchorEl={menu.anchor} open={Boolean(menu.anchor)} onClose={closeMenu}>
          <MenuItem onClick={() => { onDownloadReport(menu.report); closeMenu(); }}>Download</MenuItem>
          <MenuItem onClick={() => { handlePrintReport(menu.report); closeMenu(); }}>Print</MenuItem>
          <MenuItem sx={{ color: "error.main" }} onClick={() => { handleDeleteReport(menu.report); closeMenu(); }}>Delete</MenuItem>
        </Menu>
      </Box>
    </LocalizationProvider>
  );
}

export default AnalyticsSection;
