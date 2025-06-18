import React, { useState, useEffect } from 'react';
import {
  Box,
  Stack,
  Typography,
  TextField,
  IconButton,
  Tooltip,
  Paper,
  FormControl,
  InputLabel,
  Select as MUISelect,
  MenuItem,
  FormControlLabel,
  Checkbox
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import CancelIcon from '@mui/icons-material/Cancel';
import DeleteIcon from '@mui/icons-material/Delete';
import { toast } from 'react-toastify';
import axios from 'axios';
import { getValidToken, clearAuthData } from '../utils/auth';

function PatientInfoPanel({
  patientData,
  onPatientUpdate,
  onPatientDelete,
  showDeleteButton = true,
  doctors = [],
  organizations = [],
  currentUserOrganization = null,
  currentUserRole = null // Add currentUserRole prop
}) {
  const [editMode, setEditMode] = useState(false);
  const [patientEditData, setPatientEditData] = useState(patientData || {});
  const [emailError, setEmailError] = useState('');

  // Update patientEditData when patientData prop changes
  useEffect(() => {
    if (patientData) {
      setPatientEditData(patientData);
    }
  }, [patientData]);

  // Email validation function
  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // Format phone number for display
  const formatPhoneNumber = (phone) => {
    if (!phone) return '';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length >= 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6, 10)}`;
    }
    return phone;
  };

  const handlePatientEditChange = (e) => {
    const { name, value } = e.target;
    
    // Validate email format when email field changes in edit mode
    if (name === 'email') {
      if (value && !validateEmail(value)) {
        setEmailError('Please enter a valid email address');
      } else {
        setEmailError('');
      }
    }
    
    setPatientEditData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handlePatientEdit = () => {
    // Set default organization if not already set (empty string, null, or undefined)
    if (currentUserOrganization && (!patientEditData.organization || patientEditData.organization === '')) {
      setPatientEditData(prev => ({
        ...prev,
        organization: currentUserOrganization.id
      }));
    }
    setEditMode(true);
  };
  const handlePatientSave = async () => {
    // Validate email before saving
    if (!patientEditData.email) {
      toast.error("Email is required.");
      return;
    }
    
    if (!validateEmail(patientEditData.email)) {
      toast.error("Please enter a valid email address.");
      return;
    }
    
    try {
      const token = await getValidToken();
      if (!token) {
        toast.error('Session expired. Please log in again.');
        clearAuthData();
        return;
      }

      const updateData = {
        ...patientEditData,
        provider_id: patientEditData.provider
      };

      // Use different endpoints based on user role
      if (currentUserRole === 'patient') {
        // For patient users, update their own profile via user endpoint
        await axios.patch(
          `http://127.0.0.1:8000/api/users/${patientData.id}/`, 
          updateData,
          { headers: { Authorization: `Bearer ${token}` } }
        );
      } else {
        // For admin/staff users, use the patient-specific endpoint
        await axios.put(
          `http://127.0.0.1:8000/api/users/patients/by-user/${patientData.user_id || patientData.id}/edit/`, 
          updateData,
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }
      
      setEditMode(false);
      toast.success('Patient information updated successfully!');
      
      // Call the update callback to refresh data
      if (onPatientUpdate) {
        onPatientUpdate(patientEditData);
      }
    } catch (error) {
      console.error('Update error:', error);
      toast.error('Failed to update patient information.');
    }
  };

  const handlePatientCancel = () => {
    setPatientEditData(patientData);
    setEditMode(false);
    setEmailError('');
  };

  if (!patientData) {
    return (
      <Paper 
        elevation={4} 
        sx={{ 
          p: 4, 
          borderRadius: 3, 
          minHeight: '70vh',
          height: '100%',
          bgcolor: 'grey.100',
          opacity: 0.7
        }}
      >
        <Typography variant="h5" fontWeight={700} color="text.secondary" sx={{ mb: 3 }}>
          Patient Information
        </Typography>
        <Typography variant="body1" color="text.secondary">
          No patient information available.
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper 
      elevation={4} 
      sx={{ 
        p: 4, 
        borderRadius: 3, 
        minHeight: '70vh',
        height: '100%',
        bgcolor: 'background.paper'
      }}
    >      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" fontWeight={700} color="primary.main">
          {currentUserRole === 'patient' ? 'Details' : 'Patient Information'}
        </Typography>
        
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
          {showDeleteButton && (
            <Tooltip title="Delete Patient">
              <IconButton onClick={onPatientDelete} color="error" size="small">
                <DeleteIcon />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Box>

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
            required
            disabled={!editMode}
            error={editMode && !!emailError}
            helperText={editMode ? emailError : ''}
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
        />        <TextField
          label="Notes / Medical History"
          name="medical_history"
          value={patientEditData.medical_history || ''}
          onChange={handlePatientEditChange}
          fullWidth
          multiline
          rows={3}
          disabled={!editMode}
          InputProps={!editMode ? { style: { color: '#333', background: '#f5f5f5' } } : {}}
        />

        {/* SMS Consent Checkbox */}
        <Box sx={{ mt: 2, p: 2, bgcolor: '#f8f9fa', borderRadius: 2, border: '1px solid #e0e0e0' }}>
          <FormControlLabel
            control={
              <Checkbox
                name="sms_consent"
                checked={patientEditData.sms_consent || false}
                onChange={(e) => setPatientEditData(prev => ({
                  ...prev,
                  sms_consent: e.target.checked
                }))}
                disabled={!editMode}
                color="primary"
              />
            }
            label={
              <Typography variant="body2" sx={{ color: '#555', lineHeight: 1.4 }}>
                By providing your phone number, you agree to receive text messages from POWER Healthcare IT Systems, LLC regarding appointment reminders and notifications. Message frequency varies. Message and data rates may apply.
              </Typography>
            }
            sx={{ alignItems: 'flex-start', margin: 0 }}
          />
        </Box>
      </Stack>
    </Paper>
  );
}

export default PatientInfoPanel;
