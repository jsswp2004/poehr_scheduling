import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "../components/SimpleToast";
import axios from "axios";
import { API_BASE_URL } from "../config/api";
import { getValidToken } from "../utils/auth";
import { jwtDecode } from "jwt-decode";
import BackButton from "../components/BackButton";
import {
    Container,
Typography,
    Grid,
    Button,
    Box,
    IconButton,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    Chip,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    Alert,
    InputAdornment,
    Menu,
} from "@mui/material";
import {
    CreditCard,
    Warning,
    CloudDownload,
    DeleteForever,
    CheckBox as CheckBoxIcon,
    CheckBoxOutlineBlank as CheckBoxOutlineBlankIcon,
    Search,
    MoreVert,
} from "@mui/icons-material";

const BORDER = "#dfe4ec";

function Section({ title, action, children, sx }) {
    return (
        <Box sx={{ bgcolor: "#fff", border: `1px solid ${BORDER}`, borderRadius: "10px", p: "14px 16px", ...sx }}>
            {(title || action) && (
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.25 }}>
                    <Typography component="h2" sx={{ fontSize: 14.5, fontWeight: 600, flex: 1 }}>
                        {title}
                    </Typography>
                    {action}
                </Box>
            )}
            {children}
        </Box>
    );
}

function Field({ label, value }) {
    return (
        <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 11.5, color: "text.secondary" }}>{label}</Typography>
            <Typography sx={{ fontSize: 13.5, wordBreak: "break-word" }}>{value || "Not set"}</Typography>
        </Box>
    );
}

