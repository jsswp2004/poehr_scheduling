import { toast } from 'react-toastify';
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { 
  Container, Paper, Typography, TextField, Button, Stack, Box, FormControl, FormLabel, RadioGroup, FormControlLabel, Radio, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions, MenuItem, InputLabel, Select as MUISelect, IconButton, Tooltip, Divider
} from '@mui/material';
import Select from 'react-select';
import BackButton from '../components/BackButton';
import { jwtDecode } from 'jwt-decode';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import DeleteIcon from '@mui/icons-material/Delete';
import CancelIcon from '@mui/icons-material/Cancel';

function RegisterPage({ adminMode = false }) {
  const [isPatient, setIsPatient] = useState(adminMode ? true : true);
  const [hasProvider, setHasProvider] = useState(null); // 'yes' or 'no'
  const [doctors, setDoctors] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  
  // New state for patient information display
  const [registeredPatient, setRegisteredPatient] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [patientEditData, setPatientEditData] = useState({});

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
  });  useEffect(() => {
    // Get token and check if user is logged in
    const token = localStorage.getItem('access_token');
    
    // Function to fetch doctors
    const fetchDoctors = () => {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      axios.get('http://127.0.0.1:8000/api/users/doctors/', { headers })
        .then((res) => setDoctors(res.data))
        .catch((err) => console.error('Failed to load doctors:', err));
    };

    // Function to fetch organizations
    const fetchOrganizations = () => {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      axios.get('http://127.0.0.1:8000/api/users/organizations/', { headers })
        .then((res) => setOrganizations(res.data))
        .catch((err) => console.error('Failed to load organizations:', err));
    };

    // Function to fetch current user info if logged in
    const fetchCurrentUserOrg = async () => {
      if (token) {
        try {
          // Get current user's info
          const response = await axios.get('http://127.0.0.1:8000/api/users/me/', {
            headers: { Authorization: `Bearer ${token}` }
          });
          
          const userData = response.data;
          
          // Set the organization name to the current user's organization
          if (userData.organization_name) {
            setFormData(prevState => ({
              ...prevState,
              organization_name: userData.organization_name
            }));
          }
        } catch (error) {
          console.error('Failed to fetch current user information:', error);
        }
      }
    };
    
    fetchDoctors();
    fetchOrganizations();
    fetchCurrentUserOrg();
  }, []);
  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handlePatientEditChange = (e) => {
    setPatientEditData({
      ...patientEditData,
      [e.target.name]: e.target.value,
    });
  };  const handleSubmit = async (e) => {
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

    // Get token if user is logged in
    const token = localStorage.getItem('access_token');
    const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};

    try {
      const response = await axios.post('http://127.0.0.1:8000/api/auth/register/', payload, config);
      toast.success('Registration successful!');
      
      // If in admin mode, fetch the created patient data and display it
      if (adminMode && token) {
        try {
          // Fetch the newly created patient data
          const patientResponse = await axios.get(`http://127.0.0.1:8000/api/users/patients/`, {
            headers: { Authorization: `Bearer ${token}` },
            params: { search: formData.username }
          });
          
          if (patientResponse.data.results && patientResponse.data.results.length > 0) {
            const newPatient = patientResponse.data.results[0];
            setRegisteredPatient(newPatient);
            setPatientEditData(newPatient);
            
            // Clear the registration form
            setFormData({
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
            setHasProvider(null);
          }
        } catch (fetchError) {
          console.error('Failed to fetch registered patient:', fetchError);
        }
      } else {
        // For non-admin mode, navigate to login
        navigate('/login');
      }
    } catch (error) {
      console.error("Registration error:", error);      toast.error('Registration failed. Please try again.');
    }
  };

  const handlePatientEdit = () => {
    setEditMode(true);
  };

  const handlePatientSave = async () => {
    const token = localStorage.getItem('access_token');
    if (!token) return;

    try {
      const updateData = {
        ...patientEditData,
        provider_id: patientEditData.provider
      };

      await axios.put(
        `http://127.0.0.1:8000/api/users/patients/by-user/${registeredPatient.user_id}/edit/`, 
        updateData,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setRegisteredPatient(patientEditData);
      setEditMode(false);
      toast.success('Patient information updated successfully!');
    } catch (error) {
      console.error('Update error:', error);
      toast.error('Failed to update patient information.');
    }
  };

  const handlePatientCancel = () => {
    setPatientEditData(registeredPatient);
    setEditMode(false);
  };

  const handlePatientDelete = async () => {
    const token = localStorage.getItem('access_token');
    if (!token) return;

    try {
      await axios.delete(
        `http://127.0.0.1:8000/api/users/patients/${registeredPatient.id}/`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setRegisteredPatient(null);
      setPatientEditData({});
      setDeleteDialogOpen(false);
      toast.success('Patient deleted successfully!');
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Failed to delete patient.');
    }
  };

  const formatPhoneNumber = (value) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  };  return (
    <Box sx={{ mt: 0, maxWidth: '100vw', px: 2 }}>
      <Box sx={{ display: 'flex', gap: 3, minHeight: '80vh' , marginTop: '0px' }}>
          {/* Left Pane - Registration Form (30%) */}
        <Box sx={{ flex: '0 0 30%' }}>
          <Paper elevation={4} sx={{ p: 4, borderRadius: 3, minHeight: '70vh', height: '100%' }}>
            <Typography variant="h5" fontWeight={700} sx={{ mb: 2 }}>Quick Register</Typography>
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
                {/* Only show organization field if not in adminMode, not logged in, and role is none/patient */}
                {!adminMode && !localStorage.getItem('access_token') && (formData.role === 'none' || formData.role === 'patient') && (
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
        </Box>        {/* Right Pane - Patient Information Display (70%) */}
        <Box sx={{ flex: '0 0 70%' }}>
          <Paper 
            elevation={4} 
            sx={{ 
              p: 4, 
              borderRadius: 3, 
              minHeight: '70vh',
              height: '100%',
              bgcolor: registeredPatient ? 'background.paper' : 'grey.100',
              opacity: registeredPatient ? 1 : 0.7
            }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
              <Typography variant="h5" fontWeight={700} color={registeredPatient ? 'primary.main' : 'text.secondary'}>
                Patient Information
              </Typography>
              
              {registeredPatient && (
                <Box sx={{ display: 'flex', gap: 1 }}>
                  {editMode ? (
                    <>
                      <Tooltip title="Save Changes">
                        <IconButton onClick={handlePatientSave} color="primary" size="small">
                          <SaveIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Cancel">
                        <IconButton onClick={handlePatientCancel} color="secondary" size="small">
                          <CancelIcon />
                        </IconButton>
                      </Tooltip>
                    </>
                  ) : (
                    <Tooltip title="Edit Patient">
                      <IconButton onClick={handlePatientEdit} color="primary" size="small">
                        <EditIcon />
                      </IconButton>
                    </Tooltip>
                  )}
                  <Tooltip title="Delete Patient">
                    <IconButton onClick={() => setDeleteDialogOpen(true)} color="error" size="small">
                      <DeleteIcon />
                    </IconButton>
                  </Tooltip>
                </Box>
              )}
            </Box>

            {registeredPatient ? (
              <Stack spacing={3}>
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <TextField
                    label="First Name"
                    name="first_name"
                    value={patientEditData.first_name || ''}
                    onChange={handlePatientEditChange}
                    fullWidth
                    disabled={!editMode}
                    InputProps={!editMode ? { style: { color: '#333', background: '#f5f5f5' } } : {}}
                  />
                  <TextField
                    label="Last Name"
                    name="last_name"
                    value={patientEditData.last_name || ''}
                    onChange={handlePatientEditChange}
                    fullWidth
                    disabled={!editMode}
                    InputProps={!editMode ? { style: { color: '#333', background: '#f5f5f5' } } : {}}
                  />
                </Box>

                <Box sx={{ display: 'flex', gap: 2 }}>
                  <TextField
                    label="Username"
                    name="username"
                    value={patientEditData.username || ''}
                    onChange={handlePatientEditChange}
                    fullWidth
                    disabled={!editMode}
                    InputProps={!editMode ? { style: { color: '#333', background: '#f5f5f5' } } : {}}
                  />
                  <TextField
                    label="Email"
                    name="email"
                    type="email"
                    value={patientEditData.email || ''}
                    onChange={handlePatientEditChange}
                    fullWidth
                    disabled={!editMode}
                    InputProps={!editMode ? { style: { color: '#333', background: '#f5f5f5' } } : {}}
                  />
                </Box>

                <Box sx={{ display: 'flex', gap: 2 }}>
                  <FormControl fullWidth disabled={!editMode}>
                    <InputLabel>Provider</InputLabel>
                    <MUISelect
                      name="provider"
                      value={patientEditData.provider || ''}
                      onChange={handlePatientEditChange}
                      label="Provider"
                      sx={!editMode ? { color: '#333', background: '#f5f5f5' } : {}}
                    >
                      <MenuItem value="">Select a provider</MenuItem>
                      {doctors.map((doc) => (
                        <MenuItem key={doc.id} value={doc.id}>
                          Dr. {doc.first_name} {doc.last_name}
                        </MenuItem>
                      ))}
                    </MUISelect>
                  </FormControl>

                  <FormControl fullWidth disabled={!editMode}>
                    <InputLabel>Organization</InputLabel>
                    <MUISelect
                      name="organization"
                      value={patientEditData.organization || ''}
                      onChange={handlePatientEditChange}
                      label="Organization"
                      sx={!editMode ? { color: '#333', background: '#f5f5f5' } : {}}
                    >
                      <MenuItem value="">Select an organization</MenuItem>
                      {organizations.map((org) => (
                        <MenuItem key={org.id} value={org.id}>{org.name}</MenuItem>
                      ))}
                    </MUISelect>
                  </FormControl>
                </Box>

                <Box sx={{ display: 'flex', gap: 2 }}>
                  <TextField
                    label="Phone Number"
                    name="phone_number"
                    value={editMode ? formatPhoneNumber(patientEditData.phone_number || '') : (patientEditData.phone_number || '')}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\D/g, '');
                      setPatientEditData(prev => ({ ...prev, phone_number: raw }));
                    }}
                    fullWidth
                    disabled={!editMode}
                    InputProps={!editMode ? { style: { color: '#333', background: '#f5f5f5' } } : {}}
                  />
                  <TextField
                    label="Date of Birth"
                    name="date_of_birth"
                    type="date"
                    value={patientEditData.date_of_birth || ''}
                    onChange={handlePatientEditChange}
                    fullWidth
                    disabled={!editMode}
                    InputLabelProps={{ shrink: true }}
                    InputProps={!editMode ? { style: { color: '#333', background: '#f5f5f5' } } : {}}
                  />
                </Box>

                <TextField
                  label="Address"
                  name="address"
                  value={patientEditData.address || ''}
                  onChange={handlePatientEditChange}
                  fullWidth
                  disabled={!editMode}
                  InputProps={!editMode ? { style: { color: '#333', background: '#f5f5f5' } } : {}}
                />

                <TextField
                  label="Notes / Medical History"
                  name="medical_history"
                  value={patientEditData.medical_history || ''}
                  onChange={handlePatientEditChange}
                  fullWidth
                  disabled={!editMode}
                  multiline
                  rows={4}
                  InputProps={!editMode ? { style: { color: '#333', background: '#f5f5f5' } } : {}}
                />
              </Stack>
            ) : (
              <Box sx={{ 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center', 
                justifyContent: 'center', 
                minHeight: '40vh',
                textAlign: 'center'
              }}>
                <Typography variant="h6" color="text.secondary" gutterBottom>
                  Patient information will appear here after registration
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Complete the registration form on the left to see patient details and management options.
                </Typography>
              </Box>
            )}
          </Paper>
        </Box>
      </Box>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete this patient? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} color="primary">
            Cancel
          </Button>
          <Button onClick={handlePatientDelete} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default RegisterPage;
