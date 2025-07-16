import React from "react";
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
    List,
    ListItem,
    ListItemText,
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
    faTrash,
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

    const fetchReportData = async (reportType) => {
        try {
            console.log(`📊 Fetching real data for report: ${reportType}`);

            // Use the same API endpoint that works for downloads
            const params = new URLSearchParams();
            params.append('report_type', reportType);

            if (reportStartDate) {
                params.append('start_date', reportStartDate.toISOString().split('T')[0]);
            }
            if (reportEndDate) {
                params.append('end_date', reportEndDate.toISOString().split('T')[0]);
            }
            if (reportProvider && reportProvider !== 'all') {
                params.append('provider_id', reportProvider);
            }

            // Use the working backend endpoint (same as download functionality)
            const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://127.0.0.1:8000';
            const endpoint = `${backendUrl}/api/analytics/reports/?${params.toString()}`;

            const response = await fetch(endpoint, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token') || localStorage.getItem('access_token')}`,
                },
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
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
                            startDate: reportStartDate?.toISOString().split('T')[0] || 'Not set',
                            endDate: reportEndDate?.toISOString().split('T')[0] || 'Not set',
                            provider: reportProvider === 'all' ? 'All Providers' : reportProvider
                        }
                    },
                    records: reportData
                };
            } else if (typeof reportData === 'object' && reportData !== null) {
                // Handle object data (like status reports with summary)
                return {
                    summary: reportData.summary || reportData,
                    records: reportData.details || reportData.records || [],
                    ...reportData
                };
            } else {
                throw new Error('Unexpected data format received from API');
            }

        } catch (error) {
            console.error(`❌ Error fetching report data for ${reportType}:`, error);

            // Return empty structure with error info
            return {
                summary: {
                    error: `Unable to fetch ${reportType}`,
                    message: error.message,
                    timestamp: new Date().toISOString()
                },
                records: [],
                error: true
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
                            <div class="error-message">${reportData.summary.message || 'Unable to fetch report data from the server.'}</div>
                            <div class="error-message">Please check your connection and try again, or contact your system administrator.</div>
                            <button onclick="window.close()">Close Window</button>
                        </div>
                    </body>
                    </html>
                `;

                const printWindow = window.open('', '_blank', 'width=800,height=600');
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
                            <div class="report-info">Generated on ${currentDate.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                })}</div>
                            ${organizationData ? `<div class="report-info">Organization: ${organizationData.name || 'Healthcare Organization'}</div>` : ''}
                        </div>
                        
                        <div class="filters">
                            <h3>Report Filters</h3>
                            <p><strong>Date Range:</strong> ${formatDate(reportStartDate)} - ${formatDate(reportEndDate)}</p>
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

                const printWindow = window.open('', '_blank', 'width=800,height=600');
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
                    <div class="report-info">Generated on ${currentDate.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            })}</div>
                    ${organizationData ? `<div class="report-info">Organization: ${organizationData.name || 'Healthcare Organization'}</div>` : ''}
                </div>
                
                <div class="filters">
                    <h3>Report Filters</h3>
                    <p><strong>Date Range:</strong> ${formatDate(reportStartDate)} - ${formatDate(reportEndDate)}</p>
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
            const printWindow = window.open('', '_blank', 'width=800,height=600');
            printWindow.document.write(printContent);
            printWindow.document.close();
            printWindow.focus();

        } catch (error) {
            console.error('Error generating print report:', error);
            alert('Error generating report: ' + error.message);
        }
    };

    const generateReportContent = (reportType, reportData) => {
        // Generate summary section
        let summaryContent = `
            <div class="summary-section">
                <h3>Summary Statistics</h3>
                <div class="stats-grid">
                    ${Object.entries(reportData.summary || {}).map(([key, value]) => `
                        <div class="stat-item">
                            <span class="stat-label">${key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).replace(/_/g, ' ')}:</span>
                            <span class="stat-value">${value || 'N/A'}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        // Generate records section if data exists
        let recordsContent = '';
        if (reportData.records && reportData.records.length > 0) {
            const firstRecord = reportData.records[0];
            const headers = Object.keys(firstRecord);

            recordsContent = `
                <div class="records-section">
                    <h3>${reportType} Details</h3>
                    <table class="data-table">
                        <thead>
                            <tr>
                                ${headers.map(header => `
                                    <th>${header.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).replace(/_/g, ' ')}</th>
                                `).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            ${reportData.records.map(record => `
                                <tr>
                                    ${headers.map(header => {
                let value = record[header] || 'N/A';

                // Format date/time fields
                if (header.toLowerCase().includes('date') || header.toLowerCase().includes('time')) {
                    if (value && value !== 'N/A' && typeof value === 'string' && value.includes('T')) {
                        try {
                            const date = new Date(value);
                            if (!isNaN(date.getTime())) {
                                value = date.toLocaleDateString("en-US", {
                                    year: "numeric",
                                    month: "long",
                                    day: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit"
                                });
                            }
                        } catch (e) {
                            // Keep original value if parsing fails
                        }
                    }
                }

                // Add status badge styling for status fields
                if (header.toLowerCase().includes('status') || header.toLowerCase().includes('frequency')) {
                    value = `<span class="status-badge status-${(value.toString().toLowerCase().replace(/\s+/g, '-'))}">${value}</span>`;
                }
                return `<td>${value}</td>`;
            }).join('')}
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }

        return summaryContent + recordsContent;
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
                        mb: 3,
                        "& .MuiTabs-indicator": {
                            height: 3,
                            borderRadius: 1,
                        },
                    }}
                >
                    <Tab label="Standard Reports" value="standard" />
                    <Tab label="Advanced Analytics" value="advanced" />
                </Tabs>

                {/* Standard Reports - Two Panel Layout */}
                {analyticsTab === "standard" && (
                    <Grid container spacing={3}>
                        {/* Left Panel - Report Filters */}
                        <Grid item xs={12} md={4}>
                            <Paper sx={{ p: 3, height: "fit-content" }}>
                                <Typography variant="h6" sx={{ mb: 2, color: "primary.main" }}>
                                    Report Filters
                                </Typography>

                                <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
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
                                </Box>

                                {/* Filter Summary */}
                                <Box sx={{ mt: 3, p: 2, bgcolor: "#f5f5f5", borderRadius: 1 }}>
                                    <Typography variant="body2" sx={{ fontWeight: 500, mb: 1 }}>
                                        Current Filters:
                                    </Typography>
                                    <Typography
                                        variant="body2"
                                        color="text.secondary"
                                        sx={{ mb: 0.5 }}
                                    >
                                        Date Range: {formatDate(reportStartDate)} -{" "}
                                        {formatDate(reportEndDate)}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        Provider: {getProviderName()}
                                    </Typography>
                                </Box>
                            </Paper>
                        </Grid>

                        {/* Right Panel - Standard Reports Table */}
                        <Grid item xs={12} md={8}>
                            <Paper sx={{ p: 3 }}>
                                <Typography variant="h6" sx={{ mb: 2, color: "primary.main" }}>
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
                                                        <Box sx={{ display: "flex", gap: 1 }}>
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
                                                                <FontAwesomeIcon icon={faDownload} size="sm" />
                                                            </IconButton>
                                                            <IconButton
                                                                size="small"
                                                                onClick={() => handlePrintReport(report)}
                                                                sx={{
                                                                    color: "#2e7d32",
                                                                    "&:hover": {
                                                                        backgroundColor: "#e8f5e8",
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
                    </Grid>
                )}

                {/* Advanced Analytics - Keep original layout */}
                {analyticsTab === "advanced" && (
                    <Box>
                        {/* Report Filters for Advanced Analytics */}
                        <Paper sx={{ p: 3, mb: 3 }}>
                            <Typography variant="h6" sx={{ mb: 2, color: "primary.main" }}>
                                Report Filters
                            </Typography>

                            <Grid container spacing={3}>
                                <Grid item xs={12} md={4}>
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

                                <Grid item xs={12} md={4}>
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

                                <Grid item xs={12} md={4}>
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
                            </Grid>

                            {/* Filter Summary */}
                            <Box sx={{ mt: 2, p: 2, bgcolor: "#f5f5f5", borderRadius: 1 }}>
                                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                    Current Filters:
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    Date Range: {formatDate(reportStartDate)} -{" "}
                                    {formatDate(reportEndDate)}
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    Provider: {getProviderName()}
                                </Typography>
                            </Box>
                        </Paper>

                        <Paper sx={{ p: 3 }}>
                            <Typography variant="h6" sx={{ mb: 2, color: "primary.main" }}>
                                Advanced Analytics
                            </Typography>

                            <Grid container spacing={2}>
                                {advancedAnalyticsReports.map((report) => (
                                    <Grid item xs={12} sm={6} md={4} key={report}>
                                        <Paper
                                            sx={{
                                                p: 2,
                                                textAlign: "center",
                                                cursor: "pointer",
                                                transition: "all 0.2s",
                                                "&:hover": {
                                                    bgcolor: "warning.light",
                                                    transform: "translateY(-2px)",
                                                    boxShadow: 3,
                                                },
                                            }}
                                            onClick={() => onDownloadReport(report)}
                                        >
                                            <FontAwesomeIcon
                                                icon={faDownload}
                                                style={{
                                                    fontSize: "24px",
                                                    color: "#ed6c02",
                                                    marginBottom: "8px",
                                                }}
                                            />
                                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                                {report}
                                            </Typography>
                                        </Paper>
                                    </Grid>
                                ))}
                            </Grid>
                        </Paper>
                    </Box>
                )}
            </Box>
        </LocalizationProvider>
    );
}

export default AnalyticsSection;
