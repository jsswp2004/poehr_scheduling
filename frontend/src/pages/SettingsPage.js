import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MaintenancePage from './MaintenancePage'; // Import your existing maintenance page
import EnvironmentProfilePage from './EnvironmentProfilePage'; // Create this component as step 2
import {
  Box,
  Typography,
  Button,
  Stack
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

function SettingsPage() {
  const [view, setView] = useState(''); // '' | 'maintenance' | 'env'
  const navigate = useNavigate();

  return (
    <Box sx={{ boxShadow: 2, borderRadius: 2, bgcolor: 'background.paper', p: 3 }}>
      <Button
        variant="outlined"
        sx={{ mb: 2 }}
        onClick={() => {
          if (view) {
            setView('');
          } else {
            navigate(-1);
          }
        }}
        startIcon={<ArrowBackIcon />}
      >
        Back
      </Button>
      <Typography variant="h5" sx={{ mb: 2 }}>Settings</Typography>
      <div>
        {view === 'maintenance' && <MaintenancePage />}
        {view === 'env' && <EnvironmentProfilePage />}
        {!view && (
          <>
            <div className="text-muted" style={{ marginBottom: 24 }}>Select an option above to begin.</div>
            <Stack direction="row" spacing={2} sx={{ mb: 4, justifyContent: 'flex-start' }}>
              <Button variant="contained" color="primary" onClick={() => setView('maintenance')}>
                Schedule Maintenance
              </Button>
              <Button variant="outlined" color="secondary" onClick={() => setView('env')}>
                Environment Profile
              </Button>
            </Stack>
          </>
        )}
      </div>
    </Box>
  );
}

export default SettingsPage;
