import Select from 'react-select';
import { useState, useEffect } from 'react';
import axios from 'axios';
import CalendarView from '../components/CalendarView';
import { toast } from 'react-toastify';
import Table from 'react-bootstrap/Table';

function toLocalDatetimeString(dateObj) {
  const local = new Date(dateObj);
  local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
  return local.toISOString().slice(0, 16); // format: YYYY-MM-DDTHH:MM
}

function DashboardPage() {
  const [doctors, setDoctors] = useState([]);
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    appointment_datetime: '',
    duration_minutes: 30,
    recurrence: 'none',
    provider: null, // This will be set to the selected doctor ID
  });
  const [showForm, setShowForm] = useState(false);

  const token = localStorage.getItem('access_token');

  useEffect(() => {
    const fetchDoctors = async () => {
      try {
        const res = await axios.get('http://127.0.0.1:8000/api/users/doctors/', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setDoctors(res.data); // Store full doctor objects
      } catch (error) {
        console.error('Failed to fetch doctors:', error);
      }
    };

    const fetchAppointments = async () => {
      try {
        const response = await axios.get('http://127.0.0.1:8000/api/appointments/', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        setAppointments(response.data);
        if (response.data && response.data.length > 0) {
          const doctorId = response.data[0].doctor;  // Assuming you have a doctor field in your appointments data
          const matchedDoctor = doctors.find(doc => doc.id === doctorId);
          setSelectedDoctor(matchedDoctor ? { value: matchedDoctor.id, label: `Dr. ${matchedDoctor.first_name} ${matchedDoctor.last_name}` } : null);
        }
      } catch (error) {
        console.error('Error fetching appointments:', error);
      }
    };

    if (doctors.length === 0) {
      fetchDoctors();  // Only fetch doctors if they haven't been loaded yet
    } else {
      fetchAppointments();  // Fetch appointments once doctors are fetched
    }
  }, [token, doctors.length]); // Fetch appointments only once doctors are loaded


  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const fetchAvailableSlots = async (doctorId) => {
    setAvailableSlots([]);
    if (!doctorId) return;
  
    try {
      const res = await axios.get(`http://127.0.0.1:8000/api/doctors/${doctorId}/available-dates/`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAvailableSlots(res.data);
    } catch (error) {
      console.error("Failed to fetch available slots:", error);
    }
  };

  
  const handleEditClick = (appointment) => {
    const now = new Date();
    const appointmentDate = new Date(appointment.appointment_datetime);

    if (appointmentDate < now) {
      toast.error('Cannot edit past appointments.');
      return;
    }

    console.log('Editing appointment:', appointment);

    setFormData({
      title: appointment.title,
      description: appointment.description,
      appointment_datetime: toLocalDatetimeString(appointment.appointment_datetime),
      duration_minutes: appointment.duration_minutes,
      recurrence: appointment.recurrence || 'none',
      //provider: appointment.provider || null,
    });
    // Log the appointment's provider ID
    console.log('Appointment Provider ID:', appointment.provider);

    // Log the doctors array
    console.log('Doctors:', doctors);
    
    const matched = doctors.find(doc => doc.id === appointment.provider);
    console.log('Matched Doctor:', matched);

    setSelectedDoctor(
      matched
        ? { value: matched.id, label: `Dr. ${matched.first_name} ${matched.last_name}` }
        : null
    );

    setEditingId(appointment.id);
    setEditMode(true);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this appointment?')) return;

    try {
      await axios.delete(`http://127.0.0.1:8000/api/appointments/${id}/`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Appointment deleted!');
      setAppointments(appointments.filter(a => a.id !== id));
    } catch (error) {
      console.error(error);
      toast.error('Delete failed.');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
  
    const payload = {
      ...formData,
      provider: selectedDoctor?.value || null,  // Pass the provider ID
    };
  
    try {
      if (editMode && editingId) {
        await axios.put(`http://127.0.0.1:8000/api/appointments/${editingId}/`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        toast.success('Appointment updated!');
      } else {
        await axios.post('http://127.0.0.1:8000/api/appointments/', payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        toast.success('Appointment created!');
      }
  
      const refreshed = await axios.get('http://127.0.0.1:8000/api/appointments/', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAppointments(refreshed.data);
  
      setFormData({ title: '', description: '', appointment_datetime: '', duration_minutes: 30, recurrence: 'none' });
      setSelectedDoctor(null);
      setEditMode(false);
      setEditingId(null);
      setShowForm(false);
    } catch (error) {
      console.error(error);
      toast.error('Failed to save appointment.');
    }
  };
  

  return (
    <div className="container mt-4">
      <div className="text-center my-4">
        <h2 className="fw-bold">Manage Your Appointments</h2>
        <p className="text-muted">Easily view, create, and manage your appointments in one place.</p>
        <div className="text-center mb-4">
          <button
            className="btn btn-success"
            onClick={() => {
              setFormData({
                title: '',
                description: '',
                appointment_datetime: '',
                duration_minutes: 30,
                recurrence: 'none',
              });
              setSelectedDoctor(null);
              setEditMode(false);
              setEditingId(null);
              setShowForm(true);
            }}
          >
            + Create / Show Appointment
          </button>
        </div>
      </div>

      {showForm && (
        <div className="row">
          <div className="col-md-6">
            <form onSubmit={handleSubmit} className="mb-5">
              <h4 className="mb-3">{editMode ? 'Edit Appointment' : 'Create Appointment'}</h4>

              <div className="mb-3">
                <label className="form-label">Title</label>
                <input
                  type="text"
                  name="title"
                  className="form-control"
                  placeholder="Title"
                  onChange={handleChange}
                  value={formData.title}
                  required
                />
              </div>

              <div className="mb-3">
                <label className="form-label">Description</label>
                <textarea
                  name="description"
                  className="form-control"
                  placeholder="Description"
                  onChange={handleChange}
                  value={formData.description}
                />
              </div>

              <div className="mb-3">
                <label className="form-label">Date & Time</label>
                <input
                  type="datetime-local"
                  name="appointment_datetime"
                  className="form-control"
                  onChange={handleChange}
                  value={formData.appointment_datetime}
                  required
                />
              </div>

              <div className="mb-3">
                <label className="form-label">Duration (minutes)</label>
                <input
                  type="number"
                  name="duration_minutes"
                  className="form-control"
                  onChange={handleChange}
                  value={formData.duration_minutes}
                  required
                />
              </div>

              <div className="mb-3">
                <label className="form-label">Recurrence</label>
                <select
                  name="recurrence"
                  className="form-select"
                  onChange={handleChange}
                  value={formData.recurrence}
                >
                  <option value="none">None</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>

              <div className="mb-3">
                <label className="form-label">Select Doctor</label>
                <Select
                  
                  options={doctors.map(doc => ({
                    value: doc.id,
                    label: `Dr. ${doc.first_name} ${doc.last_name}`
                  }))}
                  value={selectedDoctor}
                  onChange={(selected) => {
                      setSelectedDoctor(selected);
                      fetchAvailableSlots(selected?.value);
                    }}

                  placeholder="Search or select doctor..."
                  isClearable
                />
              </div>

              <div className="d-flex gap-2">
                <button type="submit" className="btn btn-primary w-100">
                  {editMode ? 'Update Appointment' : 'Create Appointment'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary w-100"
                  onClick={() => {
                    setFormData({ title: '', description: '', appointment_datetime: '', duration_minutes: 30, recurrence: 'none' });
                    setSelectedDoctor(null);
                    setEditMode(false);
                    setEditingId(null);
                    setShowForm(false);
                    }}
                  >
                    Cancel
                  </button>
                  </div>
                </form>
                </div>

                <div className="col-md-6">
                <div className="mt-4">
                <h4>Available Slots for {selectedDoctor?.label || 'Selected Doctor'}</h4>
                  <ul className="list-group">
                  {availableSlots.length > 0 ? (
                    availableSlots.map((slot, idx) => {
                    const formattedSlot = toLocalDatetimeString(slot);
                    return (
                      <li
                        key={idx}
                        role="button"
                        onClick={() => {
                          setSelectedSlot(formattedSlot);
                          setFormData((prev) => ({
                            ...prev,
                            appointment_datetime: formattedSlot,
                          }));
                        }}
                        className={`list-group-item list-group-item-action ${
                          selectedSlot === formattedSlot ? 'active' : ''
                        }`}
                      >
                        {new Date(slot).toLocaleString()}
                      </li>
                    );
                  })
                ) : (
                  <li className="list-group-item text-muted">No available slots</li>
                )}
              </ul>
          </div>
            <hr className="my-4" />
            <h4>Your Appointments</h4>
            <Table striped bordered hover responsive>
              <thead>
                <tr>
                  <th>Visit</th>
                  <th>Date & Time</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {appointments.map((a) => (
                  <tr key={a.id}>
                    <td>{a.title}</td>
                    <td>{new Date(a.appointment_datetime).toLocaleString()}</td>
                    <td>
                      <button className="btn btn-sm btn-warning me-2" onClick={() => handleEditClick(a)}>✏️</button>
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(a.id)}>🗑️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </div>
      )}

      <div className="mt-5">
        <h4>Calendar</h4>
        <CalendarView />
      </div>
    </div>
  );
}

export default DashboardPage;
