import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from '../components/SimpleToast';
import axios from 'axios';
import { API_BASE_URL } from '../config/api';
import { getValidToken } from '../utils/auth';
import { jwtDecode } from 'jwt-decode';
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
    Alert
} from '@mui/material';
import {
    ArrowBack,
    Edit,
    CreditCard,
    Delete,
    Cancel,
    Warning,
    Business,
    Email,
    Person
} from '@mui/icons-material';

function AccountPage() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [accountData, setAccountData] = useState(null);
    const [paymentMethods, setPaymentMethods] = useState([]);
    const [billingHistory, setBillingHistory] = useState([]);
    const [currentPlan, setCurrentPlan] = useState('');

    // Dialog states
    const [editAccountOpen, setEditAccountOpen] = useState(false);
    const [changePlanOpen, setChangePlanOpen] = useState(false);
    const [addPaymentOpen, setAddPaymentOpen] = useState(false);
    const [cancelAccountOpen, setCancelAccountOpen] = useState(false);

    // Form states
    const [editFormData, setEditFormData] = useState({});
    const [selectedPlan, setSelectedPlan] = useState('');
    const [paymentFormData, setPaymentFormData] = useState({
        cardNumber: '',
        expiryMonth: '',
        expiryYear: '',
        cvc: '',
        billingAddress: ''
    });
    const [cancellationData, setCancellationData] = useState({
        immediate: true,
        endDate: '',
        reason: ''
    });

    // Plan options
    const planOptions = [
        { value: 'personal', label: 'Personal', price: '$29/month', features: ['Basic scheduling', 'Email notifications', '1 provider'] },
        { value: 'clinic', label: 'Clinic', price: '$99/month', features: ['Advanced scheduling', 'SMS notifications', 'Up to 10 providers', 'Analytics'] },
        { value: 'group', label: 'Group', price: '$199/month', features: ['Enterprise scheduling', 'Custom integrations', 'Unlimited providers', 'Priority support'] }
    ];

    const checkAccess = useCallback(async () => {
        try {
            const token = await getValidToken();
            if (!token) {
                toast.error('Authentication required');
                navigate('/login');
                return;
            }

            const decoded = jwtDecode(token);
            const role = decoded.role;

            // Only allow admin and system_admin access
            if (role !== 'admin' && role !== 'system_admin') {
                toast.error('Access denied. Only administrators can access account settings.');
                navigate('/');
                return;
            }

            await fetchAccountData();
        } catch (error) {
            console.error('Access check failed:', error);
            toast.error('Access verification failed');
            navigate('/login');
        }
    }, [navigate]);

    useEffect(() => {
        checkAccess();
    }, [checkAccess]);

    const fetchAccountData = async () => {
        try {
            setLoading(true);
            const token = await getValidToken();

            // Fetch user data
            const userResponse = await axios.get(`${API_BASE_URL}/api/users/me/`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            setAccountData(userResponse.data);
            setCurrentPlan(userResponse.data.subscription_tier || 'personal');
            setEditFormData({
                first_name: userResponse.data.first_name || '',
                last_name: userResponse.data.last_name || '',
                email: userResponse.data.email || '',
                phone_number: userResponse.data.phone_number || '',
                organization: userResponse.data.organization_name || ''
            });

            // Fetch payment methods (placeholder - will implement Stripe integration)
            // const paymentResponse = await axios.get(`${API_BASE_URL}/api/payments/methods/`, {
            //   headers: { Authorization: `Bearer ${token}` }
            // });
            // setPaymentMethods(paymentResponse.data);

            // Fetch billing history (placeholder)
            // const billingResponse = await axios.get(`${API_BASE_URL}/api/payments/history/`, {
            //   headers: { Authorization: `Bearer ${token}` }
            // });
            // setBillingHistory(billingResponse.data);

            // Mock data for now
            setPaymentMethods([
                { id: 1, type: 'Visa', last4: '4242', expires: '12/25', isDefault: true }
            ]);
            setBillingHistory([
                { id: 1, date: '2025-07-15', amount: '$99.00', status: 'Paid', description: 'Clinic Plan - Monthly' },
                { id: 2, date: '2025-06-15', amount: '$99.00', status: 'Paid', description: 'Clinic Plan - Monthly' }
            ]);

        } catch (error) {
            console.error('Failed to fetch account data:', error);
            toast.error('Failed to load account information');
        } finally {
            setLoading(false);
        }
    };

    const handleEditAccount = async () => {
        try {
            const token = await getValidToken();
            
            // Remove organization from update data as it's a foreign key, not a string
            const updateData = {
                first_name: editFormData.first_name,
                last_name: editFormData.last_name,
                email: editFormData.email,
                phone_number: editFormData.phone_number
            };
            
            await axios.patch(`${API_BASE_URL}/api/users/me/`, updateData, {
                headers: { Authorization: `Bearer ${token}` }
            });

            toast.success('Account details updated successfully!');
            setEditAccountOpen(false);
            await fetchAccountData();
        } catch (error) {
            console.error('Failed to update account:', error);
            toast.error('Failed to update account details');
        }
    };

    const handleChangePlan = async () => {
        try {
            const token = await getValidToken();
            await axios.post(`${API_BASE_URL}/api/users/payments/change-plan/`,
                { plan: selectedPlan },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            toast.success('Plan changed successfully!');
            setChangePlanOpen(false);
            await fetchAccountData();
        } catch (error) {
            console.error('Failed to change plan:', error);
            toast.error('Failed to change plan');
        }
    };

    const handleAddPaymentMethod = async () => {
        try {
            // Implement Stripe payment method creation
            toast.success('Payment method added successfully!');
            setAddPaymentOpen(false);
            await fetchAccountData();
        } catch (error) {
            console.error('Failed to add payment method:', error);
            toast.error('Failed to add payment method');
        }
    };

    const handleDeletePaymentMethod = async (paymentMethodId) => {
        try {
            const token = await getValidToken();
            await axios.delete(`${API_BASE_URL}/api/users/payments/methods/${paymentMethodId}/`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            toast.success('Payment method deleted successfully!');
            await fetchAccountData();
        } catch (error) {
            console.error('Failed to delete payment method:', error);
            toast.error('Failed to delete payment method');
        }
    };

    const handleCancelAccount = async () => {
        try {
            const token = await getValidToken();

            // Send cancellation request with access revocation
            const response = await axios.post(`${API_BASE_URL}/api/users/payments/cancel-subscription/`, {
                immediate: cancellationData.immediate,
                endDate: cancellationData.endDate,
                reason: cancellationData.reason,
                revoke_access: true
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (response.data.success) {
                toast.success('Account cancelled successfully. You will be logged out shortly.');
                setCancelAccountOpen(false);

                // Force logout after 3 seconds to show the success message
                setTimeout(() => {
                    // Clear all authentication data
                    localStorage.clear();
                    sessionStorage.clear();

                    // Redirect to login with cancellation notice
                    window.location.href = '/login?cancelled=true&message=Account has been cancelled';
                }, 3000);
            } else {
                throw new Error(response.data.message || 'Cancellation failed');
            }

        } catch (error) {
            console.error('Failed to cancel account:', error);
            toast.error('Failed to cancel account. Please try again.');
        }
    };

    if (loading) {
        return (
            <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
                <Typography>Loading account information...</Typography>
            </Container>
        );
    }

    const currentPlanData = planOptions.find(plan => plan.value === currentPlan);

    return (
        <Container maxWidth={false} sx={{ mt: 4, mb: 4, px: 4 }}>
            {/* Header with Back Button */}
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
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

            <Grid container spacing={4} sx={{ height: '100%' }}>
                {/* LEFT PANE */}
                <Grid item xs={12} lg={6}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>

                        {/* Account Details Section */}
                        <Box sx={{ backgroundColor: '#f9f9f9', p: 3, borderRadius: 2 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                <Typography variant="h6" gutterBottom>
                                    <Person sx={{ mr: 1, verticalAlign: 'middle' }} />
                                    Account Details
                                </Typography>
                                <IconButton onClick={() => setEditAccountOpen(true)}>
                                    <Edit />
                                </IconButton>
                            </Box>

                            <Grid container spacing={2}>
                                <Grid item xs={6}>
                                    <Typography variant="body2" color="textSecondary">First Name</Typography>
                                    <Typography variant="body1">{accountData?.first_name || 'Not set'}</Typography>
                                </Grid>
                                <Grid item xs={6}>
                                    <Typography variant="body2" color="textSecondary">Last Name</Typography>
                                    <Typography variant="body1">{accountData?.last_name || 'Not set'}</Typography>
                                </Grid>
                                <Grid item xs={12}>
                                    <Typography variant="body2" color="textSecondary">Email</Typography>
                                    <Typography variant="body1">{accountData?.email || 'Not set'}</Typography>
                                </Grid>
                                <Grid item xs={6}>
                                    <Typography variant="body2" color="textSecondary">Phone</Typography>
                                    <Typography variant="body1">{accountData?.phone_number || 'Not set'}</Typography>
                                </Grid>
                                <Grid item xs={6}>
                                    <Typography variant="body2" color="textSecondary">Role</Typography>
                                    <Typography variant="body1">{accountData?.role || 'Not set'}</Typography>
                                </Grid>
                                <Grid item xs={12}>
                                    <Typography variant="body2" color="textSecondary">Organization</Typography>
                                    <Typography variant="body1">{accountData?.organization_name || 'Not set'}</Typography>
                                </Grid>
                            </Grid>
                        </Box>
                        {/* Payment Methods Section */}
                        <Box sx={{ backgroundColor: '#f9f9f9', p: 3, borderRadius: 2 }}>
                            <Typography variant="h6" gutterBottom>
                                <CreditCard sx={{ mr: 1, verticalAlign: 'middle' }} />
                                Payment Methods
                            </Typography>

                            {paymentMethods.map((method) => (
                                <Box key={method.id} sx={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    p: 2,
                                    backgroundColor: '#ffffff',
                                    borderRadius: 1,
                                    mb: 1
                                }}>
                                    <Box>
                                        <Typography variant="body1">
                                            {method.type} ending in {method.last4}
                                        </Typography>
                                        <Typography variant="body2" color="textSecondary">
                                            Expires {method.expires}
                                            {method.isDefault && <Chip label="Default" size="small" sx={{ ml: 1 }} />}
                                        </Typography>
                                    </Box>
                                    <IconButton
                                        onClick={() => handleDeletePaymentMethod(method.id)}
                                        color="error"
                                    >
                                        <Delete />
                                    </IconButton>
                                </Box>
                            ))}

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
                        <Box sx={{ backgroundColor: '#f9f9f9', p: 3, borderRadius: 2 }}>
                            <Typography variant="h6" gutterBottom>
                                <Email sx={{ mr: 1, verticalAlign: 'middle' }} />
                                Billing History
                            </Typography>

                            <Box sx={{ mt: 2, backgroundColor: '#ffffff', borderRadius: 1, overflow: 'hidden' }}>
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
                                        {billingHistory.map((invoice) => (
                                            <TableRow key={invoice.id}>
                                                <TableCell>{invoice.date}</TableCell>
                                                <TableCell>{invoice.description}</TableCell>
                                                <TableCell>{invoice.amount}</TableCell>
                                                <TableCell>
                                                    <Chip
                                                        label={invoice.status}
                                                        color={invoice.status === 'Paid' ? 'success' : 'error'}
                                                        size="small"
                                                    />
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </Box>
                        </Box>
                    </Box>
                </Grid>

                {/* RIGHT PANE */}
                <Grid item xs={12} lg={6}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {/* Current Plan Section */}
                        <Box sx={{ backgroundColor: '#f9f9f9', p: 3, borderRadius: 2 }}>
                            <Typography variant="h6" gutterBottom>
                                <Business sx={{ mr: 1, verticalAlign: 'middle' }} />
                                Current Plan
                            </Typography>

                            {currentPlanData && (
                                <Box>
                                    <Typography variant="h5" color="primary" gutterBottom>
                                        {currentPlanData.label}
                                    </Typography>
                                    <Typography variant="h6" color="textSecondary" gutterBottom>
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
                        <Box sx={{ backgroundColor: '#f9f9f9', p: 3, borderRadius: 2 }}>
                            <Typography variant="h6" gutterBottom color="error">
                                <Warning sx={{ mr: 1, verticalAlign: 'middle' }} />
                                Cancellation Notice
                            </Typography>
                            <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                                Cancelling your account is permanent and cannot be undone. Please ensure you have saved any important data before proceeding.
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
                    </Box>
                </Grid>
            </Grid>            {/* Edit Account Dialog */}
            <Dialog open={editAccountOpen} onClose={() => setEditAccountOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Edit Account Details</DialogTitle>
                <DialogContent>
                    <Grid container spacing={2} sx={{ mt: 1 }}>
                        <Grid item xs={6}>
                            <TextField
                                fullWidth
                                label="First Name"
                                value={editFormData.first_name || ''}
                                onChange={(e) => setEditFormData({ ...editFormData, first_name: e.target.value })}
                            />
                        </Grid>
                        <Grid item xs={6}>
                            <TextField
                                fullWidth
                                label="Last Name"
                                value={editFormData.last_name || ''}
                                onChange={(e) => setEditFormData({ ...editFormData, last_name: e.target.value })}
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <TextField
                                fullWidth
                                label="Email"
                                type="email"
                                value={editFormData.email || ''}
                                onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <TextField
                                fullWidth
                                label="Phone Number"
                                value={editFormData.phone_number || ''}
                                onChange={(e) => setEditFormData({ ...editFormData, phone_number: e.target.value })}
                            />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setEditAccountOpen(false)}>Cancel</Button>
                    <Button onClick={handleEditAccount} variant="contained">Save Changes</Button>
                </DialogActions>
            </Dialog>

            {/* Change Plan Dialog */}
            <Dialog open={changePlanOpen} onClose={() => setChangePlanOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle>Change Subscription Plan</DialogTitle>
                <DialogContent>
                    <Grid container spacing={2} sx={{ mt: 1 }}>
                        {planOptions.map((plan) => (
                            <Grid item xs={12} md={4} key={plan.value}>
                                <Box
                                    sx={{
                                        cursor: 'pointer',
                                        border: selectedPlan === plan.value ? '2px solid #1976d2' : '1px solid #e0e0e0',
                                        borderRadius: 2,
                                        p: 3
                                    }}
                                    onClick={() => setSelectedPlan(plan.value)}
                                >
                                    <Typography variant="h6" gutterBottom>{plan.label}</Typography>
                                    <Typography variant="h5" color="primary" gutterBottom>{plan.price}</Typography>
                                    <Box>
                                        {plan.features.map((feature, index) => (
                                            <Typography key={index} variant="body2" sx={{ mb: 0.5 }}>
                                                • {feature}
                                            </Typography>
                                        ))}
                                    </Box>
                                    {currentPlan === plan.value && (
                                        <Chip label="Current Plan" color="primary" size="small" sx={{ mt: 1 }} />
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
            <Dialog open={addPaymentOpen} onClose={() => setAddPaymentOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Add Payment Method</DialogTitle>
                <DialogContent>
                    <Grid container spacing={2} sx={{ mt: 1 }}>
                        <Grid item xs={12}>
                            <TextField
                                fullWidth
                                label="Card Number"
                                value={paymentFormData.cardNumber}
                                onChange={(e) => setPaymentFormData({ ...paymentFormData, cardNumber: e.target.value })}
                                placeholder="1234 5678 9012 3456"
                            />
                        </Grid>
                        <Grid item xs={6}>
                            <FormControl fullWidth>
                                <InputLabel>Expiry Month</InputLabel>
                                <Select
                                    value={paymentFormData.expiryMonth}
                                    onChange={(e) => setPaymentFormData({ ...paymentFormData, expiryMonth: e.target.value })}
                                >
                                    {Array.from({ length: 12 }, (_, i) => (
                                        <MenuItem key={i + 1} value={i + 1}>
                                            {String(i + 1).padStart(2, '0')}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={6}>
                            <FormControl fullWidth>
                                <InputLabel>Expiry Year</InputLabel>
                                <Select
                                    value={paymentFormData.expiryYear}
                                    onChange={(e) => setPaymentFormData({ ...paymentFormData, expiryYear: e.target.value })}
                                >
                                    {Array.from({ length: 10 }, (_, i) => (
                                        <MenuItem key={i} value={new Date().getFullYear() + i}>
                                            {new Date().getFullYear() + i}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={12}>
                            <TextField
                                fullWidth
                                label="CVC"
                                value={paymentFormData.cvc}
                                onChange={(e) => setPaymentFormData({ ...paymentFormData, cvc: e.target.value })}
                                placeholder="123"
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <TextField
                                fullWidth
                                label="Billing Address"
                                multiline
                                rows={3}
                                value={paymentFormData.billingAddress}
                                onChange={(e) => setPaymentFormData({ ...paymentFormData, billingAddress: e.target.value })}
                            />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setAddPaymentOpen(false)}>Cancel</Button>
                    <Button onClick={handleAddPaymentMethod} variant="contained">Add Payment Method</Button>
                </DialogActions>
            </Dialog>

            {/* Cancel Account Dialog */}
            <Dialog open={cancelAccountOpen} onClose={() => setCancelAccountOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>
                    <Warning color="error" sx={{ mr: 1, verticalAlign: 'middle' }} />
                    Cancel Account
                </DialogTitle>
                <DialogContent>
                    <Alert severity="error" sx={{ mb: 2 }}>
                        <strong>Warning:</strong> Canceling your account will immediately suspend your access to the application.
                        This action cannot be undone.
                    </Alert>

                    <Grid container spacing={2}>
                        <Grid item xs={12}>
                            <FormControl fullWidth>
                                <InputLabel>Cancellation Type</InputLabel>
                                <Select
                                    value={cancellationData.immediate ? 'immediate' : 'scheduled'}
                                    onChange={(e) => setCancellationData({
                                        ...cancellationData,
                                        immediate: e.target.value === 'immediate'
                                    })}
                                >
                                    <MenuItem value="immediate">Cancel Immediately</MenuItem>
                                    <MenuItem value="scheduled">Cancel at End of Billing Period</MenuItem>
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
                                    onChange={(e) => setCancellationData({ ...cancellationData, endDate: e.target.value })}
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
                                onChange={(e) => setCancellationData({ ...cancellationData, reason: e.target.value })}
                                placeholder="Help us improve by sharing why you're canceling..."
                            />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setCancelAccountOpen(false)}>No, Keep Account</Button>
                    <Button onClick={handleCancelAccount} color="error" variant="contained">
                        Yes, Cancel Account
                    </Button>
                </DialogActions>
            </Dialog>
        </Container>
    );
}

export default AccountPage;
