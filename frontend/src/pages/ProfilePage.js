import { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import {
  Box, Stack, Typography, Button, TextField, IconButton, Tooltip, Avatar, Collapse, FormControl, InputLabel, Select as MUISelect, MenuItem, CircularProgress, Divider, Paper
} from '@mui/material';
import BackButton from '../components/BackButton';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import CancelIcon from '@mui/icons-material/Cancel';
import SearchIcon from '@mui/icons-material/Search';
import LockResetIcon from '@mui/icons-material/LockReset';
import DeleteIcon from '@mui/icons-material/Delete';
import { jwtDecode } from 'jwt-decode';
import { toast } from '../components/SimpleToast';
import { useNavigate } from 'react-router-dom';
import CreatableSelect from 'react-select/creatable';
import { notifyProfileUpdated } from '../utils/events';

function ProfilePage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);

  const navigate = useNavigate();
  const token = localStorage.getItem('access_token');
  const fileInputRef = useRef();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone_number: '',
    organization: '',
    role: '',
  });

  const [passwordData, setPasswordData] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });

  const [organizations, setOrganizations] = useState([]);

  useEffect(() => {
    if (!token) return;

    const decoded = jwtDecode(token);
    const userId = decoded.user_id;    axios.get(`http://127.0.0.1:8000/api/users/${userId}/`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => {
        if (!res.data) {
          toast.error('No user profile found.');
          return;
        }
        console.log('🔍 API Response:', res.data);
        console.log('🔍 Phone Number from API:', res.data.phone_number);
        setUser(res.data);        
        const newFormData = {
          first_name: res.data.first_name,
          last_name: res.data.last_name,
          email: res.data.email,
          phone_number: res.data.phone_number || '',
          organization: res.data.organization,
          role: res.data.role,
        };
        console.log('🔍 New FormData:', newFormData);
        setFormData(newFormData);
      })
      .catch(err => {
        console.error('Failed to load user', err);
        toast.error('Could not load profile');
      })
      .finally(() => setLoading(false));

    // Fetch organizations for dropdown
    axios.get('http://127.0.0.1:8000/api/users/organizations/', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => setOrganizations(res.data))
      .catch(() => setOrganizations([]));
  }, [token]);

  // Debug: Log whenever formData changes
  useEffect(() => {
    console.log('🔄 FormData State Updated:', formData);
    console.log('🔄 Phone Number in State:', formData.phone_number);
  }, [formData]);
  const handleSearch = async () => {
    try {
      // Fetch the current user's organization
      const orgId = user && user.organization && typeof user.organization === 'object' ? user.organization.id : user.organization;
      const res = await axios.get(`http://127.0.0.1:8000/api/users/search/?q=${searchQuery}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      // System admins can see all users across organizations
      const isSystemAdmin = loggedInUserRole === 'system_admin';
      
      // Filter results based on role and organization
      const filtered = res.data.filter(u => {
        // Always exclude patients from search results
        if (u.role === 'patient') return false;
        
        // For system admins, include all non-patient users regardless of organization
        if (isSystemAdmin) return true;
        
        // For other roles, only include users from the same organization
        if (!u.organization || !orgId) return false;
        
        // Handle organization as object or ID
        if (typeof u.organization === 'object') return String(u.organization.id) === String(orgId);
        return String(u.organization) === String(orgId);
      });
      
      setSearchResults(filtered);
      if (filtered.length === 0) {
        toast.info(isSystemAdmin 
          ? 'No matching users found.' 
          : 'No matching users found in your organization.'
        );
      }
    } catch (err) {
      toast.error('Search failed.');
    }
  };

  const handleDelete = async (id) => {
    const confirmDelete = window.confirm('Are you sure you want to delete this user?');
    if (!confirmDelete) return;

    try {
      await axios.delete(`http://127.0.0.1:8000/api/users/${id}/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success('User deleted!');
      setSearchResults(prev => prev.filter(u => u.id !== id));
    } catch (err) {
      console.error('Delete failed:', err);
      toast.error('Failed to delete user.');
    }
  };

  const handleChange = (e) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };
  const handleSave = async () => {
    try {
      const response = await axios.patch(`http://127.0.0.1:8000/api/users/${user.id}/`, formData, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUser(response.data);
      setIsEditing(false);
      
      // Notify navbar to refresh with updated data
      notifyProfileUpdated();
      
      toast.success('Profile updated!');
    } catch (error) {
      console.error('Failed to update profile', error);
      toast.error('Update failed.');
    }
  };

  const handlePasswordChange = async () => {
    try {
      await axios.post('http://127.0.0.1:8000/api/users/change-password/', passwordData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Password changed successfully');
      setPasswordData({ current_password: '', new_password: '', confirm_password: '' });
      setShowPasswordForm(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to change password');
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const uploadFormData = new FormData();
    uploadFormData.append('profile_picture', file);
    setUploading(true);

    try {
      const res = await axios.patch(
        `http://127.0.0.1:8000/api/users/${user.id}/`,
        uploadFormData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }      );
      setUser(res.data);
      
      // Notify navbar to refresh with updated profile picture
      notifyProfileUpdated();
      
      toast.success('Profile picture updated!');
      fileInputRef.current.value = '';
    } catch (err) {
      console.error(err);
      toast.error('Failed to upload profile picture');
    } finally {
      setUploading(false);
    }
  };  // Get logged-in user's role
  const loggedInUserRole = token ? jwtDecode(token).role : null;

  if (loading) {
    return <Box sx={{ textAlign: 'center', my: 5 }}><CircularProgress /></Box>;
  }

  if (!user) return <Typography color="error" align="center">User not found.</Typography>;

  return (
    <Box sx={{ mt: 4, maxWidth: 800, mx: 'auto' }}>
      <Paper elevation={3} sx={{ p: 3, borderRadius: 2 }}>        {/* Top Action Bar */}        
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between" mb={1}>
          <Stack direction="row" spacing={1} alignItems="center">
            <TextField
              size="small"
              variant="outlined"
              placeholder="Search Profile 🔍"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              sx={{ minWidth: 200 }}
            />
            <Button
              variant="contained"
              color="primary"
              startIcon={<SearchIcon />}
              onClick={handleSearch}
              sx={{ height: 40 }}
            >
              Search
            </Button>
            <Button
              variant="contained"
              color="success"
              onClick={() => navigate('/create-profile')}
              sx={{ height: 40 }}
            >
              Create Profile
            </Button>
          </Stack>
          <BackButton />
        </Stack>{/* Search Results */}
        {searchResults.length > 0 && (
          <Box sx={{ mb: 3, border: '1px solid #eee', borderRadius: 1, p: 2, maxHeight: 250, overflowY: 'auto' }}>
            <Typography variant="subtitle1" sx={{ mb: 1 }}><b>Search Results</b></Typography>
            <table style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th align="left">Name</th>
                  <th align="left">Email</th>
                  <th align="left">Role</th>
                  {loggedInUserRole === 'system_admin' && <th align="left">Organization</th>}
                  <th align="left">Select</th>
                  {(loggedInUserRole === 'admin' || loggedInUserRole === 'system_admin') && (
                    <th align="left">Delete</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {searchResults.map((result) => (
                  <tr key={result.id}>
                    <td>{result.first_name} {result.last_name}</td>
                    <td>{result.email}</td>
                    <td>{result.role}</td>
                    {loggedInUserRole === 'system_admin' && (
                      <td>
                        {result.organization_name || 
                         (result.organization && typeof result.organization === 'object' 
                          ? result.organization.name 
                          : 'Unknown')}
                      </td>
                    )}
                    <td>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => {
                          setUser(result);                          setFormData({
                            first_name: result.first_name,
                            last_name: result.last_name,
                            email: result.email,
                            phone_number: result.phone_number || '',
                            organization: result.organization,
                            role: result.role,
                          });
                          setSearchResults([]);
                        }}
                      >
                        Select
                      </Button>
                    </td>
                    {(loggedInUserRole === 'admin' || loggedInUserRole === 'system_admin') && (
                      <td>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleDelete(result.id)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </Box>
        )}        <Divider sx={{ mb: 3 }} />
        <Typography variant="h6" sx={{ mb: 3 }}>User Information</Typography>

        {/* Two-Column Layout */}
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 4, alignItems: 'start' }}>
          {/* Left Column - Profile Picture and Organization */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* Profile Picture Section */}
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <Avatar
                src={user.profile_picture 
                  ? (user.profile_picture.startsWith('http') ? user.profile_picture : `http://127.0.0.1:8000${user.profile_picture}`)
                  : undefined
                }
                alt="Profile"
                sx={{ 
                  width: 160, 
                  height: 160, 
                  borderRadius: 3,
                  bgcolor: user.profile_picture ? 'transparent' : 'grey.300',
                  fontSize: '4rem',
                  border: '3px solid',
                  borderColor: 'primary.light',
                  boxShadow: 2
                }}
                variant="square"
              >
                {!user.profile_picture && (user.first_name?.[0] || 'U')}
              </Avatar>
              
              {/* Upload Profile Picture Button */}
              <Button
                variant="contained"
                component="label"
                size="medium"
                disabled={uploading}
                startIcon={uploading ? <CircularProgress size={16} color="inherit" /> : null}
                sx={{ 
                  minWidth: 160,
                  borderRadius: 2,
                  textTransform: 'none',
                  fontWeight: 600
                }}
              >
                {uploading ? 'Uploading...' : 'Upload Picture'}
                <input type="file" hidden accept="image/png, image/jpeg" ref={fileInputRef} onChange={handleUpload} />
              </Button>
            </Box>

            {/* Organization Field */}
            <Box>
              <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 600, color: 'primary.main' }}>
                Organization
              </Typography>
              {isEditing ? (
                <CreatableSelect
                  name="organization"
                  value={
                    organizations
                      .map(org => ({ value: org.id, label: org.name, id: org.id }))
                      .find(opt => String(opt.value) === String(formData.organization)) || null
                  }
                  onChange={option => {
                    if (option && option.__isNew__) {
                      axios.post('http://127.0.0.1:8000/api/users/organizations/', { name: option.label }, {
                        headers: { Authorization: `Bearer ${token}` },
                      }).then(res => {
                        setOrganizations(prev => [...prev, res.data]);
                        setFormData({ ...formData, organization: res.data.id });
                        toast.success('Organization created!');
                      }).catch(() => toast.error('Failed to create organization'));
                    } else {
                      setFormData({ ...formData, organization: option ? option.value : '' });
                    }
                  }}
                  options={organizations.map(org => ({ value: org.id, label: org.name, id: org.id }))}
                  isClearable
                  isSearchable
                  placeholder="Select or type to add organization..."
                  formatCreateLabel={inputValue => `Add "${inputValue}"`}
                  styles={{
                    control: (base) => ({ ...base, minHeight: 40, borderRadius: 8 }),
                    menu: (base) => ({ ...base, zIndex: 9999 })
                  }}
                />
              ) : (
                <Paper 
                  elevation={1} 
                  sx={{ 
                    p: 2, 
                    borderRadius: 2, 
                    bgcolor: '#f8f9fa',
                    border: '1px solid #e0e0e0'
                  }}
                >
                  <Typography variant="body1" sx={{ fontWeight: 500 }}>
                    {user.organization && (typeof user.organization === 'object'
                      ? user.organization.name
                      : (user.organization_name || 'No organization assigned'))}
                  </Typography>
                </Paper>
              )}
            </Box>
          </Box>

          {/* Right Column - User Information Fields */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <TextField
              label="First Name"
              name="first_name"
              value={formData.first_name}
              onChange={handleChange}
              fullWidth
              size="small"
              disabled={!isEditing}
              variant="outlined"
              InputProps={{
                readOnly: !isEditing,
                sx: !isEditing ? { color: '#333', backgroundColor: '#f8f9fa', WebkitTextFillColor: '#333' } : {},
              }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />
            
            <TextField
              label="Last Name"
              name="last_name"
              value={formData.last_name}
              onChange={handleChange}
              fullWidth
              size="small"
              disabled={!isEditing}
              variant="outlined"
              InputProps={{
                readOnly: !isEditing,
                sx: !isEditing ? { color: '#333', backgroundColor: '#f8f9fa', WebkitTextFillColor: '#333' } : {},
              }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />
            
            <TextField
              label="Email"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              fullWidth
              size="small"
              disabled={!isEditing}
              variant="outlined"
              InputProps={{
                readOnly: !isEditing,
                sx: !isEditing ? { color: '#333', backgroundColor: '#f8f9fa', WebkitTextFillColor: '#333' } : {},
              }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />
            
            <TextField
              label="Phone Number"
              name="phone_number"
              type="tel"
              value={formData.phone_number || ''}
              onChange={handleChange}
              fullWidth
              size="small"
              disabled={!isEditing}
              variant="outlined"
              placeholder="(123) 456-7890"
              key={`phone-${formData.phone_number}`}
              InputProps={{
                readOnly: !isEditing,
                sx: !isEditing ? { color: '#333', backgroundColor: '#f8f9fa', WebkitTextFillColor: '#333' } : {},
              }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />
            
            {/* Debug: Phone Number Field Value */}
            <Typography variant="caption" color="textSecondary">
              Debug - Phone Number Value: "{formData.phone_number}" (Length: {formData.phone_number?.length || 0})
            </Typography>            {/* Role Selection */}
            <Box>
              <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 600, color: 'primary.main' }}>
                Role
              </Typography>
              {isEditing && (loggedInUserRole === 'admin' || loggedInUserRole === 'system_admin') ? (
                <FormControl fullWidth size="small">
                  <InputLabel id="role-label">Role</InputLabel>
                  <MUISelect
                    labelId="role-label"
                    name="role"
                    value={formData.role}
                    label="Role"
                    onChange={handleChange}
                    sx={{ borderRadius: 2 }}
                  >
                    <MenuItem value="admin">Admin</MenuItem>
                    <MenuItem value="system_admin">System Admin</MenuItem>
                    <MenuItem value="doctor">Doctor</MenuItem>
                    <MenuItem value="registrar">Registrar</MenuItem>
                    <MenuItem value="receptionist">Receptionist</MenuItem>
                    <MenuItem value="patient">Patient</MenuItem>
                  </MUISelect>
                </FormControl>
              ) : (
                <Paper 
                  elevation={1} 
                  sx={{ 
                    p: 2, 
                    borderRadius: 2, 
                    bgcolor: '#f8f9fa',
                    border: '1px solid #e0e0e0'
                  }}
                >
                  <Typography variant="body1" sx={{ fontWeight: 500, textTransform: 'capitalize' }}>
                    {user.role}
                  </Typography>
                </Paper>
              )}
            </Box>

            {/* Edit/Save/Cancel Buttons */}
            <Box sx={{ mt: 2 }}>
              {!isEditing ? (
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<EditIcon />}
                  onClick={() => setIsEditing(true)}
                  sx={{ 
                    minWidth: 140,
                    borderRadius: 2,
                    textTransform: 'none',
                    fontWeight: 600,
                    py: 1.2
                  }}
                >
                  Edit Profile
                </Button>
              ) : (
                <Stack direction="row" spacing={2}>
                  <Button
                    variant="contained"
                    color="success"
                    startIcon={<SaveIcon />}
                    onClick={handleSave}
                    disabled={uploading}
                    sx={{ 
                      minWidth: 120,
                      borderRadius: 2,
                      textTransform: 'none',
                      fontWeight: 600,
                      py: 1.2
                    }}
                  >
                    Save
                  </Button>
                  <Button
                    variant="outlined"
                    color="secondary"
                    startIcon={<CancelIcon />}
                    onClick={() => {
                      setIsEditing(false);
                      setFormData({
                        first_name: user.first_name,
                        last_name: user.last_name,
                        email: user.email,
                        phone_number: user.phone_number || '',
                        organization: user.organization,
                        role: user.role,
                      });
                    }}
                    sx={{ 
                      minWidth: 120,
                      borderRadius: 2,
                      textTransform: 'none',
                      fontWeight: 600,
                      py: 1.2
                    }}
                  >
                    Cancel
                  </Button>
                </Stack>
              )}            </Box>
          </Box>
        </Box>

        {/* Change Password Section - Full Width Below */}
        <Box sx={{ mt: 4 }}>
          <Divider sx={{ mb: 3 }} />
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main' }}>
              Security Settings
            </Typography>
            <Button
              variant="outlined"
              color="primary"
              startIcon={<LockResetIcon />}
              onClick={() => setShowPasswordForm(v => !v)}
              sx={{ 
                minWidth: 180,
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 600
              }}
            >
              {showPasswordForm ? 'Cancel' : 'Change Password'}
            </Button>
          </Box>
          
          <Collapse in={showPasswordForm}>
            <Paper elevation={1} sx={{ p: 3, borderRadius: 2, bgcolor: '#f8f9fa' }}>
              <Stack spacing={2.5}>
                <TextField
                  label="Current Password"
                  type="password"
                  name="current_password"
                  value={passwordData.current_password}
                  onChange={e => setPasswordData({ ...passwordData, current_password: e.target.value })}
                  fullWidth
                  size="small"
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                />
                <TextField
                  label="New Password"
                  type="password"
                  name="new_password"
                  value={passwordData.new_password}
                  onChange={e => setPasswordData({ ...passwordData, new_password: e.target.value })}
                  fullWidth
                  size="small"
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                />
                <TextField
                  label="Confirm New Password"
                  type="password"
                  name="confirm_password"
                  value={passwordData.confirm_password}
                  onChange={e => setPasswordData({ ...passwordData, confirm_password: e.target.value })}
                  fullWidth
                  size="small"
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                />
                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button 
                    variant="contained" 
                    color="success" 
                    onClick={handlePasswordChange}
                    sx={{ 
                      minWidth: 180,
                      borderRadius: 2,
                      textTransform: 'none',
                      fontWeight: 600,
                      py: 1.2
                    }}
                  >
                    Save New Password
                  </Button>
                </Box>
              </Stack>
            </Paper>
          </Collapse>
        </Box>
      </Paper>
    </Box>
  );
}

export default ProfilePage;
