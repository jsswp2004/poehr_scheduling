import { useState, useEffect } from 'react';
import axios from 'axios';
import CalendarView from '../components/CalendarView';
import { toast } from 'react-toastify';


function toLocalDatetimeString(dateObj) {
  const local = new Date(dateObj);
  local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
  return local.toISOString().slice(0, 16); // format: YYYY-MM-DDTHH:MM
}

function DashboardPage() {
  const [editMode, setEditMode] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    appointment_datetime: '',
    duration_minutes: 30,
    recurrence: 'none',
  });
  const [showForm, setShowForm] = useState(false);


  const token = localStorage.getItem('access_token');

  useEffect(() => {
    const fetchAppointments = async () => {
      try {
        const response = await axios.get('http://127.0.0.1:8000/api/appointments/', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        setAppointments(response.data);
      } catch (error) {
        console.error('Error fetching appointments:', error);
      }
    };

    fetchAppointments();
  }, [token]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };



  const handleEditClick = (appointment) => {
    const now = new Date();
    const appointmentDate = new Date(appointment.appointment_datetime);
  
    if (appointmentDate < now) {
      toast.error('Cannot edit past appointments.');
      return;
    }
  
    setFormData({
      title: appointment.title,
      description: appointment.description,
      //appointment_datetime: appointment.appointment_datetime.slice(0, 16),
      // Convert to local datetime string format
      appointment_datetime: toLocalDatetimeString(appointment.appointment_datetime), 
      duration_minutes: appointment.duration_minutes,
      recurrence: 'none'
    });
    setEditingId(appointment.id);
    setEditMode(true);
    setShowForm(true); // ✅ This line was missing
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
    try {
      if (editMode && editingId) {
        await axios.put(`http://127.0.0.1:8000/api/appointments/${editingId}/`, formData, {
          headers: { Authorization: `Bearer ${token}` },
        });
        toast.success('Appointment updated!');
      } else {
        console.log("Submitting appointment data:", formData); // ✅ ADD THIS
        await axios.post('http://127.0.0.1:8000/api/appointments/', formData, {
          headers: { Authorization: `Bearer ${token}` },
        });
        toast.success('Appointment created!');
      }
  
      const refreshed = await axios.get('http://127.0.0.1:8000/api/appointments/', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAppointments(refreshed.data);
      setFormData({ title: '', description: '', appointment_datetime: '', duration_minutes: 30, recurrence: 'none' });
      setEditMode(false);
      setEditingId(null);
      setShowForm(false); // ✅ COLLAPSE FORM AFTER SUBMIT
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
              setEditMode(false);
              setEditingId(null);
              setShowForm(true); // ✅ Show the form when button clicked
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

                {/* Your form fields here, unchanged */}
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

                <div className="d-flex gap-2">
                  <button type="submit" className="btn btn-primary w-100">
                    {editMode ? 'Update Appointment' : 'Create Appointment'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary w-100"
                    onClick={() => {
                      setFormData({ title: '', description: '', appointment_datetime: '', duration_minutes: 30, recurrence: 'none' });
                      setEditMode(false);
                      setEditingId(null);
                      setShowForm(false); // ✅ Collapse the form
                    }}
                  >
                    Cancel
                  </button>
                </div>

              </form>
          

          </div>

          <div className="col-md-6">
            <h4>Your Appointments</h4>
            <ul className="list-group">
              {appointments.map((a) => (
                <li key={a.id} className="list-group-item d-flex justify-content-between align-items-center">
                  <div>
                    <strong>{a.title}</strong><br />
                    {new Date(a.appointment_datetime).toLocaleString()}
                  </div>
                  <div>
                    <button className="btn btn-sm btn-warning me-2" onClick={() => handleEditClick(a)}>✏️</button>
                    <button className="btn btn-sm btn-danger" onClick={() => handleDelete(a.id)}>🗑️</button>
                  </div>
                </li>
              ))}
            </ul>

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
