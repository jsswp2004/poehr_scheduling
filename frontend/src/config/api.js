// API Configuration for different environments
// This file centralizes all API endpoint configurations

// Determine base URL based on environment
const getBaseUrl = () => {
    // Check if we have a custom API URL from environment variables
    if (process.env.REACT_APP_API_URL) {
        let url = process.env.REACT_APP_API_URL;
        // Note: Using the URL as specified in environment variable
        // TODO: Configure backend to support HTTPS for better security
        return url;
    }

    // Default based on environment
    if (process.env.NODE_ENV === 'production') {
        // Check if we're on the custom domain
        if (window.location.hostname === 'powerhealthcareit.com' ||
            window.location.hostname === 'www.powerhealthcareit.com') {
            // Always use www version for SSL certificate compatibility
            // This ensures SSL works regardless of how user accessed the site
            console.log('🔧 SSL Debug - Detected custom domain, using www version');
            console.log('🔧 SSL Debug - Current hostname:', window.location.hostname);
            return 'https://www.powerhealthcareit.com';
        }
        // Production URL - use the specific backend Azure Container App URL
        console.log('🔧 SSL Debug - Using Azure Container App URL');
        return 'https://poehr-scheduling.bluedune-dee8c412.centralus.azurecontainerapps.io';
    } else {
        // Development URL - default to localhost:8000
        return 'http://localhost:8000';
    }
};

export const API_BASE_URL = getBaseUrl();

// WebSocket URL configuration
const getWebSocketUrl = () => {
    if (process.env.REACT_APP_WS_URL) {
        return process.env.REACT_APP_WS_URL;
    }

    if (process.env.NODE_ENV === 'production') {
        // Check if we're on the custom domain for WebSocket
        if (window.location.hostname === 'powerhealthcareit.com' ||
            window.location.hostname === 'www.powerhealthcareit.com') {
            // Always use www version for SSL certificate compatibility
            // This ensures WebSocket SSL works regardless of how user accessed the site
            return 'wss://www.powerhealthcareit.com';
        }

        // Production WebSocket URL - use same domain but wss protocol
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;

        // Debug info for Azure troubleshooting
        console.log('🔧 WebSocket URL Debug:', {
            protocol: window.location.protocol,
            host: window.location.host,
            wsProtocol: protocol,
            finalUrl: `${protocol}//${host}`
        });

        return `${protocol}//${host}`;
    } else {
        // Development WebSocket URL - updated to use port 8080 consistently
        return `ws://localhost:8080`;
    }
};

export const WS_BASE_URL = getWebSocketUrl();

