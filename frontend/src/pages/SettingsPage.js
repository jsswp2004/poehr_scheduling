import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MaintenancePage from './MaintenancePage'; // Import your existing maintenance page
import EnvironmentProfilePage from './EnvironmentProfilePage'; // Create this component as step 2
import UploadTab from '../components/UploadTab'; // Correct import path for UploadTab
import BackButton from '../components/BackButton';
import {
  Box,
  Typography,
  Button,
  Stack
} from '@mui/material';
import BuildIcon from '@mui/icons-material/Build';
import SettingsApplicationsIcon from '@mui/icons-material/SettingsApplications';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';

function SettingsPage() {
  const [view, setView] = useState(''); // '' | 'maintenance' | 'env' | 'uploads'
  const navigate = useNavigate();

  return (
    <Box sx={{ boxShadow: 2, borderRadius: 2, bgcolor: 'background.paper', p: 3 }}>      

      <Typography variant="h5" sx={{ mb: 2 }}>Settings</Typography>
      <div>
        {view === 'maintenance' && <MaintenancePage />}
        {view === 'env' && <EnvironmentProfilePage />}
        {view === 'uploads' && (
          <Box sx={{ boxShadow: 2, borderRadius: 2, bgcolor: 'background.paper', p: 3, mt: 2 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Uploads / Downloads</Typography>
            <UploadTab />
          </Box>
        )}
        {!view && (
          <>
            <Stack direction="row" spacing={2} sx={{ mb: 4, justifyContent: 'flex-start' }}>
              <Button
                variant="contained"
                color="primary"
                sx={{
                  width: 120,
                  height: 120,
                  flexDirection: 'column',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  fontWeight: 'normal',
                  fontSize: '1.1rem',
                  borderRadius: 2,
                  boxShadow: 1,
                  textTransform: 'none',
                  fontFamily: 'inherit',
                }}
                onClick={() => setView('maintenance')}
              >
                <BuildIcon sx={{ fontSize: 36, mb: 1 }} />
                Schedule Maintenance
              </Button>
              <Button
                variant="contained"
                color="secondary"
                sx={{
                  width: 120,
                  height: 120,
                  flexDirection: 'column',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  fontWeight: 'normal',
                  fontSize: '1.1rem',
                  borderRadius: 2,
                  boxShadow: 1,
                  textTransform: 'none',
                  fontFamily: 'inherit',
                }}
                onClick={() => setView('env')}
              >
                <SettingsApplicationsIcon sx={{ fontSize: 36, mb: 1 }} />
                Environment Profile
              </Button>
              <Button
                variant="contained"
                color="success"
                sx={{
                  width: 120,
                  height: 120,
                  flexDirection: 'column',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  fontWeight: 'normal',
                  fontSize: '1.1rem',
                  borderRadius: 2,
                  boxShadow: 1,
                  textTransform: 'none',
                  fontFamily: 'inherit',
                }}
                onClick={() => setView('uploads')}
              >
                <CloudUploadIcon sx={{ fontSize: 36, mb: 1 }} />
                Uploads / Downloads
              </Button>
            </Stack>
          </>
        )}
      </div>
      <div style={{ marginTop: 20 }}> 
        <BackButton 
          onClick={() => {
            if (view) {
              setView('');
            } else {
              navigate(-1);
            }
          }}
        />
      </div>
    </Box>
  );
}

export default SettingsPage;
