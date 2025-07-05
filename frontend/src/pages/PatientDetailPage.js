import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import CreateAppointmentForm from '../components/CreateAppointmentForm';
import {
  Box,
  Stack,
  Typography,
  Button,
  TextField,
  Paper,
  MenuItem,
  FormControl,
  InputLabel,
  Select as MUISelect,
} from '@mui/material';
import { jwtDecode } from 'jwt-decode';
import BackButton from '../components/BackButton';
import InputAdornment from '@mui/material/InputAdornment';
import { toast } from '../components/SimpleToast';

function PatientDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [patient, setPatient] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [showAppointmentForm, setShowAppointmentForm] = useState(false);
  const [formData, setFormData] = useState({});
  const [doctors, setDoctors] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [addressSuggestions, setAddressSuggestions] = useState([]);
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

  const handleResetPassword = async () => {
    if (!patient || !patient.email) {
      toast.error('Patient email not found. Cannot reset password.');
      return;
    }

    // Get admin password for verification
    const adminPassword = window.prompt(
      `To reset the password for ${patient.first_name} ${patient.last_name}, please enter your admin password:`
    );

    if (!adminPassword) {
      return; // User cancelled
    }

    // Generate a temporary password
    const tempPassword = `Temp${Math.random().toString(36).slice(2, 8)}!`;    // Confirm action with user
    const confirmed = window.confirm(
      `Are you sure you want to reset the password for ${patient.first_name} ${patient.last_name}?\n\n` +
      `New temporary password: ${tempPassword}\n\n` +
      `This temporary password will be sent via email to the client. Provide it to them if access to email is not available and instruct them to change it immediately after logging in.`
    );

    if (!confirmed) return;

    try {
      // First, send the email with the temporary password
      await axios.post(
        'http://127.0.0.1:8000/api/users/send-email/',
        {
          email: patient.email,
          subject: 'Password Reset - POWER Healthcare IT Systems',
          message: `Dear ${patient.first_name} ${patient.last_name},\n\nYour password has been reset by an administrator.\n\nTemporary password: ${tempPassword}\n\nPlease log in with this temporary password and change it immediately in your account settings.\n\nIf you did not request this password reset, please contact your healthcare provider immediately.\n\nBest regards,\nPOWER Healthcare IT Systems`
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      // Then change the password in the system
      await axios.post(
        'http://127.0.0.1:8000/api/users/admin-change-password/',
        {
          target_user_id: patient.user_id || patient.id,
          admin_password: adminPassword,
          new_password: tempPassword,
          confirm_password: tempPassword
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      toast.success(
        `🔑 Password reset successfully!\n\n` +
        `Temporary password: ${tempPassword}\n\n` +
        `An email with the temporary password has been sent to ${patient.email}. The patient should check their email and log in with the temporary password to change it immediately.`,
        {
          autoClose: 12000 // Give time to read the message
        }
      );

    } catch (err) {
      console.error('Password reset error:', err);

      // Check if this is an email error or password change error
      if (err.config?.url?.includes('send-email')) {
        // Email failed, but try to continue with password reset
        toast.warning('Failed to send email notification. Continuing with password reset...');

        try {
          await axios.post(
            'http://127.0.0.1:8000/api/users/admin-change-password/',
            {
              target_user_id: patient.user_id || patient.id,
              admin_password: adminPassword,
              new_password: tempPassword,
              confirm_password: tempPassword
            },
            {
              headers: { Authorization: `Bearer ${token}` }
            }
          );

          toast.success(
            `🔑 Password reset successfully!\n\n` +
            `Temporary password: ${tempPassword}\n\n` +
            `⚠️ Email delivery failed. Please provide this temporary password to ${patient.first_name} ${patient.last_name} manually and instruct them to change it immediately after logging in.`,
            {
              autoClose: 15000
            }
          );
        } catch (passwordErr) {
          console.error('Password change also failed:', passwordErr);
          toast.error('Both email delivery and password reset failed. Please try again.');
        }
      } else {
        // Password change error
        if (err.response?.status === 403) {
          toast.error('You do not have permission to reset patient passwords.');
        } else if (err.response?.status === 400) {
          if (err.response.data?.detail?.includes('Admin password is incorrect')) {
            toast.error('Incorrect admin password. Please try again.');
          } else {
            toast.error(`Password reset failed: ${err.response.data?.detail || 'Invalid request data'}`);
          }
        } else if (err.response?.status === 404) {
          toast.error('Patient not found.');
        } else if (err.response?.data?.detail) {
          toast.error(`Password reset failed: ${err.response.data.detail}`);
        } else {
          toast.error('Failed to reset password. Please try again later.');
        }
      }
    }
  };

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
  }; const handleSubmit = async (e) => {
    e.preventDefault();    // Comprehensive field validation
    const errors = []; const requiredFields = [
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
      toast.error(
        <div>
          <strong>Please fix the following issues:</strong>
          <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
            {errors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        </div>,
        {
          autoClose: 8000, // Give users time to read the list
          hideProgressBar: false,
        }
      );
      return;
    }// Clone the formData and add provider_id if provider is present
    const dataToSend = { ...formData };
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
      toast.success('Patient updated successfully! 🎉');
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
          toast.error(
            <div>
              <strong>Update failed due to the following issues:</strong>
              <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
                {backendErrors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </div>,
            {
              autoClose: 10000, // Give users time to read backend errors
              hideProgressBar: false,
            }
          );
        } else if (typeof errorData === 'string') {
          toast.error(`Update failed: ${errorData}`);
        } else if (errorData.detail) {
          toast.error(`Update failed: ${errorData.detail}`);
        }
      } else if (err.response?.status === 400) {
        toast.error('Update failed: Invalid data provided. Please check all fields and try again.');
      } else if (err.response?.status === 401) {
        toast.error('Update failed: You are not authorized to perform this action.');
      } else if (err.response?.status === 404) {
        toast.error('Update failed: Patient not found.');
      } else if (err.response?.status >= 500) {
        toast.error('Update failed: Server error. Please try again later.');
      } else if (err.code === 'NETWORK_ERROR' || !err.response) {
        toast.error('Update failed: Network error. Please check your connection and try again.');
      }

      // Fallback error message if none of the above conditions match
      if (!err.response?.data && err.response?.status < 500 && err.code !== 'NETWORK_ERROR') {
        toast.error(errorMessage);
      }
    }
  };

  // Simple address validation without Google Places API
  const getAddressSuggestions = (input) => {
    console.log('getAddressSuggestions called with input:', input);
    
    if (!input || input.length < 2) {
      console.log('Input too short, clearing suggestions');
      setAddressSuggestions([]);
      return;
    }

    try {
      const suggestions = [];
      const inputLower = input.toLowerCase().trim();
      console.log('Processing input:', inputLower);

      // Common street suffixes
      const streetTypes = ['Street', 'St', 'Avenue', 'Ave', 'Boulevard', 'Blvd', 'Drive', 'Dr', 'Lane', 'Ln', 'Road', 'Rd', 'Way', 'Circle', 'Ct', 'Court', 'Place', 'Pl'];

      // Check if input already contains numbers (likely partial address)
      const hasNumbers = /\d/.test(input);
      console.log('Input has numbers:', hasNumbers);

      if (hasNumbers) {
        // Input has numbers - suggest completing with different street types
        const hasStreetType = streetTypes.some(type =>
          inputLower.includes(type.toLowerCase())
        );

        if (!hasStreetType) {
          // Add common street types
          streetTypes.slice(0, 6).forEach(type => {
            suggestions.push(`${input} ${type}`);
          });
          console.log('Added street type suggestions:', suggestions);
        } else {
          // Already has street type, suggest with common city suffixes
          suggestions.push(`${input}, New York, NY`);
          suggestions.push(`${input}, Los Angeles, CA`);
          suggestions.push(`${input}, Chicago, IL`);
          suggestions.push(`${input}, Houston, TX`);
          suggestions.push(`${input}, Phoenix, AZ`);
          suggestions.push(`${input}, Philadelphia, PA`);
          console.log('Added city suffix suggestions:', suggestions);
        }
      } else {
        // Input doesn't have numbers - suggest adding house numbers
        const commonNumbers = ['123', '456', '789', '101', '202', '555'];
        const commonTypes = ['Street', 'Avenue', 'Drive', 'Lane'];

        commonNumbers.slice(0, 3).forEach(num => {
          commonTypes.slice(0, 2).forEach(type => {
            suggestions.push(`${num} ${input} ${type}`);
          });
        });
        console.log('Added house number suggestions:', suggestions);
      }

      // Limit to 6 suggestions and ensure uniqueness
      const uniqueSuggestions = [...new Set(suggestions)].slice(0, 6);
      console.log('Final unique suggestions:', uniqueSuggestions);

      const formattedSuggestions = uniqueSuggestions.map((addr, index) => ({
        description: addr,
        placeId: `suggestion-${index}-${Date.now()}`
      }));
      
      console.log('Setting formatted suggestions:', formattedSuggestions);
      setAddressSuggestions(formattedSuggestions);
      
    } catch (error) {
      console.error('Error generating address suggestions:', error);
      setAddressSuggestions([]);
    }
  };
  // Simple Address Autocomplete component using native HTML input with datalist
  function SimpleAddressAutocomplete({ value, onChange, disabled }) {
    const debounceTimerRef = useRef(null);
    const datalistId = `address-suggestions-${Math.random().toString(36).substr(2, 9)}`;

    // Move address suggestion generation inside the component
    const generateAddressSuggestions = (input) => {
      console.log('generateAddressSuggestions called with input:', input);
      
      if (!input || input.length < 2) {
        console.log('Input too short, clearing suggestions');
        setAddressSuggestions([]);
        return;
      }

      try {
        const suggestions = [];
        const inputLower = input.toLowerCase().trim();
        console.log('Processing input:', inputLower);

        // Common street suffixes
        const streetTypes = ['Street', 'St', 'Avenue', 'Ave', 'Boulevard', 'Blvd', 'Drive', 'Dr', 'Lane', 'Ln', 'Road', 'Rd', 'Way', 'Circle', 'Ct', 'Court', 'Place', 'Pl'];

        // Check if input already contains numbers (likely partial address)
        const hasNumbers = /\d/.test(input);
        console.log('Input has numbers:', hasNumbers);

        if (hasNumbers) {
          // Input has numbers - suggest completing with different street types
          const hasStreetType = streetTypes.some(type =>
            inputLower.includes(type.toLowerCase())
          );

          if (!hasStreetType) {
            // Add common street types
            streetTypes.slice(0, 6).forEach(type => {
              suggestions.push(`${input} ${type}`);
            });
            console.log('Added street type suggestions:', suggestions);
          } else {
            // Already has street type, suggest with common city suffixes
            suggestions.push(`${input}, New York, NY`);
            suggestions.push(`${input}, Los Angeles, CA`);
            suggestions.push(`${input}, Chicago, IL`);
            suggestions.push(`${input}, Houston, TX`);
            suggestions.push(`${input}, Phoenix, AZ`);
            suggestions.push(`${input}, Philadelphia, PA`);
            console.log('Added city suffix suggestions:', suggestions);
          }
        } else {
          // Input doesn't have numbers - suggest adding house numbers
          const commonNumbers = ['123', '456', '789', '101', '202', '555'];
          const commonTypes = ['Street', 'Avenue', 'Drive', 'Lane'];

          commonNumbers.slice(0, 3).forEach(num => {
            commonTypes.slice(0, 2).forEach(type => {
              suggestions.push(`${num} ${input} ${type}`);
            });
          });
          console.log('Added house number suggestions:', suggestions);
        }

        // Limit to 6 suggestions and ensure uniqueness
        const uniqueSuggestions = [...new Set(suggestions)].slice(0, 6);
        console.log('Final unique suggestions:', uniqueSuggestions);

        const formattedSuggestions = uniqueSuggestions.map((addr, index) => ({
          description: addr,
          placeId: `suggestion-${index}-${Date.now()}`
        }));
        
        console.log('Setting formatted suggestions:', formattedSuggestions);
        setAddressSuggestions(formattedSuggestions);
        
      } catch (error) {
        console.error('Error generating address suggestions:', error);
        setAddressSuggestions([]);
      }
    };

    const handleInputChange = (event) => {
      const newValue = event.target.value;
      onChange(newValue);

      // Clear existing timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // Generate suggestions with debouncing
      if (newValue && newValue.length > 2) {
        console.log('Generating suggestions for:', newValue);
        debounceTimerRef.current = setTimeout(() => {
          generateAddressSuggestions(newValue);
        }, 300);
      } else {
        setAddressSuggestions([]);
      }
    };

    // Cleanup timer on unmount
    useEffect(() => {
      return () => {
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }
      };
    }, []);

    console.log('Current addressSuggestions:', addressSuggestions);

    return (
      <Box>
        <Box sx={{ mb: 1 }}>
          <Typography variant="body2" component="label" sx={{ color: 'rgba(0, 0, 0, 0.6)', fontSize: '0.75rem' }}>
            Address *
          </Typography>
        </Box>
        <input
          type="text"
          value={value || ''}
          onChange={handleInputChange}
          disabled={disabled}
          list={datalistId}
          autoComplete="off"
          placeholder="Type your address..."
          style={{
            width: '100%',
            padding: '16.5px 14px',
            border: (!disabled && (!value || value.trim() === '')) ? '2px solid #d32f2f' : '1px solid rgba(0, 0, 0, 0.23)',
            borderRadius: '4px',
            fontSize: '16px',
            fontFamily: 'inherit',
            outline: 'none',
            backgroundColor: disabled ? '#f5f5f5' : 'white',
            '&:focus': {
              borderColor: '#1976d2',
              borderWidth: '2px'
            }
          }}
          onFocus={(e) => {
            e.target.style.borderColor = '#1976d2';
            e.target.style.borderWidth = '2px';
          }}
          onBlur={(e) => {
            e.target.style.borderColor = (!disabled && (!value || value.trim() === '')) ? '#d32f2f' : 'rgba(0, 0, 0, 0.23)';
            e.target.style.borderWidth = (!disabled && (!value || value.trim() === '')) ? '2px' : '1px';
          }}
        />
        <datalist id={datalistId}>
          {addressSuggestions.map((suggestion, index) => {
            const optionValue = typeof suggestion === 'string' ? suggestion : suggestion.description;
            console.log('Rendering option:', optionValue);
            return (
              <option 
                key={typeof suggestion === 'string' ? suggestion : suggestion.placeId} 
                value={optionValue}
              />
            );
          })}
        </datalist>
        <Box sx={{ mt: 0.5 }}>
          <Typography variant="caption" color={(!disabled && (!value || value.trim() === '')) ? 'error' : 'text.secondary'}>
            {!disabled && (!value || value.trim() === '') ? 'Address is required' : `Type to see suggestions (3+ characters) - ${addressSuggestions.length} suggestions available`}
          </Typography>
        </Box>
      </Box>
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
                    ); setPatient((prev) => ({ ...prev, profile_picture: res.data.profile_picture }));
                    setFormData((prev) => ({ ...prev, profile_picture: res.data.profile_picture }));
                    toast.success('Profile picture updated successfully! 📸');
                  } catch (err) {
                    console.error('Profile picture upload error:', err);
                    toast.error('Failed to upload profile picture. Please try again.');
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

      {!showAppointmentForm && (<form onSubmit={handleSubmit}>
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
                <SimpleAddressAutocomplete
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
            )}              <Button
              variant="contained"
              color="success"
              onClick={() => setShowAppointmentForm(true)}
            >
              Create Appointment
            </Button>

            <Button
              variant="outlined"
              color="warning"
              onClick={handleResetPassword}
              sx={{
                borderColor: '#ff9800',
                color: '#ff9800',
                '&:hover': {
                  borderColor: '#f57c00',
                  backgroundColor: '#fff3e0'
                }
              }}
            >
              Reset Password
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
            }} />
        </div>
      )}
    </Box>
  );
}

export default PatientDetailPage;
