import { useState, useCallback } from 'react';
import axios from 'axios';
import { saveAs } from 'file-saver';
import Papa from 'papaparse';
import { toast } from 'react-toastify';

export const useAnalytics = () => {
    const [reportStartDate, setReportStartDate] = useState(null);
    const [reportEndDate, setReportEndDate] = useState(null);
    const [reportProvider, setReportProvider] = useState('all');
    const [providers, setProviders] = useState([]);
    const [analyticsTab, setAnalyticsTab] = useState('standard');
    const [organizationData, setOrganizationData] = useState(null);
    const [organizationLogo, setOrganizationLogo] = useState(null);

    const analyticsReports = [
        'Upcoming Appointments Report',
        'Past Appointments Report',
        'Provider Schedule Report',
        'Appointment Status Report',
        'New Patient Registrations',
        'Blocked Time Slots',
        'Appointment Recurrence Report',
        'Appointment Duration Summary',
    ];

    const advancedAnalyticsReports = [
        'Appointment Volume Trends',
        'No-Show & Cancellation Rate',
        'Provider Utilization Report',
        'Patient Visit Frequency',
        'New vs. Returning Patients',
        'Appointment Lead Time Analysis',
        'Patient Demographic Breakdown',
        'Blocked vs. Booked Time Comparison',
    ];

    const fetchProviders = useCallback(async (token) => {
        try {
            const res = await axios.get('http://127.0.0.1:8000/api/users/doctors/', {
                headers: { Authorization: `Bearer ${token}` },
            });
            setProviders(res.data);
        } catch (err) {
            console.error('Failed to fetch providers:', err);
            toast.error('Failed to fetch providers');
        }
    }, []);

    const fetchOrganizationData = useCallback(async () => {
        try {
            const token = localStorage.getItem('token') || localStorage.getItem('access_token');
            if (!token) {
                console.log('No token available for fetching organization data');
                return;
            }

            const res = await axios.get('http://127.0.0.1:8000/api/users/organizations/', {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (res.data && res.data.length > 0) {
                const org = res.data[0];
                setOrganizationData(org);

                // Set logo URL if available
                if (org.logo) {
                    const logoUrl = org.logo.startsWith('http')
                        ? org.logo
                        : `http://127.0.0.1:8000${org.logo}`;
                    setOrganizationLogo(logoUrl);
                }
            }
        } catch (err) {
            console.error('Failed to fetch organization data:', err);
        }
    }, []);

    const downloadCSVReport = async (reportName, token) => {
        try {
            if (!reportName) {
                toast.error('Invalid report selected');
                return;
            }

            const params = {
                report_type: reportName
            };
            if (reportStartDate) params.start_date = reportStartDate.toISOString().split('T')[0];
            if (reportEndDate) params.end_date = reportEndDate.toISOString().split('T')[0];
            if (reportProvider && reportProvider !== 'all') params.provider_id = reportProvider;

            const res = await axios.get('http://127.0.0.1:8000/api/analytics/reports/', {
                headers: { Authorization: `Bearer ${token}` },
                params,
            });

            if (res.data && res.data.data) {
                let csvData = res.data.data;

                // Handle different data structures
                if (Array.isArray(csvData)) {
                    // Direct array data
                    if (csvData.length > 0) {
                        const csv = Papa.unparse(csvData);
                        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                        saveAs(blob, `${reportName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`);
                        toast.success('Report downloaded successfully!');
                    } else {
                        toast.warning('No data available for this report');
                    }
                } else if (typeof csvData === 'object') {
                    // Object with nested data
                    if (csvData.summary) {
                        // Status report format
                        const csv = Papa.unparse(csvData.summary);
                        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                        saveAs(blob, `${reportName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`);
                        toast.success('Report downloaded successfully!');
                    } else {
                        // Convert object to array format
                        const flatData = [];
                        Object.keys(csvData).forEach(key => {
                            if (Array.isArray(csvData[key])) {
                                csvData[key].forEach(item => {
                                    flatData.push({ category: key, ...item });
                                });
                            }
                        });

                        if (flatData.length > 0) {
                            const csv = Papa.unparse(flatData);
                            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                            saveAs(blob, `${reportName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`);
                            toast.success('Report downloaded successfully!');
                        } else {
                            toast.warning('No data available for this report');
                        }
                    }
                } else {
                    toast.warning('No data available for this report');
                }
            } else {
                toast.warning('No data available for this report');
            }
        } catch (err) {
            console.error('Download failed:', err);
            if (err.response?.status === 404) {
                toast.error('Report endpoint not found. Please check the report configuration.');
            } else if (err.response?.status === 403) {
                toast.error('You do not have permission to download this report.');
            } else {
                toast.error(`Failed to download report: ${err.response?.data?.error || err.message}`);
            }
        }
    };

    // Legacy function - no longer used, kept for reference
    // const getReportEndpoint = (reportName) => {
    //     const endpoints = {
    //         'Upcoming Appointments Report': 'http://127.0.0.1:8000/api/reports/upcoming-appointments/',
    //         'Past Appointments Report': 'http://127.0.0.1:8000/api/reports/past-appointments/',
    //         'Provider Schedule Report': 'http://127.0.0.1:8000/api/reports/provider-schedule/',
    //         'Appointment Status Report': 'http://127.0.0.1:8000/api/reports/appointment-status/',
    //         'New Patient Registrations': 'http://127.0.0.1:8000/api/reports/new-patients/',
    //         'Blocked Time Slots': 'http://127.0.0.1:8000/api/reports/blocked-slots/',
    //         'Appointment Recurrence Report': 'http://127.0.0.1:8000/api/reports/recurrence/',
    //         'Appointment Duration Summary': 'http://127.0.0.1:8000/api/reports/duration-summary/',
    //         'Appointment Volume Trends': 'http://127.0.0.1:8000/api/reports/volume-trends/',
    //         'No-Show & Cancellation Rate': 'http://127.0.0.1:8000/api/reports/no-show-rate/',
    //         'Provider Utilization Report': 'http://127.0.0.1:8000/api/reports/provider-utilization/',
    //         'Patient Visit Frequency': 'http://127.0.0.1:8000/api/reports/visit-frequency/',
    //         'New vs. Returning Patients': 'http://127.0.0.1:8000/api/reports/new-vs-returning/',
    //         'Appointment Lead Time Analysis': 'http://127.0.0.1:8000/api/reports/lead-time/',
    //         'Patient Demographic Breakdown': 'http://127.0.0.1:8000/api/reports/demographics/',
    //         'Blocked vs. Booked Time Comparison': 'http://127.0.0.1:8000/api/reports/blocked-vs-booked/',
    //     };
    //     return endpoints[reportName];
    // };

    return {
        reportStartDate,
        setReportStartDate,
        reportEndDate,
        setReportEndDate,
        reportProvider,
        setReportProvider,
        providers,
        setProviders,
        analyticsTab,
        setAnalyticsTab,
        organizationData,
        organizationLogo,
        analyticsReports,
        advancedAnalyticsReports,
        fetchProviders,
        fetchOrganizationData,
        downloadCSVReport,
    };
};
