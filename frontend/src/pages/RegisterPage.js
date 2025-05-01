import { toast } from 'react-toastify';
import { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

function RegisterPage() {
  const navigate = useNavigate();
  const [isPatient, setIsPatient] = useState(true);
  const [doctors, setDoctors] = useState([]);

  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    first_name: '',
    last_name: '',
    role: 'patient',
    assigned_doctor: '', // For patients only
  });

  // Fetch doctor list when isPatient is true
  useEffect(() => {
    if (isPatient) {
      axios.get('http://127.0.0.1:8000/api/users/doctors/')
        .then((res) => setDoctors(res.data))
        .catch((err) => console.error('Failed to load doctors:', err));
    }
  }, [isPatient]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const payload = isPatient
      ? { ...formData, role: 'patient' }
      : { ...formData };

    try {
      await axios.post('http://127.0.0.1:8000/api/auth/register/', payload);
      toast.success('Registration successful! Please login.');
      navigate('/login');
    } catch (error) {
      console.error('Registration error:', error);
      toast.error('Registration failed. Please try again.');
    }
  };

  return (
    <div className="container mt-5">
      <h2 className="mb-4">Register</h2>
      <form onSubmit={handleSubmit}>
        {/* Basic Fields */}
        {['first_name', 'last_name', 'username', 'email', 'password'].map((field) => (
          <div className="mb-3" key={field}>
            <label className="form-label">{field.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</label>
            <input
              type={field === 'password' ? 'password' : 'text'}
              name={field}
              className="form-control"
              onChange={handleChange}
              value={formData[field]}
              required
            />
          </div>
        ))}

        {/* Patient? Radio */}
        <div className="mb-3">
          <label className="form-label">Are you a patient?</label>
          <div>
            <div className="form-check form-check-inline">
              <input
                className="form-check-input"
                type="radio"
                name="isPatient"
                id="patientYes"
                value="yes"
                checked={isPatient}
                onChange={() => {
                  setIsPatient(true);
                  setFormData((prev) => ({ ...prev, role: 'patient' }));
                }}
              />
              <label className="form-check-label" htmlFor="patientYes">Yes</label>
            </div>
            <div className="form-check form-check-inline">
              <input
                className="form-check-input"
                type="radio"
                name="isPatient"
                id="patientNo"
                value="no"
                checked={!isPatient}
                onChange={() => setIsPatient(false)}
              />
              <label className="form-check-label" htmlFor="patientNo">No</label>
            </div>
          </div>
        </div>

        {/* Doctor Dropdown for Patients */}
        {isPatient && (
          <div className="mb-3">
            <label className="form-label">Select Doctor</label>
            <select
              name="assigned_doctor"
              className="form-select"
              value={formData.assigned_doctor}
              onChange={handleChange}
              required
            >
              <option value="">Select doctor...</option>
              {doctors.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  Dr. {doc.first_name} {doc.last_name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Role Dropdown for non-patients */}
        {!isPatient && (
          <div className="mb-3">
            <label className="form-label">Role</label>
            <select
              name="role"
              className="form-select"
              onChange={handleChange}
              value={formData.role}
              required
            >
              <option value="">Select a role</option>
              <option value="receptionist">Receptionist</option>
              <option value="doctor">Doctor</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        )}

        <button type="submit" className="btn btn-primary w-100">Register</button>
      </form>
    </div>
  );
}

export default RegisterPage;
