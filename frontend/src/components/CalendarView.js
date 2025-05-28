import { Calendar, momentLocalizer} from 'react-big-calendar';
import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { parseISO } from 'date-fns';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import moment from 'moment';
import { Modal, Button, Form, Row, Col, OverlayTrigger, Tooltip } from 'react-bootstrap';
import { toast } from 'react-toastify';
import Select from 'react-select';
import { jwtDecode } from 'jwt-decode';
import { useNavigate } from 'react-router-dom';
import 'react-datepicker/dist/react-datepicker.css';
// Place at the top of your CalendarView.js
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

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
      {/* 🟢 View Switch Buttons */}
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
  const navigate = useNavigate(); 
  const [showModal, setShowModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
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
  const [events, setEvents] = useState([]);
  const [blockedDays, setBlockedDays] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [clinicEvents, setClinicEvents] = useState([]);
  const [selectedClinicEvent, setSelectedClinicEvent] = useState(null);


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
  if (userRole === 'doctor') {
    defaultView = 'day';
  } else if (userRole === 'registrar') {
    defaultView = 'work_week';
  }
  const [currentView, setCurrentView] = useState(defaultView);

  const fetchDoctors = async () => {
    try {
      const res = await axios.get('http://127.0.0.1:8000/api/users/doctors/', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDoctors(res.data);
      console.log("Fetched doctors:", res.data);
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
        axios.get('http://127.0.0.1:8000/api/appointments/', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        axios.get('http://127.0.0.1:8000/api/availability/', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      console.log("📥 Appointments response:", appointmentsRes.data);

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
      }

      const availEvents = availabilityRes.data.map((a) => ({
        id: `avail-${a.id}`,
        title: `${a.is_blocked ? '❌ Blocked' : '🟢'} Dr. ${a.doctor_name || 'Unknown'}`,
        start: new Date(a.start_time),
        end: new Date(a.end_time),
        is_blocked: a.is_blocked,
        doctor_id: a.doctor,
        type: 'availability',
      }));

      const combinedEvents = [...apptEvents, ...availEvents, ...holidayEvents]
      .filter(e => e && typeof e.title === 'string');

      console.log("🧠 Mapped events with duration:", apptEvents);


      setEvents([]);
      setTimeout(() => setEvents(combinedEvents), 50);
      console.log("🗓️ Combined events:", combinedEvents);

    } catch (error) {
      console.error('Failed to load calendar data:', error);
    }
  };

  // --- Blocked Days Fetch ---
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


// Fetch recognized holidays
  useEffect(() => {
    async function fetchHolidays() {
      try {
        const token = localStorage.getItem('access_token');
        const res = await axios.get('http://127.0.0.1:8000/api/holidays/', {
          headers: { Authorization: `Bearer ${token}` }
        });
        // Only keep holidays that are recognized
        setHolidays(res.data.filter(h => h.is_recognized));
        console.log('Loaded recognized holidays:', res.data.filter(h => h.is_recognized));
      } catch (err) {
        console.error('Failed to load holidays:', err);
      }
    }
    fetchHolidays();
  }, []);

  // Map recognized holidays as events
  const holidayEvents = holidays.map(h => {
    const start = new Date(h.date + 'T00:00:00');
    // End is next day at midnight (to show full all-day block)
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

  console.log("🧠 Mapped holidays:", holidayEvents);

  useEffect(() => {
    fetchDoctors().then(() => fetchAppointments());
    fetchBlockedDays();
    fetchClinicEvents();
  }, [token]);

  const handleDateNavigate = useCallback((newDate) => setCurrentDate(newDate), []);
  const handleViewChange = useCallback((view) => setCurrentView(view), []);

  // --- BLOCKED DAYS ENFORCEMENT ---
  const handleSelectSlot = ({ start }) => {
    if (userRole !== 'patient') {
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

    if (blockedDays.includes(day)) {
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
    setSelectedDate(start);
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
      toast.warn('Edits for availability are not allowed in Calendar view.');
      return;
    }

    const past = isPastAppointment(event.start);
    setIsPast(past);
    setIsEditing(true);
    setEditingId(event.id);
    setSelectedDate(new Date(event.start));
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
  };

  const handleModalSave = async () => {
    const cleanTitle = modalFormData.title.split(' - ').slice(-1).join(' - ');
    const payload = {
      ...modalFormData,
      title: selectedClinicEvent?.label || cleanTitle,
      provider: selectedDoctor?.value || null,
    };
    // For admin and system_admin, allow setting patient (if modalFormData.patient is present)
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

    // 🎉 Holiday styling comes first
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


  // --- BLOCKED DAYS: gray out in calendar ---
  const dayPropGetter = (date) => {
    const day = date.getDay();
    // Check if this date matches any recognized holiday
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
 
  // A custom date header that displays the holiday name if that day is a holiday and allows clicking the date to go to day view.
  function CustomDateHeader({ date, holidays, setCurrentView, setCurrentDate }) {
    // Find if this date is a holiday
    const holiday = holidays.find(h => {
      const holidayDate = new Date(h.date + 'T00:00:00');
      return (
        holidayDate.getFullYear() === date.getFullYear() &&
        holidayDate.getMonth() === date.getMonth() &&
        holidayDate.getDate() === date.getDate()
      );
    });

    // Handler for clicking the date number
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


  // --- For debugging only ---
  // console.log("All events:", events);
  // console.log("Selected doctor:", selectedDoctor); 
  // console.log("User role:", userRole); 
  console.log("Blocked days:", blockedDays);
  return (
    <div className="card mt-4">
      <div className="d-flex justify-content-between align-items-center mb-3" style={{ padding: '10px', gap: '10px' }}>
        <div className="d-flex align-items-center gap-2">
          <div className="position-relative" style={{ width: '300px' }}>
            <Form.Control
              type="text"
              placeholder="Search appointments..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ height: '38px' }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="btn btn-sm btn-light position-absolute"
                style={{
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  padding: '0 6px',
                  borderRadius: '50%',
                  lineHeight: '1',
                }}
              >
                &times;
              </button>
            )}
          </div>
        </div>
        {(userRole === 'admin' || userRole === 'registrar' || userRole === 'system_admin') && (
          <div style={{ width: '300px' }}>
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
                control: (base) => ({
                  ...base,
                  height: 38,
                  minHeight: 38,
                }),
                menu: (base) => ({
                  ...base,
                  zIndex: 9999,
                }),
              }}
            />
          </div>
        )}
        {(userRole === 'admin' || userRole === 'system_admin') && (
        <Button
          variant="outline-secondary"
          onClick={() => navigate("/admin")}
          style={{ height: '38px', padding: '0 12px' }}
          className="btn w-12.5"
        >
          ← Back
        </Button>
        )}
      </div>

      <div className="card-body">
        <div style={{ height: '600px', maxWidth: '100%' }}>
          <Calendar
            localizer={localizer}
            events={events
              .filter(event => {
                if (userRole === 'patient' && event.id.toString().startsWith('avail')) {
                  return false;
                }
                if (event.type === 'appointment') {
                  // Always filter by searchQuery for all users
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
            // 🟢 THIS IS ALL YOU NEED FOR BOTH TOOLBAR AND DATE HEADER:
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

          <Modal show={showModal} onHide={() => setShowModal(false)}>
            <Modal.Header closeButton>
              <Modal.Title>{isEditing ? 'Edit Appointment' : 'Create Appointment'}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              {isPast && <div className="alert alert-warning">⚠️ Past appointments cannot be edited.</div>}

              <Form>
                <Form.Group className="mb-3">
                  <Form.Label>Clinic Visit Type</Form.Label>
                  <Select
                    options={clinicEvents.map(evt => ({
                      value: evt.id,
                      label: evt.name
                    }))}
                    placeholder="Select clinic visit..."
                    value={selectedClinicEvent}
                    onChange={(selected) => {
                      setSelectedClinicEvent(selected);
                      setModalFormData(prev => ({
                        ...prev,
                        title: selected ? selected.label : ''
                      }));
                    }}
                    isClearable
                    isDisabled={isPast}
                    styles={{
                      menu: (base) => ({ ...base, zIndex: 9999 }),
                    }}
                  />
                </Form.Group>



                <Form.Group className="mb-3">
                  <Form.Label>Description</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={3}
                    value={modalFormData.description}
                    onChange={(e) => setModalFormData({ ...modalFormData, description: e.target.value })}
                    disabled={isPast}
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Date & Time</Form.Label>
                  <Form.Control
                    type="datetime-local"
                    value={modalFormData.appointment_datetime}
                    onChange={(e) => setModalFormData({ ...modalFormData, appointment_datetime: e.target.value })}
                    disabled={isPast}
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Duration (minutes)</Form.Label>
                  <Form.Control
                    type="number"
                    value={modalFormData.duration_minutes}
                    onChange={(e) => {
                      const value = parseInt(e.target.value) || 0;
                      setModalFormData({ ...modalFormData, duration_minutes: value })
                    }}
                    disabled={isPast}
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Recurrence</Form.Label>
                  <Form.Select
                    value={modalFormData.recurrence}
                    onChange={(e) => setModalFormData({ ...modalFormData, recurrence: e.target.value })}
                    disabled={isPast}
                  >
                    <option value="none">None</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </Form.Select>
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Select Doctor</Form.Label>
                  <Select
                    options={doctors.map((doc) => ({
                      value: doc.id,
                      label: `Dr. ${doc.first_name} ${doc.last_name}`,
                    }))}
                    placeholder="Assign a doctor..."
                    value={selectedDoctor}
                    onChange={setSelectedDoctor}
                    isClearable
                    isDisabled={isPast}
                    styles={{
                      menu: (base) => ({
                        ...base,
                        zIndex: 9999,
                      }),
                    }}
                  />
                </Form.Group>
              </Form>
            </Modal.Body>
            <Modal.Footer>
              <OverlayTrigger placement="top" overlay={<Tooltip>Close without saving</Tooltip>}>
                <Button variant="secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </Button>
              </OverlayTrigger>
              {isEditing && !isPast && (
                <OverlayTrigger placement="top" overlay={<Tooltip>Delete this appointment</Tooltip>}>
                  <Button variant="danger" onClick={handleDeleteAppointment}>
                    Delete
                  </Button>
                </OverlayTrigger>
              )}
              <OverlayTrigger
                placement="top"
                overlay={<Tooltip>{isEditing ? 'Update appointment' : 'Save new appointment'}</Tooltip>}
              >
                <Button variant="primary" onClick={handleModalSave} disabled={isEditing && isPast}>
                  {isEditing ? 'Update' : 'Save'}
                </Button>
              </OverlayTrigger>
            </Modal.Footer>
          </Modal>
        </div>
      </div>
    </div>
  );
}

export default CalendarView;
