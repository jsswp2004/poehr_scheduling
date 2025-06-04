import { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { jwtDecode } from 'jwt-decode';
import { Box, Paper, Typography, Stack, Button, TextField, MenuItem, Alert } from '@mui/material';
import Select from 'react-select';

function toLocalDatetimeString(dateObj) {
  const local = new Date(dateObj);
  local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
  return local.toISOString().slice(0, 16);
}

function CreateAppointmentForm({
  onSuccess,
  defaultProviderId = null,
  patientName = '',
  patientId = null,
  appointmentToEdit = null,
  editMode = false // <-- add default value
}) {
  const [doctors, setDoctors] = useState([]);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    appointment_datetime: '',
    duration_minutes: 30,
    recurrence: 'none',
    recurrence_end_date: '', // Added for recurrence end date
  });
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [token] = useState(localStorage.getItem('access_token'));
  const [selectedSlot, setSelectedSlot] = useState(null);  const [clinicEvents, setClinicEvents] = useState([]);
  const [selectedClinicEvent, setSelectedClinicEvent] = useState(null);
  const [blockedDays, setBlockedDays] = useState([]);
  const [holidays, setHolidays] = useState([]);  const [providerBlocks, setProviderBlocks] = useState([]);

  let userRole = null;
  if (token) {
    try {
      const decoded = jwtDecode(token);
      userRole = decoded.role;
    } catch (err) {
      // ignore
    }
  }

  // Fetch doctors, holidays, blocked days, and clinic events
  useEffect(() => {
    const fetchClinicEvents = async () => {
      try {
        const res = await axios.get('http://127.0.0.1:8000/api/clinic-events/', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setClinicEvents(res.data);
      } catch (error) {
        console.error('Failed to fetch clinic events:', error);
      }
    };

    const fetchDoctors = async () => {
      try {
        const res = await axios.get('http://127.0.0.1:8000/api/users/doctors/', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setDoctors(res.data);

        if (defaultProviderId) {
          const doc = res.data.find((d) => d.id === defaultProviderId);
          if (doc) {
            const selected = {
              value: doc.id,
              label: `Dr. ${doc.first_name} ${doc.last_name}`
            };
            setSelectedDoctor(selected);
            handleDoctorChange(selected);
          }
        }
      } catch (error) {
        console.error('Failed to fetch doctors:', error);
      }
    };

    const fetchBlockedDays = async () => {
      try {
        const res = await axios.get('http://127.0.0.1:8000/api/settings/environment/', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setBlockedDays(res.data.blocked_days || []);
      } catch (err) {
        console.error('Failed to fetch blocked days:', err);
      }
    };

    const fetchHolidays = async () => {
      try {
        const res = await axios.get('http://127.0.0.1:8000/api/holidays/', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setHolidays(res.data.filter(h => h.is_recognized));
      } catch (err) {
        console.error('Failed to fetch holidays:', err);
      }
    };

    fetchDoctors();
    fetchBlockedDays();
    fetchHolidays();
    fetchClinicEvents();
    // eslint-disable-next-line
  }, [defaultProviderId, token]);
  // Edit support for appointmentToEdit
  useEffect(() => {
    if (appointmentToEdit) {
      setFormData({
        title: appointmentToEdit.title || '',
        description: appointmentToEdit.description || '',
        appointment_datetime: appointmentToEdit.appointment_datetime
          ? appointmentToEdit.appointment_datetime.slice(0, 16)
          : '',
        duration_minutes: appointmentToEdit.duration_minutes || 30,
        recurrence: appointmentToEdit.recurrence || 'none',
        recurrence_end_date: appointmentToEdit.recurrence_end_date || '', // Pre-fill recurrence_end_date
        status: appointmentToEdit.status || 'scheduled', // <-- prepopulate status
      });

      // Preselect doctor
      if (appointmentToEdit.provider) {
        const selected = {
          value: appointmentToEdit.provider.id || appointmentToEdit.provider,
          label:
            appointmentToEdit.provider_name ||
            (appointmentToEdit.provider.first_name && appointmentToEdit.provider.last_name
              ? `Dr. ${appointmentToEdit.provider.first_name} ${appointmentToEdit.provider.last_name}`
              : 'Provider'),
        };
        setSelectedDoctor(selected);
        // Automatically fetch available slots for the preselected doctor
        (async () => {
          try {
            const res = await axios.get(`http://127.0.0.1:8000/api/doctors/${selected.value}/available-dates/`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            setAvailableSlots(res.data);
          } catch (error) {
            console.error('Failed to fetch available slots:', error);
          }
        })();
      }

      // Preselect clinic event
      if (clinicEvents.length > 0 && appointmentToEdit.title) {
        const matchedEvent = clinicEvents.find(
          evt => evt.name === appointmentToEdit.title
        );
        setSelectedClinicEvent(
          matchedEvent
            ? { value: matchedEvent.id, label: matchedEvent.name }
            : null
        );
      }
    }
  }, [appointmentToEdit, clinicEvents, token]);  // Check if appointment time conflicts with provider's blocked availability
  const checkAvailabilityConflict = (startDate, durationMinutes, doctorId) => {
    // Use current form data if no parameters provided
    const start = startDate || new Date(formData.appointment_datetime);
    const duration = durationMinutes || formData.duration_minutes;
    const provider = doctorId || selectedDoctor?.value;
    
    // If we don't have all required data, no conflict
    if (!provider || !start || !duration || isNaN(start.getTime())) {
      return false;
    }

    // When editing an existing appointment, check if we're keeping the same time
    if (editMode && appointmentToEdit) {
      const originalStart = new Date(appointmentToEdit.appointment_datetime);
      const originalDuration = appointmentToEdit.duration_minutes || 30;
      const originalEnd = new Date(originalStart.getTime() + (originalDuration * 60 * 1000));
      const currentEnd = new Date(start.getTime() + (duration * 60 * 1000));
      
      // If the time hasn't changed (or changed minimally), don't check for conflicts
      const timeUnchanged = Math.abs(originalStart.getTime() - start.getTime()) < 60000 && // within 1 minute
                           Math.abs(originalEnd.getTime() - currentEnd.getTime()) < 60000;
      
      if (timeUnchanged) {
        return false;
      }
    }

    const end = new Date(start.getTime() + (duration * 60 * 1000));
    
    // Get blocked availability for the selected provider during this time
    const providerAvailability = providerBlocks.filter(block => {
      const blockDoctorId = block.doctor_id || block.doctor;
      return String(blockDoctorId) === String(provider);
    });
    
    // Find ONLY blocked availability for the selected provider during this time
    const blockedAvailability = providerAvailability.filter(block => {
      const blockStart = new Date(block.start_time);
      const blockEnd = new Date(block.end_time);
      const isBlocked = block.is_blocked === true;
      const overlaps = (start < blockEnd && end > blockStart);
      
      return isBlocked && overlaps;
    });
    
    // Check if appointment time overlaps with any blocked time
    if (blockedAvailability.length > 0) {
      return 'Cannot schedule appointment during provider\'s blocked time. Please select another time.';
    }
    
    return false;
  };// Load provider availability when doctor changes
  useEffect(() => {
    const loadProviderBlocks = async () => {
      if (!selectedDoctor) {
        setProviderBlocks([]);
        return;
      }
      
      try {
        const res = await axios.get(`http://127.0.0.1:8000/api/availability/?doctor=${selectedDoctor.value}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setProviderBlocks(res.data);
      } catch (err) {
        console.error('Failed to load provider availability:', err);
      }
    };
    loadProviderBlocks();
  }, [selectedDoctor, token]);

  // Handles doctor select and fetches slots
  const handleDoctorChange = async (selected) => {
    setSelectedDoctor(selected);
    setAvailableSlots([]);
    if (selected) {
      try {
        const res = await axios.get(`http://127.0.0.1:8000/api/doctors/${selected.value}/available-dates/`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setAvailableSlots(res.data);
      } catch (error) {
        console.error("Failed to fetch available slots:", error);
      }
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!selectedClinicEvent) {
      toast.error("Please select a Clinic Event.");
      return;
    }

    if (!selectedDoctor?.value) {
      toast.error("Please select a provider for this appointment.");
      return;
    }    // Require recurrence_end_date if recurrence is set
    if (formData.recurrence !== 'none' && !formData.recurrence_end_date) {
      toast.error('Recurrence End Date is required for recurring appointments.');
      return;
    }

    // Validate recurrence_end_date is after appointment start date
    if (formData.recurrence !== 'none' && formData.recurrence_end_date) {
      const appointmentDate = new Date(formData.appointment_datetime).toDateString();
      const endDate = new Date(formData.recurrence_end_date).toDateString();
      if (new Date(endDate) < new Date(appointmentDate)) {
        toast.error('Recurrence End Date must be on or after the appointment date.');
        return;
      }
    }

    const payload = {
      ...formData,
      title: selectedClinicEvent.label,
      provider: selectedDoctor?.value || null,
      recurrence_end_date: formData.recurrence_end_date || null, // Ensure null if blank
    };

    if (patientId) {
      payload.patient = patientId;
    }
    // Fix: Ensure patient is set when editing
    if (!patientId && appointmentToEdit && appointmentToEdit.patient) {
      payload.patient = appointmentToEdit.patient.id || appointmentToEdit.patient;
    }
    if ((userRole === 'admin' || userRole === 'system_admin') && formData.patient) {
      payload.patient = formData.patient;
    }

    // Blocked day/holiday check
    const selectedDate = new Date(formData.appointment_datetime);
    const isBlockedDay = blockedDays.includes(selectedDate.getDay());
    const isHoliday = holidays.some(h => {
      const holidayDate = new Date(h.date + 'T00:00:00');
      return (
        holidayDate.getFullYear() === selectedDate.getFullYear() &&
        holidayDate.getMonth() === selectedDate.getMonth() &&
        holidayDate.getDate() === selectedDate.getDate()
      );
    });
    if (isBlockedDay || isHoliday) {
      toast.error('Appointments cannot be created on a blocked day or recognized holiday.');
      return;
    }    // Check for availability conflicts with provider's blocked time
    const appointmentStart = new Date(formData.appointment_datetime);
    const conflictResult = checkAvailabilityConflict(
      appointmentStart,
      formData.duration_minutes,
      selectedDoctor.value
    );
    
    if (conflictResult) {
      toast.error(conflictResult);
      return;
    }

    try {
      if (typeof editMode !== 'undefined' && editMode && appointmentToEdit && appointmentToEdit.id) {
        // Update existing appointment
        await axios.put(`http://127.0.0.1:8000/api/appointments/${appointmentToEdit.id}/`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        toast.success('Appointment updated!');
      } else {
        // Create new appointment
        await axios.post('http://127.0.0.1:8000/api/appointments/', payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        toast.success('Appointment created!');
      }
      onSuccess?.();
    } catch (error) {
      console.error(error);
      toast.error(editMode ? 'Failed to update appointment.' : 'Failed to create appointment.');
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 4, mt: 2 }}>
      {/* Left: Form */}
      <Paper elevation={3} sx={{ flex: 1, p: 3, borderRadius: 3, minWidth: 340 }}>        <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
          {editMode ? 'Edit Appointment' : 'Create Appointment'} {patientName && <span style={{ color: '#1976d2' }}>for {patientName}</span>}
        </Typography>
        <form onSubmit={handleSubmit}>
          <Stack spacing={2}>
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Clinic Event</Typography>
              <Select
                options={clinicEvents.map(event => ({ value: event.id, label: event.name }))}
                value={selectedClinicEvent}
                onChange={selected => {
                  setSelectedClinicEvent(selected);
                  setFormData(prev => ({ ...prev, title: selected ? selected.label : '' }));
                }}
                placeholder="Select clinic event..."
                isClearable
                styles={{
                  control: (base) => ({ ...base, minHeight: 40 }),
                  menu: (base) => ({ ...base, zIndex: 9999 })
                }}
              />
            </Box>
            <TextField
              label="Description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              multiline
              minRows={2}
              fullWidth
            />
            <TextField
              label="Date & Time"
              name="appointment_datetime"
              type="datetime-local"
              value={formData.appointment_datetime}
              onChange={handleChange}
              required
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="Duration (minutes)"
              name="duration_minutes"
              type="number"
              value={formData.duration_minutes}
              onChange={handleChange}
              required
              fullWidth
              inputProps={{ min: 1 }}
            />
            <TextField
              label="Recurrence"
              name="recurrence"
              select
              value={formData.recurrence}
              onChange={handleChange}
              fullWidth
            >
              <MenuItem value="none">None</MenuItem>
              <MenuItem value="daily">Daily</MenuItem>
              <MenuItem value="weekly">Weekly</MenuItem>
              <MenuItem value="monthly">Monthly</MenuItem>
            </TextField>            {formData.recurrence !== 'none' && (
              <TextField
                label="Recurrence End Date"
                name="recurrence_end_date"
                type="date"
                value={formData.recurrence_end_date}
                onChange={handleChange}
                required
                fullWidth
                InputLabelProps={{ shrink: true }}
                helperText="Required for recurring appointments"
                inputProps={{
                  min: formData.appointment_datetime ? formData.appointment_datetime.split('T')[0] : undefined
                }}
              />
            )}
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Select Doctor</Typography>
              <Select
                options={doctors.map(doc => ({ value: doc.id, label: `Dr. ${doc.first_name} ${doc.last_name}` }))}
                value={selectedDoctor}
                onChange={handleDoctorChange}
                placeholder="Search or select doctor..."
                isClearable
                isDisabled={false}
                styles={{
                  control: (base) => ({ ...base, minHeight: 40 }),
                  menu: (base) => ({ ...base, zIndex: 9999 })
                }}
              />
            </Box>
            {editMode && (
              <TextField
                label="Status"
                name="status"
                select
                value={formData.status || ''}
                onChange={handleChange}
                required
                fullWidth
              >
                <MenuItem value="scheduled">Scheduled</MenuItem>
                <MenuItem value="completed">Completed</MenuItem>
                <MenuItem value="cancelled">Cancelled</MenuItem>
                <MenuItem value="no_show">No Show</MenuItem>
                <MenuItem value="rescheduled">Rescheduled</MenuItem>
                <MenuItem value="pending">Pending</MenuItem>
                <MenuItem value="in_progress">In Progress</MenuItem>
              </TextField>
            )}            <Stack direction="row" spacing={2} sx={{ mt: 1 }}>              <Button 
                type="submit" 
                variant="contained" 
                color="primary"
              >
                {editMode ? 'Update Appointment' : 'Create Appointment'}
              </Button>
              <Button
                variant="outlined"
                color="secondary"
                onClick={() => onSuccess?.()}
              >
                Cancel
              </Button>
            </Stack>
          </Stack>
        </form>
      </Paper>
      {/* Right: Available Slots */}
      <Paper elevation={1} sx={{ flex: 1, p: 3, borderRadius: 3, minWidth: 260, bgcolor: '#f9f9fa' }}>
        <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
          Next Available Slots
        </Typography>
        {availableSlots.length > 0 ? (
          <Stack spacing={1}>
            {availableSlots.map((slot, idx) => {
              const formattedSlot = toLocalDatetimeString(slot);
              return (
                <Button
                  key={idx}
                  variant={selectedSlot === formattedSlot ? 'contained' : 'outlined'}
                  color={selectedSlot === formattedSlot ? 'primary' : 'inherit'}
                  size="small"
                  sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
                  onClick={() => {
                    setSelectedSlot(formattedSlot);
                    setFormData((prev) => ({ ...prev, appointment_datetime: formattedSlot }));
                  }}
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
    </Box>
  );
}

export default CreateAppointmentForm;
