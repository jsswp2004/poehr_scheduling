import React, { useState } from 'react';
import { toast } from '../components/SimpleToast';
import 'react-toastify/dist/ReactToastify.css';
import toastUtils from '../utils/toastUtils';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Grid from '@mui/material/Grid';

function ToastTestPage() {  const showRegularToast = () => {
    toast.success('Regular toast success - should last 2 seconds');
  };

  const showRegularErrorToast = () => {
    toast.error('Regular toast error - should last 2 seconds');
  };

  const showUtilToast = () => {
    toastUtils.success('Toast from utility - should last 2 seconds');
  };

  const showUtilErrorToast = () => {
    toastUtils.error('Toast error from utility - should last 2 seconds');
  };

  return (
    <Box sx={{ padding: 4 }}>
      <Typography variant="h4" gutterBottom>
        Toast Notification Test Page
      </Typography>
      <Card sx={{ mb: 4 }}>
        <CardContent>
          <Typography variant="body1" paragraph>
            This page is for testing toast notifications. Each button will trigger a different type of toast
            that should remain visible for 5 seconds.
          </Typography>
        </CardContent>
      </Card>

      <Grid container spacing={2}>
        <Grid item xs={12} sm={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Regular Toast API
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, flexDirection: 'column' }}>
                <Button 
                  variant="contained" 
                  color="primary" 
                  onClick={showRegularToast}
                >
                  Show Regular Success Toast
                </Button>
                <Button 
                  variant="contained" 
                  color="error" 
                  onClick={showRegularErrorToast}
                >
                  Show Regular Error Toast
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} sm={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Custom Toast Utility
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, flexDirection: 'column' }}>
                <Button 
                  variant="contained" 
                  color="primary" 
                  onClick={showUtilToast}
                >
                  Show Utility Success Toast
                </Button>
                <Button 
                  variant="contained" 
                  color="error" 
                  onClick={showUtilErrorToast}
                >
                  Show Utility Error Toast
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* We don't need ToastContainer here since it's already in App.js */}
    </Box>
  );
}

export default ToastTestPage;
