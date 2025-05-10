import { Calendar, momentLocalizer} from 'react-big-calendar';
import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { parseISO } from 'date-fns';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import moment from 'moment';
import { Modal, Button, Form, Row, Col } from 'react-bootstrap';
import { toast } from 'react-toastify';
import Select from 'react-select';
import { jwtDecode } from 'jwt-decode';
import { useNavigate } from 'react-router-dom';



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
    provider: null, // This will be set to the selected doctor ID
  });
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [doctors, setDoctors] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState([]);


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
  
  // ✅ Set initial view based on role
  let defaultView = 'month'; // fallback
  if (userRole === 'doctor') {
    defaultView = 'day';
  } else if (userRole === 'registrar') {
    defaultView = 'work_week';
  }
  const [currentView, setCurrentView] = useState(defaultView);
    // Fetch doctors function (outside useEffect)
  const fetchDoctors = async () => {
    try {
      const res = await axios.get('http://127.0.0.1:8000/api/users/doctors/', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDoctors(res.data); // Store full doctor objects
      console.log("Fetched doctors:", res.data);

    } catch (err) {
      console.error('Failed to load doctors:', err);
    }
  };

  

  // Fetch appointments function (outside useEffect)
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

      // Format appointments
      const apptEvents = appointmentsRes.data.map((appt) => ({
        id: `appt-${appt.id}`,
        title: `${appt.patient_name || 'Unknown Patient'} - ${appt.title || 'Untitled Appointment'}`, // ✅ include patient name
        start: parseISO(appt.appointment_datetime),
        end: new Date(new Date(appt.appointment_datetime).getTime() + appt.duration_minutes * 60000),
        type: 'appointment',
        provider: appt.provider, // Needed for doctor match
        patient_name: appt.patient_name,
        duration_minutes: appt.duration_minutes, // optional: in case you use it elsewhere
      }));
  
      // 👇 Your original logic to set default doctor based on first appointment
      if (apptEvents.length > 0 && doctors.length > 0) {
        const doctorId = apptEvents[0].provider;
        const matchedDoctor = doctors.find((doc) => doc.id === doctorId);
        setSelectedDoctor(
          matchedDoctor
            ? { value: matchedDoctor.id, label: `Dr. ${matchedDoctor.first_name} ${matchedDoctor.last_name}` }
            : null
        );
      }
  
      // Format availability
      const availEvents = availabilityRes.data.map((a) => ({
        id: `avail-${a.id}`,
        title: `${a.is_blocked ? '❌ Blocked' : '🟢'} Dr. ${a.doctor_name || 'Unknown'}`,
        start: new Date(a.start_time),
        end: new Date(a.end_time),
        is_blocked: a.is_blocked,
        doctor_id: a.doctor,
        type: 'availability',
      }));
  
      const combinedEvents = [...apptEvents, ...availEvents]
      .filter(e => e && typeof e.title === 'string'); // ✅ remove undefined/bad events

      console.log("🧠 Mapped events with duration:", apptEvents);
    
      setEvents([]); // force clear
      setTimeout(() => setEvents(combinedEvents), 50); // force re-render
      console.log("🗓️ Combined events:", combinedEvents);

    
    } catch (error) {
      console.error('Failed to load calendar data:', error);
    }
  };
  

  // useEffect with fetching logic
  useEffect(() => {
    fetchDoctors().then(() => fetchAppointments());  // Fetch doctors first and then fetch appointments
  }, [token]); // Ensure `token` is in the dependency array

  const handleDateNavigate = useCallback((newDate) => setCurrentDate(newDate), []);
  const handleViewChange = useCallback((view) => setCurrentView(view), []);

  const handleSelectSlot = ({ start }) => {
    if (userRole !== 'patient') {
      //toast.warning('Only patients can create appointments.');
      return;
    }

    const day = start.getDay(); // ✅ this defines `day` properly

    if (day === 0 || day === 6) {
      toast.warning('Appointments cannot be scheduled on weekends.');
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
    setShowModal(true);
  };

  const handleSelectEvent = (event) => {
  // ✅ Prevent non-admin from editing availability
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
      provider: event.provider || null, // Ensure provider is passed to modal form data
    });

    // Debugging: Check the values being compared
    console.log('Selected Event:', event);
    console.log('Doctors:', doctors);
    console.log('Provider ID in Event:', event.provider);

    // Ensure provider is in the expected format (either an object with id or just the id)
    const matchedDoctor = doctors.find(doc => doc.id === event.provider);
    console.log('Matched Doctor:', matchedDoctor);

    setSelectedDoctor(
      matchedDoctor
        ? { value: matchedDoctor.id, label: `Dr. ${matchedDoctor.first_name} ${matchedDoctor.last_name}` }
        : null
    );

    setShowModal(true);
  };

  const handleModalSave = async () => {

    const cleanTitle = modalFormData.title.split(' - ').slice(-1).join(' - '); // removes prepended name

    const payload = {
      ...modalFormData,
      title: cleanTitle,
      provider: selectedDoctor?.value || null,
    };

    console.log('Saving payload:', payload); // Log the payload to check its structure

    try {
      if (isEditing && editingId) {
        const cleanId = editingId.toString().replace('appt-', '');  // ✅ strip prefix
        
        console.log("📦 Duration before save:", modalFormData.duration_minutes);
        await axios.put(`http://127.0.0.1:8000/api/appointments/${cleanId}/`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        toast.success('Appointment updated!');
        if (onUpdate) onUpdate(); // ✅ trigger Dashboard refresh

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
      fetchAppointments(); // Refresh the appointments after saving
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
      fetchAppointments(); // Refresh the appointments after deletion
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete appointment.');
    }
  };

  const eventStyleGetter = (event) => {
    const now = new Date();
    const isPast = new Date(event.start) < now;
  
    let backgroundColor = isPast ? '#6c757d' : '#0d6efd'; // default for appointments
  
    if (event.type === 'availability') {
      backgroundColor = event.is_blocked
        ? '#f8d7da' // light red
        : '#d1e7dd'; // light green
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
    if (day === 0 || day === 6) {
      return {
        className: 'disabled-day',
        style: {
          backgroundColor: '#f8f9fa',
          pointerEvents: 'none',
          color: '#ccc',
        },
      };
    }
    return {};
  }; 

  console.log("All events:", events);
  console.log("Selected doctor:", selectedDoctor); // Debugging: Check selected doctor
  console.log("User role:", userRole); // Debugging: Check user role

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
        {/* Doctor dropdown (admin/registrar only) */}
        {(userRole === 'admin' || userRole === 'registrar') && (
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
                  zIndex: 9999, // 👈 ensures dropdown stays on top
                }),
              }}

            />
          </div>
        )}

        {/* Back button */}
        {userRole === 'admin' && (
        <Button
          variant="outline-secondary"
          onClick={() => navigate("/admin")}
          style={{ height: '38px', padding: '0 12px' }}
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
                // ✅ 1. Hide availability for patients
                if (userRole === 'patient' && event.id.toString().startsWith('avail')) {
                  return false;
                }
            
                // ✅ 2. Apply search **only to appointment events**
                if (event.type === 'appointment') {
                  // Filter by search query
                  return event.title.toLowerCase().includes(searchQuery.toLowerCase());
                }
            
                // ✅ 3. For availability and other events, ignore search filter and keep them
                return true;
              })
              .filter(event => {
                // ✅ 4. Filter availability by doctor for admin/registrar
                if ((userRole === 'admin' || userRole === 'registrar') && event.type === 'availability' && selectedDoctor) {
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
            min={new Date(1970, 1, 1, 8, 0, 0)}  // 8:00 AM
            max={new Date(1970, 1, 1, 18, 0, 0)} // 6:00 PM
            step={15}          // minutes per step
            timeslots={2}      // number of slots per step

          />

          <Modal show={showModal} onHide={() => setShowModal(false)}>
            <Modal.Header closeButton>
              <Modal.Title>{isEditing ? 'Edit Appointment' : 'Create Appointment'}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              {isPast && <div className="alert alert-warning">⚠️ Past appointments cannot be edited.</div>}

              <Form>
                <Form.Group className="mb-3">
                  <Form.Label>Title</Form.Label>
                  <Form.Control
                    type="text"
                    value={modalFormData.title}
                    onChange={(e) => setModalFormData({ ...modalFormData, title: e.target.value })}
                    disabled={isPast}
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
                      console.log("🧪 Duration input changed to:", value);
                      setModalFormData({ ...modalFormData, duration_minutes: parseInt(e.target.value) || 0 })
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
                        zIndex: 9999, // 👈 ensures dropdown stays on top
                      }),
                    }}
                  />
                </Form.Group>
              </Form>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" onClick={() => setShowModal(false)}>
                Cancel
              </Button>
              {isEditing && !isPast && (
                <Button variant="danger" onClick={handleDeleteAppointment}>
                  Delete
                </Button>
              )}
              <Button variant="primary" onClick={handleModalSave} disabled={isEditing && isPast}>
                {isEditing ? 'Update' : 'Save'}
              </Button>
            </Modal.Footer>
          </Modal>
        </div>
      </div>
    </div>
  );
}

export default CalendarView;
