import React from 'react';
import { AppBar, Toolbar, Typography } from '@mui/material';

const SimpleFooter = () => {
  return (
    <AppBar 
      position="fixed" 
      sx={{ 
        top: 'auto',
        bottom: 0,
        left: 0,
        right: 0,
        height: '21px', // 1/3 of navbar height (64px)
        minHeight: '21px',
        bgcolor: 'primary.main', // Same color as navbar
        boxShadow: 1,
        zIndex: 1200 // Ensure it stays above other content
      }}
    >
      <Toolbar 
        sx={{ 
          minHeight: '21px !important',
          height: '21px',
          padding: '0 !important',
          justifyContent: 'center',
          alignItems: 'center'
        }}
      >
        <Typography 
          variant="body2" 
          sx={{ 
            fontSize: '12px',
            fontWeight: 400,
            color: 'white',
            textAlign: 'center'
          }}
        >
          ™Powered by POWER Healthcare IT Systems, LLC 2025
        </Typography>
      </Toolbar>
    </AppBar>
  );
};

export default SimpleFooter;
