import { useState, useEffect } from 'react';
import axios from 'axios';
import { Form, Button, Card, Row, Col } from 'react-bootstrap';
import Select from 'react-select';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';

function MaintenancePage() {
  // State for currently editing schedule, list of schedules, doctors, selected doctor, and form data
  const [editingId, setEditingId] = useState(null);
  const [schedules, setSchedules] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [holidays, setHolidays] = useState([]); // <-- Add state to hold recognized holidays
  const [formData, setFormData] = useState({
    start_time: getTodayAt(8),     // ⏰ 8:00 AM
    end_time: getTodayAt(17),      // ⏰ 5:00 PM
    is_blocked: false,
    recurrence: 'none',
    recurrence_end_date: '',
  });
  const navigate = useNavigate();
  const token = localStorage.getItem('access_token');

  // Role-based access control for admin and system_admin only
  useEffect(() => {
    if (!token) {
      navigate('/login');
      return;
    }
    try {
      const decoded = jwtDecode(token);
      const role = decoded.role || '';
      if (role !== 'admin' && role !== 'system_admin') {
        navigate('/');
      }
    } catch (err) {
      navigate('/login');
    }
  }, [navigate, token]);
  
  // Helper to get a local datetime string for today at a given hour and minute
  function getTodayAt(hour, minute = 0) {
    const date = new Date();
    date.setHours(hour, minute, 0, 0);
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset()); // adjust for local
    return date.toISOString().slice(0, 16); // format: YYYY-MM-DDTHH:MM
  }

  // Fetch doctors on mount (and when token changes)
  useEffect(() => {
    const fetchDoctors = async () => {
      try {
        const res = await axios.get('http://127.0.0.1:8000/api/users/doctors/', {
          headers: { Authorization: `Bearer ${token}` },
        });
        setDoctors(res.data);
      } catch (err) {
        console.error('Failed to load doctors:', err);
        toast.error('Error loading doctors.');
      }
    };
    fetchDoctors();
  }, [token]);

  // Fetch recognized holidays from the backend on mount (and when token changes)
  useEffect(() => {
    const fetchHolidays = async () => {
      try {
        const res = await axios.get('http://127.0.0.1:8000/api/holidays/', {
          headers: { Authorization: `Bearer ${token}` },
        });
        setHolidays(res.data.filter(h => h.is_recognized));
      } catch (err) {
        console.error('Failed to fetch holidays:', err);
      }
    };
    fetchHolidays();
  }, [token]);

  // Fetch schedules whenever the selected doctor changes
  useEffect(() => {
    if (selectedDoctor) {
      fetchSchedules();
    }
  }, [selectedDoctor]);
  
  // Handle changes in the schedule form (input/select/checkbox)
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value,
    });
  };

  // Helper function to check if a date string is a recognized holiday
  function isHoliday(dateStr) {
    const date = new Date(dateStr);
    return holidays.some(h => {
      const hDate = new Date(h.date + 'T00:00:00');
      return (
        hDate.getFullYear() === date.getFullYear() &&
        hDate.getMonth() === date.getMonth() &&
        hDate.getDate() === date.getDate()
      );
    });
  }

  // Handle form submission for creating/updating a schedule
  const handleSubmit = async (e) => {
    e.preventDefault();
  
    if (!selectedDoctor) {
      toast.warning('Please select a clinician.');
      return;
    }
  
    if (!formData.start_time || !formData.end_time) {
      toast.warning('Please enter both start and end time.');
      return;
    }

    // Prevent creation on weekends (Saturday=6, Sunday=0)
    const startDate = new Date(formData.start_time);
    if (startDate.getDay() === 0 || startDate.getDay() === 6) {
      toast.error('Cannot create availability on a Saturday or Sunday!');
      return;
    }

    // Prevent creation on recognized holidays
    if (isHoliday(formData.start_time)) {
      toast.error('Cannot create availability on a holiday!');
      return;
    }
  
    // Prepare the payload for API (dates as ISO)
    const payload = {
      doctor: selectedDoctor.value,
      start_time: new Date(formData.start_time).toISOString(),
      end_time: new Date(formData.end_time).toISOString(),
      is_blocked: formData.is_blocked,
      recurrence: formData.recurrence,
      recurrence_end_date: formData.recurrence_end_date || null,
    };
  
    console.log("📤 Submitting payload:", payload);
  
    try {
      if (editingId) {
        // Update existing schedule
        await axios.put(`http://127.0.0.1:8000/api/availability/${editingId}/`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        toast.success('Schedule updated!');
      } else {
        // Create new schedule
        await axios.post('http://127.0.0.1:8000/api/availability/', payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        toast.success('Schedule saved!');
      }
  
      setFormData({
        start_time: '',
        end_time: '',
        is_blocked: false,
        recurrence: 'none',
      });
      setEditingId(null);
      await fetchSchedules();
  
    } catch (err) {
      console.error(err);
      toast.error('Failed to save schedule.');
    }
  };
  
  // Fetch all schedules for the currently selected doctor
  const fetchSchedules = async () => {
    if (!selectedDoctor) {
      console.log('[DEBUG] No selectedDoctor:', selectedDoctor);
      return;
    }
    try {
      const res = await axios.get('http://127.0.0.1:8000/api/availability/', {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log('[DEBUG] Schedules fetched:', res.data);
      // For admin and system_admin, show all schedules for the selected doctor
      // For other roles, you may want to filter differently (not needed here)
      // Make the filter robust to type mismatches
      const doctorId = String(selectedDoctor.value);
      const doctorSchedules = res.data.filter(s => String(s.doctor) === doctorId);
      console.log('[DEBUG] Filtered schedules for doctor', doctorId, doctorSchedules);
      setSchedules(doctorSchedules);
    } catch (err) {
      console.error('Failed to fetch schedules:', err);
      toast.error('Failed to load schedules.');
    }
  };

  // Convert an ISO datetime string to a local value suitable for datetime-local input fields
  const toLocalDatetimeInputValue = (isoString) => {
    const local = new Date(isoString);
    local.setMinutes(local.getMinutes() - local.getTimezoneOffset()); // convert to local
    return local.toISOString().slice(0, 16); // format as 'YYYY-MM-DDTHH:MM'
  };
  
  // Populate form fields for editing a schedule
  const handleEdit = (schedule) => {
    setEditingId(schedule.id); // track what you're editing
  
    setFormData({
      start_time: toLocalDatetimeInputValue(schedule.start_time),
      end_time: toLocalDatetimeInputValue(schedule.end_time),
      is_blocked: schedule.is_blocked,
      recurrence: schedule.recurrence || 'none',
    });
  
    const matched = doctors.find(doc => doc.id === schedule.doctor);
    setSelectedDoctor(
      matched
        ? { value: matched.id, label: `Dr. ${matched.first_name} ${matched.last_name}` }
        : null
    );
  };
  
  // Console log for debugging recurrence values
  console.log("recurrence value:", formData.recurrence, typeof formData.recurrence);

  // Delete a schedule (after confirmation)
  const handleDelete = async (scheduleId) => {
    if (!window.confirm('Are you sure you want to delete this schedule?')) return;
  
    try {
      await axios.delete(`http://127.0.0.1:8000/api/availability/${scheduleId}/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success('Schedule deleted.');
      await fetchSchedules(); // refresh list
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete schedule.');
    }
  };

  // Cancel editing and reset the form
  const handleCancel = () => {
    setFormData({
      start_time: '',
      end_time: '',
      is_blocked: false,
      recurrence: 'none',
    });
    setEditingId(null);
    toast.info('Edit canceled.');
  };

  // Page rendering: schedule form (left), schedules list (right)
  return (
    <div className="container mt-4">
      <Row>
        {/* LEFT SIDE: Schedule form */}
        <Col md={6}>
          <Card className="shadow-sm">
            <Card.Body>
              <Card.Title>Clinician Schedule Maintenance 🛠️:  </Card.Title>

              <Form onSubmit={handleSubmit}>
                <Row className="mb-3">
                  <Col>
                    <Form.Label>Select Clinician</Form.Label>
                    <Select
                      options={doctors.map(doc => ({
                        value: doc.id,
                        label: `Dr. ${doc.first_name} ${doc.last_name}`,
                      }))}
                      value={selectedDoctor}
                      onChange={setSelectedDoctor}
                      placeholder="Choose a doctor..."
                      isClearable
                    />
                  </Col>
                </Row>

                <Row className="mb-3">
                  <Col md={6}>
                    <Form.Label>Start Time</Form.Label>
                    <Form.Control
                      type="datetime-local"
                      name="start_time"
                      value={formData.start_time}
                      onChange={handleChange}
                    />
                  </Col>
                  <Col md={6}>
                    <Form.Label>End Time</Form.Label>
                    <Form.Control
                      type="datetime-local"
                      name="end_time"
                      value={formData.end_time}
                      onChange={handleChange}
                    />
                  </Col>
                </Row>

                <Form.Group className="mb-3">
                  <Row>
                    <Col md={6}>
                      <Form.Label>Recurrence</Form.Label>
                      <Form.Select
                        value={formData.recurrence}
                        onChange={(e) => setFormData({ ...formData, recurrence: e.target.value })}
                      >
                        <option value="none">None</option>
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                      </Form.Select>
                    </Col>

                    <Col md={6}>
                      <Form.Label>Recurrence End Date</Form.Label>
                      <Form.Control
                        type="date"
                        value={formData.recurrence_end_date || ''}
                        onChange={(e) => setFormData({ ...formData, recurrence_end_date: e.target.value })}
                      />
                    </Col>
                  </Row>

                  <Form.Check
                    type="checkbox"
                    id="blockSchedule"
                    label="Block this schedule"
                    className="mt-3"
                    checked={formData.is_blocked || false}
                    onChange={(e) => setFormData({ ...formData, is_blocked: e.target.checked })}
                  />
                </Form.Group>

                <Button type="submit" variant="primary" className="me-2">
                {editingId ? 'Update Schedule' : 'Save Schedule'}
                </Button>

                {editingId && (
                <Button variant="secondary" onClick={handleCancel}>
                    Cancel
                </Button>
                )}

              </Form>
            </Card.Body>
          </Card>
          <Button variant="outline-secondary" onClick={() => navigate("/admin")} className="mt-2 mb-3 btn w-12.5" style={{ padding: '5px' }}>
            ← Back
          </Button>
        </Col>

        {/* RIGHT SIDE: Placeholder for schedule list */}
        <Col md={6}>
          <Card className="shadow-sm">
            <Card.Body>
              <h5 className="fw-bold">📋 Schedule Overview</h5>
              <div className="mb-2">
                {selectedDoctor ? (
                  <span className="text-primary">Showing schedules for <strong>{selectedDoctor.label}</strong></span>
                ) : (
                  <span className="text-muted">No clinician selected</span>
                )}
              </div>
              <h6 className="text-success">✅ Availability</h6>
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                <ul className="list-group mb-4">
                {schedules.filter(s => !s.is_blocked).map(s => (
                    <li key={s.id} className="list-group-item d-flex justify-content-between align-items-center">
                        <span>
                        {new Date(s.start_time).toLocaleString('en-US', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                        timeZone: 'America/New_York', // ⬅️ or use your actual timezone
                        })} — {new Date(s.end_time).toLocaleString('en-US', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                        timeZone: 'America/New_York',
                        })}
                        </span>
                        <span>
                            <Button
                            variant="outline-primary"
                            size="sm"
                            className="me-2"
                            onClick={() => handleEdit(s)}
                            >
                            ✏️
                            </Button>
                            <Button
                            variant="outline-danger"
                            size="sm"
                            onClick={() => handleDelete(s.id)}
                            >
                            🗑️
                            </Button>
                        </span>
                    </li>
                ))}
                </ul>
                 </div>
              <h6 className="text-danger">🚫 Blocked</h6>
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>                
                <ul className="list-group">
                {schedules.filter(s => s.is_blocked).map(s => (
                    <li key={s.id} className="list-group-item d-flex justify-content-between align-items-center">
                    <span>
                    {new Date(s.start_time).toLocaleString('en-US', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                        timeZone: 'America/New_York', // ⬅️ or use your actual timezone
                        })} — {new Date(s.end_time).toLocaleString('en-US', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                        timeZone: 'America/New_York',
                        })}
                    </span>
                    <span>
                        <Button
                        variant="outline-primary"
                        size="sm"
                        className="me-2"
                        onClick={() => handleEdit(s)}
                        >
                        ✏️
                        </Button>
                        <Button
                        variant="outline-danger"
                        size="sm"
                        onClick={() => handleDelete(s.id)}
                        >
                        🗑️
                        </Button>
                    </span>
                </li>
                ))}
                </ul>
             </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

export default MaintenancePage;
