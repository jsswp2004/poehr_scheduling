import { useState } from 'react';
import { toast } from 'react-toastify';
import axios from 'axios';
import { Container, Paper, Typography, TextField, Button, Alert } from '@mui/material';
import BackButton from '../components/BackButton';
import { useNavigate } from 'react-router-dom';

function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      // Adjust this URL to match your backend endpoint
      await axios.post('http://127.0.0.1:8000/api/password-reset/', { email });

      setSubmitted(true);
      toast.success('If this email is registered, a reset link has been sent.');
    } catch (err) {
      console.error(err);
      toast.error('Failed to send reset link. Please try again.');
    }
  };

  return (
    <Container maxWidth="sm" sx={{ mt: 8 }}>
      <Paper elevation={4} sx={{ p: 4, borderRadius: 3 }}>        <BackButton />
        <Typography variant="h5" fontWeight={700} sx={{ mb: 2 }}>
          Forgot Password
        </Typography>
        {submitted ? (
          <Alert severity="success" sx={{ mb: 2 }}>
            Check your email for the password reset link.
          </Alert>
        ) : (
          <form onSubmit={handleSubmit}>
            <TextField
              label="Email address"
              type="email"
              placeholder="Enter your registered email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              fullWidth
              size="small"
              sx={{ mb: 3 }}
            />
            <Button type="submit" variant="contained" color="primary" size="large" fullWidth>
              Send Reset Link
            </Button>
          </form>
        )}
      </Paper>
    </Container>
  );
}

export default ForgotPasswordPage;
