/**
 * Available slots panel component
 */
import React from 'react';
import { Paper, Typography, Stack, Button, Alert } from '@mui/material';
import { toLocalDatetimeString } from '../../utils/date';

export const AvailableSlotsPanel = ({
  availableSlots,
  selectedSlot,
  onSlotSelect
}) => {
  const formatSlot = (slot) => {
    return toLocalDatetimeString(slot);
  };

  return (
    <Paper elevation={1} sx={{ flex: 1, p: 3, borderRadius: 3, minWidth: 260, bgcolor: '#f9f9fa' }}>
      <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
        Next Available Slots
      </Typography>
      {availableSlots.length > 0 ? (
        <Stack spacing={1}>
          {availableSlots.map((slot, idx) => {
            const formattedSlot = formatSlot(slot);
            return (
              <Button
                key={idx}
                variant={selectedSlot === formattedSlot ? 'contained' : 'outlined'}
                color={selectedSlot === formattedSlot ? 'primary' : 'inherit'}
                size="small"
                sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
                onClick={() => onSlotSelect(slot, formattedSlot)}
                fullWidth
              >
                {new Date(slot).toLocaleString()}
              </Button>
            );
          })}
        </Stack>
      ) : (
        <Alert severity="info">No available slots</Alert>
      )}
    </Paper>
  );
};
