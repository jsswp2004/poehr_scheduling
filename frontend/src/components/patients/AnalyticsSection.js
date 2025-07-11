import React from 'react';
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
} from '@mui/material';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faDownload } from '@fortawesome/free-solid-svg-icons';

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
        if (!date) return 'Not set';
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
    };

    const getProviderName = () => {
        if (reportProvider === 'all') return 'All Providers';
        const provider = providers.find(p => p.id.toString() === reportProvider.toString());
        return provider ? `Dr. ${provider.first_name} ${provider.last_name}` : 'Unknown Provider';
    };

    return (
        <LocalizationProvider dateAdapter={AdapterDateFns}>
            <Box>
                {/* Organization Header */}
                {organizationData && (
                    <Paper sx={{ p: 3, mb: 3, textAlign: 'center' }}>
                        {organizationLogo && (
                            <Box sx={{ mb: 2 }}>
                                <img
                                    src={organizationLogo}
                                    alt="Organization Logo"
                                    style={{
                                        maxHeight: 60,
                                        maxWidth: 200,
                                        objectFit: 'contain',
                                    }}
                                />
                            </Box>
                        )}
                        <Typography variant="h5" sx={{ color: 'primary.main', fontWeight: 'bold' }}>
                            {organizationData.name}
                        </Typography>
                        {organizationData.address && (
                            <Typography variant="body2" color="text.secondary">
                                {organizationData.address}
                            </Typography>
                        )}
                    </Paper>
                )}

                {/* Analytics Sub-tabs */}
                <Tabs
                    value={analyticsTab}
                    onChange={(e, newVal) => setAnalyticsTab(newVal)}
                    sx={{
                        mb: 3,
                        '& .MuiTabs-indicator': {
                            height: 3,
                            borderRadius: 1,
                        },
                    }}
                >
                    <Tab label="Standard Reports" value="standard" />
                    <Tab label="Advanced Analytics" value="advanced" />
                </Tabs>

                {/* Report Filters */}
                <Paper sx={{ p: 3, mb: 3 }}>
                    <Typography variant="h6" sx={{ mb: 2, color: 'primary.main' }}>
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
                                        size: 'small',
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
                                        size: 'small',
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
                    <Box sx={{ mt: 2, p: 2, bgcolor: '#f5f5f5', borderRadius: 1 }}>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            Current Filters:
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            Date Range: {formatDate(reportStartDate)} - {formatDate(reportEndDate)}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            Provider: {getProviderName()}
                        </Typography>
                    </Box>
                </Paper>

                {/* Standard Reports */}
                {analyticsTab === 'standard' && (
                    <Paper sx={{ p: 3 }}>
                        <Typography variant="h6" sx={{ mb: 2, color: 'primary.main' }}>
                            Standard Reports
                        </Typography>

                        <Grid container spacing={2}>
                            {analyticsReports.map((report) => (
                                <Grid item xs={12} sm={6} md={4} key={report}>
                                    <Paper
                                        sx={{
                                            p: 2,
                                            textAlign: 'center',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s',
                                            '&:hover': {
                                                bgcolor: 'primary.light',
                                                transform: 'translateY(-2px)',
                                                boxShadow: 3,
                                            },
                                        }}
                                        onClick={() => onDownloadReport(report)}
                                    >
                                        <FontAwesomeIcon
                                            icon={faDownload}
                                            style={{ fontSize: '24px', color: '#1976d2', marginBottom: '8px' }}
                                        />
                                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                            {report}
                                        </Typography>
                                    </Paper>
                                </Grid>
                            ))}
                        </Grid>
                    </Paper>
                )}

                {/* Advanced Analytics */}
                {analyticsTab === 'advanced' && (
                    <Paper sx={{ p: 3 }}>
                        <Typography variant="h6" sx={{ mb: 2, color: 'primary.main' }}>
                            Advanced Analytics
                        </Typography>

                        <Grid container spacing={2}>
                            {advancedAnalyticsReports.map((report) => (
                                <Grid item xs={12} sm={6} md={4} key={report}>
                                    <Paper
                                        sx={{
                                            p: 2,
                                            textAlign: 'center',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s',
                                            '&:hover': {
                                                bgcolor: 'warning.light',
                                                transform: 'translateY(-2px)',
                                                boxShadow: 3,
                                            },
                                        }}
                                        onClick={() => onDownloadReport(report)}
                                    >
                                        <FontAwesomeIcon
                                            icon={faDownload}
                                            style={{ fontSize: '24px', color: '#ed6c02', marginBottom: '8px' }}
                                        />
                                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                            {report}
                                        </Typography>
                                    </Paper>
                                </Grid>
                            ))}
                        </Grid>
                    </Paper>
                )}
            </Box>
        </LocalizationProvider>
    );
}

export default AnalyticsSection;
