import { Calendar, momentLocalizer } from 'react-big-calendar';
import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { parseISO } from 'date-fns';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import moment from 'moment';
import { toast } from 'react-toastify';
import { jwtDecode } from 'jwt-decode';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Tooltip, IconButton, Box, Stack, MenuItem, FormControl, InputLabel, Select as MUISelect, Alert
} from '@mui/material';
import BackButton from './BackButton';
import CloseIcon from '@mui/icons-material/Close';

function CustomToolbar({ date, label, onNavigate, views, view, onView }) {
  const [showPicker, setShowPicker] = useState(false);
  return (
    <div className="rbc-toolbar d-flex align-items-center justify-content-between mb-2">
      <span className="rbc-btn-group">
        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => onNavigate('TODAY')}>Today</button>
        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => onNavigate('PREV')}>&lt;</button>
        <span style={{ position: 'relative', display: 'inline-block' }}>
          <button
            type="button"
            className="btn btn-light btn-sm"
            style={{ fontWeight: 600, border: '1px solid #ccc' }}
            onClick={() => setShowPicker(!showPicker)}
          >
            {label}
          </button>
          {showPicker && (
            <div style={{
              position: 'absolute',
              zIndex: 1000,
              top: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
            }}>
              <DatePicker
                selected={date}
                onChange={d => {
                  setShowPicker(false);
                  onNavigate('DATE', d);
                }}
                inline
              />
            </div>
          )}
        </span>
        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => onNavigate('NEXT')}>&gt;</button>
      </span>
      <span className="rbc-btn-group ms-2">
        {views.map(v => (
          <button
            type="button"
            key={v}
            className={`btn btn-${view === v ? 'primary' : 'outline-primary'} btn-sm`}
            onClick={() => onView(v)}
            style={{ marginLeft: 4 }}
          >
            {v === 'month' ? 'Month'
              : v === 'week' ? 'Week'
                : v === 'work_week' ? 'Work Week'
                  : v === 'day' ? 'Day'
                    : v.charAt(0).toUpperCase() + v.slice(1)}
          </button>
        ))}
      </span>
    </div>
  );
}

const localizer = momentLocalizer(moment);

const isPastAppointment = (dateString) => {
  const now = new Date();
  return new Date(dateString) < now;
};

function toLocalDatetimeString(dateObj) {
  const local = new Date(dateObj);
  local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
  return local.toISOString().slice(0, 16);
}

