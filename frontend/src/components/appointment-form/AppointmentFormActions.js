/**
 * Appointment form actions component
 */
import React from 'react';
import { Stack, Button, CircularProgress } from '@mui/material';

export const AppointmentFormActions = ({
  editMode,
  isSubmitting,
  onCancel
}) => {
  return (
    <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
      <Button
        type="submit"
        variant="contained"
        color="primary"
        disabled={isSubmitting}
        startIcon={isSubmitting ? <CircularProgress size={20} /> : null}
      >
        {editMode ? 'Update Appointment' : 'Create Appointment'}
      </Button>
      <Button
        variant="outlined"
        color="secondary"
        onClick={onCancel}
        disabled={isSubmitting}
      >
        Cancel
      </Button>
    </Stack>
  );
};
