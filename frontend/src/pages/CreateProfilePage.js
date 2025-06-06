import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Box, Stack, Typography, TextField, Button, InputLabel, FormControl, MenuItem, Select as MUISelect } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import BackButton from '../components/BackButton';

function CreateProfile() {
  const navigate = useNavigate();
  const [organizations, setOrganizations] = useState([]);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    first_name: '',
    last_name: '',
    role: '', // Changed from 'patient' to empty string
    profile_picture: null,
    organization: '',
  });
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    // Fetch organizations and current user's organization
    const token = localStorage.getItem('access_token');
    if (!token) return;

    const headers = { Authorization: `Bearer ${token}` };

    axios.get('http://127.0.0.1:8000/api/users/organizations/', { headers })
      .then(res => setOrganizations(res.data))
      .catch(err => console.error('Failed to load organizations:', err));

    // Fetch logged-in user's organization to use as default
    axios.get('http://127.0.0.1:8000/api/users/me/', { headers })
      .then(res => {
        if (res.data && res.data.organization) {
          setFormData(prev => ({ ...prev, organization: res.data.organization }));
        }
      })
      .catch(err => console.error('Failed to load current user info:', err));
  }, []);

  const handleChange = (e) => {
    const { name, value, files } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: files ? files[0] : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    const formPayload = new FormData();
    for (const key in formData) {
      if (formData[key]) {
        formPayload.append(key, formData[key]);
      }
    }

    try {
      await axios.post('http://127.0.0.1:8000/api/auth/register/', formPayload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('Registration successful! Please login.');
      navigate('/login');
    } catch (error) {
      console.error('Registration error:', error);
      toast.error('Registration failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box sx={{ mt: 6, mx: 'auto', maxWidth: 440, p: 4, boxShadow: 3, borderRadius: 2, bgcolor: 'background.paper' }}>      <BackButton />
      <Typography variant="h5" sx={{ mb: 2, fontWeight: 700 }}>
        Create Profile
      </Typography>
      <form onSubmit={handleSubmit} encType="multipart/form-data">
        <Stack spacing={2}>
          {['first_name', 'last_name', 'username', 'email', 'password'].map((field) => (
            <TextField
              key={field}
              label={field.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
              type={field === 'password' ? 'password' : 'text'}
              name={field}
              onChange={handleChange}
              value={formData[field]}
              fullWidth
              required
              size="small"
            />
          ))}

          <Button
            variant="outlined"
            component="label"
            sx={{ textAlign: 'left', justifyContent: 'flex-start' }}
          >
            Upload Profile Picture
            <input
              type="file"
              name="profile_picture"
              accept="image/*"
              hidden
              onChange={handleChange}
            />
          </Button>
          {formData.profile_picture && (
            <Typography variant="caption" sx={{ color: 'text.secondary', mb: 1 }}>
              {formData.profile_picture.name}
            </Typography>
          )}          <FormControl fullWidth size="small">
            <InputLabel id="role-label">Role</InputLabel>
            <MUISelect
              labelId="role-label"
              name="role"
              value={formData.role}
              label="Role"
              onChange={handleChange}
              required
            >
              <MenuItem value=""><em>Select a role</em></MenuItem>
              <MenuItem value="patient">Patient</MenuItem>
              <MenuItem value="receptionist">Receptionist</MenuItem>
              <MenuItem value="doctor">Doctor</MenuItem>
              <MenuItem value="admin">Admin</MenuItem>
              <MenuItem value="registrar">Registrar</MenuItem>
            </MUISelect>
          </FormControl>

          <FormControl fullWidth size="small">
            <InputLabel id="organization-label">Organization</InputLabel>
            <MUISelect
              labelId="organization-label"
              name="organization"
              value={formData.organization}
              label="Organization"
              onChange={handleChange}
              required
            >
              <MenuItem value=""><em>Select an organization</em></MenuItem>
              {organizations.map((org) => (
                <MenuItem key={org.id} value={org.id}>
                  {org.name}
                </MenuItem>
              ))}
            </MUISelect>
          </FormControl>

          <Button
            type="submit"
            variant="contained"
            color="primary"
            disabled={submitting}
            fullWidth
          >
            {submitting ? 'Saving...' : 'Save'}
          </Button>
        </Stack>
      </form>
    </Box>
  );
}

export default CreateProfile;
