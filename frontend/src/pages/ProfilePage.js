import { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import {
  Box, Stack, Typography, Button, TextField, IconButton, Tooltip, Avatar, Collapse, FormControl, InputLabel, Select as MUISelect, MenuItem, CircularProgress, Divider, Paper
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import CancelIcon from '@mui/icons-material/Cancel';
import SearchIcon from '@mui/icons-material/Search';
import LockResetIcon from '@mui/icons-material/LockReset';
import { jwtDecode } from 'jwt-decode';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import CreatableSelect from 'react-select/creatable';

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
    const userId = decoded.user_id;

    axios.get(`http://127.0.0.1:8000/api/users/${userId}/`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => {
        if (!res.data) {
          toast.error('No user profile found.');
          return;
        }
        setUser(res.data);
        setFormData({
          first_name: res.data.first_name,
          last_name: res.data.last_name,
          email: res.data.email,
          organization: res.data.organization,
          role: res.data.role,
        });
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

  const handleSearch = async () => {
    try {
      const res = await axios.get(`http://127.0.0.1:8000/api/users/search/?q=${searchQuery}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSearchResults(res.data);

      if (res.data.length === 0) {
        toast.info('No matching users found.');
      }
    } catch (err) {
      toast.error('Search failed.');
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
        }
      );
      setUser(res.data);
      toast.success('Profile picture updated!');
      fileInputRef.current.value = '';
    } catch (err) {
      console.error(err);
      toast.error('Failed to upload profile picture');
    } finally {
      setUploading(false);
    }
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !user.organization) return;

    const logoFormData = new FormData();
    logoFormData.append('logo', file);

    setUploading(true);
    try {
      await axios.patch(
        `http://127.0.0.1:8000/api/users/organizations/${user.organization}/`,
        logoFormData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      toast.success('Organization logo updated!');
    } catch (err) {
      console.error(err);
      toast.error('Failed to upload organization logo');
    } finally {
      setUploading(false);
    }
  };

  // Get logged-in user's role
  const loggedInUserRole = token ? jwtDecode(token).role : null;

  if (loading) {
    return <Box sx={{ textAlign: 'center', my: 5 }}><CircularProgress /></Box>;
  }

  if (!user) return <Typography color="error" align="center">User not found.</Typography>;

  return (
    <Box sx={{ mt: 4, maxWidth: 800, mx: 'auto' }}>
      <Paper elevation={3} sx={{ p: 3, borderRadius: 2 }}>
        {/* Top Action Bar */}
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between" mb={3}>
          <Button
            variant="outlined"
            startIcon={<ArrowBackIcon />}
            onClick={() => navigate(-1)}
          >
            Back
          </Button>
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
        </Stack>

        {/* Search Results */}
        {searchResults.length > 0 && (
          <Box sx={{ mb: 3, border: '1px solid #eee', borderRadius: 1, p: 2, maxHeight: 250, overflowY: 'auto' }}>
            <Typography variant="subtitle1" sx={{ mb: 1 }}><b>Search Results</b></Typography>
            <table style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th align="left">Name</th>
                  <th align="left">Email</th>
                  <th align="left">Role</th>
                  <th align="left">Select</th>
                </tr>
              </thead>
              <tbody>
                {searchResults.map((result) => (
                  <tr key={result.id}>
                    <td>{result.first_name} {result.last_name}</td>
                    <td>{result.email}</td>
                    <td>{result.role}</td>
                    <td>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => {
                          setUser(result);
                          setFormData({
                            first_name: result.first_name,
                            last_name: result.last_name,
                            email: result.email,
                            organization: result.organization,
                            role: result.role,
                          });
                          setSearchResults([]);
                        }}
                      >
                        Select
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Box>
        )}

        <Divider sx={{ mb: 3 }} />
        <Typography variant="h6" sx={{ mb: 2 }}>User Information</Typography>
        {user.organization && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" component="span">Organization:</Typography>{' '}
            <Typography component="span">
              {typeof user.organization === 'object'
                ? user.organization.name
                : (user.organization_name || '')}
            </Typography>
          </Box>
        )}

        <Stack direction="row" spacing={2} alignItems="flex-start">
          {/* Profile Picture */}
          {user.profile_picture && (
            <Box sx={{ minWidth: 120, mr: 3 }}>
              <Avatar
                src={user.profile_picture.startsWith('http') ? user.profile_picture : `http://127.0.0.1:8000${user.profile_picture}`}
                alt="Profile"
                sx={{ width: 120, height: 120, borderRadius: 2 }}
                variant="square"
              />
            </Box>
          )}
          {/* All fields in a single vertical stack */}
          <Stack spacing={2} sx={{ flex: 1 }}>
            {/* Upload Org Logo */}
            <Stack direction="row" alignItems="center" spacing={2}>
              <Typography>Upload Organization Logo</Typography>
              <Button
                variant="outlined"
                component="label"
                size="small"
                disabled={uploading}
              >
                Upload
                <input type="file" hidden accept="image/png, image/jpeg" onChange={handleLogoUpload} />
              </Button>
            </Stack>
            {/* Upload Profile Picture */}
            <Stack direction="row" alignItems="center" spacing={2}>
              <Typography>Upload New Profile Picture</Typography>
              <Button
                variant="outlined"
                component="label"
                size="small"
                disabled={uploading}
              >
                Upload
                <input type="file" hidden accept="image/png, image/jpeg" ref={fileInputRef} onChange={handleUpload} />
              </Button>
              {uploading && <CircularProgress size={20} />}
            </Stack>
            {/* Editable Fields */}
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
                sx: !isEditing ? { color: '#333', backgroundColor: '#f3f3f3', WebkitTextFillColor: '#333' } : {},
              }}
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
                sx: !isEditing ? { color: '#333', backgroundColor: '#f3f3f3', WebkitTextFillColor: '#333' } : {},
              }}
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
                sx: !isEditing ? { color: '#333', backgroundColor: '#f3f3f3', WebkitTextFillColor: '#333' } : {},
              }}
            />

            {/* Organization - Editable with CreatableSelect */}
            <Box>
              <Typography sx={{ mb: 0.5 }}>Organization</Typography>
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
                    control: (base) => ({ ...base, minHeight: 40 }),
                    menu: (base) => ({ ...base, zIndex: 9999 })
                  }}
                />
              ) : (
                <TextField
                  variant="outlined"
                  value={
                    user.organization && (typeof user.organization === 'object'
                      ? user.organization.name
                      : (user.organization_name || ''))
                  }
                  InputProps={{ readOnly: true, sx: { color: '#333', backgroundColor: '#f3f3f3', WebkitTextFillColor: '#333' } }}
                  fullWidth
                />
              )}
            </Box>

            {/* Role Selection */}
            <Box>
              <Typography sx={{ mb: 0.5 }}>Role</Typography>
              {isEditing && (loggedInUserRole === 'admin' || loggedInUserRole === 'system_admin') ? (
                <FormControl fullWidth size="small">
                  <InputLabel id="role-label">Role</InputLabel>
                  <MUISelect
                    labelId="role-label"
                    name="role"
                    value={formData.role}
                    label="Role"
                    onChange={handleChange}
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
                <TextField
                  variant="outlined"
                  value={user.role}
                  InputProps={{ readOnly: true, sx: { color: '#333', backgroundColor: '#f3f3f3', WebkitTextFillColor: '#333' } }}
                  fullWidth
                />
              )}
            </Box>

            {/* Edit/Save/Cancel Buttons */}
            {!isEditing ? (
              <Button
                variant="contained"
                color="primary"
                startIcon={<EditIcon />}
                onClick={() => setIsEditing(true)}
                sx={{ width: 130 }}
              >
                Edit
              </Button>
            ) : (
              <Stack direction="row" spacing={2}>
                <Button
                  variant="contained"
                  color="success"
                  startIcon={<SaveIcon />}
                  onClick={handleSave}
                  disabled={uploading}
                  sx={{ width: 120 }}
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
                      organization: user.organization,
                      role: user.role,
                    });
                  }}
                  sx={{ width: 120 }}
                >
                  Cancel
                </Button>
              </Stack>
            )}

            {/* Change Password */}
            <Divider sx={{ my: 2 }} />
            <Button
              variant="outlined"
              color="primary"
              startIcon={<LockResetIcon />}
              onClick={() => setShowPasswordForm(v => !v)}
              sx={{ width: 220 }}
            >
              {showPasswordForm ? 'Cancel' : 'Change Password'}
            </Button>
            <Collapse in={showPasswordForm}>
              <Box sx={{ my: 2 }}>
                <TextField
                  label="Current Password"
                  type="password"
                  name="current_password"
                  value={passwordData.current_password}
                  onChange={e => setPasswordData({ ...passwordData, current_password: e.target.value })}
                  fullWidth
                  size="small"
                  sx={{ mb: 2 }}
                />
                <TextField
                  label="New Password"
                  type="password"
                  name="new_password"
                  value={passwordData.new_password}
                  onChange={e => setPasswordData({ ...passwordData, new_password: e.target.value })}
                  fullWidth
                  size="small"
                  sx={{ mb: 2 }}
                />
                <TextField
                  label="Confirm New Password"
                  type="password"
                  name="confirm_password"
                  value={passwordData.confirm_password}
                  onChange={e => setPasswordData({ ...passwordData, confirm_password: e.target.value })}
                  fullWidth
                  size="small"
                  sx={{ mb: 2 }}
                />
                <Button variant="contained" color="success" onClick={handlePasswordChange}>
                  Save New Password
                </Button>
              </Box>
            </Collapse>
          </Stack>
        </Stack>
      </Paper>
    </Box>
  );
}

export default ProfilePage;
