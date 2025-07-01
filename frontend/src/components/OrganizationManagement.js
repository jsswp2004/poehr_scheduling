import React, { useState, useEffect } from 'react';
import {
    Box,
    Paper,
    Typography,
    TextField,
    Button,
    Stack,
    Avatar,
    Alert,
    CircularProgress,
    Table,
    TableHead,
    TableRow,
    TableCell,
    TableBody,
    IconButton,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    InputAdornment,
    Chip,
    Grid,
    Tooltip
} from '@mui/material';
import {
    Search,
    Edit,
    Save,
    Upload,
    Delete,
    Add,
    Business,
    Warning
} from '@mui/icons-material';
import axios from 'axios';
import { jwtDecode } from 'jwt-decode';
import { toast } from 'react-toastify';

function OrganizationManagement() {
    const [currentUser, setCurrentUser] = useState(null);
    const [userOrganization, setUserOrganization] = useState(null);
    const [allOrganizations, setAllOrganizations] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [filteredOrganizations, setFilteredOrganizations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Create Organization States
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [createFormData, setCreateFormData] = useState({
        name: '',
        logo: null
    });
    const [createFormErrors, setCreateFormErrors] = useState({});
    const [previewCreateLogo, setPreviewCreateLogo] = useState(null);

    // Edit Organization States
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [editingOrganization, setEditingOrganization] = useState(null);
    const [editFormData, setEditFormData] = useState({
        name: '',
        logo: null
    });
    const [editFormErrors, setEditFormErrors] = useState({});
    const [previewEditLogo, setPreviewEditLogo] = useState(null);

    // Delete Organization States
    const [deleteConfirmDialog, setDeleteConfirmDialog] = useState(false);
    const [organizationToDelete, setOrganizationToDelete] = useState(null);

    // Check user permissions
    const isSystemAdmin = currentUser && (currentUser.role === 'system_admin' || currentUser.role === 'admin');
    const isAdmin = currentUser && ['admin', 'system_admin'].includes(currentUser.role);

    useEffect(() => {
        fetchCurrentUser();
    }, []);

    useEffect(() => {
        if (currentUser) {
            fetchUserOrganization();
            if (isSystemAdmin) {
                fetchAllOrganizations();
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentUser, isSystemAdmin]);

    useEffect(() => {
        // Filter organizations based on search query
        if (searchQuery.trim() === '') {
            setFilteredOrganizations(allOrganizations);
        } else {
            const filtered = allOrganizations.filter(org =>
                org.name.toLowerCase().includes(searchQuery.toLowerCase())
            );
            setFilteredOrganizations(filtered);
        }
    }, [searchQuery, allOrganizations]);

    const fetchCurrentUser = async () => {
        try {
            const token = localStorage.getItem('access_token');
            if (!token) return;

            const decodedToken = jwtDecode(token);
            const response = await axios.get(`http://127.0.0.1:8000/api/users/${decodedToken.user_id}/`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setCurrentUser(response.data);
        } catch (error) {
            toast.error('Failed to fetch current user:', error);
            toast.error('Failed to fetch user information');
        }
    };

    const fetchUserOrganization = async () => {
        try {
            const token = localStorage.getItem('access_token');
            if (!token || !currentUser?.organization) return;

            const response = await axios.get(`http://127.0.0.1:8000/api/users/organizations/${currentUser.organization}/`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            setUserOrganization(response.data);
        } catch (error) {
            toast.error('Failed to fetch user organization:', error);
            toast.error('Failed to fetch organization information');
        } finally {
            setLoading(false);
        }
    };

    const fetchAllOrganizations = async () => {
        try {
            const token = localStorage.getItem('access_token');
            if (!token) return;

            const response = await axios.get('http://127.0.0.1:8000/api/users/organizations/', {
                headers: { Authorization: `Bearer ${token}` }
            });

            setAllOrganizations(response.data);
            setFilteredOrganizations(response.data);
        } catch (error) {
            toast.error('Failed to fetch organizations:', error);
            toast.error('Failed to fetch organizations');
        }
    };

    // Create Organization Functions
    const validateCreateForm = () => {
        const errors = {};

        if (!createFormData.name.trim()) {
            errors.name = 'Organization name is required';
        } else if (createFormData.name.trim().length < 2) {
            errors.name = 'Organization name must be at least 2 characters';
        } else if (createFormData.name.trim().length > 255) {
            errors.name = 'Organization name must be less than 255 characters';
        }

        setCreateFormErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleCreateLogoChange = (event) => {
        const file = event.target.files[0];
        if (file) {
            // Validate file type
            const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
            if (!allowedTypes.includes(file.type)) {
                toast.error('Please select a valid image file (JPEG, PNG, or GIF)');
                return;
            }

            // Validate file size (5MB limit)
            if (file.size > 5 * 1024 * 1024) {
                toast.error('File size must be less than 5MB');
                return;
            }

            setCreateFormData(prev => ({ ...prev, logo: file }));

            // Create preview
            const reader = new FileReader();
            reader.onload = (e) => setPreviewCreateLogo(e.target.result);
            reader.readAsDataURL(file);
        }
    };

    const handleCreateSubmit = async () => {
        if (!validateCreateForm()) return;

        setSaving(true);
        try {
            const token = localStorage.getItem('access_token');
            const formData = new FormData();
            formData.append('name', createFormData.name.trim());

            if (createFormData.logo) {
                formData.append('logo', createFormData.logo);
            }

            await axios.post('http://127.0.0.1:8000/api/users/organizations/', formData, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'multipart/form-data'
                }
            });

            toast.success('Organization created successfully!');
            setCreateDialogOpen(false);
            resetCreateForm();
            fetchAllOrganizations(); // Refresh the list
        } catch (error) {
            toast.error('Create organization error:', error);
            if (error.response?.data?.name) {
                toast.error(`Error: ${error.response.data.name[0]}`);
            } else {
                toast.error('Failed to create organization');
            }
        } finally {
            setSaving(false);
        }
    };

    const resetCreateForm = () => {
        setCreateFormData({ name: '', logo: null });
        setCreateFormErrors({});
        setPreviewCreateLogo(null);
    };

    // Edit Organization Functions
    const handleEditClick = (organization) => {
        setEditingOrganization(organization);
        setEditFormData({
            name: organization.name,
            logo: null
        });
        setEditFormErrors({});
        setPreviewEditLogo(organization.logo ? `http://127.0.0.1:8000${organization.logo}` : null);
        setEditDialogOpen(true);
    };

    const validateEditForm = () => {
        const errors = {};

        if (!editFormData.name.trim()) {
            errors.name = 'Organization name is required';
        } else if (editFormData.name.trim().length < 2) {
            errors.name = 'Organization name must be at least 2 characters';
        } else if (editFormData.name.trim().length > 255) {
            errors.name = 'Organization name must be less than 255 characters';
        }

        setEditFormErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleEditLogoChange = (event) => {
        const file = event.target.files[0];
        if (file) {
            // Validate file type
            const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
            if (!allowedTypes.includes(file.type)) {
                toast.error('Please select a valid image file (JPEG, PNG, or GIF)');
                return;
            }

            // Validate file size (5MB limit)
            if (file.size > 5 * 1024 * 1024) {
                toast.error('File size must be less than 5MB');
                return;
            }

            setEditFormData(prev => ({ ...prev, logo: file }));

            // Create preview
            const reader = new FileReader();
            reader.onload = (e) => setPreviewEditLogo(e.target.result);
            reader.readAsDataURL(file);
        }
    };

    const handleEditSubmit = async () => {
        if (!validateEditForm()) return;

        setSaving(true);
        try {
            const token = localStorage.getItem('access_token');
            const formData = new FormData();
            formData.append('name', editFormData.name.trim());

            if (editFormData.logo) {
                formData.append('logo', editFormData.logo);
            }

            await axios.patch(
                `http://127.0.0.1:8000/api/users/organizations/${editingOrganization.id}/`,
                formData,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'multipart/form-data'
                    }
                }
            );

            toast.success('Organization updated successfully!');
            setEditDialogOpen(false);
            resetEditForm();
            fetchAllOrganizations(); // Refresh the list
            if (userOrganization && userOrganization.id === editingOrganization.id) {
                fetchUserOrganization(); // Refresh user org if it was edited
            }
        } catch (error) {
            toast.error('Update organization error:', error);
            if (error.response?.data?.name) {
                toast.error(`Error: ${error.response.data.name[0]}`);
            } else {
                toast.error('Failed to update organization');
            }
        } finally {
            setSaving(false);
        }
    };

    const resetEditForm = () => {
        setEditingOrganization(null);
        setEditFormData({ name: '', logo: null });
        setEditFormErrors({});
        setPreviewEditLogo(null);
    };

    // Delete Organization Functions
    const handleDeleteClick = (organization) => {
        setOrganizationToDelete(organization);
        setDeleteConfirmDialog(true);
    };

    const handleDeleteConfirm = async () => {
        if (!organizationToDelete) return;

        setSaving(true);
        try {
            const token = localStorage.getItem('access_token');

            await axios.delete(`http://127.0.0.1:8000/api/users/organizations/${organizationToDelete.id}/`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            toast.success('Organization deleted successfully!');
            setDeleteConfirmDialog(false);
            setOrganizationToDelete(null);
            fetchAllOrganizations(); // Refresh the list
        } catch (error) {
            toast.error('Delete organization error:', error);
            if (error.response?.status === 403) {
                toast.error('You do not have permission to delete this organization');
            } else if (error.response?.data?.detail) {
                toast.error(`Error: ${error.response.data.detail}`);
            } else {
                toast.error('Failed to delete organization');
            }
        } finally {
            setSaving(false);
        }
    };

    const formatDate = (dateString) => {
        try {
            return new Date(dateString).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch {
            return 'N/A';
        }
    };

    if (loading) {
        return (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Box>
            {/* User's Organization Section */}
            {userOrganization && (
                <Paper sx={{ p: 3, mb: 3, backgroundColor: '#f8f9fa' }}>
                    <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Business color="primary" />
                        Your Organization
                    </Typography>

                    <Grid container spacing={2} alignItems="center">
                        <Grid item>
                            <Avatar
                                src={userOrganization.logo ? `http://127.0.0.1:8000${userOrganization.logo}` : undefined}
                                sx={{ width: 60, height: 60 }}
                            >
                                <Business />
                            </Avatar>
                        </Grid>
                        <Grid item xs>
                            <Typography variant="h6">{userOrganization.name}</Typography>
                            <Typography variant="body2" color="text.secondary">
                                Created: {formatDate(userOrganization.created_at)}
                            </Typography>
                            {isAdmin && (
                                <Chip
                                    size="small"
                                    label="You can edit this organization"
                                    color="info"
                                    sx={{ mt: 1 }}
                                />
                            )}
                        </Grid>
                        {isAdmin && (
                            <Grid item>
                                <Button
                                    variant="outlined"
                                    startIcon={<Edit />}
                                    onClick={() => handleEditClick(userOrganization)}
                                    size="small"
                                >
                                    Edit
                                </Button>
                            </Grid>
                        )}
                    </Grid>
                </Paper>
            )}

            {/* System Admin Section - All Organizations Management */}
            {isSystemAdmin && (
                <Paper sx={{ p: 3 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                        <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Business color="primary" />
                            All Organizations
                        </Typography>
                        <Button
                            variant="contained"
                            startIcon={<Add />}
                            onClick={() => setCreateDialogOpen(true)}
                            sx={{ borderRadius: 2 }}
                        >
                            Create Organization
                        </Button>
                    </Box>

                    {/* Search */}
                    <TextField
                        fullWidth
                        placeholder="Search organizations..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        sx={{ mb: 3 }}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <Search />
                                </InputAdornment>
                            ),
                        }}
                    />

                    {/* Organizations Table */}
                    {filteredOrganizations.length === 0 ? (
                        <Alert severity="info" sx={{ mt: 2 }}>
                            {searchQuery ? 'No organizations found matching your search.' : 'No organizations found.'}
                        </Alert>
                    ) : (
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell>Logo</TableCell>
                                    <TableCell>Name</TableCell>
                                    <TableCell>Created Date</TableCell>
                                    <TableCell align="center">Actions</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {filteredOrganizations.map((org) => (
                                    <TableRow key={org.id} hover>
                                        <TableCell>
                                            <Avatar
                                                src={org.logo ? `http://127.0.0.1:8000${org.logo}` : undefined}
                                                sx={{ width: 40, height: 40 }}
                                            >
                                                <Business />
                                            </Avatar>
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body1" fontWeight={500}>
                                                {org.name}
                                            </Typography>
                                            {userOrganization && userOrganization.id === org.id && (
                                                <Chip size="small" label="Your Organization" color="primary" />
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2">
                                                {formatDate(org.created_at)}
                                            </Typography>
                                        </TableCell>
                                        <TableCell align="center">
                                            <Stack direction="row" spacing={1} justifyContent="center">
                                                <Tooltip title="Edit Organization">
                                                    <IconButton
                                                        size="small"
                                                        onClick={() => handleEditClick(org)}
                                                        color="primary"
                                                    >
                                                        <Edit />
                                                    </IconButton>
                                                </Tooltip>
                                                <Tooltip title="Delete Organization">
                                                    <IconButton
                                                        size="small"
                                                        onClick={() => handleDeleteClick(org)}
                                                        color="error"
                                                    >
                                                        <Delete />
                                                    </IconButton>
                                                </Tooltip>
                                            </Stack>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </Paper>
            )}

            {/* Non-Admin Users */}
            {!isSystemAdmin && !userOrganization && (
                <Alert severity="info">
                    You are not currently associated with any organization.
                </Alert>
            )}

            {/* Create Organization Dialog */}
            <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Add color="primary" />
                    Create New Organization
                </DialogTitle>
                <DialogContent>
                    <Stack spacing={3} sx={{ mt: 1 }}>
                        <TextField
                            autoFocus
                            label="Organization Name"
                            fullWidth
                            variant="outlined"
                            value={createFormData.name}
                            onChange={(e) => setCreateFormData(prev => ({ ...prev, name: e.target.value }))}
                            error={!!createFormErrors.name}
                            helperText={createFormErrors.name}
                            required
                        />

                        <Box>
                            <Typography variant="subtitle2" gutterBottom>
                                Organization Logo (Optional)
                            </Typography>
                            <input
                                accept="image/*"
                                style={{ display: 'none' }}
                                id="create-logo-upload"
                                type="file"
                                onChange={handleCreateLogoChange}
                            />
                            <label htmlFor="create-logo-upload">
                                <Button
                                    variant="outlined"
                                    component="span"
                                    startIcon={<Upload />}
                                    sx={{ mb: 2 }}
                                >
                                    Upload Logo
                                </Button>
                            </label>

                            {previewCreateLogo && (
                                <Box sx={{ mt: 2 }}>
                                    <Typography variant="body2" gutterBottom>Preview:</Typography>
                                    <Avatar src={previewCreateLogo} sx={{ width: 80, height: 80 }} />
                                </Box>
                            )}
                        </Box>
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 3 }}>
                    <Button onClick={() => {
                        setCreateDialogOpen(false);
                        resetCreateForm();
                    }}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleCreateSubmit}
                        variant="contained"
                        disabled={saving}
                        startIcon={saving ? <CircularProgress size={16} /> : <Save />}
                    >
                        {saving ? 'Creating...' : 'Create Organization'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Edit Organization Dialog */}
            <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Edit color="primary" />
                    Edit Organization
                </DialogTitle>
                <DialogContent>
                    <Stack spacing={3} sx={{ mt: 1 }}>
                        <TextField
                            autoFocus
                            label="Organization Name"
                            fullWidth
                            variant="outlined"
                            value={editFormData.name}
                            onChange={(e) => setEditFormData(prev => ({ ...prev, name: e.target.value }))}
                            error={!!editFormErrors.name}
                            helperText={editFormErrors.name}
                            required
                        />

                        <Box>
                            <Typography variant="subtitle2" gutterBottom>
                                Organization Logo
                            </Typography>
                            <input
                                accept="image/*"
                                style={{ display: 'none' }}
                                id="edit-logo-upload"
                                type="file"
                                onChange={handleEditLogoChange}
                            />
                            <label htmlFor="edit-logo-upload">
                                <Button
                                    variant="outlined"
                                    component="span"
                                    startIcon={<Upload />}
                                    sx={{ mb: 2 }}
                                >
                                    Change Logo
                                </Button>
                            </label>

                            {previewEditLogo && (
                                <Box sx={{ mt: 2 }}>
                                    <Typography variant="body2" gutterBottom>Current/Preview:</Typography>
                                    <Avatar src={previewEditLogo} sx={{ width: 80, height: 80 }} />
                                </Box>
                            )}
                        </Box>
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 3 }}>
                    <Button onClick={() => {
                        setEditDialogOpen(false);
                        resetEditForm();
                    }}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleEditSubmit}
                        variant="contained"
                        disabled={saving}
                        startIcon={saving ? <CircularProgress size={16} /> : <Save />}
                    >
                        {saving ? 'Saving...' : 'Save Changes'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog
                open={deleteConfirmDialog}
                onClose={() => setDeleteConfirmDialog(false)}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Warning color="error" />
                    Confirm Deletion
                </DialogTitle>
                <DialogContent>
                    <Alert severity="warning" sx={{ mb: 2 }}>
                        This action cannot be undone!
                    </Alert>
                    <Typography>
                        Are you sure you want to delete the organization <strong>"{organizationToDelete?.name}"</strong>?
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        This will permanently remove the organization and may affect associated users.
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 3 }}>
                    <Button onClick={() => {
                        setDeleteConfirmDialog(false);
                        setOrganizationToDelete(null);
                    }}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleDeleteConfirm}
                        variant="contained"
                        color="error"
                        disabled={saving}
                        startIcon={saving ? <CircularProgress size={16} /> : <Delete />}
                    >
                        {saving ? 'Deleting...' : 'Delete Organization'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}

export default OrganizationManagement;