function CalendarView({ onUpdate }) {
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [isPast, setIsPast] = useState(false);
  const [modalFormData, setModalFormData] = useState({
    title: 'New Clinic Visit',
    description: '',
    duration_minutes: 30,
    recurrence: 'none',
    appointment_datetime: '',
    provider: null,
  });
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [doctors, setDoctors] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState([]); const [blockedDays, setBlockedDays] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [clinicEvents, setClinicEvents] = useState([]);
  const [selectedClinicEvent, setSelectedClinicEvent] = useState(null);
  const [providerBlocks, setProviderBlocks] = useState([]);

  const token = localStorage.getItem('access_token');

  let userRole = null;
  if (token) {
    try {
      const decoded = jwtDecode(token);
      userRole = decoded.role;
    } catch (err) {
      console.error('Failed to decode token:', err);
    }
  }

  let defaultView = 'month';
  if (userRole === 'doctor') defaultView = 'day';
  else if (userRole === 'registrar') defaultView = 'work_week';
  const [currentView, setCurrentView] = useState(defaultView);

  const fetchDoctors = async () => {
    try {
      const res = await axios.get('http://127.0.0.1:8000/api/users/doctors/', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDoctors(res.data);
    } catch (err) {
      console.error('Failed to load doctors:', err);
    }
  };

  const fetchClinicEvents = async () => {
    try {
      const res = await axios.get('http://127.0.0.1:8000/api/clinic-events/', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setClinicEvents(res.data);
    } catch (err) {
      console.error('Failed to load clinic events:', err);
    }
  };
  const fetchAppointments = async () => {
    try {
      const [appointmentsRes, availabilityRes] = await Promise.all([
        axios.get('http://127.0.0.1:8000/api/appointments/', { headers: { Authorization: `Bearer ${token}` } }),
        axios.get('http://127.0.0.1:8000/api/availability/', { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      const apptEvents = appointmentsRes.data.map((appt) => ({
        id: `appt-${appt.id}`,
        title: `${appt.patient_name || 'Unknown Patient'} - ${appt.title || 'Untitled Appointment'}`,
        start: parseISO(appt.appointment_datetime),
        end: new Date(new Date(appt.appointment_datetime).getTime() + appt.duration_minutes * 60000),
        type: 'appointment',
        provider: appt.provider,
        patient_name: appt.patient_name,
        duration_minutes: appt.duration_minutes,
        description: appt.description,
      }));

      if (apptEvents.length > 0 && doctors.length > 0) {
        const doctorId = apptEvents[0].provider;
        const matchedDoctor = doctors.find((doc) => doc.id === doctorId);
        setSelectedDoctor(
          matchedDoctor
            ? { value: matchedDoctor.id, label: `Dr. ${matchedDoctor.first_name} ${matchedDoctor.last_name}` }
            : null
        );
      } const availEvents = availabilityRes.data.map((a) => ({
        id: `avail-${a.id}`,
        title: a.is_blocked
          ? `❌ ${a.block_type || 'Blocked'} | Dr. ${a.doctor_name || 'Unknown'}`
          : `🟢 Dr. ${a.doctor_name || 'Unknown'}`,
        start: new Date(a.start_time),
        end: new Date(a.end_time),
        is_blocked: a.is_blocked,
        doctor_id: a.doctor,
        type: 'availability',
        block_type: a.block_type,
      }));      // Store blocked availability times separately for conflict checking
      const blockedTimes = availabilityRes.data
        .filter(a => a.is_blocked)
        .map(a => ({
          doctor_id: a.doctor,
          start: new Date(a.start_time),
          end: new Date(a.end_time),
          doctor_name: a.doctor_name,
          block_type: a.block_type,
        }));
      setProviderBlocks(blockedTimes);

      const combinedEvents = [...apptEvents, ...availEvents, ...holidayEvents]
        .filter(e => e && typeof e.title === 'string');

      setEvents([]);
      setTimeout(() => setEvents(combinedEvents), 50);
    } catch (error) {
      console.error('Failed to load calendar data:', error);
    }
  };

  const fetchBlockedDays = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const res = await axios.get('http://127.0.0.1:8000/api/settings/environment/', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setBlockedDays(res.data.blocked_days || []);
    } catch (err) {
      console.error('Failed to load blocked days:', err);
    }
  };

  useEffect(() => {
    async function fetchHolidays() {
      try {
        const token = localStorage.getItem('access_token');
        const res = await axios.get('http://127.0.0.1:8000/api/holidays/', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setHolidays(res.data.filter(h => h.is_recognized));
      } catch (err) {
        console.error('Failed to load holidays:', err);
      }
    }
    fetchHolidays();
  }, []);

  // Map holidays as events
  const holidayEvents = holidays.map(h => {
    const start = new Date(h.date + 'T00:00:00');
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return {
      id: `holiday-${h.id}`,
      title: `🎉 ${h.name || 'Holiday'}`,
      start,
      end,
      type: 'holiday',
      allDay: true,
    };
  });

  useEffect(() => {
    fetchDoctors().then(() => fetchAppointments());
    fetchBlockedDays();
    fetchClinicEvents();
    // eslint-disable-next-line
  }, [token]);  // Check if appointment time conflicts with provider's blocked availability
  const checkAvailabilityConflict = useCallback((startDate, durationMinutes, doctorId) => {
    // If called without params, use the current modal form data
    const start = startDate || new Date(modalFormData.appointment_datetime);
    const duration = durationMinutes || modalFormData.duration_minutes;
    const provider = doctorId || (selectedDoctor?.value);

    // If we don't have all required data, no conflict
    if (!provider || !start || !duration || isNaN(start.getTime())) {
      return false;
    }

    // When editing an existing appointment, check if we're keeping the same time
    if (isEditing && editingId) {
      const originalEvent = events.find(event => event.id === editingId);
      if (originalEvent) {
        const originalStart = new Date(originalEvent.start);
        const originalEnd = new Date(originalEvent.end);
        const currentEnd = new Date(start.getTime() + (duration * 60 * 1000));

        // If the time hasn't changed (or changed minimally), don't check for conflicts
        const timeUnchanged = Math.abs(originalStart.getTime() - start.getTime()) < 60000 && // within 1 minute
          Math.abs(originalEnd.getTime() - currentEnd.getTime()) < 60000;

        if (timeUnchanged) {
          return false;
        }
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
      const blockStart = block.start || new Date(block.start_time);
      const blockEnd = block.end || new Date(block.end_time);
      const isBlocked = block.is_blocked === true;
      const overlaps = (start < blockEnd && end > blockStart);

      return isBlocked && overlaps;
    });

    // Check if appointment time overlaps with any blocked time
    if (blockedAvailability.length > 0) {
      return 'Cannot schedule appointment during provider\'s blocked time. Please select another time.';
    }

    return false;
  }, [modalFormData.appointment_datetime, modalFormData.duration_minutes, selectedDoctor, providerBlocks, isEditing, editingId, events]); const handleDateNavigate = useCallback((newDate) => setCurrentDate(newDate), []);
  const handleViewChange = useCallback((view) => setCurrentView(view), []);

  const handleSelectSlot = ({ start }) => {
    if (userRole !== 'patient') return;
    const day = start.getDay();

    const isSameDay = (dateA, dateB) =>
      dateA.getFullYear() === dateB.getFullYear() &&
      dateA.getMonth() === dateB.getMonth() &&
      dateA.getDate() === dateB.getDate();

    const isHoliday = holidays.some(h => {
      const holidayDate = new Date(h.date + 'T00:00:00');
      return isSameDay(holidayDate, start);
    });

    if (blockedDays.includes(day) || isHoliday) {
      toast.warning('This day is blocked for scheduling.');
      return;
    }
    if (start < new Date()) {
      toast.warning('You cannot create appointments in the past.');
      return;
    }

    setIsEditing(false);
    setIsPast(false); setEditingId(null);
    setSelectedDoctor(null);
    setModalFormData({
      title: 'New Clinic Visit',
      description: '',
      duration_minutes: 30,
      recurrence: 'none',
      appointment_datetime: toLocalDatetimeString(start),
    });
    setSelectedClinicEvent(null);
    setShowModal(true);
  };

  const handleSelectEvent = (event) => {
    if (event.id.toString().startsWith('avail')) {
      //toast.warn('Edits for availability are not allowed in Calendar view.');
      return;
    }
    const past = isPastAppointment(event.start); setIsPast(past);
    setIsEditing(true);
    setEditingId(event.id);
    setModalFormData({
      title: event.title,
      description: event.description || '',
      duration_minutes: event.duration_minutes || 30,
      recurrence: 'none',
      appointment_datetime: toLocalDatetimeString(event.start),
      provider: event.provider || null,
    });
    const matchedEvent = clinicEvents.find(evt =>
      event.title?.endsWith(evt.name)
    );
    setSelectedClinicEvent(
      matchedEvent ? { value: matchedEvent.id, label: matchedEvent.name } : null
    );
    const matchedDoctor = doctors.find(doc => doc.id === event.provider);
    setSelectedDoctor(
      matchedDoctor
        ? { value: matchedDoctor.id, label: `Dr. ${matchedDoctor.first_name} ${matchedDoctor.last_name}` }
        : null
    );
    setShowModal(true);
  }; const handleModalSave = async () => {
    // Validate required fields
    if (!modalFormData.appointment_datetime) {
      toast.error('Please select an appointment date and time.');
      return;
    }

    if (!selectedDoctor?.value) {
      toast.error('Please select a provider for this appointment.');
      return;
    }    // Check for availability conflicts before saving
    const appointmentStart = new Date(modalFormData.appointment_datetime);
    const conflictResult = checkAvailabilityConflict(
      appointmentStart,
      modalFormData.duration_minutes,
      selectedDoctor.value
    );

    if (conflictResult) {
      toast.error(conflictResult);
      return;
    }

    const cleanTitle = modalFormData.title.split(' - ').slice(-1).join(' - ');
    const payload = {
      ...modalFormData,
      title: selectedClinicEvent?.label || cleanTitle,
      provider: selectedDoctor?.value || null,
    };
    if ((userRole === 'admin' || userRole === 'system_admin' || userRole === 'registrar') && modalFormData.patient) {
      payload.patient = modalFormData.patient;
    }
    try {
      if (isEditing && editingId) {
        const cleanId = editingId.toString().replace('appt-', '');
        await axios.put(`http://127.0.0.1:8000/api/appointments/${cleanId}/`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        toast.success('Appointment updated!');
        if (onUpdate) onUpdate();
      } else {
        await axios.post('http://127.0.0.1:8000/api/appointments/', payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        toast.success('Appointment created!');
      }
      setShowModal(false);
      setModalFormData({
        title: '',
        description: '',
        duration_minutes: 30,
        recurrence: 'none',
        appointment_datetime: '',
      });
      setEditingId(null);
      setIsEditing(false);
      setSelectedDoctor(null);
      fetchAppointments();
    } catch (err) {
      console.error(err);
      toast.error('Failed to save appointment.');
    }
  };

  const handleDeleteAppointment = async () => {
    if (!editingId) return;
    const confirmDelete = window.confirm("Are you sure you want to delete this appointment?");
    if (!confirmDelete) return;
    try {
      const cleanId = editingId.toString().replace('appt-', '');
      await axios.delete(`http://127.0.0.1:8000/api/appointments/${cleanId}/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success('Appointment deleted!');
      setShowModal(false);
      setEditingId(null);
      fetchAppointments();
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete appointment.');
    }
  };

  const eventStyleGetter = (event) => {
    const now = new Date();
    const isPast = new Date(event.start) < now;
    if (event.type === 'holiday') {
      return {
        style: {
          backgroundColor: '#fff3cd',
          color: '#856404',
          border: '1px dashed #856404',
          fontWeight: 'bold',
        }
      };
    }
    let backgroundColor = isPast ? '#6c757d' : '#0d6efd';
    if (event.type === 'availability') {
      backgroundColor = event.is_blocked
        ? '#f8d7da'
        : '#d1e7dd';
    }
    return {
      style: {
        backgroundColor,
        color: 'black',
        borderRadius: '5px',
        padding: '4px',
        border: '2px solid white',
        fontWeight: event.type === 'availability' ? '500' : 'normal',
      },
    };
  };

  const dayPropGetter = (date) => {
    const day = date.getDay();
    const isSameDay = (dateA, dateB) =>
      dateA.getFullYear() === dateB.getFullYear() &&
      dateA.getMonth() === dateB.getMonth() &&
      dateA.getDate() === dateB.getDate();
    const isHoliday = holidays.some(h => {
      const holidayDate = new Date(h.date + 'T00:00:00');
      return isSameDay(holidayDate, date);
    });
    if (blockedDays.includes(day) || isHoliday) {
      return {
        className: 'disabled-day',
        style: {
          backgroundColor: isHoliday ? '#ffe7ba' : '#f8d7da',
          pointerEvents: 'none',
          color: '#ccc',
        },
      };
    }
    return {};
  };

  function CustomDateHeader({ date, holidays, setCurrentView, setCurrentDate }) {
    const holiday = holidays.find(h => {
      const holidayDate = new Date(h.date + 'T00:00:00');
      return (
        holidayDate.getFullYear() === date.getFullYear() &&
        holidayDate.getMonth() === date.getMonth() &&
        holidayDate.getDate() === date.getDate()
      );
    });
    const handleClick = (e) => {
      e.stopPropagation();
      setCurrentView('day');
      setCurrentDate(date);
    };
    return (
      <div style={{ minHeight: 32 }}>
        <span
          style={{ cursor: 'pointer', fontWeight: 600, color: '#0d6efd' }}
          onClick={handleClick}
          title="Go to day view"
        >
          {date.getDate().toString().padStart(2, '0')}
        </span>
        {holiday && (
          <div style={{ color: '#c79100', fontWeight: 600, fontSize: 12 }}>
            {holiday.name}
          </div>
        )}
      </div>
    );
  }
  // Removed duplicate checkAvailabilityConflict implementation
  useEffect(() => {
    const loadProviderBlocks = async () => {
      if (!selectedDoctor) return;
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

  return (
    <Box sx={{ mt: 4, boxShadow: 2, borderRadius: 2, bgcolor: 'background.paper' }}>
      <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between" sx={{ mb: 3, p: 2 }}>
        {(userRole === 'admin' || userRole === 'registrar' || userRole === 'system_admin') && (<BackButton />
        )}
        <Box sx={{ position: 'relative', width: 300 }}>
          <TextField
            fullWidth
            size="small"
            variant="outlined"
            placeholder="Search appointments..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            InputProps={{
              endAdornment: searchQuery && (
                <IconButton
                  size="small"
                  onClick={() => setSearchQuery('')}
                  sx={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)' }}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              )
            }}
          />
        </Box>
        {/* Commented out doctor selection dropdown
        (userRole === 'admin' || userRole === 'registrar' || userRole === 'system_admin') && (
          <Box sx={{ width: 300 }}>
            <Select
              options={doctors.map((doc) => ({
                value: doc.id,
                label: `Dr. ${doc.first_name} ${doc.last_name}`,
              }))}
              placeholder="Select Doctor availability"
              value={selectedDoctor}
              onChange={setSelectedDoctor}
              isClearable
              styles={{
                control: (base) => ({ ...base, height: 38, minHeight: 38 }),
                menu: (base) => ({ ...base, zIndex: 9999 }),
              }}
            />
          </Box>
        )
        */}

      </Stack>
      <Box className="card-body">
        <Box sx={{ height: 600, maxWidth: '100%' }}>
          <Calendar
            localizer={localizer}
            events={events
              .filter(event => {
                if (userRole === 'patient' && event.id.toString().startsWith('avail')) {
                  return false;
                }
                if (event.type === 'appointment') {
                  return event.title.toLowerCase().includes(searchQuery.toLowerCase());
                }
                return true;
              })
              .filter(event => {
                if ((userRole === 'admin' || userRole === 'registrar' || userRole === 'system_admin') && event.type === 'availability' && selectedDoctor) {
                  return String(event.doctor_id) === String(selectedDoctor.value);
                }
                return true;
              })}
            startAccessor="start"
            endAccessor="end"
            view={currentView}
            onView={handleViewChange}
            date={currentDate}
            onNavigate={handleDateNavigate}
            defaultView="month"
            views={['month', 'work_week', 'day']}
            eventPropGetter={eventStyleGetter}
            dayPropGetter={dayPropGetter}
            selectable
            onSelectSlot={handleSelectSlot}
            onSelectEvent={handleSelectEvent}
            min={new Date(1970, 1, 1, 8, 0, 0)}
            max={new Date(1970, 1, 1, 18, 0, 0)}
            step={15}
            timeslots={2}
            components={{
              toolbar: (toolbarProps) => (
                <CustomToolbar {...toolbarProps} />
              ),
              month: {
                dateHeader: (props) => (
                  <CustomDateHeader
                    {...props}
                    holidays={holidays}
                    setCurrentView={setCurrentView}
                    setCurrentDate={setCurrentDate}
                  />
                ),
              },
            }}
          />

          <Dialog open={showModal} onClose={() => setShowModal(false)} maxWidth="sm" fullWidth>            <DialogTitle>{isEditing ? 'Edit Appointment' : 'Create Appointment'}</DialogTitle>            <DialogContent dividers>
            {isPast && <Alert severity="warning">⚠️ Past appointments cannot be edited.</Alert>}
            <Stack spacing={2} mt={2}>
              {/* Clinic Visit Type */}
              <FormControl fullWidth size="small">
                <InputLabel id="clinic-event-label">Clinic Visit Type</InputLabel>
                <MUISelect
                  labelId="clinic-event-label"
                  value={selectedClinicEvent ? selectedClinicEvent.value : ''}
                  label="Clinic Visit Type"
                  onChange={(e) => {
                    const selected = clinicEvents.find(evt => evt.id === e.target.value);
                    setSelectedClinicEvent(selected ? { value: selected.id, label: selected.name } : null);
                    setModalFormData(prev => ({ ...prev, title: selected ? selected.name : '' }));
                  }}
                  disabled={isPast}
                >
                  <MenuItem value=""><em>None</em></MenuItem>
                  {clinicEvents.map(evt => (
                    <MenuItem key={evt.id} value={evt.id}>{evt.name}</MenuItem>
                  ))}
                </MUISelect>
              </FormControl>
              {/* Description */}
              <TextField
                label="Description"
                multiline
                minRows={3}
                value={modalFormData.description}
                onChange={(e) => setModalFormData({ ...modalFormData, description: e.target.value })}
                disabled={isPast}
                fullWidth
                size="small"
              />
              {/* Date & Time */}
              <TextField
                label="Date & Time"
                type="datetime-local"
                value={modalFormData.appointment_datetime}
                onChange={(e) => setModalFormData({ ...modalFormData, appointment_datetime: e.target.value })}
                disabled={isPast}
                fullWidth
                size="small"
                InputLabelProps={{ shrink: true }}
              />
              {/* Duration */}
              <TextField
                label="Duration (minutes)"
                type="number"
                value={modalFormData.duration_minutes}
                onChange={(e) => {
                  const value = parseInt(e.target.value) || 0;
                  setModalFormData({ ...modalFormData, duration_minutes: value })
                }}
                disabled={isPast}
                fullWidth
                size="small"
              />
              {/* Recurrence */}
              <FormControl fullWidth size="small">
                <InputLabel id="recurrence-label">Recurrence</InputLabel>
                <MUISelect
                  labelId="recurrence-label"
                  value={modalFormData.recurrence}
                  label="Recurrence"
                  onChange={(e) => setModalFormData({ ...modalFormData, recurrence: e.target.value })}
                  disabled={isPast}
                >
                  <MenuItem value="none">None</MenuItem>
                  <MenuItem value="daily">Daily</MenuItem>
                  <MenuItem value="weekly">Weekly</MenuItem>
                  <MenuItem value="monthly">Monthly</MenuItem>
                </MUISelect>
              </FormControl>
              {/* Select Doctor */}
              <FormControl fullWidth size="small">
                <InputLabel id="doctor-label">Select Doctor</InputLabel>
                <MUISelect
                  labelId="doctor-label"
                  value={selectedDoctor ? selectedDoctor.value : ''}
                  label="Select Doctor"
                  onChange={(e) => {
                    const selected = doctors.find(doc => doc.id === e.target.value);
                    setSelectedDoctor(selected ? { value: selected.id, label: `Dr. ${selected.first_name} ${selected.last_name}` } : null);
                  }}
                  disabled={isPast}
                >
                  <MenuItem value=""><em>None</em></MenuItem>
                  {doctors.map(doc => (
                    <MenuItem key={doc.id} value={doc.id}>{`Dr. ${doc.first_name} ${doc.last_name}`}</MenuItem>
                  ))}
                </MUISelect>
              </FormControl>
            </Stack>
          </DialogContent>
            <DialogActions>
              <Tooltip title="Close without saving">
                <Button onClick={() => setShowModal(false)} color="secondary">
                  Cancel
                </Button>
              </Tooltip>
              {isEditing && !isPast && (
                <Tooltip title="Delete this appointment">
                  <Button color="error" onClick={handleDeleteAppointment}>
                    Delete
                  </Button>
                </Tooltip>
              )}              <Tooltip title={
                isEditing
                  ? 'Update appointment'
                  : 'Save new appointment'
              }>
                <span>                  <Button
                  onClick={handleModalSave}
                  variant="contained"
                  disabled={isEditing && isPast}
                >
                  {isEditing ? 'Update' : 'Save'}
                </Button>
                </span>
              </Tooltip>
            </DialogActions>
          </Dialog>
        </Box>
      </Box>
    </Box>
  );
}

export default CalendarView;
