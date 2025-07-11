/**
 * Refactored CreateAppointmentForm component
 * 
 * This is a much more maintainable version of the original 518-line CreateAppointmentForm.js
 * - Business logic separated into focused hooks
 * - UI components modularized for reusability
 * - Better organization and maintainability
 */
import React from 'react';
import { Box, Paper, Typography } from '@mui/material';
import { useAppointmentFormData } from '../hooks/appointment-form/useAppointmentFormData';
import { useAppointmentDoctors } from '../hooks/appointment-form/useAppointmentDoctors';
import { useAppointmentFormExternal } from '../hooks/appointment-form/useAppointmentFormExternal';
import { useAppointmentFormSubmission } from '../hooks/appointment-form/useAppointmentFormSubmission';
import { AppointmentFormFields } from './appointment-form/AppointmentFormFields';
import { AvailableSlotsPanel } from './appointment-form/AvailableSlotsPanel';
import { AppointmentFormActions } from './appointment-form/AppointmentFormActions';

function CreateAppointmentForm({
  onSuccess,
  defaultProviderId = null,
  patientName = '',
  patientId = null,
  appointmentToEdit = null,
  editMode = false
}) {
  // External data (events, holidays, blocked days)
  const { 
    clinicEvents, 
    blockedDays, 
    holidays, 
    loading: externalDataLoading 
  } = useAppointmentFormExternal(localStorage.getItem('access_token'));

  // Form data management
  const {
    formData,
    selectedClinicEvent,
    token,
    userRole,
    handleChange,
    handleClinicEventChange,
    validateForm,
    preparePayload,
  } = useAppointmentFormData(appointmentToEdit, editMode, patientId, clinicEvents);

  // Doctors and availability management
  const {
    doctors,
    selectedDoctor,
    availableSlots,
    providerBlocks,
    selectedSlot,
    handleDoctorChange,
    handleSlotSelection,
  } = useAppointmentDoctors(token, defaultProviderId, appointmentToEdit);

  // Form submission handling
  const { isSubmitting, handleSubmit } = useAppointmentFormSubmission(
    token, 
    editMode, 
    appointmentToEdit, 
    onSuccess
  );

  const onFormSubmit = (e) => {
    handleSubmit(
      e, 
      formData, 
      validateForm, 
      preparePayload, 
      selectedDoctor, 
      blockedDays, 
      holidays, 
      providerBlocks
    );
  };

  const onSlotSelect = (slot, formattedSlot) => {
    handleSlotSelection(slot, formattedSlot, (updater) => {
      if (typeof updater === 'function') {
        const newData = updater(formData);
        handleChange({ target: { name: 'appointment_datetime', value: newData.appointment_datetime } });
      }
    });
  };

  if (externalDataLoading) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography>Loading form data...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 4, mt: 2 }}>
      {/* Left: Form */}
      <Paper elevation={3} sx={{ flex: 1, p: 3, borderRadius: 3, minWidth: 340 }}>
        <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
          {editMode ? 'Edit Appointment' : 'Create Appointment'} 
          {patientName && <span style={{ color: '#1976d2' }}> for {patientName}</span>}
        </Typography>

        <form onSubmit={onFormSubmit}>
          <AppointmentFormFields
            formData={formData}
            handleChange={handleChange}
            clinicEvents={clinicEvents}
            selectedClinicEvent={selectedClinicEvent}
            handleClinicEventChange={handleClinicEventChange}
            doctors={doctors}
            selectedDoctor={selectedDoctor}
            handleDoctorChange={handleDoctorChange}
            editMode={editMode}
          />

          <AppointmentFormActions
            editMode={editMode}
            isSubmitting={isSubmitting}
            onCancel={() => onSuccess?.()}
          />
        </form>
      </Paper>

      {/* Right: Available Slots */}
      <AvailableSlotsPanel
        availableSlots={availableSlots}
        selectedSlot={selectedSlot}
        onSlotSelect={onSlotSelect}
      />
    </Box>
  );
}

export default CreateAppointmentForm;
