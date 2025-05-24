import { useState, useEffect } from 'react';
import Select from 'react-select';
import axios from 'axios';
import { toast } from 'react-toastify';

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
  appointmentToEdit = null
}) {
  const [doctors, setDoctors] = useState([]);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    appointment_datetime: '',
    duration_minutes: 30,
    recurrence: 'none',
  });
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [availableSlots, setAvailableSlots] = useState([]);
  const token = localStorage.getItem('access_token');
  const [selectedSlot, setSelectedSlot] = useState(null);

  // --- NEW: Holidays and Blocked Days ---
  const [blockedDays, setBlockedDays] = useState([]);
  const [holidays, setHolidays] = useState([]);

  // Fetch doctors, holidays, and blocked days
  useEffect(() => {
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
            handleDoctorChange(selected); // fetch slots if default provider is set
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
    // eslint-disable-next-line
  }, [defaultProviderId, token]);

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
      });

      // Set the selected doctor (assume provider is an id; adjust if object)
      if (appointmentToEdit.provider) {
        setSelectedDoctor({
          value: appointmentToEdit.provider.id || appointmentToEdit.provider,
          label:
            appointmentToEdit.provider_name ||
            (appointmentToEdit.provider.first_name && appointmentToEdit.provider.last_name
              ? `Dr. ${appointmentToEdit.provider.first_name} ${appointmentToEdit.provider.last_name}`
              : 'Provider'),
        });
      }
    }
  }, [appointmentToEdit]);

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

    const payload = {
      ...formData,
      provider: selectedDoctor?.value || null,
    };

    // Only add patient if patientId is passed in (registrar/admin context)
    if (patientId) {
      payload.patient = patientId;
    }

    // --- BLOCK LOGIC: No appts on blocked days or holidays ---
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
    }

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
    <div className="row">
      {/* Left: Form */}
      <div className="col-md-7">
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
            <input
              type="datetime-local"
              name="appointment_datetime"
              className="form-control"
              value={formData.appointment_datetime}
              onChange={handleChange}
              required
            />
          </div>

          <div className="mb-3">
            <label className="form-label">Duration (minutes)</label>
            <input
              type="number"
              name="duration_minutes"
              className="form-control"
              value={formData.duration_minutes}
              onChange={handleChange}
              required
            />
          </div>

          <div className="mb-3">
            <label className="form-label">Recurrence</label>
            <select
              name="recurrence"
              className="form-select"
              value={formData.recurrence}
              onChange={handleChange}
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
              options={doctors.map(doc => ({ value: doc.id, label: `Dr. ${doc.first_name} ${doc.last_name}` }))}
              value={selectedDoctor}
              onChange={handleDoctorChange}
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
      </div>

      {/* Right: Available Slots */}
      <div className="col-md-5 border-start ps-4">
        <h5>Next Available Slots</h5>
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
    </div>
  );
}

export default CreateAppointmentForm;
