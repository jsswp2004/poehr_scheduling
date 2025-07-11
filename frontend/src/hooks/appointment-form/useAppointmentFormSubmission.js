/**
 * Hook for handling appointment form submission
 */
import { useState } from 'react';
import { toast } from 'react-toastify';
import { createAppointment, updateAppointment } from '../../utils/appointment/appointmentApi';

export const useAppointmentFormSubmission = (token, editMode, appointmentToEdit, onSuccess) => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e, formData, validateForm, preparePayload, selectedDoctor, blockedDays, holidays, providerBlocks) => {
    e.preventDefault();
    
    // Validate form
    const validation = validateForm(selectedDoctor, blockedDays, holidays, providerBlocks);
    if (!validation.isValid) {
      validation.errors.forEach(error => toast.error(error));
      return;
    }

    setIsSubmitting(true);
    
    try {
      const payload = preparePayload(selectedDoctor);
      
      if (editMode && appointmentToEdit && appointmentToEdit.id) {
        // Update existing appointment
        await updateAppointment(appointmentToEdit.id, payload, token);
        toast.success('Appointment updated!');
      } else {
        // Create new appointment
        await createAppointment(payload, token);
        toast.success('Appointment created!');
      }
      
      onSuccess?.();
    } catch (error) {
      console.error(error);
      toast.error(editMode ? 'Failed to update appointment.' : 'Failed to create appointment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    isSubmitting,
    handleSubmit,
  };
};
