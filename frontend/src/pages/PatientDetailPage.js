import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import axios from 'axios';
import CreateAppointmentForm from '../components/CreateAppointmentForm';
import {
  Box,
  Stack,
  Typography,
  Button,
  TextField,
  IconButton,
  Tooltip,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  MenuItem,
  FormControl,
  InputLabel,
  Select as MUISelect,
  Alert,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { jwtDecode } from 'jwt-decode';
import BackButton from '../components/BackButton';
import Autocomplete from '@mui/material/Autocomplete';
import usePlacesAutocomplete, { getGeocode, getLatLng } from "use-places-autocomplete";
import InputAdornment from '@mui/material/InputAdornment';

function PatientDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [patient, setPatient] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [showAppointmentForm, setShowAppointmentForm] = useState(false);
  const [formData, setFormData] = useState({});
  const [doctors, setDoctors] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [addressOptions, setAddressOptions] = useState([]);
  const [addressInput, setAddressInput] = useState('');
  const token = localStorage.getItem('access_token');

  // Role-based access control for admin, system_admin, doctor, registrar, and receptionist only
  useEffect(() => {
    if (!token) {
      navigate('/login');
      return;
    }
    try {
      const decoded = jwtDecode(token);
      const role = decoded.role || '';
      if (
        role !== 'admin' &&
        role !== 'system_admin' &&
        role !== 'doctor' &&
        role !== 'registrar' &&
        role !== 'receptionist'
      ) {
        navigate('/');
      }
    } catch (err) {
      navigate('/login');
    }
  }, [navigate, token]);
  // Fetch patient data
  useEffect(() => {
    axios
      .get(`http://127.0.0.1:8000/api/users/patients/by-user/${id}/`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => {
        setPatient(res.data);
        setFormData(res.data);
      })
      .catch((err) => console.error('Error fetching patient:', err));
  }, [id, token]);

  // Fetch doctors for dropdown
  useEffect(() => {
    axios
      .get('http://127.0.0.1:8000/api/users/doctors/', {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => setDoctors(res.data))
      .catch((err) => console.error('Failed to load doctors:', err));
  }, [token]);

  // Fetch organizations for dropdown
  useEffect(() => {
    axios
      .get('http://127.0.0.1:8000/api/users/organizations/', {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => setOrganizations(res.data))
      .catch((err) => setOrganizations([]));
  }, [token]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      // If provider is changed, update organization to match provider's org
      if (name === "provider") {
        const selectedProvider = doctors.find((doc) => String(doc.id) === String(value));
        if (selectedProvider && selectedProvider.organization) {
          return { ...prev, provider: value, organization: selectedProvider.organization };
        }
      }
      return { ...prev, [name]: value };
    });
  };  const handleSubmit = async (e) => {
    e.preventDefault();    // Comprehensive field validation
    const errors = [];    const requiredFields = [
      { field: 'first_name', label: 'First Name' },
      { field: 'last_name', label: 'Last Name' },
      { field: 'username', label: 'Username' },
      { field: 'email', label: 'Email' },
      { field: 'provider', label: 'Provider' },
      { field: 'organization', label: 'Organization' },
      { field: 'phone_number', label: 'Phone Number' },
      { field: 'date_of_birth', label: 'Date of Birth' },
      { field: 'address', label: 'Address' }
    ];
      // Check required fields
    requiredFields.forEach(({ field, label }) => {
      if (!formData[field] || formData[field].toString().trim() === '') {
        errors.push(`${label} is required`);
      }
    });
    
    // Email format validation
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.push('Email format is invalid');
    }
    
    // Phone number validation (if provided)
    if (formData.phone_number && formData.phone_number.length > 0 && formData.phone_number.length < 10) {
      errors.push('Phone number must be at least 10 digits');
    }
    
    // Username validation
    if (formData.username && formData.username.length < 3) {
      errors.push('Username must be at least 3 characters long');
    }
    
    // Show validation errors if any
    if (errors.length > 0) {
      alert(`Please fix the following issues:\n\n${errors.map(error => `• ${error}`).join('\n')}`);
      return;
    }    // Clone the formData and add provider_id if provider is present
    const dataToSend = {...formData};
    if (dataToSend.provider !== undefined) {
      dataToSend.provider_id = dataToSend.provider;
    }
    
    // Allow medical_history to be null - backend now handles this properly
    if (!dataToSend.medical_history || dataToSend.medical_history.trim() === '') {
      dataToSend.medical_history = null;
    }
    
    try {
      await axios.put(`http://127.0.0.1:8000/api/users/patients/by-user/${id}/edit/`, dataToSend, {
        headers: { Authorization: `Bearer ${token}` },
      });
      alert('Patient updated successfully!');
      setEditMode(false);
      setPatient(formData);
    } catch (err) {
      console.error('Update error:', err);
      
      // Enhanced error handling with specific backend error messages
      let errorMessage = 'Failed to update patient.';
      
      if (err.response?.data) {
        const backendErrors = [];
        const errorData = err.response.data;
        
        // Handle field-specific errors
        Object.keys(errorData).forEach(field => {
          const fieldErrors = Array.isArray(errorData[field]) ? errorData[field] : [errorData[field]];
          fieldErrors.forEach(error => {
            const fieldLabel = requiredFields.find(f => f.field === field)?.label || field;
            backendErrors.push(`${fieldLabel}: ${error}`);
          });
        });
        
        if (backendErrors.length > 0) {
          errorMessage = `Update failed due to the following issues:\n\n${backendErrors.map(error => `• ${error}`).join('\n')}`;
        } else if (typeof errorData === 'string') {
          errorMessage = `Update failed: ${errorData}`;
        } else if (errorData.detail) {
          errorMessage = `Update failed: ${errorData.detail}`;
        }
      } else if (err.response?.status === 400) {
        errorMessage = 'Update failed: Invalid data provided. Please check all fields and try again.';
      } else if (err.response?.status === 401) {
        errorMessage = 'Update failed: You are not authorized to perform this action.';
      } else if (err.response?.status === 404) {
        errorMessage = 'Update failed: Patient not found.';
      } else if (err.response?.status >= 500) {
        errorMessage = 'Update failed: Server error. Please try again later.';
      } else if (err.code === 'NETWORK_ERROR' || !err.response) {
        errorMessage = 'Update failed: Network error. Please check your connection and try again.';
      }
      
      alert(errorMessage);
    }
  };

  // Address Autocomplete hook
  function GooglePlacesAutocomplete({ value, onChange, disabled }) {
    const {
      ready,
      value: inputValue,
      suggestions: { status, data },
      setValue,
      clearSuggestions,
    } = usePlacesAutocomplete({ debounce: 400 });

    return (
      <Autocomplete
        freeSolo
        disabled={disabled}
        options={status === "OK" ? data.map(option => option.description) : []}
        inputValue={inputValue}
        value={value}
        onInputChange={(_, newInputValue, reason) => {
          setValue(newInputValue);
          if (reason === 'input') {
            onChange(newInputValue);
          }
        }}
        onChange={(_, newValue) => {
          onChange(newValue || '');
          setValue(newValue || '');
          clearSuggestions();
        }}        renderInput={(params) => (
          <TextField 
            {...params} 
            label="Address *" 
            name="address" 
            fullWidth 
            required
            error={editMode && (!value || value.trim() === '')}
            helperText={editMode && (!value || value.trim() === '') ? 'Address is required' : ''}
          />
        )}
      />
    );
  }

  function formatPhoneNumber(value) {
    // Remove all non-digit characters
    const digits = value.replace(/\D/g, '');
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  }

  function formatEmail(value) {
    // Lowercase and trim whitespace
    return value.replace(/\s+/g, '').toLowerCase();
  }

  if (!patient) return <div>Loading patient details...</div>;
  return (
    <Box sx={{ mt: 0, boxShadow: 2, borderRadius: 2, bgcolor: 'background.paper', p: 3 }}>
      {/* Header with BackButton inline */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5">
          Patient Details
        </Typography>
        <BackButton to="/patients" />
      </Box>

      {/* Show profile picture if available */}
      {patient.profile_picture && (
        <div className="mb-3 text-center">
          <img
            src={patient.profile_picture.startsWith('http') ? patient.profile_picture : `http://127.0.0.1:8000${patient.profile_picture}`}
            alt="Profile"
            style={{ width: 120, height: 120, borderRadius: '50%', objectFit: 'cover', border: '2px solid #ccc' }}
          />
        </div>
      )}      {/* Upload profile picture in edit mode */}
      {editMode && (
        <Paper elevation={1} sx={{ p: 3, mb: 3, borderRadius: 2, bgcolor: '#f8f9fa' }}>
          <Typography variant="h6" sx={{ mb: 2, color: 'primary.main' }}>
            Profile Picture
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Button
              variant="outlined"
              component="label"
              sx={{
                textTransform: 'none',
                borderRadius: 2,
                px: 3,
                py: 1.5,
                borderColor: 'primary.main',
                '&:hover': {
                  bgcolor: 'primary.light',
                  borderColor: 'primary.dark',
                },
              }}
            >
              Choose New Picture
              <input
                type="file"
                accept="image/png, image/jpeg"
                hidden
                onChange={async (e) => {
                  const file = e.target.files[0];
                  if (!file) return;
                  const formDataPic = new FormData();
                  formDataPic.append('profile_picture', file);
                  try {
                    const res = await axios.patch(
                      `http://127.0.0.1:8000/api/users/${patient.user_id || patient.id}/`,
                      formDataPic,
                      {
                        headers: {
                          'Content-Type': 'multipart/form-data',
                          Authorization: `Bearer ${token}`,
                        },
                      }
                    );
                    setPatient((prev) => ({ ...prev, profile_picture: res.data.profile_picture }));
                    setFormData((prev) => ({ ...prev, profile_picture: res.data.profile_picture }));
                    alert('Profile picture updated!');
                  } catch (err) {
                    alert('Failed to upload profile picture.');
                  }
                }}
              />
            </Button>
            <Typography variant="body2" color="text.secondary">
              Accepted formats: PNG, JPEG (max 5MB)
            </Typography>
          </Box>
        </Paper>
      )}

      {!showAppointmentForm && (        <form onSubmit={handleSubmit}>
          <Paper elevation={2} sx={{ p: 3, borderRadius: 2 }}>
            <Typography variant="h6" sx={{ mb: 3 }}>Patient Information</Typography>
            
            {/* Two-column grid layout */}
            <Box sx={{ 
              display: 'grid', 
              gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, 
              gap: 3,
              mb: 3 
            }}>
              {/* Left Column */}
              <Stack spacing={3}>
                <TextField
                  label="First Name *"
                  name="first_name"
                  value={formData.first_name || ''}
                  onChange={handleChange}
                  fullWidth
                  required
                  disabled={!editMode}
                  error={editMode && (!formData.first_name || formData.first_name.trim() === '')}
                  helperText={editMode && (!formData.first_name || formData.first_name.trim() === '') ? 'First name is required' : ''}
                  InputProps={!editMode ? { style: { color: '#333', background: '#f5f5f5' } } : {}}
                />
                
                <TextField
                  label="Last Name *"
                  name="last_name"
                  value={formData.last_name || ''}
                  onChange={handleChange}
                  fullWidth
                  required
                  disabled={!editMode}
                  error={editMode && (!formData.last_name || formData.last_name.trim() === '')}
                  helperText={editMode && (!formData.last_name || formData.last_name.trim() === '') ? 'Last name is required' : ''}
                  InputProps={!editMode ? { style: { color: '#333', background: '#f5f5f5' } } : {}}
                />
                
                <TextField
                  label="Username *"
                  name="username"
                  value={formData.username || ''}
                  onChange={handleChange}
                  fullWidth
                  required
                  disabled={!editMode}
                  error={editMode && (!formData.username || formData.username.trim() === '' || formData.username.length < 3)}
                  helperText={editMode && (!formData.username || formData.username.trim() === '') ? 'Username is required' : 
                            editMode && formData.username && formData.username.length < 3 ? 'Username must be at least 3 characters' : ''}
                  InputProps={!editMode ? { style: { color: '#333', background: '#f5f5f5' } } : {}}
                />
                
                <TextField
                  label="Email *"
                  name="email"
                  type="email"
                  value={editMode ? formatEmail(formData.email || '') : (formData.email || '')}
                  onChange={e => {
                    const val = e.target.value;
                    setFormData(prev => ({ ...prev, email: val.replace(/\s+/g, '') }));
                  }}
                  fullWidth
                  required
                  disabled={!editMode}
                  error={editMode && (!formData.email || formData.email.trim() === '' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email))}
                  helperText={editMode && (!formData.email || formData.email.trim() === '') ? 'Email is required' :
                            editMode && formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email) ? 'Invalid email format' : ''}
                  InputProps={!editMode ? { style: { color: '#333', background: '#f5f5f5' } } : {}}
                />
                
                <TextField
                  label="Phone Number *"
                  name="phone_number"
                  value={editMode ? formatPhoneNumber(formData.phone_number || '') : (formData.phone_number || '')}
                  onChange={e => {
                    const raw = e.target.value.replace(/\D/g, '');
                    setFormData(prev => ({ ...prev, phone_number: raw }));
                  }}
                  fullWidth
                  required
                  disabled={!editMode}
                  error={editMode && (!formData.phone_number || formData.phone_number.length === 0 || formData.phone_number.length < 10)}
                  helperText={editMode && (!formData.phone_number || formData.phone_number.length === 0) ? 'Phone number is required' :
                            editMode && formData.phone_number && formData.phone_number.length > 0 && formData.phone_number.length < 10 ? 
                            'Phone number must be at least 10 digits' : editMode ? 'Format: (555) 123-4567' : ''}
                  InputProps={{
                    ...(editMode ? {} : { style: { color: '#333', background: '#f5f5f5' } }),
                    startAdornment: <InputAdornment position="start">📞</InputAdornment>,
                  }}
                />
              </Stack>

              {/* Right Column */}
              <Stack spacing={3}>
                <TextField
                  label="Date of Birth *"
                  name="date_of_birth"
                  type="date"
                  value={formData.date_of_birth || ''}
                  onChange={handleChange}
                  fullWidth
                  required
                  disabled={!editMode}
                  error={editMode && (!formData.date_of_birth || formData.date_of_birth.trim() === '')}
                  helperText={editMode && (!formData.date_of_birth || formData.date_of_birth.trim() === '') ? 'Date of birth is required' : ''}
                  InputLabelProps={{ shrink: true }}
                  InputProps={!editMode ? { style: { color: '#333', background: '#f5f5f5' } } : {}}
                />

                <FormControl fullWidth disabled={!editMode} required>
                  <InputLabel required>Provider *</InputLabel>
                  <MUISelect
                    name="provider"
                    value={formData.provider || ''}
                    onChange={handleChange}
                    label="Provider"
                    required
                    error={editMode && (!formData.provider || formData.provider === '')}
                    sx={!editMode ? { color: '#333', background: '#f5f5f5' } : {}}
                  >
                    <MenuItem value="">Select a provider</MenuItem>
                    {Array.isArray(doctors) && doctors.map((doc) => (
                      <MenuItem key={doc.id} value={doc.id}>
                        Dr. {doc.first_name} {doc.last_name}
                      </MenuItem>
                    ))}
                  </MUISelect>
                  {editMode && (!formData.provider || formData.provider === '') && (
                    <Typography variant="caption" color="error" sx={{ mt: 0.5, ml: 1.5 }}>
                      Provider is required
                    </Typography>
                  )}
                </FormControl>

                <FormControl 
                  fullWidth 
                  disabled={!editMode} 
                  required
                  error={editMode && (!formData.organization || formData.organization === '')}
                >
                  <InputLabel required error={editMode && (!formData.organization || formData.organization === '')}>
                    Organization *
                  </InputLabel>
                  <MUISelect
                    name="organization"
                    value={formData.organization || ''}
                    onChange={handleChange}
                    label="Organization"
                    required
                    error={editMode && (!formData.organization || formData.organization === '')}
                    sx={!editMode ? { color: '#333', background: '#f5f5f5' } : {}}
                  >
                    <MenuItem value="">Select an organization</MenuItem>
                    {organizations.map((org) => (
                      <MenuItem key={org.id} value={org.id}>{org.name}</MenuItem>
                    ))}
                  </MUISelect>
                  {editMode && (!formData.organization || formData.organization === '') && (
                    <Typography variant="caption" color="error" sx={{ mt: 0.5, ml: 1.5 }}>
                      Organization is required
                    </Typography>
                  )}
                </FormControl>

                {editMode ? (
                  <GooglePlacesAutocomplete
                    value={formData.address || ''}
                    onChange={val => setFormData(prev => ({ ...prev, address: val }))}
                    disabled={!editMode}
                  />
                ) : (
                  <TextField
                    label="Address *"
                    name="address"
                    value={formData.address || ''}
                    fullWidth
                    required
                    disabled
                    InputProps={{ style: { color: '#333', background: '#f5f5f5' } }}
                  />
                )}
              </Stack>
            </Box>

            {/* Medical History - Full Width */}
            <TextField
              label="Notes (Optional)"
              name="medical_history"
              value={formData.medical_history || ''}
              onChange={handleChange}
              fullWidth
              disabled={!editMode}
              multiline
              rows={4}
              helperText={editMode ? 'Optional - medical history, allergies, or other notes' : ''}
              InputProps={!editMode ? { style: { color: '#333', background: '#f5f5f5' } } : {}}
              sx={{ mb: 2 }}
            />

            <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
              {editMode ? (
                <>
                  <Button variant="contained" color="primary" type="submit">
                    Save
                  </Button>
                  <Button
                    variant="outlined"
                    color="secondary"
                    onClick={() => {
                      setEditMode(false);
                      setFormData(patient);
                    }}
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <Button
                  variant="outlined"
                  color="warning"
                  onClick={() => setEditMode(true)}
                >
                  Edit
                </Button>
              )}

              <Button
                variant="contained"
                color="success"
                onClick={() => setShowAppointmentForm(true)}
              >
                Create Appointment
              </Button>
            </Stack>
          </Paper>
        </form>
      )}

      {showAppointmentForm && (
        <div className="mt-4">
          <CreateAppointmentForm
            defaultProviderId={patient.provider}
            patientName={`${patient.first_name} ${patient.last_name}`}
            patientId={patient.user_id}
            appointmentToEdit={null}
            onSuccess={() => {
              setShowAppointmentForm(false);
              navigate('/patients');
            }}
          />
        </div>
      )}
    </Box>
  );
}

export default PatientDetailPage;