// API Endpoints - centralized endpoint definitions
export const apiEndpoints = {
    // User endpoints
    user: (id) => `${API_BASE_URL}/api/users/${id}/`,
    userUpdate: (id) => `${API_BASE_URL}/api/users/${id}/`,
    userDelete: (id) => `${API_BASE_URL}/api/users/${id}/`,
    userSearch: (query) => `${API_BASE_URL}/api/users/search/?q=${query}`,

    // Rights / permissions management (Security Settings, admin/system_admin only)
    rightsCatalog: `${API_BASE_URL}/api/users/rights-catalog/`,
    userRights: (userId) => `${API_BASE_URL}/api/users/${userId}/rights/`,

    // Organization endpoints
    organizations: `${API_BASE_URL}/api/users/organizations/`,
    organizationDetail: (id) => `${API_BASE_URL}/api/users/organizations/${id}/`,

    // Doctor endpoints
    doctors: `${API_BASE_URL}/api/users/doctors/`,

    // Appointment endpoints
    appointments: `${API_BASE_URL}/api/appointments/`,
    appointment: (id) => `${API_BASE_URL}/api/appointments/${id}/`,
    availableSlots: (doctorId, date) => `${API_BASE_URL}/api/doctors/${doctorId}/available-dates/`,

    // Clinical notes endpoints
    clinicalNotes: `${API_BASE_URL}/api/clinical-notes/`,
    clinicalNote: (id) => `${API_BASE_URL}/api/clinical-notes/${id}/`,
    clinicalNoteSign: (id) => `${API_BASE_URL}/api/clinical-notes/${id}/sign/`,
    clinicalNoteAddend: (id) => `${API_BASE_URL}/api/clinical-notes/${id}/addend/`,
    noteTemplates: `${API_BASE_URL}/api/note-templates/`,

    // Orders
    orders: `${API_BASE_URL}/api/orders/`,
    order: (id) => `${API_BASE_URL}/api/orders/${id}/`,
    ordersSign: `${API_BASE_URL}/api/orders/sign/`,
    orderAction: (id, action) => `${API_BASE_URL}/api/orders/${id}/${action}/`,
    orderables: `${API_BASE_URL}/api/orderables/`,
    orderSets: `${API_BASE_URL}/api/order-sets/`,
    icd10Search: `${API_BASE_URL}/api/icd10/search/`,

    // Order Builder (admin)
    orderablesAdmin: `${API_BASE_URL}/api/admin/orderables/`,
    orderableAdmin: (id) => `${API_BASE_URL}/api/admin/orderables/${id}/`,
    orderablesSampleCsv: `${API_BASE_URL}/api/admin/orderables/sample-csv/`,
    orderablesDownloadCsv: `${API_BASE_URL}/api/admin/orderables/download-csv/`,
    orderablesUploadCsv: `${API_BASE_URL}/api/admin/orderables/upload-csv/`,
    orderSetsAdmin: `${API_BASE_URL}/api/admin/order-sets/`,
    orderSetAdmin: (id) => `${API_BASE_URL}/api/admin/order-sets/${id}/`,
    noteTemplate: (code) => `${API_BASE_URL}/api/note-templates/${code}/`,

    // Vital Signs flowsheet endpoints
    vitalSignsFlowsheets: `${API_BASE_URL}/api/vital-signs-flowsheets/`,
    vitalSignsFlowsheet: (id) => `${API_BASE_URL}/api/vital-signs-flowsheets/${id}/`,

    // Flowsheet type (template) endpoints -- read-only, used by the
    // flowsheet panel to populate its type dropdown and render the grid
    flowsheetTemplates: `${API_BASE_URL}/api/flowsheet-templates/`,
    flowsheetTemplate: (code) => `${API_BASE_URL}/api/flowsheet-templates/${code}/`,

    // Note-builder configuration UI (Phase 2, admin-only)
    noteTemplatesAdmin: `${API_BASE_URL}/api/admin/note-templates/`,
    noteTemplateAdmin: (code) => `${API_BASE_URL}/api/admin/note-templates/${code}/`,
    // CSV download / upload for note templates
    noteTemplatesSampleCsv: `${API_BASE_URL}/api/admin/note-templates/sample-csv/`,
    noteTemplatesUploadCsv: `${API_BASE_URL}/api/admin/note-templates/upload-csv/`,
    noteTemplateDownloadCsv: (code) => `${API_BASE_URL}/api/admin/note-templates/${code}/download-csv/`,
    dictionariesAdmin: `${API_BASE_URL}/api/admin/dictionaries/`,
    dictionaryAdmin: (id) => `${API_BASE_URL}/api/admin/dictionaries/${id}/`,

    // Flowsheet-builder configuration UI (Phase 2, admin-only)
    flowsheetTemplatesAdmin: `${API_BASE_URL}/api/admin/flowsheet-templates/`,
    flowsheetTemplateAdmin: (code) => `${API_BASE_URL}/api/admin/flowsheet-templates/${code}/`,
    // CSV download / upload for flowsheet templates
    flowsheetTemplatesSampleCsv: `${API_BASE_URL}/api/admin/flowsheet-templates/sample-csv/`,
    flowsheetTemplatesUploadCsv: `${API_BASE_URL}/api/admin/flowsheet-templates/upload-csv/`,
    flowsheetTemplateDownloadCsv: (code) => `${API_BASE_URL}/api/admin/flowsheet-templates/${code}/download-csv/`,

    // Full patient Registration (Identity/Emergency Contact/Financial/Reason
    // for Visit/Legal Documents/Logistics) -- the "Registration" tab on the
    // Patients page's Register sub-tab.
    patients: `${API_BASE_URL}/api/users/patients/`,
    patient: (id) => `${API_BASE_URL}/api/users/patients/${id}/`,
    registrations: `${API_BASE_URL}/api/users/registrations/`,
    registration: (id) => `${API_BASE_URL}/api/users/registrations/${id}/`,

    // Authentication endpoints
    changePassword: `${API_BASE_URL}/api/auth/change-password/`,
    adminChangePassword: `${API_BASE_URL}/api/users/admin-change-password/`,

    // Communication endpoints
    sendEmail: `${API_BASE_URL}/api/auth/send-email/`,
    sendSMS: `${API_BASE_URL}/api/auth/send-sms/`,

    // Staffing module endpoints
    staffingStaff: `${API_BASE_URL}/api/staffing/staff/`,
    staffingStaffDetail: (id) => `${API_BASE_URL}/api/staffing/staff/${id}/`,
    staffingStaffInvite: (id) => `${API_BASE_URL}/api/staffing/staff/${id}/invite/`,
    staffingStaffUploadCsv: `${API_BASE_URL}/api/staffing/staff/upload-csv/`,
    staffingRecurringPatterns: `${API_BASE_URL}/api/staffing/recurring-patterns/`,
    staffingRecurringPatternDetail: (id) => `${API_BASE_URL}/api/staffing/recurring-patterns/${id}/`,
    staffingShifts: `${API_BASE_URL}/api/staffing/shifts/`,
    staffingShiftDetail: (id) => `${API_BASE_URL}/api/staffing/shifts/${id}/`,
    staffingStaffSendMessage: (id) => `${API_BASE_URL}/api/staffing/staff/${id}/send-message/`,
    staffingUnits: `${API_BASE_URL}/api/staffing/units/`,
    staffingUnitDetail: (id) => `${API_BASE_URL}/api/staffing/units/${id}/`,
    staffingCensus: `${API_BASE_URL}/api/staffing/census/`,
    staffingCoverageRequirements: `${API_BASE_URL}/api/staffing/coverage-requirements/`,
    staffingCoverageRequirementDetail: (id) => `${API_BASE_URL}/api/staffing/coverage-requirements/${id}/`,
    staffingCoverageStatus: `${API_BASE_URL}/api/staffing/coverage-status/`,
    staffingLocation: `${API_BASE_URL}/api/staffing/location/`,
    staffingRules: `${API_BASE_URL}/api/staffing/rules/`,
    staffingRuleDetail: (id) => `${API_BASE_URL}/api/staffing/rules/${id}/`,
    staffingRuleDuplicate: (id) => `${API_BASE_URL}/api/staffing/rules/${id}/duplicate/`,
    staffingRuleAudit: (id) => `${API_BASE_URL}/api/staffing/rules/${id}/audit/`,
    staffingRuleSelection: `${API_BASE_URL}/api/staffing/rules/selection/`,
    staffingTimeOff: `${API_BASE_URL}/api/staffing/time-off/`,
    staffingTimeOffDecide: (id) => `${API_BASE_URL}/api/staffing/time-off/${id}/decide/`,
    staffingTimeOffResolve: (id) => `${API_BASE_URL}/api/staffing/time-off/${id}/resolve/`,
    staffingTimeOffCover: (id) => `${API_BASE_URL}/api/staffing/time-off/${id}/cover-candidates/`,
    staffingMyTimeOff: `${API_BASE_URL}/api/staffing/me/time-off/`,
    staffingReportUnscheduled: `${API_BASE_URL}/api/staffing/reports/unscheduled/`,
    staffingReportLaborHours: `${API_BASE_URL}/api/staffing/reports/labor-hours/`,
    staffingReportCoverageCompliance: `${API_BASE_URL}/api/staffing/reports/coverage-compliance/`,
    staffingReportMessageLog: `${API_BASE_URL}/api/staffing/reports/message-log/`,
    staffingReportShiftDistribution: `${API_BASE_URL}/api/staffing/reports/shift-distribution/`,

    // Media endpoints
    profilePicture: (id) => `${API_BASE_URL}/api/users/${id}/`,
    mediaUrl: (path) => path?.startsWith(`http`) ? path : `${API_BASE_URL}${path}`,
};

// Common headers for API requests
export const getAuthHeaders = (token) => ({
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
});

// For file uploads
export const getAuthHeadersForUpload = (token) => ({
    'Authorization': `Bearer ${token}`,
    // Don't set Content-Type for file uploads - let browser set it
});

// API request configuration
export const apiConfig = {
    timeout: 10000, // 10 seconds timeout
    headers: {
        'Content-Type': 'application/json',
    },
};

// Export for debugging
export const debugApiConfig = () => {
    console.log('🔧 API Configuration:', {
        baseUrl: API_BASE_URL,
        environment: process.env.NODE_ENV,
        customApiUrl: process.env.REACT_APP_API_URL,
    });
};
