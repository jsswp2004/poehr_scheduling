import React, { useState } from 'react';
import axios from 'axios';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { Container, Paper, Typography, TextField, Button, Stack, MenuItem } from '@mui/material';
import { useNavigate } from 'react-router-dom';

function EnrollmentPage() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    first_name: '',
    last_name: '',
    phone_number: '',
    organization_name: '',
    organization_type: 'personal',
  });

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post('http://127.0.0.1:8000/api/auth/register/', formData);
      navigate('/login');
    } catch (err) {
      console.error('Enrollment failed:', err);
    }
  };

  return (
    <div className="enrollment-page">
      <Header />
      <Container maxWidth="sm" sx={{ my: 4 }}>
        <Paper elevation={4} sx={{ p: 4 }}>
          <Typography variant="h5" sx={{ mb: 2, fontWeight: 700 }}>
            Enrollment
          </Typography>
          <form onSubmit={handleSubmit}>
            <Stack spacing={2}>
              <TextField
                label="Organization Name"
                name="organization_name"
                value={formData.organization_name}
                onChange={handleChange}
                required
                size="small"
              />
              <TextField
                select
                label="Organization Type"
                name="organization_type"
                value={formData.organization_type}
                onChange={handleChange}
                required
                size="small"
              >
                <MenuItem value="personal">Personal</MenuItem>
                <MenuItem value="clinic">Clinic</MenuItem>
                <MenuItem value="group">Group</MenuItem>
              </TextField>
              <TextField label="First Name" name="first_name" value={formData.first_name} onChange={handleChange} required size="small" />
              <TextField label="Last Name" name="last_name" value={formData.last_name} onChange={handleChange} required size="small" />
              <TextField label="Username" name="username" value={formData.username} onChange={handleChange} required size="small" />
              <TextField label="Email" type="email" name="email" value={formData.email} onChange={handleChange} required size="small" />
              <TextField label="Phone Number" name="phone_number" value={formData.phone_number} onChange={handleChange} size="small" />
              <TextField label="Password" type="password" name="password" value={formData.password} onChange={handleChange} required size="small" />
              <Button variant="contained" type="submit" fullWidth>
                Enroll
              </Button>
            </Stack>
          </form>
        </Paper>
      </Container>
      <Footer pricingLink="/pricing" featuresLink="/features" />
    </div>
  );
}

export default EnrollmentPage;
