import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Container, Paper, Typography, CircularProgress, Box, Button } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CreateAppointmentForm from '../components/CreateAppointmentForm';

function EditAppointmentPage() {
  const { id } = useParams();
  const [appointment, setAppointment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const token = localStorage.getItem('access_token');

  useEffect(() => {
    const fetchAppointment = async () => {
      setLoading(true);
      try {
        const res = await axios.get(`http://127.0.0.1:8000/api/appointments/${id}/`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setAppointment(res.data);
      } catch (err) {
        setError('Failed to load appointment.');
      } finally {
        setLoading(false);
      }
    };
    fetchAppointment();
    // eslint-disable-next-line
  }, [id]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Container maxWidth="sm" sx={{ mt: 6 }}>
        <Paper sx={{ p: 4 }}>
          <Typography color="error" align="center">{error}</Typography>
        </Paper>
      </Container>
    );
  }

  return (
    <Container maxWidth={false} sx={{ mt: 6, mb: 6, maxWidth: 1100 }}>
      <Paper sx={{ p: { xs: 2, sm: 4 }, borderRadius: 3, boxShadow: 3, maxWidth: 1000, mx: 'auto' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Button
            variant="outlined"
            color="secondary"
            onClick={() => navigate(-1)}
            sx={{ mr: 2, minWidth: 90, fontWeight: 600, borderRadius: 2 }}
            startIcon={<ArrowBackIcon />}
          >
            Back
          </Button>

        </Box>
        <CreateAppointmentForm
          appointmentToEdit={appointment}
          onSuccess={() => navigate(-1)}
          editMode={true}
        />
      </Paper>
    </Container>
  );
}

export default EditAppointmentPage;
