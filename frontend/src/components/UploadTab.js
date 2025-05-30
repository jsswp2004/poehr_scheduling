import React, { useState } from 'react';
import { Table, TableHead, TableRow, TableCell, TableBody, Button, TextField, Stack, Alert } from '@mui/material';
import axios from 'axios';

function UploadTab() {
  const [file, setFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState('');
  // Provider upload state
  const [providerFile, setProviderFile] = useState(null);
  const [providerUploadStatus, setProviderUploadStatus] = useState('');
  // Availability upload state
  const [availabilityFile, setAvailabilityFile] = useState(null);
  const [availabilityUploadStatus, setAvailabilityUploadStatus] = useState('');
  const token = localStorage.getItem('access_token');

  // Clinic Events handlers
  const handleDownload = async () => {
    try {
      const response = await axios.get('http://127.0.0.1:8000/api/upload/clinic-events/template/', {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'clinic_events_template.csv');
      document.body.appendChild(link);
      link.click();
    } catch (err) {
      console.error(err);
      setUploadStatus('❌ Download failed.');
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setUploadStatus('❌ Please select a file to upload.');
      return;
    }
    const formData = new FormData();
    formData.append('file', file);
    try {
      await axios.post('http://127.0.0.1:8000/api/upload/clinic-events/', formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
      });
      setUploadStatus('✅ Upload successful.');
    } catch (err) {
      console.error(err);
      setUploadStatus('❌ Upload failed.');
    }
  };

  // Providers handlers
  const handleProviderDownload = async () => {
    try {
      const response = await axios.get('http://127.0.0.1:8000/api/users/providers/download-template/', {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'providers_template.csv');
      document.body.appendChild(link);
      link.click();
    } catch (err) {
      console.error(err);
      setProviderUploadStatus('❌ Download failed.');
    }
  };

  const handleProviderUpload = async () => {
    if (!providerFile) {
      setProviderUploadStatus('❌ Please select a file to upload.');
      return;
    }
    const formData = new FormData();
    formData.append('file', providerFile);
    try {
      await axios.post('http://127.0.0.1:8000/api/users/providers/upload-csv/', formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
      });
      setProviderUploadStatus('✅ Upload successful.');
    } catch (err) {
      console.error(err);
      setProviderUploadStatus('❌ Upload failed.');
    }
  };

  // Availability handlers
  const handleAvailabilityDownload = async () => {
    try {
      const response = await axios.get('http://127.0.0.1:8000/api/availability/download-template/', {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'availability_template.csv');
      document.body.appendChild(link);
      link.click();
    } catch (err) {
      console.error(err);
      setAvailabilityUploadStatus('❌ Download failed.');
    }
  };

  const handleAvailabilityUpload = async () => {
    if (!availabilityFile) {
      setAvailabilityUploadStatus('❌ Please select a file to upload.');
      return;
    }
    const formData = new FormData();
    formData.append('file', availabilityFile);
    try {
      await axios.post('http://127.0.0.1:8000/api/availability/upload-csv/', formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
      });
      setAvailabilityUploadStatus('✅ Upload successful.');
    } catch (err) {
      console.error(err);
      setAvailabilityUploadStatus('❌ Upload failed.');
    }
  };

  return (
    <>
      <Table size="small" stickyHeader sx={{ bgcolor: '#f5faff', borderRadius: 2, boxShadow: 1, mt: 3 }}>
        <TableHead>
          <TableRow sx={{ bgcolor: '#e3f2fd' }}>
            <TableCell sx={{ fontWeight: 'bold', width: 200, fontSize: '1rem' }}>Items</TableCell>
            <TableCell sx={{ fontWeight: 'bold', width: 300, fontSize: '1rem', textAlign: 'left' }}>Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          <TableRow sx={{ '&:nth-of-type(odd)': { bgcolor: '#f0f4ff' } }}>
            <TableCell>Clinic Events</TableCell>
            <TableCell>
              <Stack direction="row" spacing={2} alignItems="center" justifyContent="flex-start" flexWrap="wrap">
                <Button variant="outlined" onClick={handleDownload}>
                  Download Template
                </Button>
                <TextField
                  type="file"
                  inputProps={{ accept: '.csv' }}
                  onChange={(e) => setFile(e.target.files[0])}
                  variant="outlined"
                  size="small"
                  sx={{ minWidth: 180 }}
                />
                <Button variant="contained" onClick={handleUpload}>
                  Upload CSV
                </Button>
              </Stack>
            </TableCell>
          </TableRow>
          <TableRow sx={{ '&:nth-of-type(even)': { bgcolor: '#f8fafd' } }}>
            <TableCell>Providers/ Staff</TableCell>
            <TableCell>
              <Stack direction="row" spacing={2} alignItems="center" justifyContent="flex-start" flexWrap="wrap">
                <Button variant="outlined" onClick={handleProviderDownload}>
                  Download Template
                </Button>
                <TextField
                  type="file"
                  inputProps={{ accept: '.csv' }}
                  onChange={(e) => setProviderFile(e.target.files[0])}
                  variant="outlined"
                  size="small"
                  sx={{ minWidth: 180 }}
                />
                <Button variant="contained" onClick={handleProviderUpload}>
                  Upload CSV
                </Button>
              </Stack>
            </TableCell>
          </TableRow>
          <TableRow sx={{ '&:nth-of-type(odd)': { bgcolor: '#f0f4ff' } }}>
            <TableCell>Availability</TableCell>
            <TableCell>
              <Stack direction="row" spacing={2} alignItems="center" justifyContent="flex-start" flexWrap="wrap">
                <Button variant="outlined" onClick={handleAvailabilityDownload}>
                  Download Template
                </Button>
                <TextField
                  type="file"
                  inputProps={{ accept: '.csv' }}
                  onChange={(e) => setAvailabilityFile(e.target.files[0])}
                  variant="outlined"
                  size="small"
                  sx={{ minWidth: 180 }}
                />
                <Button variant="contained" onClick={handleAvailabilityUpload}>
                  Upload CSV
                </Button>
              </Stack>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
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
      )}
    </>
  );
}

export default UploadTab;
