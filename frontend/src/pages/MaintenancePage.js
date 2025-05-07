import { useState, useEffect } from 'react';
import axios from 'axios';
import { Form, Button, Card, Row, Col } from 'react-bootstrap';
import Select from 'react-select';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';

function MaintenancePage() {
  const [editingId, setEditingId] = useState(null);
  const [schedules, setSchedules] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [formData, setFormData] = useState({
    start_time: '',
    end_time: '',
    is_blocked: false,
    recurrence: 'none',
  });
  const navigate = useNavigate();
  const token = localStorage.getItem('access_token');

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

  useEffect(() => {
    if (selectedDoctor) {
      fetchSchedules();
    }
  }, [selectedDoctor]);
  
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!selectedDoctor) {
      toast.warning('Please select a clinician.');
      return;
    }

    const payload = {
      ...formData,
      doctor: selectedDoctor.value,
    };

    try {
        if (editingId) {
            await axios.put(`http://127.0.0.1:8000/api/availability/${editingId}/`, payload, {
              headers: { Authorization: `Bearer ${token}` },
            });
            toast.success('Schedule updated!');
          } else {
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

  const fetchSchedules = async () => {
    if (!selectedDoctor) return;
    try {
      const res = await axios.get('http://127.0.0.1:8000/api/availability/', {
        headers: { Authorization: `Bearer ${token}` },
      });
  
      // Filter by selected doctor
      const doctorSchedules = res.data.filter(s => s.doctor === selectedDoctor.value);
      setSchedules(doctorSchedules);
    } catch (err) {
      console.error('Failed to fetch schedules:', err);
      toast.error('Failed to load schedules.');
    }
  };

  const toLocalDatetimeInputValue = (isoString) => {
    const local = new Date(isoString);
    local.setMinutes(local.getMinutes() - local.getTimezoneOffset()); // convert to local
    return local.toISOString().slice(0, 16); // format as 'YYYY-MM-DDTHH:MM'
  };
  
  const handleEdit = (schedule) => {
    setEditingId(schedule.id); // track what you're editing
  
    setFormData({
      start_time: toLocalDatetimeInputValue(schedule.start_time),
      end_time: toLocalDatetimeInputValue(schedule.end_time),
      is_blocked: schedule.is_blocked,
      recurrence: 'none',
    });
  
    const matched = doctors.find(doc => doc.id === schedule.doctor);
    setSelectedDoctor(
      matched
        ? { value: matched.id, label: `Dr. ${matched.first_name} ${matched.last_name}` }
        : null
    );
  };
  
  
  
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

                <Row className="mb-3">
                  <Col md={6}>
                    <Form.Label>Recurrence</Form.Label>
                    <Form.Select
                      name="recurrence"
                      value={formData.recurrence}
                      onChange={handleChange}
                    >
                      <option value="none">None</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </Form.Select>
                  </Col>
                  <Col md={6} className="d-flex align-items-end">
                    <Form.Check
                      type="checkbox"
                      label="Block this schedule"
                      name="is_blocked"
                      checked={formData.is_blocked}
                      onChange={handleChange}
                    />
                  </Col>
                </Row>

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
          <Button variant="outline-secondary" onClick={() => navigate("/admin")} className="mt-2 mb-3" style={{ padding: '5px' }}>
            ← Back
          </Button>
        </Col>

        {/* RIGHT SIDE: Placeholder for schedule list */}
        <Col md={6}>
          <Card className="shadow-sm">
            <Card.Body>
              <h5 className="fw-bold">📋 Schedule Overview</h5>
              <h6 className="text-success">✅ Availability</h6>
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

                <h6 className="text-danger">🚫 Blocked</h6>
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

            </Card.Body>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

export default MaintenancePage;
