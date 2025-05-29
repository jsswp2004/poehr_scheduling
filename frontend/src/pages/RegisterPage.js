import { toast } from 'react-toastify';
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { 
  Container, Paper, Typography, TextField, Button, Stack, Box, FormControl, FormLabel, RadioGroup, FormControlLabel, Radio, Alert 
} from '@mui/material';
import Select from 'react-select';
import BackButton from '../components/BackButton';

function RegisterPage({ adminMode = false }) {
  const [isPatient, setIsPatient] = useState(adminMode ? true : true);
  const [hasProvider, setHasProvider] = useState(null); // 'yes' or 'no'
  const [doctors, setDoctors] = useState([]);

  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    first_name: '',
    last_name: '',
    role: adminMode ? 'patient' : 'patient',
    assigned_doctor: '',
    phone_number: '',
    organization_name: '',
  });

  useEffect(() => {
    axios.get('http://127.0.0.1:8000/api/users/doctors/')
      .then((res) => setDoctors(res.data))
      .catch((err) => console.error('Failed to load doctors:', err));
  }, []);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (isPatient && hasProvider === 'no' && (!formData.email || !formData.phone_number)) {
      toast.error("Please fill out both email and phone number.");
      return;
    }

    const payload = {
      ...formData,
      role: isPatient ? 'patient' : (formData.role || 'none'),
      provider: formData.assigned_doctor,
    };

    try {
      await axios.post('http://127.0.0.1:8000/api/auth/register/', payload);
      toast.success('Registration successful! Please login.');
      navigate('/login');
    } catch (error) {
      toast.error('Registration failed. Please try again.');
    }
  };

  return (
    <Container maxWidth="sm" sx={{ mt: 6 }}>
      <Paper elevation={4} sx={{ p: 4, borderRadius: 3 }}>        <BackButton />
        <Typography variant="h5" fontWeight={700} sx={{ mb: 2 }}>Register</Typography>
        {!adminMode && (formData.role === 'none' || formData.role === 'patient') && (
          <Box sx={{ mb: 2 }}>
            <FormControl component="fieldset">
              <FormLabel>Are you registering as a patient?</FormLabel>
              <RadioGroup row value={isPatient ? 'yes' : 'no'}>
                <FormControlLabel
                  value="yes"
                  control={<Radio />}
                  label="Yes"
                  onChange={() => {
                    setIsPatient(true);
                    setFormData({ ...formData, role: 'patient' });
                  }}
                  checked={isPatient}
                />
                <FormControlLabel
                  value="no"
                  control={<Radio />}
                  label="No"
                  onChange={() => {
                    setIsPatient(false);
                    setFormData({ ...formData, role: '' });
                  }}
                  checked={!isPatient}
                />
              </RadioGroup>
            </FormControl>
          </Box>
        )}

        <form onSubmit={handleSubmit}>
          <Stack spacing={2}>
            {!adminMode && (formData.role === 'none' || formData.role === 'patient') && (
              <TextField
                label="Organization Name"
                name="organization_name"
                value={formData.organization_name || ''}
                onChange={handleChange}
                required
                fullWidth
                size="small"
              />
            )}
            <TextField label="First Name" name="first_name" value={formData.first_name} onChange={handleChange} required fullWidth size="small" />
            <TextField label="Last Name" name="last_name" value={formData.last_name} onChange={handleChange} required fullWidth size="small" />
            <TextField label="Username" name="username" value={formData.username} onChange={handleChange} required fullWidth size="small" />
            <TextField label="Email" name="email" type="email" value={formData.email} onChange={handleChange} required={isPatient && hasProvider === 'no'} fullWidth size="small" />
            <TextField label="Phone Number" name="phone_number" value={formData.phone_number} onChange={handleChange} required={isPatient && hasProvider === 'no'} fullWidth size="small" placeholder="e.g. (555) 123-4567" />
            <TextField label="Password" name="password" type="password" value={formData.password} onChange={handleChange} required fullWidth size="small" />

            {/* Provider question - HIDDEN in adminMode */}
            {!adminMode && isPatient && (
              <Box>
                <FormControl component="fieldset">
                  <FormLabel>Do you know/have a Primary Care Provider?</FormLabel>
                  <RadioGroup row value={hasProvider}>
                    <FormControlLabel
                      value="yes"
                      control={<Radio />}
                      label="Yes"
                      onChange={() => setHasProvider('yes')}
                      checked={hasProvider === 'yes'}
                    />
                    <FormControlLabel
                      value="no"
                      control={<Radio />}
                      label="No"
                      onChange={() => setHasProvider('no')}
                      checked={hasProvider === 'no'}
                    />
                  </RadioGroup>
                </FormControl>
              </Box>
            )}

            {isPatient && hasProvider === 'yes' && (
              <Box>
                <FormLabel>Select Doctor</FormLabel>
                <Select
                  options={doctors.map((doc) => ({
                    value: doc.id,
                    label: `Dr. ${doc.first_name} ${doc.last_name}`,
                  }))}
                  placeholder="Search or select doctor..."
                  onChange={(selected) => setFormData({ ...formData, assigned_doctor: selected?.value || '' })}
                  isClearable
                  styles={{
                    control: (base) => ({ ...base, minHeight: 40 }),
                    menu: (base) => ({ ...base, zIndex: 9999 })
                  }}
                />
              </Box>
            )}

            {!localStorage.getItem('access_token') && isPatient && hasProvider === 'no' && (
              <Box>
                {(formData.email === '' || formData.phone_number === '') ? (
                  <Alert severity="error">Please provide us with your contact details.</Alert>
                ) : (
                  <Alert severity="info" sx={{ fontWeight: 700 }}>A representative will reach out to you shortly after registration. Thank you!</Alert>
                )}
              </Box>
            )}
            <Button type="submit" variant="contained" color="primary" size="large" sx={{ mt: 2 }} fullWidth>
              Register
            </Button>
          </Stack>
        </form>
      </Paper>
    </Container>
  );
}

export default RegisterPage;
