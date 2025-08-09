import { useState, useCallback } from 'react';
import axios from 'axios';
import { saveAs } from 'file-saver';
import Papa from 'papaparse';
import { toast } from 'react-toastify';
import { API_BASE_URL } from '../config/api';
import { getValidToken, clearAuthData, refreshAccessToken } from '../utils/auth';
import { jwtDecode } from 'jwt-decode';

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

    const fetchProviders = useCallback(async (maybeToken) => {
        try {
            const token = maybeToken || (await getValidToken());
            if (!token) {
                console.log('No valid token available for fetching providers');
                return;
            }
            const res = await axios.get(`${API_BASE_URL}/api/users/doctors/`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setProviders(res.data);
        } catch (err) {
            console.error('Failed to fetch providers:', err);
            toast.error('Failed to fetch providers');
        }
    }, []);

    const fetchOrganizationData = useCallback(async () => {
        // Use centralized, refresh-aware token getter to avoid 401s
        let token = await getValidToken();
        if (!token) {
            console.log('No valid token available for fetching organization data');
            return;
        }

        // Determine role and userId to decide if organizations endpoint is allowed
        let decoded = null;
        try {
            decoded = jwtDecode(token);
        } catch { }
        const userId = decoded?.user_id;
        const role = decoded?.role;
        const hasOrgPrivilege = ['admin', 'system_admin', 'registrar', 'receptionist', 'doctor'].includes(role);

        // Fallback: for roles without org privileges, fetch minimal org info from user endpoint
        const fetchFromUser = async (bearer) => {
            if (!userId) return false;
            try {
                const me = await axios.get(`${API_BASE_URL}/api/users/${userId}/`, {
                    headers: { Authorization: `Bearer ${bearer}` },
                });
                const orgLogo = me.data.organization_logo;
                if (orgLogo) {
                    const logoUrl = typeof orgLogo === 'string' && orgLogo.startsWith('http')
                        ? orgLogo
                        : `${API_BASE_URL}${orgLogo}`;
                    setOrganizationLogo(logoUrl);
                }
                // Best-effort organization fields
                setOrganizationData({
                    id: me.data.organization ?? null,
                    name: me.data.organization_name || '',
                    logo: me.data.organization_logo || null,
                });
                return true;
            } catch (e) {
                return false;
            }
        };

        if (!hasOrgPrivilege) {
            const ok = await fetchFromUser(token);
            if (ok) return;
        }

        const doFetch = async (bearer) =>
            axios.get(`${API_BASE_URL}/api/users/organizations/`, {
                headers: { Authorization: `Bearer ${bearer}` },
            });

        try {
            const res = await doFetch(token);
            if (res.data && res.data.length > 0) {
                const org = res.data[0];
                setOrganizationData(org);

                // Set logo URL if available
                if (org.logo) {
                    const logoUrl = org.logo.startsWith('http')
                        ? org.logo
                        : `${API_BASE_URL}${org.logo}`;
                    setOrganizationLogo(logoUrl);
                }
            } else {
                // Empty list – fallback to user endpoint to populate minimal org info
                const ok = await fetchFromUser(token);
                if (ok) return;
            }
        } catch (err) {
            // Retry once on 401 by forcing a refresh
            if (err?.response?.status === 401 || err?.response?.status === 403) {
                try {
                    const refreshed = await refreshAccessToken();
                    if (refreshed) {
                        // First try the organizations endpoint again
                        try {
                            const retryRes = await doFetch(refreshed);
                            if (retryRes.data && retryRes.data.length > 0) {
                                const org = retryRes.data[0];
                                setOrganizationData(org);
                                if (org.logo) {
                                    const logoUrl = org.logo.startsWith('http')
                                        ? org.logo
                                        : `${API_BASE_URL}${org.logo}`;
                                    setOrganizationLogo(logoUrl);
                                }
                                return;
                            } else {
                                // Empty after retry – fallback
                                const ok = await fetchFromUser(refreshed);
                                if (ok) return;
                            }
                        } catch (retryErr) {
                            // If organizations still fails, try fetching from user endpoint
                            const ok = await fetchFromUser(refreshed);
                            if (ok) return;
                            throw retryErr;
                        }
                    }
                } catch (refreshErr) {
                    console.error('Organization fetch retry after refresh failed:', refreshErr);
                }
                // If 401 after all attempts, clear auth to force re-login. For 403, don't logout – just stop.
                if (err?.response?.status === 401) {
                    clearAuthData?.();
                }
                return;
            }
            console.error('Failed to fetch organization data:', err);
            // Final fallback attempt without disturbing auth
            const ok = await fetchFromUser(token);
            if (ok) return;
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

            // Use provided token if present; otherwise, obtain a valid one
            const bearer = token || (await getValidToken());
            if (!bearer) {
                toast.error('Not authenticated. Please log in again.');
                return;
            }

            const res = await axios.get(`${API_BASE_URL}/api/analytics/reports/`, {
                headers: { Authorization: `Bearer ${bearer}` },
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
