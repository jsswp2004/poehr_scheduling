import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Box, Stack, Typography, Button, TextField, InputLabel, FormControl, MenuItem, Select as MUISelect } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';

function CreateProfile() {
  const navigate = useNavigate();
  const [doctors, setDoctors] = useState([]);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    first_name: '',
    last_name: '',
    role: 'patient', // still defaulting to patient
    profile_picture: null,
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    axios.get('http://127.0.0.1:8000/api/users/doctors/')
      .then((res) => setDoctors(res.data))
      .catch((err) => console.error('Failed to load doctors:', err));
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
    <Box sx={{ mt: 6, mx: 'auto', maxWidth: 440, p: 4, boxShadow: 3, borderRadius: 2, bgcolor: 'background.paper' }}>
      <Button variant="outlined" sx={{ mb: 2 }} onClick={() => navigate(-1)}>
        Back
      </Button>
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
          )}

          <FormControl fullWidth size="small">
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
              <MenuItem value="receptionist">Receptionist</MenuItem>
              <MenuItem value="doctor">Doctor</MenuItem>
              <MenuItem value="admin">Admin</MenuItem>
              <MenuItem value="registrar">Registrar</MenuItem>
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
