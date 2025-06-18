import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Typography,
  Alert,
  Box,
  Stack,
  IconButton,
  InputAdornment
} from '@mui/material';
import { Visibility, VisibilityOff, Lock } from '@mui/icons-material';
import axios from 'axios';
import { toast } from 'react-toastify';

function FirstLoginPasswordModal({ open, onPasswordChanged }) {
  const [formData, setFormData] = useState({
    current_password: '',
    new_password: '',
    confirm_password: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    // Clear error when user starts typing
    if (error) setError('');
  };

  const validateForm = () => {
    if (!formData.current_password) {
      setError('Current password is required');
      return false;
    }
    if (!formData.new_password) {
      setError('New password is required');
      return false;
    }
    if (formData.new_password.length < 8) {
      setError('New password must be at least 8 characters long');
      return false;
    }
    if (formData.new_password !== formData.confirm_password) {
      setError('New passwords do not match');
      return false;
    }
    if (formData.current_password === formData.new_password) {
      setError('New password must be different from current password');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('access_token');
      await axios.post(
        'http://127.0.0.1:8000/api/users/first-login-password-change/',
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      toast.success('Password changed successfully! Welcome to POEHR!');
      onPasswordChanged();
    } catch (error) {
      console.error('Password change error:', error);
      setError(error.response?.data?.detail || 'Failed to change password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      maxWidth="sm"
      fullWidth
      disableEscapeKeyDown
      sx={{ '& .MuiDialog-paper': { borderRadius: 3 } }}
    >
      <DialogTitle sx={{ textAlign: 'center', pb: 1 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
          <Lock color="primary" sx={{ fontSize: 40 }} />
          <Typography variant="h5" fontWeight={700} color="primary.main">
            Change Your Password
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', maxWidth: 400 }}>
            For security reasons, you must change your password before continuing to use the system.
          </Typography>
        </Box>
      </DialogTitle>

      <form onSubmit={handleSubmit}>
        <DialogContent sx={{ pt: 2 }}>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <Stack spacing={3}>
            <TextField
              label="Current Password"
              name="current_password"
              type={showCurrentPassword ? 'text' : 'password'}
              value={formData.current_password}
              onChange={handleChange}
              required
              fullWidth
              autoComplete="current-password"
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      edge="end"
                      size="small"
                    >
                      {showCurrentPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                )
              }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />

            <TextField
              label="New Password"
              name="new_password"
              type={showNewPassword ? 'text' : 'password'}
              value={formData.new_password}
              onChange={handleChange}
              required
              fullWidth
              autoComplete="new-password"
              helperText="Must be at least 8 characters long"
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      edge="end"
                      size="small"
                    >
                      {showNewPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                )
              }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />

            <TextField
              label="Confirm New Password"
              name="confirm_password"
              type={showConfirmPassword ? 'text' : 'password'}
              value={formData.confirm_password}
              onChange={handleChange}
              required
              fullWidth
              autoComplete="new-password"
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      edge="end"
                      size="small"
                    >
                      {showConfirmPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                )
              }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />
          </Stack>
        </DialogContent>

        <DialogActions sx={{ p: 3, pt: 2 }}>
          <Button
            type="submit"
            variant="contained"
            fullWidth
            size="large"
            disabled={loading}
            sx={{
              borderRadius: 2,
              py: 1.5,
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '1rem'
            }}
          >
            {loading ? 'Changing Password...' : 'Change Password & Continue'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

export default FirstLoginPasswordModal;
