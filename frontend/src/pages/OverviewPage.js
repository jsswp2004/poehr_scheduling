import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import OverviewImage from '../assets/dashboard_overview.png'; // Placeholder for the overview image

export const OverviewPage = () => {
  const navigate = useNavigate();

  const handleClose = () => {
    navigate(-1); // go back to previous page
  };

  return (
    <Dialog open onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>Application Overview</DialogTitle>
      <DialogContent dividers>
        <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
          {/* Image placeholder */}
          <div style={{ width: '100%', height: '200px', background: '#ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px' }}>
            <Typography variant="subtitle1">        
              <img 
                src={OverviewImage} 
                alt="Features Overview" 
                className="features-image"
                style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                      borderRadius: '0px',
                      padding: '0px'
                    }} />
            </Typography>
          </div>
        </div>
        <Typography variant="body1" paragraph>
          POWER Scheduler is a healthcare scheduling system built with a Django backend and React frontend. Clinics can upload events, holidays, staff lists and provider lists directly from the app, manage availability and block times, and send automated text and email reminders. Notifications keep both organization and system administrators informed whenever patients register or appointments are created, ensuring seamless collaboration across the team.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} variant="contained">Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default OverviewPage;