function AccountPage() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [accountData, setAccountData] = useState(null);
    const [paymentMethods, setPaymentMethods] = useState([]);
    const [billingHistory, setBillingHistory] = useState([]);
    const [currentPlan, setCurrentPlan] = useState("");

    // Dialog states
    const [editAccountOpen, setEditAccountOpen] = useState(false);
    const [changePlanOpen, setChangePlanOpen] = useState(false);
    const [addPaymentOpen, setAddPaymentOpen] = useState(false);
    const [cancelAccountOpen, setCancelAccountOpen] = useState(false);
    const [exportDialogOpen, setExportDialogOpen] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
    const [payMenu, setPayMenu] = useState({ anchor: null, method: null });

    // Form states
    const [editFormData, setEditFormData] = useState({});
    const [selectedPlan, setSelectedPlan] = useState("");
    const [paymentFormData, setPaymentFormData] = useState({
        cardNumber: "",
        expiry: "", // MM/YY
        cvc: "",
        billingAddress: "",
    });
    const [cancellationData, setCancellationData] = useState({
        immediate: true,
        endDate: "",
        reason: "",
    });

    // Data management states
    const [exportFormData, setExportFormData] = useState({
        formats: ["json"],
        include_data: {
            users: true,
            appointments: true,
            availability: true,
            clinic_events: true,
            holidays: true,
            communications: false,
        },
    });
    const [deleteFormData, setDeleteFormData] = useState({
        confirmation_name: "",
        final_confirmation: false,
    });
    const [exportLoading, setExportLoading] = useState(false);
    const [deleteLoading, setDeleteLoading] = useState(false);

    // System admin organization management states
    const [isSystemAdmin, setIsSystemAdmin] = useState(false);
    const [selectedOrganization, setSelectedOrganization] = useState(null);
    const [organizationSearchQuery, setOrganizationSearchQuery] = useState("");
    const [organizationSearchResults, setOrganizationSearchResults] = useState([]);
    const [organizationSearchLoading, setOrganizationSearchLoading] = useState(false);
    const [showSearchResults, setShowSearchResults] = useState(false);

    // Pinned title block (same pattern as the Staffing Center): publish its height so the billing toolbar can stack under it
    const [tab, setTab] = useState("details");
    const [billFilter, setBillFilter] = useState("all");
    const [billQuery, setBillQuery] = useState("");
    const [moreAnchor, setMoreAnchor] = useState(null);
    const [billMenuAnchor, setBillMenuAnchor] = useState(null);
    const pinRef = useCallback((node) => {
        if (!node) return;
        const publish = () => document.documentElement.style.setProperty("--account-sticky-h", `${node.offsetHeight}px`);
        publish();
        if (typeof ResizeObserver !== "undefined") new ResizeObserver(publish).observe(node);
    }, []);

    // Plan options (updated to match current subscription tiers)
    const planOptions = [
        {
            value: "basic",
            label: "Professional",
            price: "$49.99/month",
            features: [
                "Basic scheduling",
                "Basic calendar view",
                "Email notifications",
                "Basic reporting",
            ],
        },
        {
            value: "premium",
            label: "Clinic",
            price: "$299.99/month",
            features: [
                "Up to 10 providers",
                "Unlimited appointments",
                "Advanced calendar features",
                "SMS + Email notifications",
                "Patient management system",
                "Advanced reporting & analytics",
            ],
        },
        {
            value: "enterprise",
            label: "Group",
            price: "Contact Sales",
            features: [
                "Unlimited users",
                "Advanced analytics",
                "Priority support",
                "Custom integrations",
                "Multi-organization support",
                "Custom branding",
            ],
        },
    ];

    const fetchAccountData = async () => {
        try {
            setLoading(true);
            const token = await getValidToken();

            // Fetch user data
            const userResponse = await axios.get(`${API_BASE_URL}/api/users/me/`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            setAccountData(userResponse.data);

            // Check if user is system admin
            const token_decoded = jwtDecode(token);
            const userRole = token_decoded.role || userResponse.data.role;
            setIsSystemAdmin(userRole === 'system_admin');

            // Set selected organization to user's organization by default
            if (userResponse.data.organization) {
                setSelectedOrganization({
                    id: userResponse.data.organization,
                    name: userResponse.data.organization_name,
                    subscription_tier: userResponse.data.subscription_tier,
                });
            }

            // Map old plan names to new plan values for backwards compatibility
            let userPlan = userResponse.data.subscription_tier || "basic";
            if (userPlan.toLowerCase() === "personal") {
                userPlan = "basic";
            } else if (userPlan.toLowerCase() === "clinic") {
                userPlan = "premium";
            } else if (userPlan.toLowerCase() === "group") {
                userPlan = "enterprise";
            }

            setCurrentPlan(userPlan);
            setEditFormData({
                first_name: userResponse.data.first_name || "",
                last_name: userResponse.data.last_name || "",
                email: userResponse.data.email || "",
                phone_number: userResponse.data.phone_number || "",
                organization: userResponse.data.organization_name || "",
            });

            // Fetch payment methods from Stripe
            try {
                const paymentResponse = await axios.get(
                    `${API_BASE_URL}/api/users/payments/methods/`,
                    {
                        headers: { Authorization: `Bearer ${token}` },
                    }
                );
                setPaymentMethods(paymentResponse.data.payment_methods || []);
            } catch {
                setPaymentMethods([]);
            }

            // Fetch billing history from Stripe
            try {
                const billingResponse = await axios.get(
                    `${API_BASE_URL}/api/users/payments/history/`,
                    {
                        headers: { Authorization: `Bearer ${token}` },
                    }
                );
                setBillingHistory(billingResponse.data.billing_history || []);
            } catch {
                setBillingHistory([]);
            }
        } catch (error) {
            console.error("Failed to fetch account data:", error);
            toast.error("Failed to load account information");
        } finally {
            setLoading(false);
        }
    };

    // Organization search functionality for system admins
    const searchOrganizations = async (query) => {
        if (!isSystemAdmin) return;

        try {
            setOrganizationSearchLoading(true);
            const token = await getValidToken();

            const response = await axios.get(`${API_BASE_URL}/api/users/organization/search/`, {
                headers: { Authorization: `Bearer ${token}` },
                params: { q: query, limit: 20 }
            });

            setOrganizationSearchResults(response.data.organizations || []);
            setShowSearchResults(true);
        } catch (error) {
            console.error("Failed to search organizations:", error);
            toast.error("Failed to search organizations");
            setOrganizationSearchResults([]);
        } finally {
            setOrganizationSearchLoading(false);
        }
    };

    const handleOrganizationSearchChange = (e) => {
        const query = e.target.value;
        setOrganizationSearchQuery(query);

        // Simple debouncing with setTimeout
        if (window.searchTimeout) {
            clearTimeout(window.searchTimeout);
        }

        window.searchTimeout = setTimeout(() => {
            if (query.trim().length >= 2) {
                searchOrganizations(query);
            } else {
                setOrganizationSearchResults([]);
                setShowSearchResults(false);
            }
        }, 300);
    };

    const fetchOrganizationAdmin = async (organizationId) => {
        try {
            const token = await getValidToken();

            // Fetch the organization's admin user details
            const response = await axios.get(
                `${API_BASE_URL}/api/users/organization/${organizationId}/admin/`,
                {
                    headers: { Authorization: `Bearer ${token}` },
                }
            );

            return response.data;
        } catch (error) {
            console.error("Failed to fetch organization admin:", error);
            return null;
        }
    };

    const selectOrganization = async (organization) => {
        try {
            setSelectedOrganization(organization);
            setOrganizationSearchQuery(organization.name);
            setShowSearchResults(false);

            // For system admins, fetch the organization's admin user details
            if (isSystemAdmin) {
                const orgAdmin = await fetchOrganizationAdmin(organization.id);
                if (orgAdmin) {
                    // Update account data to show the organization's admin details
                    setAccountData({
                        ...orgAdmin,
                        organization: organization.id,
                        organization_name: organization.name,
                        subscription_tier: organization.subscription_tier,
                    });

                    // Update edit form data to show the organization's admin details
                    setEditFormData({
                        first_name: orgAdmin.first_name || "",
                        last_name: orgAdmin.last_name || "",
                        email: orgAdmin.email || "",
                        phone_number: orgAdmin.phone_number || "",
                        organization: organization.name || "",
                    });
                } else {
                    // Fallback: show organization info with placeholder user data
                    const fallbackData = {
                        first_name: "Organization",
                        last_name: "Admin",
                        email: "admin@" + organization.name.toLowerCase().replace(/\s+/g, '') + ".com",
                        phone_number: "Not available",
                        role: "admin",
                        organization: organization.id,
                        organization_name: organization.name,
                        subscription_tier: organization.subscription_tier,
                    };
                    setAccountData(fallbackData);

                    // Update edit form data with fallback data
                    setEditFormData({
                        first_name: fallbackData.first_name || "",
                        last_name: fallbackData.last_name || "",
                        email: fallbackData.email || "",
                        phone_number: fallbackData.phone_number || "",
                        organization: organization.name || "",
                    });
                }
            } else {
                // For regular admins, just update organization context
                setAccountData({
                    ...accountData,
                    organization: organization.id,
                    organization_name: organization.name,
                    subscription_tier: organization.subscription_tier,
                });
            }

            // Map organization subscription tier with same logic
            let orgPlan = organization.subscription_tier || 'basic';
            if (orgPlan.toLowerCase() === "personal") {
                orgPlan = "basic";
            } else if (orgPlan.toLowerCase() === "clinic") {
                orgPlan = "premium";
            } else if (orgPlan.toLowerCase() === "group") {
                orgPlan = "enterprise";
            }

            setCurrentPlan(orgPlan);

            // Fetch organization-specific data (payment methods, billing history, etc.)
            await fetchOrganizationData(organization.id);

            toast.success(`Switched to organization: ${organization.name}`);
        } catch (error) {
            console.error("Failed to select organization:", error);
            toast.error("Failed to switch organization");
        }
    };

    const fetchOrganizationData = async (organizationId) => {
        try {
            const token = await getValidToken();

            // TODO: We'll need to update these endpoints to accept organization ID
            // For now, we'll use the existing endpoints which should work with selected org context

            // Fetch payment methods for selected organization
            try {
                const paymentResponse = await axios.get(
                    `${API_BASE_URL}/api/users/payments/methods/`,
                    {
                        headers: { Authorization: `Bearer ${token}` },
                        params: { organization_id: organizationId }
                    }
                );
                setPaymentMethods(paymentResponse.data.payment_methods || []);
            } catch {
                setPaymentMethods([]);
            }

            // Fetch billing history for selected organization
            try {
                const billingResponse = await axios.get(
                    `${API_BASE_URL}/api/users/payments/history/`,
                    {
                        headers: { Authorization: `Bearer ${token}` },
                        params: { organization_id: organizationId }
                    }
                );
                setBillingHistory(billingResponse.data.billing_history || []);
            } catch {
                setBillingHistory([]);
            }
        } catch (error) {
            console.error("Failed to fetch organization data:", error);
            toast.error("Failed to load organization data");
        }
    };

    const checkAccess = useCallback(async () => {
        try {
            const token = await getValidToken();
            if (!token) {
                toast.error("Authentication required");
                navigate("/login");
                return;
            }

            const decoded = jwtDecode(token);
            const role = decoded.role;

            // Only allow admin and system_admin access
            if (role !== "admin" && role !== "system_admin") {
                toast.error(
                    "Access denied. Only administrators can access account settings."
                );
                navigate("/");
                return;
            }

            await fetchAccountData();
        } catch (error) {
            console.error("Access check failed:", error);
            toast.error("Access verification failed");
            navigate("/login");
        }
    }, [navigate]);

    useEffect(() => {
        checkAccess();
    }, [checkAccess]);

    const handleEditAccount = async () => {
        try {
            const token = await getValidToken();

            const updateData = {
                first_name: editFormData.first_name,
                last_name: editFormData.last_name,
                email: editFormData.email,
                phone_number: editFormData.phone_number,
            };

            // For system admins managing an organization, update the organization's admin
            if (isSystemAdmin && selectedOrganization && accountData.id) {
                await axios.patch(
                    `${API_BASE_URL}/api/users/organization/${selectedOrganization.id}/admin/`,
                    updateData,
                    {
                        headers: { Authorization: `Bearer ${token}` },
                    }
                );

                // Update local accountData state
                setAccountData({
                    ...accountData,
                    ...updateData,
                });

                toast.success(`Updated ${selectedOrganization.name} admin details successfully!`);
            } else {
                // For regular users or system admins not managing an organization
                await axios.patch(`${API_BASE_URL}/api/users/me/`, updateData, {
                    headers: { Authorization: `Bearer ${token}` },
                });

                toast.success("Account details updated successfully!");
                await fetchAccountData();
            }

            setEditAccountOpen(false);
        } catch (error) {
            console.error("Failed to update account:", error);
            if (error.response?.status === 404) {
                toast.error("Organization admin not found");
            } else {
                toast.error("Failed to update account details");
            }
        }
    };

    const handleChangePlan = async () => {
        try {
            const token = await getValidToken();

            // Prepare plan change data with organization context for system admins
            const planChangeData = {
                plan: selectedPlan,
                ...(isSystemAdmin && selectedOrganization && {
                    organization_id: selectedOrganization.id
                })
            };

            const response = await axios.post(
                `${API_BASE_URL}/api/users/payments/change-plan/`,
                planChangeData,
                { headers: { Authorization: `Bearer ${token}` } }
            );

            // Update local state to reflect the change
            setCurrentPlan(selectedPlan);

            // Update selected organization's plan in local state
            if (isSystemAdmin && selectedOrganization) {
                setSelectedOrganization({
                    ...selectedOrganization,
                    subscription_tier: selectedPlan
                });

                // Update account data as well
                setAccountData({
                    ...accountData,
                    subscription_tier: selectedPlan
                });
            }

            const orgContext = response.data.organization ? ` for ${response.data.organization}` : '';
            toast.success(`Plan changed successfully${orgContext}!`);
            setChangePlanOpen(false);

            // Refresh account data to ensure consistency
            if (isSystemAdmin && selectedOrganization) {
                // Also refresh the search results to get updated organization data
                await searchOrganizations(selectedOrganization.name);
            } else {
                await fetchAccountData();
            }
        } catch (error) {
            console.error("Failed to change plan:", error);
            if (error.response?.data?.message) {
                toast.error(error.response.data.message);
            } else {
                toast.error("Failed to change plan");
            }
        }
    };

    const handleAddPaymentMethod = async () => {
        try {
            // Implement Stripe payment method creation
            toast.success("Payment method added successfully!");
            setAddPaymentOpen(false);
            await fetchAccountData();
        } catch (error) {
            console.error("Failed to add payment method:", error);
            toast.error("Failed to add payment method");
        }
    };

    const handleDeletePaymentMethod = async (paymentMethodId) => {
        try {
            const token = await getValidToken();
            await axios.delete(
                `${API_BASE_URL}/api/users/payments/methods/${paymentMethodId}/`,
                {
                    headers: { Authorization: `Bearer ${token}` },
                }
            );

            toast.success("Payment method deleted successfully!");
            await fetchAccountData();
        } catch (error) {
            console.error("Failed to delete payment method:", error);
            toast.error("Failed to delete payment method");
        }
    };

    const handleSetDefaultPaymentMethod = async (paymentMethodId) => {
        try {
            const token = await getValidToken();

            await axios.patch(
                `${API_BASE_URL}/api/users/payments/methods/${paymentMethodId}/set-default/`,
                {},
                { headers: { Authorization: `Bearer ${token}` } }
            );

            const updatedMethods = paymentMethods.map((method) => ({
                ...method,
                isDefault: method.id === paymentMethodId,
            }));
            setPaymentMethods(updatedMethods);

            toast.success("Default payment method updated successfully!");
        } catch (error) {
            console.error("Failed to set default payment method:", error);
            toast.error("Failed to update default payment method");
        }
    };

    const handlePrintBillingHistory = () => {
        const printWindow = window.open("", "_blank");
        const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Billing History - ${accountData?.first_name} ${accountData?.last_name
            }</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          h1 { color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 10px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
          th { background-color: #f8fafc; font-weight: bold; }
          tr:nth-child(even) { background-color: #f8fafc; }
          .header-info { margin-bottom: 20px; }
          .print-date { text-align: right; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="print-date">Generated: ${new Date().toLocaleDateString()}</div>
        <h1>Billing History</h1>
        <div class="header-info">
          <strong>Account:</strong> ${accountData?.first_name} ${accountData?.last_name
            }<br>
          <strong>Email:</strong> ${accountData?.email}<br>
          <strong>Organization:</strong> ${accountData?.organization_name || "N/A"
            }
        </div>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${billingHistory
                .map(
                    (invoice) => `
              <tr>
                <td>${invoice.date}</td>
                <td>${invoice.description}</td>
                <td>${invoice.amount}</td>
                <td>${invoice.status}</td>
              </tr>`
                )
                .join("")}
          </tbody>
        </table>
      </body>
      </html>
    `;

        printWindow.document.write(printContent);
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
        printWindow.close();
    };

    const handleDownloadBillingCsv = () => {
        const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
        const rows = [
            ["Date", "Description", "Amount", "Status"],
            ...billingHistory.map((i) => [i.date, i.description, i.amount, i.status]),
        ];
        const blob = new Blob([rows.map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "billing-history.csv";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    };

    const handleCancelAccount = async () => {
        try {
            const token = await getValidToken();

            const response = await axios.post(
                `${API_BASE_URL}/api/users/payments/cancel-subscription/`,
                {
                    immediate: cancellationData.immediate,
                    endDate: cancellationData.endDate,
                    reason: cancellationData.reason,
                    revoke_access: true,
                },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            if (response.data.success) {
                toast.success(
                    "Account cancelled successfully. You will be logged out shortly."
                );
                setCancelAccountOpen(false);

                setTimeout(() => {
                    localStorage.clear();
                    sessionStorage.clear();
                    window.location.href =
                        "/login?cancelled=true&message=Account has been cancelled";
                }, 3000);
            } else {
                throw new Error(response.data.message || "Cancellation failed");
            }
        } catch (error) {
            console.error("Failed to cancel account:", error);
            toast.error("Failed to cancel account. Please try again.");
        }
    };

    const handleExportData = async () => {
        try {
            setExportLoading(true);
            const token = await getValidToken();

            // Prepare export data with organization context for system admins
            const exportData = {
                ...exportFormData,
                ...(isSystemAdmin && selectedOrganization && {
                    organization_id: selectedOrganization.id
                })
            };

            const response = await axios.post(
                `${API_BASE_URL}/api/users/organization/export-data/`,
                exportData,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json",
                    },
                    responseType: "blob",
                }
            );

            const blob = new Blob([response.data], { type: "application/zip" });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;

            const disposition = response.headers["content-disposition"];
            let filename = "organization_export.zip";
            if (disposition) {
                const filenameMatch = disposition.match(/filename="(.+)"/);
                if (filenameMatch) filename = filenameMatch[1];
            }

            // Include organization name in filename for system admins
            if (isSystemAdmin && selectedOrganization) {
                const orgName = selectedOrganization.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                filename = `${orgName}_export_${new Date().toISOString().split('T')[0]}.zip`;
            }

            link.setAttribute("download", filename);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);

            const orgContext = isSystemAdmin && selectedOrganization ? ` for ${selectedOrganization.name}` : '';
            toast.success(`Organization data${orgContext} exported successfully!`);
            setExportDialogOpen(false);
        } catch (error) {
            console.error("Export failed:", error);
            toast.error("Failed to export organization data. Please try again.");
        } finally {
            setExportLoading(false);
        }
    };

    const handleDeleteOrganization = async () => {
        try {
            setDeleteLoading(true);
            const token = await getValidToken();

            // Prepare deletion data with organization context for system admins
            const deleteData = {
                confirmation_name: deleteFormData.confirmation_name,
                ...(isSystemAdmin && selectedOrganization && {
                    organization_id: selectedOrganization.id
                })
            };

            const response = await axios.post(
                `${API_BASE_URL}/api/users/organization/delete/`,
                deleteData,
                { headers: { Authorization: `Bearer ${token}` } }
            );

            if (response.data.message) {
                setDeleteDialogOpen(false);
                setDeleteConfirmationOpen(true);
            }
        } catch (error) {
            console.error("Delete preparation failed:", error);
            if (error.response?.data?.error) {
                toast.error(error.response.data.error);
            } else {
                toast.error(
                    "Failed to prepare organization deletion. Please try again."
                );
            }
        } finally {
            setDeleteLoading(false);
        }
    };

    const handleFinalDeleteConfirmation = async () => {
        try {
            setDeleteLoading(true);
            const token = await getValidToken();

            // Prepare final deletion data with organization context for system admins
            const deleteData = {
                final_confirmation: true,
                ...(isSystemAdmin && selectedOrganization && {
                    organization_id: selectedOrganization.id
                })
            };

            const response = await axios.delete(
                `${API_BASE_URL}/api/users/organization/delete/`,
                {
                    headers: { Authorization: `Bearer ${token}` },
                    data: deleteData,
                }
            );

            if (response.data.message) {
                const orgContext = isSystemAdmin && selectedOrganization ? ` (${selectedOrganization.name})` : '';
                toast.success(
                    `Organization${orgContext} deleted successfully.${!isSystemAdmin ? ' You will be logged out.' : ''}`
                );
                setDeleteConfirmationOpen(false);

                if (isSystemAdmin) {
                    // For system admins, reset to their own organization
                    fetchAccountData();
                } else {
                    // For regular admins, log them out
                    setTimeout(() => {
                        localStorage.clear();
                        sessionStorage.clear();
                        window.location.href =
                            "/login?deleted=true&message=Organization has been deleted";
                    }, 3000);
                }
            }
        } catch (error) {
            console.error("Delete failed:", error);
            toast.error("Failed to delete organization. Please try again.");
        } finally {
            setDeleteLoading(false);
        }
    };

    if (loading) {
        return (
            <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
                <Typography>Loading account information...</Typography>
            </Container>
        );
    }

    const currentPlanData = planOptions.find(
        (plan) => plan.value === currentPlan
    );

    // Debug logging to help diagnose the "Loading..." issue
    console.log('🔍 Account Page Debug:', {
        currentPlan,
        currentPlanData,
        planOptions: planOptions.map(p => ({ value: p.value, label: p.label }))
    });

    const orgName = selectedOrganization?.name || accountData?.organization_name;
    const planLabel = (value) => planOptions.find((p) => p.value === value)?.label;

    const paidCount = billingHistory.filter((i) => i.status === "Paid").length;
    const failedCount = billingHistory.length - paidCount;
    const billQ = billQuery.trim().toLowerCase();
    const shownInvoices = billingHistory.filter((i) => {
        if (billFilter === "paid" && i.status !== "Paid") return false;
        if (billFilter === "failed" && i.status === "Paid") return false;
        if (billQ && !`${i.date} ${i.description} ${i.amount} ${i.status}`.toLowerCase().includes(billQ)) return false;
        return true;
    });
    const accountTabs = [
        { key: "details", label: "Details" },
        { key: "billing", label: "Billing history", count: billingHistory.length },
        { key: "plan", label: "Plan & data" },
        { key: "danger", label: "Danger zone" },
    ];
    const STICKY_TOP = "calc(64px + var(--account-sticky-h, 130px))";

    return (
        <Container maxWidth={false} sx={{ mt: 0, mb: 3, px: { xs: 2, md: 4 } }}>
            {/* Pinned title, tabs and toolbar (stays put while the body scrolls) */}
            <Box
                ref={pinRef}
                sx={{
                    position: "sticky", top: 64, zIndex: 1000, bgcolor: "background.paper",
                    pt: "18px", mt: "-18px", pb: 0.5, borderBottom: `1px solid ${BORDER}`,
                }}
            >
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                    <Typography variant="h5" component="h1" sx={{ fontWeight: 500 }}>
                        Account
                    </Typography>
                    {currentPlanData && <Chip size="small" color="primary" variant="outlined" label={currentPlanData.label} />}
                    {orgName && <Chip size="small" variant="outlined" label={orgName} />}
                    <Box sx={{ flex: 1 }} />
                    <BackButton sx={{ mb: 0, py: 0.75 }} />
                </Box>
                <Typography variant="body2" sx={{ color: "text.secondary", fontSize: 12, mt: -0.25 }}>
                    Your details, plan and billing
                </Typography>

                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap", py: 1 }}>
                    {accountTabs.map((t) => (
                        <Chip
                            key={t.key}
                            size="small"
                            clickable
                            color={tab === t.key ? "primary" : "default"}
                            variant={tab === t.key ? "filled" : "outlined"}
                            label={t.count != null ? `${t.label} ${t.count}` : t.label}
                            onClick={() => setTab(t.key)}
                            data-testid={`account-tab-${t.key}`}
                        />
                    ))}
                    <Box sx={{ flex: 1 }} />
                    {tab === "details" && (
                        <Button size="small" variant="contained" onClick={() => setEditAccountOpen(true)}>
                            Edit details
                        </Button>
                    )}
                    <IconButton size="small" aria-label="More actions" onClick={(e) => setMoreAnchor(e.currentTarget)}>
                        <MoreVert fontSize="small" />
                    </IconButton>
                    <Menu anchorEl={moreAnchor} open={Boolean(moreAnchor)} onClose={() => setMoreAnchor(null)}>
                        <MenuItem onClick={() => { setMoreAnchor(null); handlePrintBillingHistory(); }}>Print billing history</MenuItem>
                        <MenuItem onClick={() => { setMoreAnchor(null); handleDownloadBillingCsv(); }}>Download invoices (CSV)</MenuItem>
                        <MenuItem onClick={() => { setMoreAnchor(null); setExportDialogOpen(true); }}>Export organization data</MenuItem>
                        <MenuItem onClick={() => { setMoreAnchor(null); setChangePlanOpen(true); }}>Change plan</MenuItem>
                    </Menu>
                </Box>

                {/* System admin: pick another organization */}
                {isSystemAdmin && (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap", pb: 1, pt: 0.75, borderTop: `1px dashed ${BORDER}` }}>
                        <Typography sx={{ fontWeight: 600, fontSize: 13 }}>System admin</Typography>
                        {selectedOrganization && (
                            <Chip label={`Managing: ${selectedOrganization.name}`} color="primary" size="small" variant="outlined" />
                        )}
                        <Box sx={{ position: "relative", width: { xs: "100%", sm: 320 } }}>
                            <TextField
                                fullWidth
                                size="small"
                                placeholder="Search organizations by name..."
                                value={organizationSearchQuery}
                                onChange={handleOrganizationSearchChange}
                                InputProps={{
                                    startAdornment: (
                                        <InputAdornment position="start">
                                            <Search fontSize="small" />
                                        </InputAdornment>
                                    ),
                                }}
                            />
                            {organizationSearchLoading && (
                                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                                    Searching...
                                </Typography>
                            )}
                            {showSearchResults && organizationSearchResults.length > 0 && (
                                <Box
                                    sx={{
                                        position: "absolute", top: "100%", left: 0, right: 0, zIndex: 1000,
                                        bgcolor: "#fff", border: `1px solid ${BORDER}`, borderRadius: "8px",
                                        maxHeight: 220, overflowY: "auto", mt: 0.5,
                                        boxShadow: "0 8px 24px rgba(15,23,42,.12)",
                                    }}
                                >
                                    {organizationSearchResults.map((org) => (
                                        <Box
                                            key={org.id}
                                            onClick={() => selectOrganization(org)}
                                            sx={{
                                                px: 1.5, py: 1, cursor: "pointer",
                                                borderBottom: "1px solid #eef1f6",
                                                "&:hover": { bgcolor: "#f5f7fb" },
                                                "&:last-child": { borderBottom: "none" },
                                            }}
                                        >
                                            <Typography variant="body2" sx={{ fontWeight: 600 }}>{org.name}</Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                {org.subscription_tier || "No plan"} • ID: {org.id}
                                            </Typography>
                                        </Box>
                                    ))}
                                </Box>
                            )}
                            {showSearchResults && organizationSearchResults.length === 0 && organizationSearchQuery.length >= 2 && !organizationSearchLoading && (
                                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                                    No organizations found
                                </Typography>
                            )}
                        </Box>
                    </Box>
                )}
            </Box>

            <Box sx={{ maxWidth: 860, mx: "auto", pt: 1.75, display: "flex", flexDirection: "column", gap: 1.5 }}>
                {tab === "details" && (
                    <>
                        <Section
                            title="Account details"
                            action={
                                <Button size="small" variant="outlined" onClick={() => setEditAccountOpen(true)}>
                                    Edit
                                </Button>
                            }
                        >
                            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: "10px 16px" }}>
                                <Field label="First name" value={accountData?.first_name} />
                                <Field label="Last name" value={accountData?.last_name} />
                                <Field label="Email" value={accountData?.email} />
                                <Field label="Phone" value={accountData?.phone_number} />
                                <Field label="Role" value={accountData?.role} />
                                <Field
                                    label="Organization"
                                    value={
                                        <>
                                            {orgName}
                                            {isSystemAdmin && selectedOrganization && (
                                                <Chip
                                                    label={selectedOrganization.subscription_tier || "No plan"}
                                                    size="small"
                                                    color="secondary"
                                                    sx={{ ml: 1 }}
                                                />
                                            )}
                                        </>
                                    }
                                />
                            </Box>
                        </Section>

                        <Section
                            title="Payment methods"
                            action={
                                <Button size="small" variant="outlined" onClick={() => setAddPaymentOpen(true)}>
                                    + Add
                                </Button>
                            }
                        >
                            {paymentMethods.length === 0 ? (
                                <Typography variant="body2" sx={{ color: "text.secondary", textAlign: "center", py: 2 }}>
                                    No payment methods found. Add a payment method to manage your subscription.
                                </Typography>
                            ) : (
                                paymentMethods.map((method) => (
                                    <Box
                                        key={method.id}
                                        sx={{
                                            display: "flex", alignItems: "center", gap: 1.25, minHeight: 44,
                                            border: `1px solid ${BORDER}`, borderRadius: "8px", px: 1.5, mb: 0.75,
                                        }}
                                    >
                                        <CreditCard fontSize="small" sx={{ color: "text.secondary" }} />
                                        <Box sx={{ flex: 1, py: 0.5 }}>
                                            <Typography variant="body2" sx={{ fontSize: 13.5 }}>
                                                {method.type} ending in {method.last4}
                                                {method.isDefault && (
                                                    <Chip label="Default" size="small" color="success" variant="outlined" sx={{ ml: 1, height: 20 }} />
                                                )}
                                            </Typography>
                                            <Typography variant="caption" sx={{ color: "text.secondary" }}>
                                                Expires {method.expires}
                                            </Typography>
                                        </Box>
                                        <IconButton
                                            size="small"
                                            aria-label={`Actions for ${method.type} ending in ${method.last4}`}
                                            onClick={(e) => setPayMenu({ anchor: e.currentTarget, method })}
                                        >
                                            <MoreVert fontSize="small" />
                                        </IconButton>
                                    </Box>
                                ))
                            )}
                        </Section>
                    </>
                )}

                {tab === "billing" && (
                    <Section>
                        {/* Pinned billing toolbar, stacked under the title block */}
                        <Box
                            sx={{
                                position: "sticky", top: STICKY_TOP, zIndex: 900, bgcolor: "background.paper",
                                display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap", py: 0.75,
                            }}
                        >
                            <Typography component="h2" sx={{ fontSize: 14.5, fontWeight: 600, mr: 0.5 }}>
                                Billing history
                            </Typography>
                            {[
                                { key: "all", label: "All", n: billingHistory.length },
                                { key: "paid", label: "Paid", n: paidCount },
                                { key: "failed", label: "Failed", n: failedCount },
                            ].map((f) => (
                                <Chip
                                    key={f.key}
                                    size="small"
                                    clickable
                                    color={billFilter === f.key ? "primary" : "default"}
                                    variant={billFilter === f.key ? "filled" : "outlined"}
                                    label={`${f.label} ${f.n}`}
                                    onClick={() => setBillFilter(f.key)}
                                    data-testid={`bill-filter-${f.key}`}
                                />
                            ))}
                            <Box sx={{ flex: 1 }} />
                            <TextField
                                size="small"
                                placeholder="Search invoices"
                                value={billQuery}
                                onChange={(e) => setBillQuery(e.target.value)}
                                inputProps={{ "aria-label": "Search invoices" }}
                                sx={{ width: { xs: "100%", sm: 200 } }}
                            />
                            <IconButton size="small" aria-label="Billing actions" onClick={(e) => setBillMenuAnchor(e.currentTarget)}>
                                <MoreVert fontSize="small" />
                            </IconButton>
                            <Menu anchorEl={billMenuAnchor} open={Boolean(billMenuAnchor)} onClose={() => setBillMenuAnchor(null)}>
                                <MenuItem onClick={() => { setBillMenuAnchor(null); handlePrintBillingHistory(); }}>Print</MenuItem>
                                <MenuItem onClick={() => { setBillMenuAnchor(null); handleDownloadBillingCsv(); }}>Download CSV</MenuItem>
                            </Menu>
                        </Box>
                        <Box
                            sx={{
                                border: `1px solid ${BORDER}`, borderRadius: "8px",
                                overflowX: { xs: "auto", md: "clip" },
                            }}
                        >
                            <Table size="small" sx={{ minWidth: 520 }}>
                                <TableHead>
                                    <TableRow>
                                        {["Date", "Description", "Amount", "Status"].map((h) => (
                                            <TableCell
                                                key={h}
                                                sx={{
                                                    fontWeight: 700, bgcolor: "#f3f5f9",
                                                    position: { md: "sticky" }, top: { md: `calc(${STICKY_TOP} + 44px)` }, zIndex: 2,
                                                }}
                                            >
                                                {h}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {billingHistory.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={4} sx={{ textAlign: "center", py: 2.5 }}>
                                                <Typography variant="body2" color="text.secondary">
                                                    No billing history found. Invoices will appear here after your first payment.
                                                </Typography>
                                            </TableCell>
                                        </TableRow>
                                    ) : shownInvoices.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={4} sx={{ textAlign: "center", py: 2.5 }}>
                                                <Typography variant="body2" color="text.secondary">
                                                    No invoices match.
                                                </Typography>
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        shownInvoices.map((invoice) => (
                                            <TableRow key={invoice.id} hover>
                                                <TableCell>{invoice.date}</TableCell>
                                                <TableCell>{invoice.description}</TableCell>
                                                <TableCell>{invoice.amount}</TableCell>
                                                <TableCell>
                                                    <Chip
                                                        label={invoice.status}
                                                        color={invoice.status === "Paid" ? "success" : "error"}
                                                        size="small"
                                                        variant="outlined"
                                                    />
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </Box>
                    </Section>
                )}

                {tab === "plan" && (
                    <>
                        <Section title="Current plan">
                            {currentPlanData ? (
                                <Box>
                                    <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
                                        <Typography sx={{ fontSize: 22, fontWeight: 600, color: "primary.main" }}>
                                            {currentPlanData.label}
                                        </Typography>
                                        <Typography variant="body2" sx={{ color: "text.secondary" }}>
                                            {currentPlanData.price}
                                        </Typography>
                                    </Box>
                                    <Box sx={{ my: 1.25 }}>
                                        {currentPlanData.features.map((feature) => (
                                            <Typography key={feature} variant="body2" sx={{ display: "flex", gap: 1, mb: 0.5 }}>
                                                <Box component="span" sx={{ color: "success.main" }}>&#10003;</Box>
                                                {feature}
                                            </Typography>
                                        ))}
                                    </Box>
                                </Box>
                            ) : (
                                <Typography variant="body2" sx={{ color: "text.secondary", mb: 1.25 }}>
                                    {`Loading... (${currentPlan || "undefined"})`}
                                </Typography>
                            )}
                            <Button variant="outlined" fullWidth onClick={() => setChangePlanOpen(true)}>
                                Change plan
                            </Button>
                        </Section>

                        <Section title="Your data">
                            <Typography variant="body2" sx={{ color: "text.secondary", mb: 1 }}>
                                Download all your organization's data as JSON and/or CSV.
                            </Typography>
                            <Button
                                variant="outlined"
                                fullWidth
                                startIcon={<CloudDownload fontSize="small" />}
                                onClick={() => setExportDialogOpen(true)}
                            >
                                Export organization data
                            </Button>
                        </Section>
                    </>
                )}

                {tab === "danger" && (
                    <Section title="Danger zone" sx={{ borderColor: "#f0b8b4" }}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, pb: 1, borderBottom: "1px solid #f3d6d4", flexWrap: "wrap" }}>
                            <Box sx={{ flex: 1, minWidth: 200 }}>
                                <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>Cancel account</Typography>
                                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                                    Suspends access. Cannot be undone.
                                </Typography>
                            </Box>
                            <Button size="small" variant="outlined" color="error" sx={{ width: 170 }} onClick={() => setCancelAccountOpen(true)}>
                                Cancel account
                            </Button>
                        </Box>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, pt: 1, flexWrap: "wrap" }}>
                            <Box sx={{ flex: 1, minWidth: 200 }}>
                                <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>Delete organization</Typography>
                                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                                    Permanently deletes all data.
                                </Typography>
                            </Box>
                            <Button size="small" variant="outlined" color="error" sx={{ width: 170 }} onClick={() => setDeleteDialogOpen(true)}>
                                Delete organization
                            </Button>
                        </Box>
                    </Section>
                )}
            </Box>

            <Menu anchorEl={payMenu.anchor} open={Boolean(payMenu.anchor)} onClose={() => setPayMenu({ anchor: null, method: null })}>
                {payMenu.method && !payMenu.method.isDefault && (
                    <MenuItem
                        onClick={() => {
                            handleSetDefaultPaymentMethod(payMenu.method.id);
                            setPayMenu({ anchor: null, method: null });
                        }}
                    >
                        Set as default
                    </MenuItem>
                )}
                <MenuItem
                    sx={{ color: "error.main" }}
                    onClick={() => {
                        handleDeletePaymentMethod(payMenu.method.id);
                        setPayMenu({ anchor: null, method: null });
                    }}
                >
                    Delete
                </MenuItem>
            </Menu>

            {/* Edit Account Dialog */}
            <Dialog
                open={editAccountOpen}
                onClose={() => setEditAccountOpen(false)}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>Edit Account Details</DialogTitle>
                <DialogContent>
                    <Grid container spacing={2} sx={{ mt: 1 }}>
                        <Grid size={6}>
                            <TextField
                                fullWidth
                                label="First Name"
                                value={editFormData.first_name || ""}
                                onChange={(e) =>
                                    setEditFormData({
                                        ...editFormData,
                                        first_name: e.target.value,
                                    })
                                }
                            />
                        </Grid>
                        <Grid size={6}>
                            <TextField
                                fullWidth
                                label="Last Name"
                                value={editFormData.last_name || ""}
                                onChange={(e) =>
                                    setEditFormData({
                                        ...editFormData,
                                        last_name: e.target.value,
                                    })
                                }
                            />
                        </Grid>
                        <Grid size={12}>
                            <TextField
                                fullWidth
                                label="Email"
                                type="email"
                                value={editFormData.email || ""}
                                onChange={(e) =>
                                    setEditFormData({ ...editFormData, email: e.target.value })
                                }
                            />
                        </Grid>
                        <Grid size={12}>
                            <TextField
                                fullWidth
                                label="Phone Number"
                                value={editFormData.phone_number || ""}
                                onChange={(e) =>
                                    setEditFormData({
                                        ...editFormData,
                                        phone_number: e.target.value,
                                    })
                                }
                            />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setEditAccountOpen(false)}>Cancel</Button>
                    <Button onClick={handleEditAccount} variant="contained">
                        Save Changes
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Change Plan Dialog */}
            <Dialog
                open={changePlanOpen}
                onClose={() => setChangePlanOpen(false)}
                maxWidth="md"
                fullWidth
            >
                <DialogTitle>Change plan</DialogTitle>
                <DialogContent>
                    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" }, gap: 1.25, mt: 0.5 }}>
                        {planOptions.map((plan) => {
                            const picked = selectedPlan === plan.value;
                            return (
                                <Box
                                    key={plan.value}
                                    role="button"
                                    tabIndex={0}
                                    aria-pressed={picked}
                                    onClick={() => setSelectedPlan(plan.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                            e.preventDefault();
                                            setSelectedPlan(plan.value);
                                        }
                                    }}
                                    sx={{
                                        cursor: "pointer",
                                        border: picked ? "2px solid #1d4ed8" : `1px solid ${BORDER}`,
                                        bgcolor: picked ? "#f5f9ff" : "#fff",
                                        borderRadius: "10px",
                                        p: picked ? "11px 13px" : "12px 14px",
                                    }}
                                >
                                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                                        <Typography sx={{ fontSize: 15, fontWeight: 600 }}>{plan.label}</Typography>
                                        {currentPlan === plan.value && (
                                            <Chip label="Current" color="primary" size="small" variant="outlined" sx={{ height: 20 }} />
                                        )}
                                    </Box>
                                    <Typography variant="body2" sx={{ color: "text.secondary", mb: 1 }}>
                                        {plan.price}
                                    </Typography>
                                    {plan.features.map((feature) => (
                                        <Typography key={feature} variant="body2" sx={{ fontSize: 12.5, mb: 0.4 }}>
                                            <Box component="span" sx={{ color: "success.main", mr: 0.75 }}>&#10003;</Box>
                                            {feature}
                                        </Typography>
                                    ))}
                                </Box>
                            );
                        })}
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setChangePlanOpen(false)}>Cancel</Button>
                    <Button
                        onClick={handleChangePlan}
                        variant="contained"
                        disabled={!selectedPlan || selectedPlan === currentPlan}
                    >
                        {selectedPlan && selectedPlan !== currentPlan ? `Switch to ${planLabel(selectedPlan)}` : "Change plan"}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Add Payment Method Dialog */}
            <Dialog
                open={addPaymentOpen}
                onClose={() => setAddPaymentOpen(false)}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>Add Payment Method</DialogTitle>
                <DialogContent dividers>
                    <Grid container spacing={2} sx={{ mt: 0.5 }}>
                        <Grid size={12}>
                            <TextField
                                fullWidth
                                label="Card number"
                                value={paymentFormData.cardNumber}
                                onChange={(e) =>
                                    setPaymentFormData({
                                        ...paymentFormData,
                                        cardNumber: e.target.value,
                                    })
                                }
                                placeholder="1234 5678 9012 3456"
                                inputMode="numeric"
                                autoComplete="cc-number"
                                helperText="We accept Visa, MasterCard, AmEx"
                            />
                        </Grid>

                        <Grid size={{ xs: 12, md: 6 }}>
                            <TextField
                                fullWidth
                                label="Expiry (MM/YY)"
                                value={paymentFormData.expiry}
                                onChange={(e) =>
                                    setPaymentFormData({
                                        ...paymentFormData,
                                        expiry: e.target.value,
                                    })
                                }
                                placeholder="08/27"
                                inputProps={{ maxLength: 5 }}
                                autoComplete="cc-exp"
                            />
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <TextField
                                fullWidth
                                label="CVC"
                                value={paymentFormData.cvc}
                                onChange={(e) =>
                                    setPaymentFormData({
                                        ...paymentFormData,
                                        cvc: e.target.value,
                                    })
                                }
                                placeholder="123"
                                inputMode="numeric"
                                autoComplete="cc-csc"
                                helperText="3–4 digits on the back of your card"
                            />
                        </Grid>

                        <Grid size={12}>
                            <TextField
                                fullWidth
                                label="Billing address"
                                multiline
                                minRows={3}
                                value={paymentFormData.billingAddress}
                                onChange={(e) =>
                                    setPaymentFormData({
                                        ...paymentFormData,
                                        billingAddress: e.target.value,
                                    })
                                }
                                placeholder="Street, City, State, ZIP"
                                autoComplete="billing street-address"
                            />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions sx={{ px: 3, py: 2 }}>
                    <Button onClick={() => setAddPaymentOpen(false)}>Cancel</Button>
                    <Button onClick={handleAddPaymentMethod} variant="contained">
                        Add Payment Method
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Cancel Account Dialog */}
            <Dialog
                open={cancelAccountOpen}
                onClose={() => setCancelAccountOpen(false)}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>
                    <Warning color="error" sx={{ mr: 1, verticalAlign: "middle" }} />
                    Cancel Account
                </DialogTitle>
                <DialogContent>
                    <Alert severity="error" sx={{ mb: 2 }}>
                        <strong>Warning:</strong> Canceling your account will immediately
                        suspend your access to the application. This action cannot be
                        undone.
                    </Alert>

                    <Grid container spacing={2}>
                        <Grid size={12}>
                            <FormControl fullWidth>
                                <InputLabel>Cancellation Type</InputLabel>
                                <Select
                                    value={cancellationData.immediate ? "immediate" : "scheduled"}
                                    onChange={(e) =>
                                        setCancellationData({
                                            ...cancellationData,
                                            immediate: e.target.value === "immediate",
                                        })
                                    }
                                >
                                    <MenuItem value="immediate">Cancel Immediately</MenuItem>
                                    <MenuItem value="scheduled">
                                        Cancel at End of Billing Period
                                    </MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>

                        {!cancellationData.immediate && (
                            <Grid size={12}>
                                <TextField
                                    fullWidth
                                    label="End Date"
                                    type="date"
                                    value={cancellationData.endDate}
                                    onChange={(e) =>
                                        setCancellationData({
                                            ...cancellationData,
                                            endDate: e.target.value,
                                        })
                                    }
                                    InputLabelProps={{ shrink: true }}
                                />
                            </Grid>
                        )}

                        <Grid size={12}>
                            <TextField
                                fullWidth
                                label="Reason for Cancellation (Optional)"
                                multiline
                                rows={3}
                                value={cancellationData.reason}
                                onChange={(e) =>
                                    setCancellationData({
                                        ...cancellationData,
                                        reason: e.target.value,
                                    })
                                }
                                placeholder="Help us improve by sharing why you're canceling..."
                            />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setCancelAccountOpen(false)}>
                        No, Keep Account
                    </Button>
                    <Button
                        onClick={handleCancelAccount}
                        color="error"
                        variant="contained"
                    >
                        Yes, Cancel Account
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Export Data Dialog */}
            <Dialog
                open={exportDialogOpen}
                onClose={() => setExportDialogOpen(false)}
                maxWidth="md"
                fullWidth
            >
                <DialogTitle>
                    <CloudDownload sx={{ mr: 1, verticalAlign: "middle" }} />
                    Export Organization Data
                </DialogTitle>
                <DialogContent>
                    <Typography variant="body1" sx={{ mb: 3 }}>
                        Select the data format and which data to include in your export.
                    </Typography>

                    {/* Format Selection */}
                    <Box sx={{ mb: 3 }}>
                        <Typography variant="h6" gutterBottom>
                            Data Format:
                        </Typography>
                        <Box sx={{ display: "flex", gap: 2 }}>
                            <Button
                                variant={
                                    exportFormData.formats.includes("json")
                                        ? "contained"
                                        : "outlined"
                                }
                                onClick={() => {
                                    const formats = exportFormData.formats.includes("json")
                                        ? exportFormData.formats.filter((f) => f !== "json")
                                        : [...exportFormData.formats, "json"];
                                    setExportFormData({ ...exportFormData, formats });
                                }}
                            >
                                JSON Format
                            </Button>
                            <Button
                                variant={
                                    exportFormData.formats.includes("csv")
                                        ? "contained"
                                        : "outlined"
                                }
                                onClick={() => {
                                    const formats = exportFormData.formats.includes("csv")
                                        ? exportFormData.formats.filter((f) => f !== "csv")
                                        : [...exportFormData.formats, "csv"];
                                    setExportFormData({ ...exportFormData, formats });
                                }}
                            >
                                CSV Format
                            </Button>
                        </Box>
                    </Box>

                    {/* Data Selection */}
                    <Box sx={{ mb: 3 }}>
                        <Typography variant="h6" gutterBottom>
                            Data to Include:
                        </Typography>
                        <Grid container spacing={2}>
                            {Object.entries(exportFormData.include_data).map(
                                ([key, value]) => (
                                    <Grid size={6} key={key}>
                                        <Button
                                            variant={value ? "contained" : "outlined"}
                                            fullWidth
                                            onClick={() => {
                                                setExportFormData({
                                                    ...exportFormData,
                                                    include_data: {
                                                        ...exportFormData.include_data,
                                                        [key]: !value,
                                                    },
                                                });
                                            }}
                                            startIcon={
                                                value ? <CheckBoxIcon /> : <CheckBoxOutlineBlankIcon />
                                            }
                                        >
                                            {key.charAt(0).toUpperCase() +
                                                key.slice(1).replace("_", " ")}
                                        </Button>
                                    </Grid>
                                )
                            )}
                        </Grid>
                    </Box>

                    <Alert severity="info" sx={{ mb: 2 }}>
                        Export will be downloaded as a ZIP file containing the selected data
                        formats.
                    </Alert>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setExportDialogOpen(false)}>Cancel</Button>
                    <Button
                        onClick={handleExportData}
                        variant="contained"
                        disabled={exportLoading || exportFormData.formats.length === 0}
                        startIcon={<CloudDownload />}
                    >
                        {exportLoading ? "Exporting..." : "Export Data"}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Delete Organization Dialog */}
            <Dialog
                open={deleteDialogOpen}
                onClose={() => setDeleteDialogOpen(false)}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>
                    <DeleteForever
                        color="error"
                        sx={{ mr: 1, verticalAlign: "middle" }}
                    />
                    Delete Organization
                </DialogTitle>
                <DialogContent>
                    <Alert severity="error" sx={{ mb: 3 }}>
                        <strong>WARNING:</strong> This action will permanently delete your
                        organization and ALL associated data including:
                        <ul>
                            <li>All user accounts</li>
                            <li>All appointments</li>
                            <li>All availability schedules</li>
                            <li>All communication history</li>
                            <li>All billing information</li>
                        </ul>
                        This action cannot be undone.
                    </Alert>

                    <Typography variant="body1" sx={{ mb: 2 }}>
                        To confirm deletion, please type the organization name exactly:
                        <strong> {selectedOrganization?.name || accountData?.organization_name}</strong>
                    </Typography>

                    <TextField
                        fullWidth
                        label="Organization Name"
                        value={deleteFormData.confirmation_name}
                        onChange={(e) =>
                            setDeleteFormData({
                                ...deleteFormData,
                                confirmation_name: e.target.value,
                            })
                        }
                        placeholder={selectedOrganization?.name || accountData?.organization_name}
                        error={
                            !!deleteFormData.confirmation_name &&
                            deleteFormData.confirmation_name !==
                            (selectedOrganization?.name || accountData?.organization_name)
                        }
                        helperText={
                            !!deleteFormData.confirmation_name &&
                                deleteFormData.confirmation_name !==
                                (selectedOrganization?.name || accountData?.organization_name)
                                ? "Organization name does not match"
                                : ""
                        }
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
                    <Button
                        onClick={handleDeleteOrganization}
                        color="error"
                        variant="contained"
                        disabled={
                            deleteLoading ||
                            deleteFormData.confirmation_name !==
                            (selectedOrganization?.name || accountData?.organization_name)
                        }
                        startIcon={<DeleteForever />}
                    >
                        {deleteLoading ? "Preparing..." : "Delete Organization"}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Final Delete Confirmation Dialog */}
            <Dialog
                open={deleteConfirmationOpen}
                onClose={() => setDeleteConfirmationOpen(false)}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>
                    <Warning color="error" sx={{ mr: 1, verticalAlign: "middle" }} />
                    Final Confirmation
                </DialogTitle>
                <DialogContent>
                    <Alert severity="error" sx={{ mb: 2 }}>
                        You are about to permanently delete{" "}
                        <strong>{accountData?.organization_name}</strong>. This is your last
                        chance to cancel.
                    </Alert>

                    <Typography variant="body1" color="error" sx={{ mb: 2 }}>
                        Once deleted, you will be immediately logged out and will not be
                        able to recover any data.
                    </Typography>

                    <Typography variant="body2">
                        Are you absolutely sure you want to proceed?
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button
                        onClick={() => setDeleteConfirmationOpen(false)}
                        variant="outlined"
                    >
                        No, Keep Organization
                    </Button>
                    <Button
                        onClick={handleFinalDeleteConfirmation}
                        color="error"
                        variant="contained"
                        disabled={deleteLoading}
                        startIcon={<DeleteForever />}
                    >
                        {deleteLoading ? "Deleting..." : "Yes, Delete Forever"}
                    </Button>
                </DialogActions>
            </Dialog>
        </Container>
    );
}

export default AccountPage;
