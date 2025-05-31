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
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.put(`http://127.0.0.1:8000/api/users/patients/by-user/${id}/edit/`, formData, {
        headers: { Authorization: `Bearer ${token}` },
      });
      alert('Patient updated successfully!');
      setEditMode(false);
      setPatient(formData);
    } catch (err) {
      console.error('Update error:', err);
      alert('Failed to update patient.');
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
        }}
        renderInput={(params) => (
          <TextField {...params} label="Address" name="address" fullWidth />
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
    <Box sx={{ mt: 0, boxShadow: 2, borderRadius: 2, bgcolor: 'background.paper', p: 3 }}>      <BackButton to="/patients" />
      <Typography variant="h5" sx={{ mb: 2 }}>
        Patient Details
      </Typography>

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

      {!showAppointmentForm && (
        <form onSubmit={handleSubmit}>
          <Paper elevation={2} sx={{ p: 3, borderRadius: 2 }}>
            <Stack spacing={3}>
              <Typography variant="h6">Patient Information</Typography>
              <TextField
                label="First Name"
                name="first_name"
                value={formData.first_name || ''}
                onChange={handleChange}
                fullWidth
                disabled={!editMode}
                InputProps={!editMode ? { style: { color: '#333', background: '#f5f5f5' } } : {}}
              />
              <TextField
                label="Last Name"
                name="last_name"
                value={formData.last_name || ''}
                onChange={handleChange}
                fullWidth
                disabled={!editMode}
                InputProps={!editMode ? { style: { color: '#333', background: '#f5f5f5' } } : {}}
              />
              <TextField
                label="Username"
                name="username"
                value={formData.username || ''}
                onChange={handleChange}
                fullWidth
                disabled={!editMode}
                InputProps={!editMode ? { style: { color: '#333', background: '#f5f5f5' } } : {}}
              />
              <TextField
                label="Email"
                name="email"
                type="email"
                value={editMode ? formatEmail(formData.email || '') : (formData.email || '')}
                onChange={e => {
                  const val = e.target.value;
                  setFormData(prev => ({ ...prev, email: val.replace(/\s+/g, '') }));
                }}
                fullWidth
                disabled={!editMode}
                InputProps={!editMode ? { style: { color: '#333', background: '#f5f5f5' } } : {}}
              />
              <FormControl fullWidth disabled={!editMode}>
                <InputLabel>Provider</InputLabel>
                <MUISelect
                  name="provider"
                  value={formData.provider || ''}
                  onChange={handleChange}
                  label="Provider"
                  sx={!editMode ? { color: '#333', background: '#f5f5f5' } : {}}
                >
                  <MenuItem value="">Select a provider</MenuItem>
                  {Array.isArray(doctors) && doctors.map((doc) => (
                    <MenuItem key={doc.id} value={doc.id}>
                      Dr. {doc.first_name} {doc.last_name}
                    </MenuItem>
                  ))}
                </MUISelect>
              </FormControl>

              {/* Organization Selection */}
              <FormControl fullWidth disabled={!editMode} sx={{ mt: 1 }}>
                <InputLabel>Organization</InputLabel>
                <MUISelect
                  name="organization"
                  value={formData.organization || ''}
                  onChange={handleChange}
                  label="Organization"
                  sx={!editMode ? { color: '#333', background: '#f5f5f5' } : {}}
                >
                  <MenuItem value="">Select an organization</MenuItem>
                  {organizations.map((org) => (
                    <MenuItem key={org.id} value={org.id}>{org.name}</MenuItem>
                  ))}
                </MUISelect>
              </FormControl>

              <TextField
                label="Phone Number"
                name="phone_number"
                value={editMode ? formatPhoneNumber(formData.phone_number || '') : (formData.phone_number || '')}
                onChange={e => {
                  const raw = e.target.value.replace(/\D/g, '');
                  setFormData(prev => ({ ...prev, phone_number: raw }));
                }}
                fullWidth
                disabled={!editMode}
                InputProps={{
                  ...(editMode ? {} : { style: { color: '#333', background: '#f5f5f5' } }),
                  startAdornment: <InputAdornment position="start">📞</InputAdornment>,
                }}
              />
              <TextField
                label="Date of Birth"
                name="date_of_birth"
                type="date"
                value={formData.date_of_birth || ''}
                onChange={handleChange}
                fullWidth
                disabled={!editMode}
                InputLabelProps={{ shrink: true }}
                InputProps={!editMode ? { style: { color: '#333', background: '#f5f5f5' } } : {}}
              />
              {editMode ? (
                <GooglePlacesAutocomplete
                  value={formData.address || ''}
                  onChange={val => setFormData(prev => ({ ...prev, address: val }))}
                  disabled={!editMode}
                />
              ) : (
                <TextField
                  label="Address"
                  name="address"
                  value={formData.address || ''}
                  fullWidth
                  disabled
                  InputProps={{ style: { color: '#333', background: '#f5f5f5' } }}
                />
              )}
              <TextField
                label="Notes"
                name="medical_history"
                value={formData.medical_history || ''}
                onChange={handleChange}
                fullWidth
                disabled={!editMode}
                multiline
                rows={4}
                InputProps={!editMode ? { style: { color: '#333', background: '#f5f5f5' } } : {}}
              />
            </Stack>

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
