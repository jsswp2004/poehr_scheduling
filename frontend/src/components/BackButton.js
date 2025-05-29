import React from 'react';
import { Button } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useNavigate } from 'react-router-dom';

/**
 * Standard back button component that maintains a consistent style throughout the application
 * 
 * @param {Object} props - Component props
 * @param {string} [props.to] - Destination path to navigate to. If not provided, navigates to the previous page.
 * @param {function} [props.onClick] - Custom onClick handler. If provided, overrides the default navigation.
 * @param {Object} [props.sx] - Additional styling to apply to the button
 */
const BackButton = ({ to, onClick, sx = {}, ...props }) => {
  const navigate = useNavigate();

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else if (to) {
      navigate(to);
    } else {
      navigate(-1);
    }
  };

  return (
    <Button
      startIcon={<ArrowBackIcon />}
      onClick={handleClick}
      sx={{
        mb: 2,
        px: 2,
        py: 1,
        alignSelf: 'flex-start',
        borderRadius: 2,
        backgroundColor: '#f5f5f5',
        color: 'primary.main',
        fontWeight: 600,
        textTransform: 'none',
        boxShadow: 'none',
        '&:hover': {
          backgroundColor: '#e0e0e0',
          boxShadow: 'none',
        },
        ...sx,
      }}
      disableElevation
      {...props}
    >
      Back
    </Button>
  );
};

export default BackButton;
