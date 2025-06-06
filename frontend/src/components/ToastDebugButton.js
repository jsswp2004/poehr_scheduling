import React, { useState } from 'react';
import { Fab, Dialog, DialogContent, DialogTitle, DialogActions, Button, Typography } from '@mui/material';
import BugReportIcon from '@mui/icons-material/BugReport';
import { toast } from './SimpleToast';
import { useNavigate } from 'react-router-dom';

// Small component that adds a debugging button to test toasts from anywhere in the app
function ToastDebugButton() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const handleOpen = () => setOpen(true);
  const handleClose = () => setOpen(false);
    const testSuccessToast = () => {
    toast.success('Test success toast - should stay for 2 seconds');
    handleClose();
  };
  
  const testErrorToast = () => {
    toast.error('Test error toast - should stay for 2 seconds');
    handleClose();
  };
  
  const goToTestPage = () => {
    navigate('/toast-test');
    handleClose();
  };

  return (
    <>
      <Fab
        size="small"
        color="primary"
        sx={{ 
          position: 'fixed', 
          bottom: 20, 
          right: 20, 
          opacity: 0.6,
          '&:hover': { opacity: 1 }
        }}
        onClick={handleOpen}
      >
        <BugReportIcon />
      </Fab>
      
      <Dialog open={open} onClose={handleClose}>
        <DialogTitle>Toast Debug Tool</DialogTitle>
        <DialogContent>
          <Typography variant="body2" gutterBottom>
            Use these options to test toast notifications:
          </Typography>
        </DialogContent>
        <DialogActions sx={{ flexDirection: 'column', alignItems: 'stretch', padding: 2, gap: 1 }}>
          <Button onClick={testSuccessToast} variant="contained" color="success" fullWidth>
            Test Success Toast
          </Button>
          <Button onClick={testErrorToast} variant="contained" color="error" fullWidth>
            Test Error Toast
          </Button>
          <Button onClick={goToTestPage} variant="outlined" fullWidth>
            Go To Toast Test Page
          </Button>
          <Button onClick={handleClose} variant="text" fullWidth>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export default ToastDebugButton;
