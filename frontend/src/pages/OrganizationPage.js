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
  InputAdornment
} from '@mui/material';
import { Search, Edit, Save, Cancel, Upload, Delete } from '@mui/icons-material';
import axios from 'axios';
import { jwtDecode } from 'jwt-decode';
import { toast } from 'react-toastify';

function OrganizationPage() {
  const [currentUser, setCurrentUser] = useState(null);
  const [userOrganization, setUserOrganization] = useState(null);
  const [allOrganizations, setAllOrganizations] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredOrganizations, setFilteredOrganizations] = useState([]);
  const [editMode, setEditMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedLogo, setSelectedLogo] = useState(null);
  const [previewLogo, setPreviewLogo] = useState(null);  const [deleteConfirmDialog, setDeleteConfirmDialog] = useState(false);
  const [organizationToDelete, setOrganizationToDelete] = useState(null);
  const [editingOrganization, setEditingOrganization] = useState(null);

  const [formData, setFormData] = useState({
    name: '',
    logo: null
  });

  // Check user permissions
  const canEdit = currentUser && ['admin', 'system_admin'].includes(currentUser.role);
  const canSearch = currentUser && currentUser.role === 'system_admin';

  useEffect(() => {
    fetchCurrentUser();
  }, []);

  useEffect(() => {
    if (currentUser) {
      fetchUserOrganization();
      if (canSearch) {
        fetchAllOrganizations();
      }
    }
  }, [currentUser]);

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
      console.error('Failed to fetch current user:', error);
      toast.error('Failed to fetch user information');
    }
  };

  const fetchUserOrganization = async () => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token || !currentUser?.organization) return;      const response = await axios.get(`http://127.0.0.1:8000/api/users/organizations/${currentUser.organization}/`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setUserOrganization(response.data);
      setFormData({
        name: response.data.name,
        logo: response.data.logo
      });
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch organization:', error);
      toast.error('Failed to fetch organization information');
      setLoading(false);
    }
  };

  const fetchAllOrganizations = async () => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) return;      const response = await axios.get('http://127.0.0.1:8000/api/users/organizations/', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setAllOrganizations(response.data);
      setFilteredOrganizations(response.data);
    } catch (error) {
      console.error('Failed to fetch all organizations:', error);
      toast.error('Failed to fetch organizations list');
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleLogoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedLogo(file);
      // Create preview URL
      const previewUrl = URL.createObjectURL(file);
      setPreviewLogo(previewUrl);
    }
  };
  const handleSave = async () => {
    if (!canEdit) {
      toast.error('You do not have permission to edit organization details');
      return;
    }

    setSaving(true);
    try {
      const token = localStorage.getItem('access_token');
      const formDataToSend = new FormData();
      
      formDataToSend.append('name', formData.name);
      if (selectedLogo) {
        formDataToSend.append('logo', selectedLogo);
      }

      const organizationId = editingOrganization ? editingOrganization.id : userOrganization.id;
      const response = await axios.put(
        `http://127.0.0.1:8000/api/users/organizations/${organizationId}/`,
        formDataToSend,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data'
          }
        }
      );

      if (editingOrganization) {
        // Update the organization in the search results
        setAllOrganizations(prev => 
          prev.map(org => org.id === organizationId ? response.data : org)
        );
        setEditingOrganization(null);
      } else {
        // Update user's own organization
        setUserOrganization(response.data);
      }
      
      setFormData({
        name: response.data.name,
        logo: response.data.logo
      });
      setEditMode(false);
      setSelectedLogo(null);
      setPreviewLogo(null);
      toast.success('Organization updated successfully!');
      
      // Refresh all organizations list if user is system admin
      if (canSearch) {
        fetchAllOrganizations();
      }
    } catch (error) {
      console.error('Failed to update organization:', error);
      toast.error('Failed to update organization');
    }
    setSaving(false);
  };
  const handleCancel = () => {
    if (editingOrganization) {
      setFormData({
        name: editingOrganization.name,
        logo: editingOrganization.logo
      });
      setEditingOrganization(null);
    } else {
      setFormData({
        name: userOrganization.name,
        logo: userOrganization.logo
      });
    }
    setEditMode(false);
    setSelectedLogo(null);
    setPreviewLogo(null);
  };
  const handleEditOrganization = (org) => {
    setEditingOrganization(org);
    setFormData({
      name: org.name,
      logo: org.logo
    });
    setEditMode(true);
    setSelectedLogo(null);
    setPreviewLogo(null);
    
    // Scroll to top to show the edit form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteOrganization = async (orgId) => {
    try {
      const token = localStorage.getItem('access_token');
      await axios.delete(`http://127.0.0.1:8000/api/users/organizations/${orgId}/`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast.success('Organization deleted successfully!');
      fetchAllOrganizations();
      setDeleteConfirmDialog(false);
      setOrganizationToDelete(null);
    } catch (error) {
      console.error('Failed to delete organization:', error);
      toast.error('Failed to delete organization');
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%' }}>
      {/* User's Organization Section */}
      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
            {editingOrganization ? `Editing: ${editingOrganization.name}` : 'My Organization'}
          </Typography>
          {canEdit && (
            <Stack direction="row" spacing={1}>
              {!editMode ? (
                <Button
                  variant="outlined"
                  startIcon={<Edit />}
                  onClick={() => setEditMode(true)}
                  size="small"
                >
                  Edit
                </Button>
              ) : (
                <>
                  <Button
                    variant="contained"
                    startIcon={saving ? <CircularProgress size={16} /> : <Save />}
                    onClick={handleSave}
                    disabled={saving}
                    size="small"
                  >
                    Save
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<Cancel />}
                    onClick={handleCancel}
                    disabled={saving}
                    size="small"
                  >
                    Cancel
                  </Button>
                </>
              )}
            </Stack>
          )}
        </Stack>        {(userOrganization || editingOrganization) ? (
          <Stack direction="row" spacing={3} alignItems="start">
            <Box>              <Avatar
                src={previewLogo || ((editingOrganization || userOrganization).logo ? (
                  (editingOrganization || userOrganization).logo.startsWith('http') 
                    ? (editingOrganization || userOrganization).logo 
                    : `http://127.0.0.1:8000${(editingOrganization || userOrganization).logo}`
                ) : null)}
                sx={{ width: 80, height: 80, border: '2px solid #e0e0e0' }}
              >
                {(editingOrganization || userOrganization).name.charAt(0).toUpperCase()}
              </Avatar>
              {editMode && (
                <Stack spacing={1} sx={{ mt: 2 }}>
                  <input
                    accept="image/*"
                    style={{ display: 'none' }}
                    id="logo-upload"
                    type="file"
                    onChange={handleLogoChange}
                  />
                  <label htmlFor="logo-upload">
                    <Button
                      variant="outlined"
                      component="span"
                      startIcon={<Upload />}
                      size="small"
                      fullWidth
                    >
                      Upload Logo
                    </Button>
                  </label>
                </Stack>
              )}
            </Box>

            <Box sx={{ flex: 1 }}>
              <TextField
                label="Organization Name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                fullWidth
                disabled={!editMode}
                variant={editMode ? "outlined" : "filled"}
                sx={{ mb: 2 }}
              />
              
              <Typography variant="body2" color="text.secondary">
                <strong>Created:</strong> {new Date((editingOrganization || userOrganization).created_at).toLocaleDateString()}
              </Typography>
            </Box>
          </Stack>        ) : !editingOrganization ? (
          <Alert severity="info">
            No organization found. Please contact your administrator.
          </Alert>
        ) : null}
      </Paper>

      {/* System Admin Organization Search Section */}
      {canSearch && (
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 2 }}>
            All Organizations (System Admin)
          </Typography>
          
          <TextField
            label="Search Organizations"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            fullWidth
            sx={{ mb: 3 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search />
                </InputAdornment>
              ),
            }}
            placeholder="Search by organization name..."
          />

          <Table size="small">            <TableHead>
              <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                <TableCell sx={{ fontWeight: 'bold' }}>Logo</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Name</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Created</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredOrganizations.map((org) => (
                <TableRow 
                  key={org.id} 
                  hover 
                  sx={{ 
                    cursor: 'pointer',
                    backgroundColor: editingOrganization?.id === org.id ? '#e3f2fd' : 'inherit'
                  }}
                  onClick={() => handleEditOrganization(org)}
                >                  <TableCell>
                    <Avatar
                      src={org.logo ? (
                        org.logo.startsWith('http') 
                          ? org.logo 
                          : `http://127.0.0.1:8000${org.logo}`
                      ) : null}
                      sx={{ width: 40, height: 40 }}
                    >
                      {org.name.charAt(0).toUpperCase()}
                    </Avatar>
                  </TableCell>
                  <TableCell>{org.name}</TableCell>
                  <TableCell>{new Date(org.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <IconButton
                      color="error"
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation(); // Prevent row click when clicking delete
                        setOrganizationToDelete(org);
                        setDeleteConfirmDialog(true);
                      }}
                    >
                      <Delete />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {filteredOrganizations.length === 0 && (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography color="text.secondary">
                {searchQuery ? 'No organizations found matching your search.' : 'No organizations found.'}
              </Typography>
            </Box>
          )}
        </Paper>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteConfirmDialog}
        onClose={() => setDeleteConfirmDialog(false)}
      >
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          Are you sure you want to delete the organization "{organizationToDelete?.name}"? 
          This action cannot be undone.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmDialog(false)}>Cancel</Button>
          <Button
            onClick={() => handleDeleteOrganization(organizationToDelete?.id)}
            color="error"
            variant="contained"
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default OrganizationPage;
