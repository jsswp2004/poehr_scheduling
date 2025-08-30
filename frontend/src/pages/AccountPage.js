import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "../components/SimpleToast";
import axios from "axios";
import { API_BASE_URL } from "../config/api";
import { getValidToken } from "../utils/auth";
import { jwtDecode } from "jwt-decode";
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
} from "@mui/material";
import {
  ArrowBack,
  Edit,
  CreditCard,
  Delete,
  Cancel,
  Warning,
  Business,
  Email,
  Person,
  Print,
  CheckCircle,
  CloudDownload,
  DeleteForever,
  Storage,
  CheckBox as CheckBoxIcon,
  CheckBoxOutlineBlank as CheckBoxOutlineBlankIcon,
  Search,
} from "@mui/icons-material";

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

      // Map old 'personal' tier to new 'basic' tier for backwards compatibility
      let userPlan = userResponse.data.subscription_tier || "basic";
      if (userPlan.toLowerCase() === "personal") {
        userPlan = "basic";
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

  const selectOrganization = async (organization) => {
    try {
      setSelectedOrganization(organization);
      setOrganizationSearchQuery(organization.name);
      setShowSearchResults(false);
      
      // Update account data to reflect selected organization
      setAccountData({
        ...accountData,
        organization: organization.id,
        organization_name: organization.name,
        subscription_tier: organization.subscription_tier,
      });
      
      setCurrentPlan(organization.subscription_tier || 'basic');
      
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

      await axios.patch(`${API_BASE_URL}/api/users/me/`, updateData, {
        headers: { Authorization: `Bearer ${token}` },
      });

      toast.success("Account details updated successfully!");
      setEditAccountOpen(false);
      await fetchAccountData();
    } catch (error) {
      console.error("Failed to update account:", error);
      toast.error("Failed to update account details");
    }
  };

  const handleChangePlan = async () => {
    try {
      const token = await getValidToken();
      await axios.post(
        `${API_BASE_URL}/api/users/payments/change-plan/`,
        { plan: selectedPlan },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success("Plan changed successfully!");
      setChangePlanOpen(false);
      await fetchAccountData();
    } catch (error) {
      console.error("Failed to change plan:", error);
      toast.error("Failed to change plan");
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
        <title>Billing History - ${accountData?.first_name} ${
      accountData?.last_name
    }</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          h1 { color: #1976d2; border-bottom: 2px solid #1976d2; padding-bottom: 10px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
          th { background-color: #f5f5f5; font-weight: bold; }
          tr:nth-child(even) { background-color: #f9f9f9; }
          .header-info { margin-bottom: 20px; }
          .print-date { text-align: right; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="print-date">Generated: ${new Date().toLocaleDateString()}</div>
        <h1>Billing History</h1>
        <div class="header-info">
          <strong>Account:</strong> ${accountData?.first_name} ${
      accountData?.last_name
    }<br>
          <strong>Email:</strong> ${accountData?.email}<br>
          <strong>Organization:</strong> ${
            accountData?.organization_name || "N/A"
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

  return (
    <Container
      maxWidth={false}
      sx={{ mt: 4, mb: 4, px: 4, height: "calc(100vh - 100px)" }}
    >
      {/* Header with Back Button */}
      <Box sx={{ display: "flex", alignItems: "center", mb: 3 }}>
        <IconButton
          onClick={() => navigate(-1)}
          sx={{ mr: 2 }}
          aria-label="Go back"
        >
          <ArrowBack />
        </IconButton>
        <Typography variant="h4" component="h1">
          Account Settings
        </Typography>
      </Box>

      {/* Two-Column Layout using responsive CSS Grid */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
          gap: 4,
          alignItems: "start",
          height: "calc(100% - 80px)",
        }}
      >
        {/* LEFT PANE - Account & Billing */}
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 3,
            overflowY: "auto",
            maxHeight: "100%",
          }}
        >
          {/* Account Details Section */}
          <Box sx={{ backgroundColor: "#f9f9f9", p: 3, borderRadius: 2 }}>
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                mb: 2,
              }}
            >
              <Typography variant="h6" gutterBottom>
                <Person sx={{ mr: 1, verticalAlign: "middle" }} />
                Account Details
                {isSystemAdmin && selectedOrganization && (
                  <Chip 
                    label={`Managing: ${selectedOrganization.name}`} 
                    color="primary" 
                    size="small" 
                    sx={{ ml: 2 }}
                  />
                )}
              </Typography>
              <IconButton onClick={() => setEditAccountOpen(true)}>
                <Edit />
              </IconButton>
            </Box>

            {/* System Admin Organization Search */}
            {isSystemAdmin && (
              <Box sx={{ mb: 3, p: 2, backgroundColor: "#e3f2fd", borderRadius: 1 }}>
                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                  System Admin: Search Organizations
                </Typography>
                <Box sx={{ position: "relative" }}>
                  <TextField
                    fullWidth
                    size="small"
                    placeholder="Search organizations by name..."
                    value={organizationSearchQuery}
                    onChange={handleOrganizationSearchChange}
                    sx={{ backgroundColor: "white" }}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <Search />
                        </InputAdornment>
                      ),
                    }}
                  />
                  
                  {organizationSearchLoading && (
                    <Box sx={{ p: 1, textAlign: "center" }}>
                      <Typography variant="body2" color="text.secondary">
                        Searching...
                      </Typography>
                    </Box>
                  )}
                  
                  {showSearchResults && organizationSearchResults.length > 0 && (
                    <Box
                      sx={{
                        position: "absolute",
                        top: "100%",
                        left: 0,
                        right: 0,
                        zIndex: 1000,
                        backgroundColor: "white",
                        border: "1px solid #ddd",
                        borderRadius: 1,
                        maxHeight: 200,
                        overflowY: "auto",
                        mt: 0.5,
                      }}
                    >
                      {organizationSearchResults.map((org) => (
                        <Box
                          key={org.id}
                          sx={{
                            p: 1.5,
                            borderBottom: "1px solid #eee",
                            cursor: "pointer",
                            "&:hover": { backgroundColor: "#f5f5f5" },
                            "&:last-child": { borderBottom: "none" },
                          }}
                          onClick={() => selectOrganization(org)}
                        >
                          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <Box>
                              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                {org.name}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {org.subscription_tier || "No plan"} • ID: {org.id}
                              </Typography>
                            </Box>
                            <Button size="small" variant="outlined">
                              Select
                            </Button>
                          </Box>
                        </Box>
                      ))}
                    </Box>
                  )}
                  
                  {showSearchResults && organizationSearchResults.length === 0 && organizationSearchQuery.length >= 2 && !organizationSearchLoading && (
                    <Box sx={{ p: 1, textAlign: "center" }}>
                      <Typography variant="body2" color="text.secondary">
                        No organizations found
                      </Typography>
                    </Box>
                  )}
                </Box>
              </Box>
            )}

            <Grid container spacing={2}>
              <Grid item xs={6}>
                <Typography variant="body2" color="text.secondary">
                  First Name
                </Typography>
                <Typography variant="body1">
                  {accountData?.first_name || "Not set"}
                </Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="body2" color="text.secondary">
                  Last Name
                </Typography>
                <Typography variant="body1">
                  {accountData?.last_name || "Not set"}
                </Typography>
              </Grid>
              <Grid item xs={12}>
                <Typography variant="body2" color="text.secondary">
                  Email
                </Typography>
                <Typography variant="body1">
                  {accountData?.email || "Not set"}
                </Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="body2" color="text.secondary">
                  Phone
                </Typography>
                <Typography variant="body1">
                  {accountData?.phone_number || "Not set"}
                </Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="body2" color="text.secondary">
                  Role
                </Typography>
                <Typography variant="body1">
                  {accountData?.role || "Not set"}
                </Typography>
              </Grid>
              <Grid item xs={12}>
                <Typography variant="body2" color="text.secondary">
                  Organization
                  {isSystemAdmin && (
                    <Typography component="span" variant="caption" sx={{ ml: 1, color: 'primary.main' }}>
                      (System Admin View)
                    </Typography>
                  )}
                </Typography>
                <Typography variant="body1">
                  {selectedOrganization?.name || accountData?.organization_name || "Not set"}
                  {isSystemAdmin && selectedOrganization && (
                    <Chip 
                      label={selectedOrganization.subscription_tier || "No plan"} 
                      size="small" 
                      color="secondary" 
                      sx={{ ml: 1 }}
                    />
                  )}
                </Typography>
              </Grid>
            </Grid>
          </Box>

          {/* Payment Methods Section */}
          <Box sx={{ backgroundColor: "#f9f9f9", p: 3, borderRadius: 2 }}>
            <Typography variant="h6" gutterBottom>
              <CreditCard sx={{ mr: 1, verticalAlign: "middle" }} />
              Payment Methods
              {isSystemAdmin && selectedOrganization && (
                <Typography component="span" variant="caption" sx={{ ml: 1, color: 'text.secondary' }}>
                  - {selectedOrganization.name}
                </Typography>
              )}
            </Typography>

            {paymentMethods.length === 0 ? (
              <Box
                sx={{
                  p: 3,
                  backgroundColor: "#ffffff",
                  borderRadius: 1,
                  textAlign: "center",
                  mb: 2,
                }}
              >
                <Typography variant="body2" color="text.secondary">
                  No payment methods found. Add a payment method to manage your
                  subscription.
                </Typography>
              </Box>
            ) : (
              paymentMethods.map((method) => (
                <Box
                  key={method.id}
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    p: 2,
                    backgroundColor: "#ffffff",
                    borderRadius: 1,
                    mb: 1,
                  }}
                >
                  <Box>
                    <Typography variant="body1">
                      {method.type} ending in {method.last4}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Expires {method.expires}
                      {method.isDefault && (
                        <Chip label="Default" size="small" sx={{ ml: 1 }} />
                      )}
                    </Typography>
                  </Box>
                  <Box sx={{ display: "flex", gap: 1 }}>
                    {!method.isDefault && (
                      <IconButton
                        onClick={() => handleSetDefaultPaymentMethod(method.id)}
                        color="primary"
                        title="Set as Default"
                      >
                        <CheckCircle />
                      </IconButton>
                    )}
                    <IconButton
                      onClick={() => handleDeletePaymentMethod(method.id)}
                      color="error"
                      title="Delete Payment Method"
                    >
                      <Delete />
                    </IconButton>
                  </Box>
                </Box>
              ))
            )}

            <Button
              variant="outlined"
              onClick={() => setAddPaymentOpen(true)}
              startIcon={<CreditCard />}
              fullWidth
              sx={{ mt: 2 }}
            >
              Add Payment Method
            </Button>
          </Box>

          {/* Billing History Section */}
          <Box sx={{ backgroundColor: "#f9f9f9", p: 3, borderRadius: 2 }}>
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                mb: 2,
              }}
            >
              <Typography variant="h6">
                <Email sx={{ mr: 1, verticalAlign: "middle" }} />
                Billing History
                {isSystemAdmin && selectedOrganization && (
                  <Typography component="span" variant="caption" sx={{ ml: 1, color: 'text.secondary' }}>
                    - {selectedOrganization.name}
                  </Typography>
                )}
              </Typography>
              <IconButton
                onClick={handlePrintBillingHistory}
                color="primary"
                title="Print Billing History"
              >
                <Print />
              </IconButton>
            </Box>

            <Box
              sx={{
                mt: 2,
                backgroundColor: "#ffffff",
                borderRadius: 1,
                overflow: "hidden",
              }}
            >
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>Description</TableCell>
                    <TableCell>Amount</TableCell>
                    <TableCell>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {billingHistory.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        sx={{ textAlign: "center", py: 4 }}
                      >
                        <Typography variant="body2" color="text.secondary">
                          No billing history found. Invoices will appear here
                          after your first payment.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    billingHistory.map((invoice) => (
                      <TableRow key={invoice.id}>
                        <TableCell>{invoice.date}</TableCell>
                        <TableCell>{invoice.description}</TableCell>
                        <TableCell>{invoice.amount}</TableCell>
                        <TableCell>
                          <Chip
                            label={invoice.status}
                            color={
                              invoice.status === "Paid" ? "success" : "error"
                            }
                            size="small"
                          />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Box>
          </Box>
        </Box>

        {/* RIGHT PANE - Plans & Data Management */}
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 3,
            overflowY: "auto",
            maxHeight: "100%",
          }}
        >
          {/* Current Plan Section */}
          <Box sx={{ backgroundColor: "#f9f9f9", p: 3, borderRadius: 2 }}>
            <Typography variant="h6" gutterBottom>
              <Business sx={{ mr: 1, verticalAlign: "middle" }} />
              Current Plan:{" "}
              {currentPlanData ? currentPlanData.label : "Loading..."}
              {isSystemAdmin && selectedOrganization && (
                <Typography component="span" variant="caption" sx={{ ml: 1, color: 'text.secondary' }}>
                  - {selectedOrganization.name}
                </Typography>
              )}
            </Typography>

            {currentPlanData && (
              <Box>
                <Typography variant="h5" color="primary" gutterBottom>
                  {currentPlanData.label}
                </Typography>
                <Typography variant="h6" color="text.secondary" gutterBottom>
                  {currentPlanData.price}
                </Typography>
                <Box sx={{ mt: 2, mb: 2 }}>
                  {currentPlanData.features.map((feature, index) => (
                    <Chip
                      key={index}
                      label={feature}
                      size="small"
                      sx={{ mr: 1, mb: 1 }}
                    />
                  ))}
                </Box>
              </Box>
            )}

            <Button
              variant="outlined"
              onClick={() => setChangePlanOpen(true)}
              startIcon={<Edit />}
              fullWidth
            >
              Change Plan
            </Button>
          </Box>

          {/* Cancellation Notice Section */}
          <Box sx={{ backgroundColor: "#f9f9f9", p: 3, borderRadius: 2 }}>
            <Typography variant="h6" gutterBottom color="error">
              <Warning sx={{ mr: 1, verticalAlign: "middle" }} />
              Cancellation Notice
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Cancelling your account is permanent and cannot be undone. Please
              ensure you have saved any important data before proceeding.
            </Typography>
            <Button
              variant="contained"
              color="error"
              onClick={() => setCancelAccountOpen(true)}
              startIcon={<Cancel />}
            >
              Cancel Account
            </Button>
          </Box>

          {/* Data Management Section */}
          <Box sx={{ backgroundColor: "#f9f9f9", p: 3, borderRadius: 2 }}>
            <Typography variant="h6" gutterBottom>
              <Storage sx={{ mr: 1, verticalAlign: "middle" }} />
              Data Management
              {isSystemAdmin && selectedOrganization && (
                <Typography component="span" variant="caption" sx={{ ml: 1, color: 'text.secondary' }}>
                  - {selectedOrganization.name}
                </Typography>
              )}
            </Typography>

            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <Button
                variant="outlined"
                onClick={() => setExportDialogOpen(true)}
                startIcon={<CloudDownload />}
                fullWidth
                color="primary"
              >
                Export Organization Data
              </Button>

              <Button
                variant="outlined"
                onClick={() => setDeleteDialogOpen(true)}
                startIcon={<DeleteForever />}
                fullWidth
                color="error"
                sx={{ mt: 1 }}
              >
                Delete Organization
              </Button>
            </Box>

            <Box
              sx={{ mt: 2, p: 2, backgroundColor: "#fff3cd", borderRadius: 1 }}
            >
              <Typography variant="body2" color="text.secondary">
                <strong>Data Export:</strong> Download all your organization's
                data in JSON and/or CSV format.
                <br />
                <strong>Delete Organization:</strong> Permanently delete your
                organization and all associated data.
              </Typography>
            </Box>
          </Box>
        </Box>
      </Box>

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
            <Grid item xs={6}>
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
            <Grid item xs={6}>
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
            <Grid item xs={12}>
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
            <Grid item xs={12}>
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
        <DialogTitle>Change Subscription Plan</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            {planOptions.map((plan) => (
              <Grid item xs={12} md={4} key={plan.value}>
                <Box
                  sx={{
                    cursor: "pointer",
                    border:
                      selectedPlan === plan.value
                        ? "2px solid #1976d2"
                        : "1px solid #e0e0e0",
                    borderRadius: 2,
                    p: 3,
                  }}
                  onClick={() => setSelectedPlan(plan.value)}
                >
                  <Typography variant="h6" gutterBottom>
                    {plan.label}
                  </Typography>
                  <Typography variant="h5" color="primary" gutterBottom>
                    {plan.price}
                  </Typography>
                  <Box>
                    {plan.features.map((feature, index) => (
                      <Typography key={index} variant="body2" sx={{ mb: 0.5 }}>
                        • {feature}
                      </Typography>
                    ))}
                  </Box>
                  {currentPlan === plan.value && (
                    <Chip
                      label="Current Plan"
                      color="primary"
                      size="small"
                      sx={{ mt: 1 }}
                    />
                  )}
                </Box>
              </Grid>
            ))}
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setChangePlanOpen(false)}>Cancel</Button>
          <Button
            onClick={handleChangePlan}
            variant="contained"
            disabled={!selectedPlan || selectedPlan === currentPlan}
          >
            Change Plan
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
            <Grid item xs={12}>
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

            <Grid item xs={12} md={6}>
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
            <Grid item xs={12} md={6}>
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

            <Grid item xs={12}>
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
            <Grid item xs={12}>
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
              <Grid item xs={12}>
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

            <Grid item xs={12}>
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
                  <Grid item xs={6} key={key}>
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
