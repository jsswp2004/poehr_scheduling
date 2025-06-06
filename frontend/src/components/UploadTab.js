import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faDownload, faUpload } from '@fortawesome/free-solid-svg-icons';
import {
  Table, TableHead, TableRow, TableCell, TableBody,
  Button, Stack, Alert, TextField, IconButton, Tooltip
} from '@mui/material';
import axios from 'axios';

function UploadTab() {
  const [file, setFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState('');
  const [providerFile, setProviderFile] = useState(null);
  const [providerUploadStatus, setProviderUploadStatus] = useState('');
  const [availabilityFile, setAvailabilityFile] = useState(null);
  const [availabilityUploadStatus, setAvailabilityUploadStatus] = useState('');
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
      const response = await axios.get('http://127.0.0.1:8000/api/upload/clinic-events/template/', {
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

  const handleProviderDownload = async () => {
    try {
      const response = await axios.get('http://127.0.0.1:8000/api/users/providers/download-template/', {
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

  const handleAvailabilityDownload = async () => {
    try {
      const response = await axios.get('http://127.0.0.1:8000/api/availability/download-template/', {
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
            <TableCell sx={{ fontWeight: 'bold', width: 200 }}>Items</TableCell>
            <TableCell sx={{ fontWeight: 'bold', width: 300 }}>Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {/* Clinic Events */}
          <TableRow sx={{ '&:nth-of-type(odd)': { bgcolor: '#f0f4ff' } }}>
            <TableCell>Clinic Events</TableCell>
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
          </TableRow>

          {/* Availability */}
          <TableRow sx={{ '&:nth-of-type(odd)': { bgcolor: '#f0f4ff' } }}>
            <TableCell>Availability</TableCell>
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
        </TableBody>
      </Table>

      {/* Alerts */}
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
