import React, { useState, useEffect } from 'react';
import {
    Box,
    Grid,
    Paper,
    Typography,
    TextField,
    Button,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    IconButton,
    Switch,
    FormControlLabel,
    Alert,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Chip,
    Tooltip
} from '@mui/material';
import {
    Add as AddIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    Search as SearchIcon,
    Clear as ClearIcon,
    Save as SaveIcon,
    Cancel as CancelIcon
} from '@mui/icons-material';
import axios from 'axios';
import { API_BASE_URL } from '../config/api';
import { getValidToken } from '../utils/auth';
import { jwtDecode } from 'jwt-decode';

const ClinicEventsManagement = () => {
    // State management
    const [clinicEvents, setClinicEvents] = useState([]);
    const [organizations, setOrganizations] = useState([]);
    const [filteredEvents, setFilteredEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [userRole, setUserRole] = useState('');
    const [userOrganization, setUserOrganization] = useState(null);

    // Form state
    const [formData, setFormData] = useState({
        id: null,
        name: '',
        description: '',
        is_active: true,
        organization: ''
    });
    const [isEditing, setIsEditing] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [alert, setAlert] = useState({ show: false, message: '', severity: 'success' });

    // Delete confirmation dialog
    const [deleteDialog, setDeleteDialog] = useState({ open: false, eventId: null, eventName: '' });

    // Initialize component
    useEffect(() => {
        const init = async () => {
            try {
                const token = await getValidToken();
                if (!token) return;

                const decoded = jwtDecode(token);
                const role = decoded.role || '';
                const orgId = decoded.organization_id;

                setUserRole(role);
                setUserOrganization(orgId);

                // Set default organization for regular admin
                if (role === 'admin' && orgId) {
                    setFormData(prev => ({ ...prev, organization: orgId }));
                }

                await Promise.all([
                    fetchClinicEvents(),
                    fetchOrganizations()
                ]);
            } catch (error) {
                console.error('Failed to initialize component:', error);
                showAlert('Failed to initialize component', 'error');
            }
        };

        const fetchClinicEvents = async () => {
            try {
                setLoading(true);
                const token = await getValidToken();
                if (!token) return;

                const response = await axios.get(`${API_BASE_URL}/api/clinic-events/`, {
                    headers: { Authorization: `Bearer ${token}` }
                });

                setClinicEvents(response.data || []);
            } catch (error) {
                console.error('Failed to fetch clinic events:', error);
                showAlert('Failed to load clinic events', 'error');
            } finally {
                setLoading(false);
            }
        };

        const fetchOrganizations = async () => {
            try {
                const token = await getValidToken();
                if (!token) return;

                // Only fetch organizations for system admin
                if (userRole === 'system_admin') {
                    const response = await axios.get(`${API_BASE_URL}/api/users/organizations/`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    setOrganizations(response.data || []);
                }
            } catch (error) {
                console.error('Failed to fetch organizations:', error);
            }
        };

        init();
    }, []);

    // Filter events when search term changes
    useEffect(() => {
        if (!searchTerm.trim()) {
            setFilteredEvents(clinicEvents);
            return;
        }

        const filtered = clinicEvents.filter(event =>
            event.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            event.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            event.organization_name?.toLowerCase().includes(searchTerm.toLowerCase())
        );
        setFilteredEvents(filtered);
    }, [clinicEvents, searchTerm]);

    const fetchClinicEvents = async () => {
        try {
            setLoading(true);
            const token = await getValidToken();
            if (!token) return;

            const response = await axios.get(`${API_BASE_URL}/api/clinic-events/`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            setClinicEvents(response.data || []);
        } catch (error) {
            console.error('Failed to fetch clinic events:', error);
            showAlert('Failed to load clinic events', 'error');
        } finally {
            setLoading(false);
        }
    };

    const fetchOrganizations = async () => {
        try {
            const token = await getValidToken();
            if (!token) return;

            // Only fetch organizations for system admin
            if (userRole === 'system_admin') {
                const response = await axios.get(`${API_BASE_URL}/api/users/organizations/`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                setOrganizations(response.data || []);
            }
        } catch (error) {
            console.error('Failed to fetch organizations:', error);
        }
    };

    const filterEvents = () => {
        if (!searchTerm.trim()) {
            setFilteredEvents(clinicEvents);
            return;
        }

        const filtered = clinicEvents.filter(event =>
            event.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            event.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            event.organization_name?.toLowerCase().includes(searchTerm.toLowerCase())
        );
        setFilteredEvents(filtered);
    };

    const showAlert = (message, severity = 'success') => {
        setAlert({ show: true, message, severity });
        setTimeout(() => setAlert({ show: false, message: '', severity: 'success' }), 5000);
    };

    const handleFormChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleCreate = () => {
        setFormData({
            id: null,
            name: '',
            description: '',
            is_active: true,
            organization: userRole === 'admin' ? userOrganization : ''
        });
        setIsEditing(false);
    };

    const handleEdit = (event) => {
        setFormData({
            id: event.id,
            name: event.name || '',
            description: event.description || '',
            is_active: event.is_active,
            organization: event.organization || ''
        });
        setIsEditing(true);
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            const token = await getValidToken();
            if (!token) return;

            // Validation
            if (!formData.name.trim()) {
                showAlert('Event name is required', 'error');
                return;
            }

            if (userRole === 'system_admin' && !formData.organization) {
                showAlert('Organization is required', 'error');
                return;
            }

            const payload = {
                name: formData.name.trim(),
                description: formData.description.trim(),
                is_active: formData.is_active,
                organization: formData.organization || userOrganization
            };

            if (isEditing && formData.id) {
                await axios.put(
                    `${API_BASE_URL}/api/clinic-events/${formData.id}/`,
                    payload,
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                showAlert('Clinic event updated successfully', 'success');
            } else {
                await axios.post(
                    `${API_BASE_URL}/api/clinic-events/`,
                    payload,
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                showAlert('Clinic event created successfully', 'success');
            }

            // Refresh data
            await fetchClinicEvents();
            handleCancel();
        } catch (error) {
            console.error('Failed to save clinic event:', error);
            const errorMessage = error.response?.data?.detail ||
                error.response?.data?.name?.[0] ||
                'Failed to save clinic event';
            showAlert(errorMessage, 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleCancel = () => {
        setFormData({
            id: null,
            name: '',
            description: '',
            is_active: true,
            organization: userRole === 'admin' ? userOrganization : ''
        });
        setIsEditing(false);
    };

    const handleDeleteClick = (event) => {
        setDeleteDialog({
            open: true,
            eventId: event.id,
            eventName: event.name
        });
    };

    const handleDeleteConfirm = async () => {
        try {
            setSaving(true);
            const token = await getValidToken();
            if (!token) return;

            await axios.delete(
                `${API_BASE_URL}/api/clinic-events/${deleteDialog.eventId}/`,
                { headers: { Authorization: `Bearer ${token}` } }
            );

            showAlert('Clinic event deleted successfully', 'success');
            await fetchClinicEvents();

            // Clear form if deleted item was being edited
            if (formData.id === deleteDialog.eventId) {
                handleCancel();
            }
        } catch (error) {
            console.error('Failed to delete clinic event:', error);
            showAlert('Failed to delete clinic event', 'error');
        } finally {
            setSaving(false);
            setDeleteDialog({ open: false, eventId: null, eventName: '' });
        }
    };

    return (
        <Box sx={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            maxHeight: '100%'
        }}>
            {/* Alert */}
            {alert.show && (
                <Alert
                    severity={alert.severity}
                    sx={{ mb: 2, flexShrink: 0 }}
                    onClose={() => setAlert({ show: false, message: '', severity: 'success' })}
                >
                    {alert.message}
                </Alert>
            )}

            {/* Two-pane layout */}
            <Grid container spacing={3} sx={{
                flex: 1,
                minHeight: 0,
                height: '100%',
                overflow: 'hidden'
            }}>
                {/* Left Pane - Form */}
                <Grid item xs={12} md={5} sx={{
                    display: 'flex',
                    minHeight: 0,
                    height: '100%'
                }}>
                    <Paper sx={{
                        p: 3,
                        width: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                        height: '100%'
                    }}>
                        <Typography variant="h6" gutterBottom sx={{ flexShrink: 0 }}>
                            {isEditing ? 'Edit Clinic Event' : 'Create Clinic Event'}
                        </Typography>

                        {/* Search Field */}
                        <TextField
                            fullWidth
                            placeholder="Search clinic events..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            InputProps={{
                                startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />,
                                endAdornment: searchTerm && (
                                    <IconButton size="small" onClick={() => setSearchTerm('')}>
                                        <ClearIcon />
                                    </IconButton>
                                )
                            }}
                            sx={{ mb: 3, flexShrink: 0 }}
                        />

                        {/* Form Fields */}
                        <Box sx={{
                            flex: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 2,
                            overflow: 'auto',
                            minHeight: 0,
                            maxHeight: 'calc(100% - 200px)',
                            pr: 1
                        }}>
                            <TextField
                                fullWidth
                                label="Event Name"
                                value={formData.name}
                                onChange={(e) => handleFormChange('name', e.target.value)}
                                required
                                error={!formData.name.trim()}
                                helperText={!formData.name.trim() ? 'Event name is required' : ''}
                            />

                            <TextField
                                fullWidth
                                label="Description"
                                value={formData.description}
                                onChange={(e) => handleFormChange('description', e.target.value)}
                                multiline
                                rows={3}
                                placeholder="Optional description..."
                            />

                            {/* Organization Selection - Only for System Admin */}
                            {userRole === 'system_admin' && (
                                <FormControl fullWidth required>
                                    <InputLabel>Organization</InputLabel>
                                    <Select
                                        value={formData.organization}
                                        label="Organization"
                                        onChange={(e) => handleFormChange('organization', e.target.value)}
                                    >
                                        {organizations.map((org) => (
                                            <MenuItem key={org.id} value={org.id}>
                                                {org.name}
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            )}

                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={formData.is_active}
                                        onChange={(e) => handleFormChange('is_active', e.target.checked)}
                                    />
                                }
                                label="Active"
                            />
                        </Box>

                        {/* Form Actions */}
                        <Box sx={{ display: 'flex', gap: 2, mt: 3, flexShrink: 0 }}>
                            <Button
                                variant="contained"
                                startIcon={saving ? <CircularProgress size={20} /> : <SaveIcon />}
                                onClick={handleSave}
                                disabled={saving || !formData.name.trim()}
                                sx={{ flex: 1 }}
                            >
                                {saving ? 'Saving...' : (isEditing ? 'Update' : 'Create')}
                            </Button>
                            <Button
                                variant="outlined"
                                startIcon={<CancelIcon />}
                                onClick={handleCancel}
                                disabled={saving}
                            >
                                Cancel
                            </Button>
                            {!isEditing && (
                                <Button
                                    variant="outlined"
                                    startIcon={<AddIcon />}
                                    onClick={handleCreate}
                                    disabled={saving}
                                >
                                    New
                                </Button>
                            )}
                        </Box>
                    </Paper>
                </Grid>

                {/* Right Pane - Table */}
                <Grid item xs={12} md={7} sx={{
                    display: 'flex',
                    minHeight: 0,
                    height: '100%'
                }}>
                    <Paper sx={{
                        width: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                        height: '100%'
                    }}>
                        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
                            <Typography variant="h6">
                                Clinic Events ({filteredEvents.length})
                            </Typography>
                        </Box>

                        <TableContainer sx={{
                            flex: 1,
                            overflow: 'auto',
                            maxHeight: 'calc(100% - 80px)'
                        }}>
                            <Table stickyHeader size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Name</TableCell>
                                        <TableCell>Description</TableCell>
                                        {userRole === 'system_admin' && <TableCell>Organization</TableCell>}
                                        <TableCell align="center">Status</TableCell>
                                        <TableCell align="center">Actions</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {loading ? (
                                        <TableRow>
                                            <TableCell colSpan={userRole === 'system_admin' ? 5 : 4} align="center">
                                                <CircularProgress size={24} />
                                            </TableCell>
                                        </TableRow>
                                    ) : filteredEvents.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={userRole === 'system_admin' ? 5 : 4} align="center">
                                                <Typography color="text.secondary">
                                                    {searchTerm ? 'No matching clinic events found' : 'No clinic events found'}
                                                </Typography>
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        filteredEvents.map((event) => (
                                            <TableRow key={event.id} hover>
                                                <TableCell>
                                                    <Typography variant="body2" fontWeight="medium">
                                                        {event.name}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell>
                                                    <Tooltip title={event.description || 'No description'}>
                                                        <Typography
                                                            variant="body2"
                                                            color="text.secondary"
                                                            sx={{
                                                                maxWidth: 200,
                                                                overflow: 'hidden',
                                                                textOverflow: 'ellipsis',
                                                                whiteSpace: 'nowrap'
                                                            }}
                                                        >
                                                            {event.description || 'No description'}
                                                        </Typography>
                                                    </Tooltip>
                                                </TableCell>
                                                {userRole === 'system_admin' && (
                                                    <TableCell>
                                                        <Typography variant="body2">
                                                            {event.organization_name || 'No Organization'}
                                                        </Typography>
                                                    </TableCell>
                                                )}
                                                <TableCell align="center">
                                                    <Chip
                                                        label={event.is_active ? 'Active' : 'Inactive'}
                                                        color={event.is_active ? 'success' : 'default'}
                                                        size="small"
                                                    />
                                                </TableCell>
                                                <TableCell align="center">
                                                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                                                        <Tooltip title="Edit">
                                                            <IconButton
                                                                size="small"
                                                                onClick={() => handleEdit(event)}
                                                                disabled={saving}
                                                            >
                                                                <EditIcon fontSize="small" />
                                                            </IconButton>
                                                        </Tooltip>
                                                        <Tooltip title="Delete">
                                                            <IconButton
                                                                size="small"
                                                                onClick={() => handleDeleteClick(event)}
                                                                disabled={saving}
                                                                color="error"
                                                            >
                                                                <DeleteIcon fontSize="small" />
                                                            </IconButton>
                                                        </Tooltip>
                                                    </Box>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>
                </Grid>
            </Grid>

            {/* Delete Confirmation Dialog */}
            <Dialog
                open={deleteDialog.open}
                onClose={() => setDeleteDialog({ open: false, eventId: null, eventName: '' })}
            >
                <DialogTitle>Confirm Delete</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Are you sure you want to delete the clinic event "{deleteDialog.eventName}"?
                        This action cannot be undone.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button
                        onClick={() => setDeleteDialog({ open: false, eventId: null, eventName: '' })}
                        disabled={saving}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleDeleteConfirm}
                        color="error"
                        disabled={saving}
                        startIcon={saving ? <CircularProgress size={16} /> : <DeleteIcon />}
                    >
                        {saving ? 'Deleting...' : 'Delete'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default ClinicEventsManagement;
