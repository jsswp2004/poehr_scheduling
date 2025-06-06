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
  Button, TextField, Tooltip, IconButton, Box, Stack, MenuItem, FormControl, InputLabel, Select as MUISelect, Alert,
  List, ListItem, ListItemText, Typography, Chip
} from '@mui/material';
import BackButton from './BackButton';
import CloseIcon from '@mui/icons-material/Close';

function CustomToolbar({ date, label, onNavigate, views, view, onView, searchQuery, onSearchChange }) {
  const [showPicker, setShowPicker] = useState(false);
  return (
    <div className="rbc-toolbar d-flex align-items-center justify-content-between mb-2">
      {/* Search Field - positioned on the left after navigation controls */}
      <div style={{ position: 'relative', width: '250px', marginLeft: '16px', marginRight: '6px' }}>
          <TextField
            fullWidth
            size="small"
            variant="outlined"
            placeholder="Search appointments..."
            value={searchQuery}
            onChange={onSearchChange}
            sx={{ 
              '& .MuiOutlinedInput-root': { 
                height: '29px',
                fontSize: '14px'
              }
            }}
            InputProps={{
              endAdornment: searchQuery && (
                <IconButton
                  size="small"
                  onClick={() => onSearchChange({ target: { value: '' } })}
                  sx={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)' }}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              )
            }}
          />
      </div>
      <div className="d-flex align-items-center">        
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
      </div>
      <span className="rbc-btn-group ms-2">        {views.map(v => (
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
  const [currentDate, setCurrentDate] = useState(new Date());  const [events, setEvents] = useState([]);
  const [blockedDays, setBlockedDays] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [clinicEvents, setClinicEvents] = useState([]);
  const [selectedClinicEvent, setSelectedClinicEvent] = useState(null);
  const [providerBlocks, setProviderBlocks] = useState([]);
  const [availabilityEvents, setAvailabilityEvents] = useState([]); // Store availability for modal use only
  const [showAvailabilityModal, setShowAvailabilityModal] = useState(false);
  const [selectedDateAvailability, setSelectedDateAvailability] = useState(null);
  const [preventSlotSelection, setPreventSlotSelection] = useState(false);

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
  };  const fetchAppointments = async () => {
    try {
      console.log('Fetching appointments for user role:', userRole);
      
      const appointmentsPromise = axios.get('http://127.0.0.1:8000/api/appointments/', { 
        headers: { Authorization: `Bearer ${token}` } 
      }).catch(error => {
        console.error('Appointments API error:', error.response?.status, error.response?.data);
        throw error;
      });
      
      const availabilityPromise = axios.get('http://127.0.0.1:8000/api/availability/', { 
        headers: { Authorization: `Bearer ${token}` } 
      }).catch(error => {
        console.error('Availability API error:', error.response?.status, error.response?.data);
        throw error;
      });

      const [appointmentsRes, availabilityRes] = await Promise.all([
        appointmentsPromise,
        availabilityPromise
      ]);

      console.log('Appointments response:', appointmentsRes.data.length, 'appointments');
      console.log('First few appointments:', appointmentsRes.data.slice(0, 3));

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
      }      const availEvents = availabilityRes.data.map((a) => ({
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
      }));      // Store availability events separately for modal use only
      setAvailabilityEvents(availEvents);

      // Store blocked availability times separately for conflict checking
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

      // Filter availability events to only show BLOCKED (red) events, not available (green) events
      const blockedAvailEvents = availEvents.filter(event => event.is_blocked);

      // Combine events WITH blocked availability events but WITHOUT available (green) events
      const combinedEvents = [...apptEvents, ...blockedAvailEvents, ...holidayEvents]
        .filter(e => e && typeof e.title === 'string');setEvents([]);
      setTimeout(() => setEvents(combinedEvents), 50);
    } catch (error) {
      console.error('Failed to load calendar data:', error);
      console.error('Error details:', error.response?.data);
      console.error('Error status:', error.response?.status);
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

  // Separate function to fetch availability events for the modal
  const fetchAvailabilityEvents = async () => {
    try {
      console.log('🔍 Fetching availability events for modal...');
      const res = await axios.get('http://127.0.0.1:8000/api/availability/', {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log('📡 Raw availability API response:', res.data);
      
      if (!res.data || res.data.length === 0) {
        console.log('⚠️ No availability data found in the API response');
        setAvailabilityEvents([]);
        return;
      }
      
      const events = res.data.map(avail => {
        const start = new Date(avail.start_time);
        const end = new Date(avail.end_time);
        return {
          id: `avail-${avail.id}`,
          title: avail.is_blocked ? 'Blocked' : 'Available',
          start,
          end,
          type: 'availability',
          is_blocked: avail.is_blocked,
          doctor_id: avail.doctor,
          doctor: avail.doctor,
          doctor_name: avail.doctor_name,
          block_type: avail.block_type
        };
      });
      
      console.log('✅ Processed availability events:', events);
      setAvailabilityEvents(events);
    } catch (err) {
      console.error('❌ Failed to fetch availability events:', err);
      setAvailabilityEvents([]);
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
  });  // Function to get available providers for a specific date
  const getAvailableProvidersForDate = (date) => {
    const dateStr = moment(date).format('YYYY-MM-DD');
    return doctors.filter(doctor => {
      // Check if doctor has any available (non-blocked) time blocks on this date
      const hasAvailability = availabilityEvents.some(event => {
        if (event.type !== 'availability') return false;
        
        const eventDate = moment(event.start).format('YYYY-MM-DD');
        const eventDoctor = event.doctor_id;
        
        return String(eventDoctor) === String(doctor.id) && 
               eventDate === dateStr &&
               !event.is_blocked; // Only count non-blocked availability
      });
      return hasAvailability;
    });  };  // Handle date click to show availability
  const handleDateClick = async (date) => {
    console.log('🗓️ handleDateClick called for date:', date);
    console.log('👨‍⚕️ Available doctors:', doctors.length);
    console.log('📋 Available availabilityEvents:', availabilityEvents.length);
    console.log('📝 Sample availabilityEvents:', availabilityEvents.slice(0, 3));
    
    const dateStr = moment(date).format('YYYY-MM-DD');
    console.log('🔍 Looking for availability on date:', dateStr);
    
    // Extract user role and provider information from JWT token
    let currentUserRole = null;
    let assignedProviderId = null;
    
    if (token) {
      try {
        const decoded = jwtDecode(token);
        currentUserRole = decoded.role;
        
        // If user is a patient, we need to get their assigned provider
        // This will need to be fetched from the user's profile since it's not in the JWT
        console.log('🔐 Current user role:', currentUserRole);
      } catch (err) {
        console.error('Failed to decode token:', err);
      }
    }
    
    // First, let's see ALL availability events for this date (both blocked and available)
    const allAvailabilityForDate = availabilityEvents.filter(event => {
      if (event.type !== 'availability') return false;
      const eventDate = moment(event.start).format('YYYY-MM-DD');
      return eventDate === dateStr;
    });
    
    console.log('📊 All availability events for this date:', allAvailabilityForDate);
    
    // Get providers with availability data for this date
    const allProvidersWithAnyAvailability = doctors.filter(doctor => {
      const anySlots = availabilityEvents.filter(event => {
        if (event.type !== 'availability') return false;
        
        const eventDate = moment(event.start).format('YYYY-MM-DD');
        const eventDoctor = event.doctor_id;
        
        return String(eventDoctor) === String(doctor.id) && eventDate === dateStr;
      });
      
      return anySlots.length > 0;
    }).map(doctor => {
      const allSlots = availabilityEvents.filter(event => {
        if (event.type !== 'availability') return false;
        
        const eventDate = moment(event.start).format('YYYY-MM-DD');
        const eventDoctor = event.doctor_id;
        
        return String(eventDoctor) === String(doctor.id) && eventDate === dateStr;
      }).map(slot => ({
        start: moment(slot.start).format('h:mm A'),
        end: moment(slot.end).format('h:mm A'),
        duration: moment(slot.end).diff(moment(slot.start), 'minutes'),
        isBlocked: slot.is_blocked
      }));
      
      return {
        ...doctor,
        timeSlots: allSlots
      };
    });
    
    console.log('🏥 All providers with ANY availability (blocked or not):', allProvidersWithAnyAvailability);
      // Role-based filtering logic
    let providersToShow = [];
    
    if (currentUserRole === 'patient') {
      // For patients: Fetch their assigned provider and only show if available
      console.log('🔍 Patient detected - fetching assigned provider...');
      
      try {
        const userResponse = await axios.get('http://127.0.0.1:8000/api/users/me/', {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        const currentUser = userResponse.data;
        const assignedProviderId = currentUser.provider;
        
        console.log('👤 Current user info:', currentUser);
        console.log('🏥 Assigned provider ID:', assignedProviderId);
        
        if (assignedProviderId) {
          // Filter to only show the assigned provider if they have AVAILABLE (non-blocked) slots
          const assignedProviderWithAvailability = allProvidersWithAnyAvailability.find(provider => {
            return String(provider.id) === String(assignedProviderId) && 
                   provider.timeSlots.some(slot => !slot.isBlocked);
          });
          
          if (assignedProviderWithAvailability) {
            // Only show non-blocked slots for the assigned provider
            const availableSlots = assignedProviderWithAvailability.timeSlots.filter(slot => !slot.isBlocked);
            providersToShow = [{
              ...assignedProviderWithAvailability,
              timeSlots: availableSlots
            }];
            console.log('✅ Showing assigned provider with available slots:', providersToShow);
          } else {
            // Assigned provider has no available slots on this date
            providersToShow = [];
            console.log('❌ Assigned provider has no available slots on this date');
          }
        } else {
          // Patient has no assigned provider
          providersToShow = [];
          console.log('⚠️ Patient has no assigned provider');
        }
      } catch (err) {
        console.error('❌ Failed to fetch user profile for patient filtering:', err);
        // Fallback to showing all providers with available slots
        const providersWithAvailableSlots = allProvidersWithAnyAvailability.filter(provider => {
          return provider.timeSlots.some(slot => !slot.isBlocked);
        });
        providersToShow = providersWithAvailableSlots;
      }
    } else {
      // For non-patients (admin, doctor, registrar, etc.): show all providers with availability data
      providersToShow = allProvidersWithAnyAvailability.length > 0 
        ? allProvidersWithAnyAvailability 
        : doctors.map(doctor => ({
            ...doctor,
            timeSlots: [{ 
              start: 'No schedule data', 
              end: 'available', 
              duration: 0, 
              isBlocked: false 
            }]
          }));
    }
    
    console.log('📋 Final providers to show in modal (after role filtering):', providersToShow);
    
    setSelectedDateAvailability({
      date: dateStr,
      dateFormatted: moment(date).format('MMMM D, YYYY'),
      providers: providersToShow
    });
    setShowAvailabilityModal(true);
  };
  useEffect(() => {
    fetchDoctors().then(() => fetchAppointments());
    fetchBlockedDays();
    fetchClinicEvents();
    fetchAvailabilityEvents(); // Add this to specifically fetch availability events for the modal
    // eslint-disable-next-line
  }, [token]);// Check if appointment time conflicts with provider's blocked availability
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
    
    // Check if we should prevent slot selection (e.g., if availability modal was just opened)
    if (preventSlotSelection) {
      setPreventSlotSelection(false);
      return;
    }
    
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
    setIsPast(false);
    setEditingId(null);
    setSelectedDoctor(null);
    setShowModal(true);
    setModalFormData({
      title: 'New Clinic Visit',
      description: '',
      duration_minutes: 30,
      recurrence: 'none',
      appointment_datetime: toLocalDatetimeString(start),
    });
    setSelectedClinicEvent(null);
    
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
  };  function CustomDateHeader({ date, holidays, setCurrentView, setCurrentDate, handleDateClick, setPreventSlotSelection }) {
    const holiday = holidays.find(h => {
      const holidayDate = new Date(h.date + 'T00:00:00');
      return (
        holidayDate.getFullYear() === date.getFullYear() &&
        holidayDate.getMonth() === date.getMonth() &&
        holidayDate.getDate() === date.getDate()
      );
    });
    const handleDayViewClick = (e) => {
      e.stopPropagation();
      setCurrentView('day');
      setCurrentDate(date);
    };
    const handleAvailabilityClick = (e) => {
      e.stopPropagation();
      e.preventDefault();
      
      // Set flag to prevent slot selection
      setPreventSlotSelection(true);
      
      // Call the date click handler to show availability
      handleDateClick(date);
      
      // Reset the flag after a short delay
      setTimeout(() => {
        setPreventSlotSelection(false);
      }, 100);
    };
    return (
      <div style={{ minHeight: 32 }}>
        <span
          style={{ cursor: 'pointer', fontWeight: 600, color: '#0d6efd' }}
          onClick={handleDayViewClick}
          title="Go to day view"
        >
          {date.getDate().toString().padStart(2, '0')}
        </span>
        <span 
          style={{ cursor: 'pointer', fontSize: '12px', color: '#28a745', marginLeft: '4px' }}
          onClick={handleAvailabilityClick}
          title="View available providers"
        >
          📅
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
            timeslots={2}            components={{
              toolbar: (toolbarProps) => (
                <CustomToolbar 
                  {...toolbarProps} 
                  searchQuery={searchQuery}
                  onSearchChange={(e) => setSearchQuery(e.target.value)}
                />
              ),
              month: {
                dateHeader: (props) => (
                  <CustomDateHeader
                    {...props}
                    holidays={holidays}
                    setCurrentView={setCurrentView}
                    setCurrentDate={setCurrentDate}
                    handleDateClick={handleDateClick}
                    setPreventSlotSelection={setPreventSlotSelection}
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
              </Tooltip>            </DialogActions>
          </Dialog>

          {/* Availability Modal */}
          <Dialog 
            open={showAvailabilityModal} 
            onClose={() => setShowAvailabilityModal(false)} 
            maxWidth="sm" 
            fullWidth
          >
            <DialogTitle>
              Available Providers
              {selectedDateAvailability && (
                <Typography variant="subtitle2" color="text.secondary">
                  {selectedDateAvailability.dateFormatted}
                </Typography>
              )}
            </DialogTitle>
            <DialogContent dividers>              {selectedDateAvailability && (
                <Box>
                  {selectedDateAvailability.providers.length > 0 ? (
                    <List>
                      {selectedDateAvailability.providers.map((provider) => (
                        <ListItem key={provider.id} divider>
                          <ListItemText
                            primary={`Dr. ${provider.first_name} ${provider.last_name}`}
                            secondary={
                              <Box>
                                <Typography variant="body2" color="text.secondary">
                                  Specialization: {provider.specialization || 'General'}
                                </Typography>                                {provider.timeSlots && provider.timeSlots.length > 0 && (
                                  <Box sx={{ mt: 1 }}>
                                    <Typography variant="caption" color="text.secondary">
                                      Time Slots:
                                    </Typography>
                                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                                      {provider.timeSlots.map((slot, index) => (
                                        <Chip
                                          key={index}
                                          label={`${slot.start} - ${slot.end}${slot.isBlocked !== undefined ? (slot.isBlocked ? ' (Blocked)' : ' (Available)') : ''}`}
                                          variant="outlined"
                                          size="small"
                                          color={slot.isBlocked === true ? "error" : slot.isBlocked === false ? "success" : "primary"}
                                        />
                                      ))}
                                    </Box>
                                  </Box>
                                )}
                              </Box>
                            }
                          />
                          <Chip
                            label="Available"
                            color="success"
                            size="small"
                          />
                        </ListItem>
                      ))}
                    </List>
                  ) : (
                    <Typography color="text.secondary" align="center" sx={{ py: 3 }}>
                      No providers available on this date.
                    </Typography>
                  )}
                </Box>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setShowAvailabilityModal(false)} color="primary">
                Close
              </Button>
            </DialogActions>
          </Dialog>
        </Box>
      </Box>
    </Box>
  );
}

export default CalendarView;
