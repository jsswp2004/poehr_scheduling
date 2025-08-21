import React, { useState } from "react";
import { API_BASE_URL } from "../../config/api";
import { getAccessToken } from "../../utils/tokenManager";
import {
  Box,
  Typography,
  Paper,
  Button,
  Grid,
  FormControl,
  InputLabel,
  Select as MUISelect,
  MenuItem,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  CircularProgress,
} from "@mui/material";
import { LocalizationProvider, DatePicker } from "@mui/x-date-pickers";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faDownload,
  faPrint,
  faTrash,
  faPlay,
} from "@fortawesome/free-solid-svg-icons";

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
  const renderReportPreview = () => {
    if (previewLoading) {
      return (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "300px",
            gap: 2,
          }}
        >
          <CircularProgress />
          <Typography variant="body1" color="text.secondary">
            Loading {selectedReportName}...
          </Typography>
        </Box>
      );
    }

    if (previewError) {
      return (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "300px",
            gap: 2,
            color: "error.main",
          }}
        >
          <Typography variant="h6" color="error">
            Error Loading Report
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ textAlign: "center" }}
          >
            {previewError}
          </Typography>
          <Button
            variant="outlined"
            onClick={() =>
              selectedReportName && handleRunReport(selectedReportName)
            }
            size="small"
          >
            Try Again
          </Button>
        </Box>
      );
    }

    if (previewData) {
      return (
        <Box sx={{ height: "100%" }}>
          {/* Report Header */}
          <Box sx={{ mb: 3, pb: 2, borderBottom: "2px solid #1976d2" }}>
            <Typography variant="h6" sx={{ color: "primary.main", mb: 1 }}>
              {selectedReportName}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Generated on{" "}
              {new Date().toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Typography>
          </Box>

          {/* Filter Summary */}
          <Box sx={{ mb: 3, p: 2, bgcolor: "#f5f5f5", borderRadius: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 500, mb: 1 }}>
              Applied Filters:
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={4}>
                <Typography variant="body2" color="text.secondary">
                  <strong>Date Range:</strong>
                  <br />
                  {formatDate(reportStartDate)} - {formatDate(reportEndDate)}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={4}>
                <Typography variant="body2" color="text.secondary">
                  <strong>Provider:</strong>
                  <br />
                  {getProviderName()}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={4}>
                <Typography variant="body2" color="text.secondary">
                  <strong>Total Records:</strong>
                  <br />
                  {previewData.records ? previewData.records.length : 0}
                </Typography>
              </Grid>
            </Grid>
          </Box>

          {/* Report Data */}
          {previewData.records && previewData.records.length > 0 ? (
            <TableContainer sx={{ maxHeight: "400px" }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    {Object.keys(previewData.records[0]).map((header) => (
                      <TableCell
                        key={header}
                        sx={{
                          fontWeight: "bold",
                          bgcolor: "#1976d2",
                          color: "white",
                        }}
                      >
                        {header
                          .replace(/([A-Z])/g, " $1")
                          .replace(/^./, (str) => str.toUpperCase())
                          .replace(/_/g, " ")}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {previewData.records.map((record, index) => (
                    <TableRow
                      key={index}
                      sx={{ "&:nth-of-type(even)": { bgcolor: "#f9f9f9" } }}
                    >
                      {Object.keys(record).map((key) => {
                        let value = record[key] || "N/A";

                        // Format date/time fields
                        if (
                          key.toLowerCase().includes("date") ||
                          key.toLowerCase().includes("time")
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
                                value = date.toLocaleDateString("en-US", {
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                });
                              }
                            } catch (e) {
                              // Keep original value if parsing fails
                            }
                          }
                        }

                        return (
                          <TableCell key={key} sx={{ fontSize: "0.875rem" }}>
                            {value}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: "200px",
                bgcolor: "#f9f9f9",
                borderRadius: 1,
                border: "2px dashed #ccc",
              }}
            >
              <Typography variant="h6" color="text.secondary">
                📊 No Data Available
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ textAlign: "center", mt: 1 }}
              >
                No records found for this report with the current filters.
                <br />
                Try adjusting your date range or provider selection.
              </Typography>
            </Box>
          )}
        </Box>
      );
    }

    // Default state - no report selected
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "300px",
          gap: 2,
          color: "text.secondary",
        }}
      >
        <Typography variant="h6">📊 Report Preview</Typography>
        <Typography variant="body1" sx={{ textAlign: "center" }}>
          Select a report and click the "Run" button to preview the results
          here.
        </Typography>
      </Box>
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
      if (Array.isArray(reportData)) {
        return {
          summary: {
            totalRecords: reportData.length,
            reportGenerated: new Date().toISOString(),
            filters: {
              startDate:
                reportStartDate?.toISOString().split("T")[0] || "Not set",
              endDate: reportEndDate?.toISOString().split("T")[0] || "Not set",
              provider:
                reportProvider === "all" ? "All Providers" : reportProvider,
            },
          },
          records: reportData,
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
                                color: #d32f2f;
                            }
                            .error-container {
                                padding: 40px;
                                border: 2px solid #d32f2f;
                                border-radius: 10px;
                                background-color: #ffebee;
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
                                background-color: #d32f2f;
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
                                border-bottom: 2px solid #1976d2;
                                padding-bottom: 20px;
                                margin-bottom: 30px;
                            }
                            .report-title {
                                font-size: 24px;
                                font-weight: bold;
                                color: #1976d2;
                                margin-bottom: 10px;
                            }
                            .report-info {
                                font-size: 14px;
                                color: #666;
                            }
                            .filters {
                                background-color: #f5f5f5;
                                padding: 15px;
                                border-radius: 5px;
                                margin-bottom: 20px;
                            }
                            .filters h3 {
                                margin-top: 0;
                                color: #1976d2;
                                font-size: 16px;
                            }
                            .no-data-container {
                                text-align: center;
                                padding: 60px 20px;
                                background-color: #f9f9f9;
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
                                background-color: #1976d2;
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
                        border-bottom: 2px solid #1976d2;
                        padding-bottom: 20px;
                        margin-bottom: 30px;
                    }
                    .report-title {
                        font-size: 24px;
                        font-weight: bold;
                        color: #1976d2;
                        margin-bottom: 10px;
                    }
                    .report-info {
                        font-size: 14px;
                        color: #666;
                    }
                    .filters {
                        background-color: #f5f5f5;
                        padding: 15px;
                        border-radius: 5px;
                        margin-bottom: 20px;
                    }
                    .filters h3 {
                        margin-top: 0;
                        color: #1976d2;
                        font-size: 16px;
                    }
                    .summary-section, .details-section, .records-section {
                        margin: 30px 0;
                        page-break-inside: avoid;
                    }
                    .summary-section h3, .details-section h3, .records-section h3 {
                        color: #1976d2;
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
                        background-color: #f9f9f9;
                        border-radius: 5px;
                        border-left: 4px solid #1976d2;
                    }
                    .stat-label {
                        font-weight: 500;
                        color: #555;
                    }
                    .stat-value {
                        font-weight: bold;
                        color: #1976d2;
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
                        background-color: #1976d2;
                        color: white;
                        font-weight: bold;
                    }
                    .data-table tr:nth-child(even) {
                        background-color: #f9f9f9;
                    }
                    .status-badge {
                        padding: 2px 6px;
                        border-radius: 3px;
                        font-size: 11px;
                        font-weight: bold;
                    }
                    .status-completed { background-color: #d4edda; color: #155724; }
                    .status-cancelled { background-color: #f8d7da; color: #721c24; }
                    .status-no-show { background-color: #fff3cd; color: #856404; }
                    .status-paid { background-color: #d4edda; color: #155724; }
                    .status-pending { background-color: #fff3cd; color: #856404; }
                    .status-processed { background-color: #d1ecf1; color: #0c5460; }
                    .status-blocked { background-color: #f8d7da; color: #721c24; }
                    .frequency-high { background-color: #d4edda; color: #155724; }
                    .frequency-medium { background-color: #fff3cd; color: #856404; }
                    .frequency-low { background-color: #f8d7da; color: #721c24; }
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
                    <button onclick="window.print()" style="padding: 12px 24px; background-color: #1976d2; color: white; border: none; border-radius: 5px; cursor: pointer; margin-right: 10px; font-size: 14px;">Print Report</button>
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

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Box>
        {/* Analytics Sub-tabs */}
        <Tabs
          value={analyticsTab}
          onChange={(e, newVal) => setAnalyticsTab(newVal)}
          sx={{
            mb: 0,
            "& .MuiTabs-indicator": {
              height: 3,
              borderRadius: 1,
            },
          }}
        >
          <Tab label="Standard Reports" value="standard" />
          <Tab label="Advanced Analytics" value="advanced" />
        </Tabs>

        {/* Standard Reports - New Three Panel Layout */}
        {analyticsTab === "standard" && (
          <Box>
            {/* Top Panel - Report Filters */}
            <Paper sx={{ p: 3, mb: 0 }}>
              <Typography variant="h6" sx={{ mb: 0, color: "primary.main" }}>
                Report Filters
              </Typography>

              <Grid container spacing={3} alignItems="center">
                <Grid item xs={12} sm={6} md={3}>
                  <DatePicker
                    label="Start Date"
                    value={reportStartDate}
                    onChange={setReportStartDate}
                    slotProps={{
                      textField: {
                        size: "small",
                        fullWidth: true,
                      },
                    }}
                  />
                </Grid>

                <Grid item xs={12} sm={6} md={3}>
                  <DatePicker
                    label="End Date"
                    value={reportEndDate}
                    onChange={setReportEndDate}
                    slotProps={{
                      textField: {
                        size: "small",
                        fullWidth: true,
                      },
                    }}
                  />
                </Grid>

                <Grid item xs={12} sm={6} md={3}>
                  <FormControl size="small" fullWidth>
                    <InputLabel>Provider</InputLabel>
                    <MUISelect
                      value={reportProvider}
                      label="Provider"
                      onChange={(e) => setReportProvider(e.target.value)}
                    >
                      <MenuItem value="all">All Providers</MenuItem>
                      {providers.map((provider) => (
                        <MenuItem key={provider.id} value={provider.id}>
                          Dr. {provider.first_name} {provider.last_name}
                        </MenuItem>
                      ))}
                    </MUISelect>
                  </FormControl>
                </Grid>

                <Grid item xs={12} sm={6} md={3}>
                  <Typography variant="body2" color="text.secondary">
                    <strong>Current Filters:</strong>
                    <br />
                    {formatDate(reportStartDate)} - {formatDate(reportEndDate)}
                    <br />
                    {getProviderName()}
                  </Typography>
                </Grid>
              </Grid>
            </Paper>

            {/* Bottom Panel - Left: Reports Table, Right: Preview */}
            <Grid container spacing={3}>
              {/* Left Panel - Reports Table */}
              <Grid item xs={12} md={5}>
                <Paper
                  sx={{
                    p: 3,
                    height: "calc(70vh - 100px)",
                    overflowY: "auto",
                  }}
                >
                  <Typography
                    variant="h6"
                    sx={{ mb: 0, color: "primary.main" }}
                  >
                    Standard Reports
                  </Typography>

                  <TableContainer>
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: "bold" }}>
                            Report Name
                          </TableCell>
                          <TableCell sx={{ fontWeight: "bold" }}>
                            Actions
                          </TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {analyticsReports.map((report) => (
                          <TableRow
                            key={report}
                            sx={{
                              "&:nth-of-type(odd)": {
                                backgroundColor: "#f9f9f9",
                              },
                              "&:hover": {
                                backgroundColor: "#f0f7ff",
                              },
                            }}
                          >
                            <TableCell>
                              <Typography
                                variant="body2"
                                sx={{ fontWeight: 500 }}
                              >
                                {report}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Box
                                sx={{
                                  display: "flex",
                                  gap: 1,
                                  flexWrap: "wrap",
                                }}
                              >
                                <IconButton
                                  size="small"
                                  onClick={() => handleRunReport(report)}
                                  sx={{
                                    color: "#2e7d32",
                                    "&:hover": {
                                      backgroundColor: "#e8f5e8",
                                    },
                                  }}
                                  title="Run Report"
                                >
                                  <FontAwesomeIcon icon={faPlay} size="sm" />
                                </IconButton>
                                <IconButton
                                  size="small"
                                  onClick={() => onDownloadReport(report)}
                                  sx={{
                                    color: "#1976d2",
                                    "&:hover": {
                                      backgroundColor: "#e3f2fd",
                                    },
                                  }}
                                  title="Download"
                                >
                                  <FontAwesomeIcon
                                    icon={faDownload}
                                    size="sm"
                                  />
                                </IconButton>
                                <IconButton
                                  size="small"
                                  onClick={() => handlePrintReport(report)}
                                  sx={{
                                    color: "#ed6c02",
                                    "&:hover": {
                                      backgroundColor: "#fff4e6",
                                    },
                                  }}
                                  title="Print"
                                >
                                  <FontAwesomeIcon icon={faPrint} size="sm" />
                                </IconButton>
                                <IconButton
                                  size="small"
                                  onClick={() => handleDeleteReport(report)}
                                  sx={{
                                    color: "#d32f2f",
                                    "&:hover": {
                                      backgroundColor: "#ffebee",
                                    },
                                  }}
                                  title="Delete"
                                >
                                  <FontAwesomeIcon icon={faTrash} size="sm" />
                                </IconButton>
                              </Box>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Paper>
              </Grid>

              {/* Right Panel - Report Preview */}
              <Grid item xs={12} md={7}>
                <Paper
                  sx={{
                    p: 3,
                    height: "calc(70vh - 100px)",
                    overflowY: "auto",
                  }}
                >
                  <Typography
                    variant="h6"
                    sx={{ mb: 0, color: "primary.main" }}
                  >
                    Report Preview
                  </Typography>
                  {renderReportPreview()}
                </Paper>
              </Grid>
            </Grid>
          </Box>
        )}

        {/* Advanced Analytics - New Three Panel Layout */}
        {analyticsTab === "advanced" && (
          <Box>
            {/* Top Panel - Report Filters */}
            <Paper sx={{ p: 3, mb: 0 }}>
              <Typography variant="h6" sx={{ mb: 0, color: "primary.main" }}>
                Report Filters
              </Typography>

              <Grid container spacing={3} alignItems="center">
                <Grid item xs={12} sm={6} md={3}>
                  <DatePicker
                    label="Start Date"
                    value={reportStartDate}
                    onChange={setReportStartDate}
                    slotProps={{
                      textField: {
                        size: "small",
                        fullWidth: true,
                      },
                    }}
                  />
                </Grid>

                <Grid item xs={12} sm={6} md={3}>
                  <DatePicker
                    label="End Date"
                    value={reportEndDate}
                    onChange={setReportEndDate}
                    slotProps={{
                      textField: {
                        size: "small",
                        fullWidth: true,
                      },
                    }}
                  />
                </Grid>

                <Grid item xs={12} sm={6} md={3}>
                  <FormControl size="small" fullWidth>
                    <InputLabel>Provider</InputLabel>
                    <MUISelect
                      value={reportProvider}
                      label="Provider"
                      onChange={(e) => setReportProvider(e.target.value)}
                    >
                      <MenuItem value="all">All Providers</MenuItem>
                      {providers.map((provider) => (
                        <MenuItem key={provider.id} value={provider.id}>
                          Dr. {provider.first_name} {provider.last_name}
                        </MenuItem>
                      ))}
                    </MUISelect>
                  </FormControl>
                </Grid>

                <Grid item xs={12} sm={6} md={3}>
                  <Typography variant="body2" color="text.secondary">
                    <strong>Current Filters:</strong>
                    <br />
                    {formatDate(reportStartDate)} - {formatDate(reportEndDate)}
                    <br />
                    {getProviderName()}
                  </Typography>
                </Grid>
              </Grid>
            </Paper>

            {/* Bottom Panel - Left: Reports Table, Right: Preview */}
            <Grid container spacing={3}>
              {/* Left Panel - Reports Table */}
              <Grid item xs={12} md={5}>
                <Paper
                  sx={{
                    p: 3,
                    height: "calc(70vh - 100px)",
                    overflowY: "auto",
                  }}
                >
                  <Typography
                    variant="h6"
                    sx={{ mb: 0, color: "primary.main" }}
                  >
                    Advanced Analytics
                  </Typography>

                  <TableContainer>
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: "bold" }}>
                            Report Name
                          </TableCell>
                          <TableCell sx={{ fontWeight: "bold" }}>
                            Actions
                          </TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {advancedAnalyticsReports.map((report) => (
                          <TableRow
                            key={report}
                            sx={{
                              "&:nth-of-type(odd)": {
                                backgroundColor: "#f9f9f9",
                              },
                              "&:hover": {
                                backgroundColor: "#f0f7ff",
                              },
                            }}
                          >
                            <TableCell>
                              <Typography
                                variant="body2"
                                sx={{ fontWeight: 500 }}
                              >
                                {report}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Box
                                sx={{
                                  display: "flex",
                                  gap: 1,
                                  flexWrap: "wrap",
                                }}
                              >
                                <IconButton
                                  size="small"
                                  onClick={() => handleRunReport(report)}
                                  sx={{
                                    color: "#2e7d32",
                                    "&:hover": {
                                      backgroundColor: "#e8f5e8",
                                    },
                                  }}
                                  title="Run Report"
                                >
                                  <FontAwesomeIcon icon={faPlay} size="sm" />
                                </IconButton>
                                <IconButton
                                  size="small"
                                  onClick={() => onDownloadReport(report)}
                                  sx={{
                                    color: "#1976d2",
                                    "&:hover": {
                                      backgroundColor: "#e3f2fd",
                                    },
                                  }}
                                  title="Download"
                                >
                                  <FontAwesomeIcon
                                    icon={faDownload}
                                    size="sm"
                                  />
                                </IconButton>
                                <IconButton
                                  size="small"
                                  onClick={() => handlePrintReport(report)}
                                  sx={{
                                    color: "#ed6c02",
                                    "&:hover": {
                                      backgroundColor: "#fff4e6",
                                    },
                                  }}
                                  title="Print"
                                >
                                  <FontAwesomeIcon icon={faPrint} size="sm" />
                                </IconButton>
                                <IconButton
                                  size="small"
                                  onClick={() => handleDeleteReport(report)}
                                  sx={{
                                    color: "#d32f2f",
                                    "&:hover": {
                                      backgroundColor: "#ffebee",
                                    },
                                  }}
                                  title="Delete"
                                >
                                  <FontAwesomeIcon icon={faTrash} size="sm" />
                                </IconButton>
                              </Box>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Paper>
              </Grid>

              {/* Right Panel - Report Preview */}
              <Grid item xs={12} md={7}>
                <Paper
                  sx={{
                    p: 3,
                    height: "calc(70vh - 200px)",
                    overflowY: "auto",
                  }}
                >
                  <Typography
                    variant="h6"
                    sx={{ mb: 2, color: "primary.main" }}
                  >
                    Report Preview
                  </Typography>
                  {renderReportPreview()}
                </Paper>
              </Grid>
            </Grid>
          </Box>
        )}
      </Box>
    </LocalizationProvider>
  );
}

export default AnalyticsSection;
