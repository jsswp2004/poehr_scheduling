import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faDownload, faUpload } from '@fortawesome/free-solid-svg-icons';
import {
  Table, TableHead, TableRow, TableCell, TableBody,
  Button, Stack, Alert, TextField, IconButton, Tooltip, Box, Typography
} from '@mui/material';
import axios from 'axios';
import { API_BASE_URL } from '../config/api';

function UploadTab() {
  const [file, setFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState('');
  const [providerFile, setProviderFile] = useState(null);
  const [providerUploadStatus, setProviderUploadStatus] = useState('');
  const [availabilityFile, setAvailabilityFile] = useState(null);
  const [availabilityUploadStatus, setAvailabilityUploadStatus] = useState('');
  const [patientFile, setPatientFile] = useState(null);
  const [patientUploadStatus, setPatientUploadStatus] = useState('');
  const token = localStorage.getItem('access_token');

  const triggerDownload = (blob, filename) => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    setTimeout(() => {
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    }, 0);
  };

  const handleDownload = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/upload/clinic-events/template/`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
      });
      triggerDownload(new Blob([response.data]), 'clinic_events_template.csv');
      setUploadStatus('');
    } catch (err) {
      setUploadStatus('❌ Download failed.');
      console.error(err);
    }
  };

  const handleUpload = async () => {
    if (!file) return setUploadStatus('❌ Please select a file to upload.');
    const formData = new FormData();
    formData.append('file', file);
    try {
      await axios.post(`${API_BASE_URL}/api/upload/clinic-events/`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
      });
      setUploadStatus('✅ Upload successful.');
    } catch (err) {
      console.error('Upload error details:', err);
      console.error('Error response:', err.response?.data);
      console.error('Error status:', err.response?.status);
      setUploadStatus(`❌ Upload failed: ${err.response?.data?.error || err.response?.data?.message || err.message}`);
    }
  };

  const handleProviderDownload = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/users/providers/download-template/`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
      });
      triggerDownload(new Blob([response.data]), 'providers_template.csv');
      setProviderUploadStatus('');
    } catch (err) {
      setProviderUploadStatus('❌ Download failed.');
      console.error(err);
    }
  };

  const handleProviderUpload = async () => {
    if (!providerFile) return setProviderUploadStatus('❌ Please select a file to upload.');
    const formData = new FormData();
    formData.append('file', providerFile);
    try {
      await axios.post(`${API_BASE_URL}/api/users/providers/upload-csv/`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
      });
      setProviderUploadStatus('✅ Upload successful.');
    } catch (err) {
      console.error('Provider upload error:', err);
      console.error('Error response:', err.response?.data);
      setProviderUploadStatus(`❌ Upload failed: ${err.response?.data?.error || err.response?.data?.message || err.message}`);
    }
  };

  const handleAvailabilityDownload = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/upload/availability/template/`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
      });
      triggerDownload(new Blob([response.data]), 'availability_template.csv');
      setAvailabilityUploadStatus('');
    } catch (err) {
      setAvailabilityUploadStatus('❌ Download failed.');
      console.error(err);
    }
  };

  const handleAvailabilityUpload = async () => {
    if (!availabilityFile) return setAvailabilityUploadStatus('❌ Please select a file to upload.');
    const formData = new FormData();
    formData.append('file', availabilityFile);
    try {
      await axios.post(`${API_BASE_URL}/api/upload/availability/`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
      });
      setAvailabilityUploadStatus('✅ Upload successful.');
    } catch (err) {
      console.error('Availability upload error:', err);
      console.error('Error response:', err.response?.data);
      setAvailabilityUploadStatus(`❌ Upload failed: ${err.response?.data?.error || err.response?.data?.message || err.message}`);
    }
  };

  const handlePatientDownload = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/users/patients/download-template/`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
      });
      triggerDownload(new Blob([response.data]), 'patients_template.csv');
      setPatientUploadStatus('');
    } catch (err) {
      setPatientUploadStatus('❌ Download failed.');
      console.error(err);
    }
  };

  const handlePatientUpload = async () => {
    if (!patientFile) return setPatientUploadStatus('❌ Please select a file to upload.');
    const formData = new FormData();
    formData.append('file', patientFile);
    try {
      await axios.post(`${API_BASE_URL}/api/users/patients/upload-csv/`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
      });
      setPatientUploadStatus('✅ Upload successful.');
    } catch (err) {
      console.error('Patient upload error:', err);
      console.error('Error response:', err.response?.data);
      setPatientUploadStatus(`❌ Upload failed: ${err.response?.data?.error || err.response?.data?.message || err.message}`);
    }
  };

  return (
    <Box
      sx={{
        height: "calc(100vh - 240px)", // Adjust for header height
      }}
    >
      <Table size="small" stickyHeader sx={{ bgcolor: '#f5faff', borderRadius: 2, boxShadow: 1, mt: 3 }}>
        <TableHead>
          <TableRow sx={{ bgcolor: '#e3f2fd' }}>
            <TableCell sx={{ fontWeight: 'bold', width: 200 }}>Items</TableCell>
            <TableCell sx={{ fontWeight: 'bold', width: 400 }}>Description</TableCell>
            <TableCell sx={{ fontWeight: 'bold', width: 300 }}>Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {/* Clinic Events */}
          <TableRow sx={{ '&:nth-of-type(odd)': { bgcolor: '#f0f4ff' } }}>
            <TableCell>Clinic Events</TableCell>
            <TableCell>
              <Typography variant="body2" sx={{ mb: 1, fontWeight: 500 }}>
                Upload your organization's scheduled events, appointments, and clinic sessions.
              </Typography>
              <Typography variant="body2" sx={{ mb: 1, fontStyle: 'italic', color: 'text.secondary' }}>
                <strong>Examples:</strong> Regular appointments, group sessions, special events, recurring meetings
              </Typography>
              <Typography variant="body2" sx={{ color: 'primary.main' }}>
                <strong>Instructions:</strong> 1. Download the template 2. Fill in event details (date, time, type, provider) 3. Upload the completed CSV file
              </Typography>
            </TableCell>
            <TableCell>
              <Stack direction="row" spacing={2} alignItems="center">
                <Tooltip title="Download Template">
                  <IconButton color="primary" onClick={handleDownload} sx={{ width: 40, height: 40 }}>
                    <FontAwesomeIcon icon={faDownload} />
                  </IconButton>
                </Tooltip>
                <TextField
                  type="file"
                  inputProps={{ accept: '.csv' }}
                  onChange={e => setFile(e.target.files[0])}
                  size="small"
                  sx={{ minWidth: 180 }}
                />
                <Tooltip title="Upload CSV">
                  <IconButton color="success" onClick={handleUpload} sx={{ width: 40, height: 40 }}>
                    <FontAwesomeIcon icon={faUpload} />
                  </IconButton>
                </Tooltip>
              </Stack>
            </TableCell>
          </TableRow>

          {/* Providers / Staff */}
          <TableRow sx={{ '&:nth-of-type(even)': { bgcolor: '#f8fafd' } }}>
            <TableCell>Providers / Staff</TableCell>
            <TableCell>
              <Typography variant="body2" sx={{ mb: 1, fontWeight: 500 }}>
                Add your healthcare providers and staff members to the system.
              </Typography>
              <Typography variant="body2" sx={{ mb: 1, fontStyle: 'italic', color: 'text.secondary' }}>
                <strong>Examples:</strong> Doctors, nurses, therapists, administrative staff, specialists
              </Typography>
              <Typography variant="body2" sx={{ color: 'primary.main' }}>
                <strong>Instructions:</strong> 1. Download the template 2. Enter staff details (name, role, specialization, contact info) 3. Upload the completed CSV file
              </Typography>
            </TableCell>
            <TableCell>
              <Stack direction="row" spacing={2} alignItems="center">
                <Tooltip title="Download Template">
                  <IconButton color="primary" onClick={handleProviderDownload} sx={{ width: 40, height: 40 }}>
                    <FontAwesomeIcon icon={faDownload} />
                  </IconButton>
                </Tooltip>
                <TextField
                  type="file"
                  inputProps={{ accept: '.csv' }}
                  onChange={e => setProviderFile(e.target.files[0])}
                  size="small"
                  sx={{ minWidth: 180 }}
                />
                <Tooltip title="Upload CSV">
                  <IconButton color="success" onClick={handleProviderUpload} sx={{ width: 40, height: 40 }}>
                    <FontAwesomeIcon icon={faUpload} />
                  </IconButton>
                </Tooltip>
              </Stack>
            </TableCell>
          </TableRow>          {/* Availability */}
          <TableRow sx={{ '&:nth-of-type(odd)': { bgcolor: '#f0f4ff' } }}>
            <TableCell>Availability</TableCell>
            <TableCell>
              <Typography variant="body2" sx={{ mb: 1, fontWeight: 500 }}>
                Set up provider schedules and available time slots for appointments.
              </Typography>
              <Typography variant="body2" sx={{ mb: 1, fontStyle: 'italic', color: 'text.secondary' }}>
                <strong>Examples:</strong> Working hours, break times, blocked periods, recurring schedules
              </Typography>
              <Typography variant="body2" sx={{ color: 'primary.main' }}>
                <strong>Instructions:</strong> 1. Download the template 2. Define time slots and availability patterns 3. Upload the completed CSV file
              </Typography>
            </TableCell>
            <TableCell>
              <Stack direction="row" spacing={2} alignItems="center">
                <Tooltip title="Download Template">
                  <IconButton color="primary" onClick={handleAvailabilityDownload} sx={{ width: 40, height: 40 }}>
                    <FontAwesomeIcon icon={faDownload} />
                  </IconButton>
                </Tooltip>
                <TextField
                  type="file"
                  inputProps={{ accept: '.csv' }}
                  onChange={e => setAvailabilityFile(e.target.files[0])}
                  size="small"
                  sx={{ minWidth: 180 }}
                />
                <Tooltip title="Upload CSV">
                  <IconButton color="success" onClick={handleAvailabilityUpload} sx={{ width: 40, height: 40 }}>
                    <FontAwesomeIcon icon={faUpload} />
                  </IconButton>
                </Tooltip>
              </Stack>
            </TableCell>
          </TableRow>

          {/* Patients */}
          <TableRow sx={{ '&:nth-of-type(even)': { bgcolor: '#f8fafd' } }}>
            <TableCell>Patients</TableCell>
            <TableCell>
              <Typography variant="body2" sx={{ mb: 1, fontWeight: 500 }}>
                Import patient records and contact information into your organization.
              </Typography>
              <Typography variant="body2" sx={{ mb: 1, fontStyle: 'italic', color: 'text.secondary' }}>
                <strong>Examples:</strong> Patient demographics, contact details, medical record numbers
              </Typography>
              <Typography variant="body2" sx={{ color: 'primary.main' }}>
                <strong>Instructions:</strong> 1. Download the template 2. Enter patient information (ensure HIPAA compliance) 3. Upload the completed CSV file
              </Typography>
            </TableCell>
            <TableCell>
              <Stack direction="row" spacing={2} alignItems="center">
                <Tooltip title="Download Template">
                  <IconButton color="primary" onClick={handlePatientDownload} sx={{ width: 40, height: 40 }}>
                    <FontAwesomeIcon icon={faDownload} />
                  </IconButton>
                </Tooltip>
                <TextField
                  type="file"
                  inputProps={{ accept: '.csv' }}
                  onChange={e => setPatientFile(e.target.files[0])}
                  size="small"
                  sx={{ minWidth: 180 }}
                />
                <Tooltip title="Upload CSV">
                  <IconButton color="success" onClick={handlePatientUpload} sx={{ width: 40, height: 40 }}>
                    <FontAwesomeIcon icon={faUpload} />
                  </IconButton>
                </Tooltip>
              </Stack>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>{/* Alerts */}
      {uploadStatus && (
        <Alert severity={uploadStatus.startsWith('✅') ? 'success' : 'error'} sx={{ mt: 3 }}>
          {uploadStatus}
        </Alert>
      )}
      {providerUploadStatus && (
        <Alert severity={providerUploadStatus.startsWith('✅') ? 'success' : 'error'} sx={{ mt: 3 }}>
          {providerUploadStatus}
        </Alert>
      )}
      {availabilityUploadStatus && (
        <Alert severity={availabilityUploadStatus.startsWith('✅') ? 'success' : 'error'} sx={{ mt: 3 }}>
          {availabilityUploadStatus}
        </Alert>
      )}      {patientUploadStatus && (
        <Alert severity={patientUploadStatus.startsWith('✅') ? 'success' : 'error'} sx={{ mt: 3 }}>
          {patientUploadStatus}
        </Alert>
      )}
    </Box>
  );
}

export default UploadTab;
