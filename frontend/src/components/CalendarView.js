import { Calendar, momentLocalizer } from 'react-big-calendar';
import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { parseISO } from 'date-fns';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import moment from 'moment';
import { Modal, Button, Form } from 'react-bootstrap';
import { toast } from 'react-toastify';

const localizer = momentLocalizer(moment);

const isPastAppointment = (dateString) => {
    const now = new Date();
    const appointmentDate = new Date(dateString);
    return appointmentDate < now;
  };
  

// ✅ Helper to convert UTC to local datetime input value
function toLocalDatetimeString(dateObj) {
  const local = new Date(dateObj);
  local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
  return local.toISOString().slice(0, 16);
}

function CalendarView() {
  const [showModal, setShowModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [modalFormData, setModalFormData] = useState({
    title: '',
    description: '',
    duration_minutes: 30,
    recurrence: 'none',
    appointment_datetime: '',
  });

  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [currentView, setCurrentView] = useState('month');
  const token = localStorage.getItem('access_token');

  const fetchAppointments = async () => {
    try {
      const response = await axios.get('http://127.0.0.1:8000/api/appointments/', {
        headers: { Authorization: `Bearer ${token}` },
      });

      const formatted = response.data.map((appt) => ({
        id: appt.id,
        title: appt.title,
        description: appt.description,
        duration_minutes: appt.duration_minutes,
        start: parseISO(appt.appointment_datetime),
        end: new Date(new Date(appt.appointment_datetime).getTime() + appt.duration_minutes * 60000),
      }));

      setEvents(formatted);
    } catch (error) {
      console.error('Calendar load failed:', error);
    }
  };

  useEffect(() => {
    fetchAppointments();
  }, [token]);

  const eventStyleGetter = (event) => {
    const now = new Date();
    const isPast = new Date(event.start) < now;
    return {
      style: {
        backgroundColor: isPast ? '#6c757d' : '#0d6efd',
        color: 'white',
        borderRadius: '5px',
        padding: '4px',
        border: 'none',
      },
    };
  };

  const handleDateNavigate = useCallback((newDate) => {
    setCurrentDate(newDate);
  }, []);

  const handleViewChange = useCallback((view) => {
    setCurrentView(view);
  }, []);

  const handleSelectSlot = ({ start }) => {
    if (start < new Date()) {
      toast.warning('You cannot create appointments in the past.');
      return;
    }
  
    setIsEditing(false);
    setIsPast(false); // ✅ reset past flag
    setEditingId(null);
    setSelectedDate(start);
    setModalFormData({
      title: '',
      description: '',
      duration_minutes: 30,
      recurrence: 'none',
      appointment_datetime: toLocalDatetimeString(start),
    });
    setShowModal(true);
  };
  

  const [isPast, setIsPast] = useState(false);

  const handleSelectEvent = (event) => {
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
    });
    setShowModal(true);
  };
  

  const handleModalSave = async () => {
    const payload = {
      ...modalFormData,
    };

    try {
      if (isEditing && editingId) {
        await axios.put(
          `http://127.0.0.1:8000/api/appointments/${editingId}/`,
          payload,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        toast.success('Appointment updated!');
      } else {
        await axios.post(
          'http://127.0.0.1:8000/api/appointments/',
          payload,
          { headers: { Authorization: `Bearer ${token}` } }
        );
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
      await axios.delete(`http://127.0.0.1:8000/api/appointments/${editingId}/`, {
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
  
  return (
    <div className="card mt-4">
      <div className="card-body">
        <div style={{ height: '500px' }}>
          <Calendar
            localizer={localizer}
            events={events}
            startAccessor="start"
            endAccessor="end"
            view={currentView}
            onView={handleViewChange}
            date={currentDate}
            onNavigate={handleDateNavigate}
            defaultView="month"
            views={['month', 'week', 'day']}
            eventPropGetter={eventStyleGetter}
            style={{ height: '500px' }}
            selectable
            onSelectSlot={handleSelectSlot}
            onSelectEvent={handleSelectEvent}
          />

          <Modal show={showModal} onHide={() => setShowModal(false)}>
            <Modal.Header closeButton>
              <Modal.Title>{isEditing ? 'Edit Appointment' : 'Create Appointment'}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
            {isPast && (
            <div className="alert alert-warning" role="alert">
                ⚠️ Past appointments cannot be edited.
            </div>
            )}

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
                    onChange={(e) =>
                      setModalFormData({ ...modalFormData, appointment_datetime: e.target.value })
                      
                    }
                    disabled={isPast}
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Duration (minutes)</Form.Label>
                  <Form.Control
                    type="number"
                    value={modalFormData.duration_minutes}
                    onChange={(e) =>
                      setModalFormData({
                        ...modalFormData,
                        duration_minutes: parseInt(e.target.value) || 0,
                      })
                      
                    }
                    disabled={isPast}
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Recurrence</Form.Label>
                  <Form.Select
                    value={modalFormData.recurrence}
                    onChange={(e) =>
                      setModalFormData({ ...modalFormData, recurrence: e.target.value })
                    }
                    disabled={isPast}
                  >
                    <option value="none">None</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </Form.Select>
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
                <Button
                    variant="primary"
                    onClick={handleModalSave}
                    disabled={isEditing && isPast} // ✅ prevent updating past appointments
                >
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
