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

function PatientDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [patient, setPatient] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [showAppointmentForm, setShowAppointmentForm] = useState(false);
  const [formData, setFormData] = useState({});
  const [doctors, setDoctors] = useState([]);
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

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
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
      )}

      {/* Upload profile picture in edit mode */}
      {editMode && (
        <div className="mb-3">
          <label className="form-label">Upload Profile Picture</label>
          <input
            type="file"
            accept="image/png, image/jpeg"
            className="form-control"
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
        </div>
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
                value={formData.email || ''}
                onChange={handleChange}
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
              <TextField
                label="Phone Number"
                name="phone_number"
                value={formData.phone_number || ''}
                onChange={handleChange}
                fullWidth
                disabled={!editMode}
                InputProps={!editMode ? { style: { color: '#333', background: '#f5f5f5' } } : {}}
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
              <TextField
                label="Address"
                name="address"
                value={formData.address || ''}
                onChange={handleChange}
                fullWidth
                disabled={!editMode}
                InputProps={!editMode ? { style: { color: '#333', background: '#f5f5f5' } } : {}}
              />
              <TextField
                label="Medical History"
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
