import { useState, useEffect } from 'react';
import Select from 'react-select';
import axios from 'axios';
import { toast } from 'react-toastify';

function toLocalDatetimeString(dateObj) {
  const local = new Date(dateObj);
  local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
  return local.toISOString().slice(0, 16);
}

function CreateAppointmentForm({ onSuccess, defaultDoctorId = null, patientName=''}) {
  const [doctors, setDoctors] = useState([]);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    appointment_datetime: '',
    duration_minutes: 30,
    recurrence: 'none',
  });
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const token = localStorage.getItem('access_token');

  useEffect(() => {
    const fetchDoctors = async () => {
      try {
        const res = await axios.get('http://127.0.0.1:8000/api/users/doctors/', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setDoctors(res.data);

        if (defaultDoctorId) {
          const doc = res.data.find((d) => d.id === defaultDoctorId);
          setSelectedDoctor({
            value: doc.id,
            label: `Dr. ${doc.first_name} ${doc.last_name}`,
          });
        }
      } catch (error) {
        console.error('Failed to fetch doctors:', error);
      }
    };

    fetchDoctors();
  }, [defaultDoctorId, token]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const payload = {
      ...formData,
      doctor: selectedDoctor?.value || null,
    };

    try {
      await axios.post('http://127.0.0.1:8000/api/appointments/', payload, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success('Appointment created!');
      onSuccess?.(); // optional callback to refresh or redirect
    } catch (error) {
      console.error(error);
      toast.error('Failed to create appointment.');
    }
  };

  return (
    <form onSubmit={handleSubmit}>
        <h4 className="mb-3" style={{ fontSize: '1.25rem', fontWeight: 'normal' }}>
        Create Appointment{' '}
        {patientName && <span style={{ color: 'blue' }}>for {patientName}</span>}
        </h4>
      <div className="mb-3">
        <label className="form-label">Title</label>
        <input name="title" className="form-control" value={formData.title} onChange={handleChange} required />
      </div>

      <div className="mb-3">
        <label className="form-label">Description</label>
        <textarea name="description" className="form-control" value={formData.description} onChange={handleChange} />
      </div>

      <div className="mb-3">
        <label className="form-label">Date & Time</label>
        <input type="datetime-local" name="appointment_datetime" className="form-control"
          value={formData.appointment_datetime} onChange={handleChange} required />
      </div>

      <div className="mb-3">
        <label className="form-label">Duration (minutes)</label>
        <input type="number" name="duration_minutes" className="form-control"
          value={formData.duration_minutes} onChange={handleChange} required />
      </div>

      <div className="mb-3">
        <label className="form-label">Recurrence</label>
        <select name="recurrence" className="form-select" value={formData.recurrence} onChange={handleChange}>
          <option value="none">None</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
      </div>

      <div className="mb-3">
        <label className="form-label">Select Doctor</label>
        <Select
          options={doctors.map(doc => ({ value: doc.id, label: `Dr. ${doc.first_name} ${doc.last_name}` }))}
          value={selectedDoctor}
          onChange={setSelectedDoctor}
          placeholder="Search or select doctor..."
          isClearable
        />
      </div>

      <div className="d-flex gap-2 mt-3">
        <button type="submit" className="btn btn-primary">
            Create Appointment
        </button>
        <button
            type="button"
            className="btn btn-secondary"
            onClick={() => onSuccess?.()}
        >
            Cancel Appointment Creation
        </button>
</div>

    </form>
  );
}

export default CreateAppointmentForm;
