import { toast } from 'react-toastify';
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import Select from 'react-select';

function RegisterPage({ adminMode = false }) {
  // NEW: Patient state
  const [isPatient, setIsPatient] = useState(adminMode ? true : true); // Always true for adminMode
  const [hasProvider, setHasProvider] = useState(null); // 'yes' or 'no'
  const [phone, setPhone] = useState('');

  const navigate = useNavigate();
  const [doctors, setDoctors] = useState([]);

  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    first_name: '',
    last_name: '',
    role: adminMode ? 'patient' : 'patient',
    assigned_doctor: '',
    phone_number: '',
  });

  useEffect(() => {
    axios.get('http://127.0.0.1:8000/api/users/doctors/')
      .then((res) => setDoctors(res.data))
      .catch((err) => console.error('Failed to load doctors:', err));
  }, []);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (isPatient && hasProvider === 'no' && (!formData.email || !formData.phone_number)) {
      toast.error("Please fill out both email and phone number.");
      return;
    }

    const payload = {
      ...formData,
      role: isPatient ? 'patient' : (formData.role || 'none'),
      provider: formData.assigned_doctor,
    };

    try {
      console.log("📤 Sending payload:", formData);

      await axios.post('http://127.0.0.1:8000/api/auth/register/', payload);
      toast.success('Registration successful! Please login.');
      navigate('/login');
    } catch (error) {
      console.error("❌ Registration error:", error.response?.data || error.message);
      toast.error('Registration failed. Please try again.');
    }
  };

  return (
    <div className="container mt-5">
      <h2 className="mb-4">Register</h2>

      {/* Patient or Other selector - HIDDEN in adminMode */}
      {!adminMode && (formData.role === 'none' || formData.role === 'patient') && (
        <div className="mb-3">
          <label className="form-label">Are you registering as a patient?</label>
          <div>
            <div className="form-check form-check-inline">
              <input
                className="form-check-input"
                type="radio"
                name="isPatient"
                id="isPatientYes"
                value="yes"
                checked={isPatient}
                onChange={() => {
                  setIsPatient(true);
                  setFormData({ ...formData, role: 'patient' });
                }}
              />
              <label className="form-check-label" htmlFor="isPatientYes">Yes</label>
            </div>
            <div className="form-check form-check-inline">
              <input
                className="form-check-input"
                type="radio"
                name="isPatient"
                id="isPatientNo"
                value="no"
                checked={!isPatient}
                onChange={() => {
                  setIsPatient(false);
                  setFormData({ ...formData, role: '' });
                }}
              />
              <label className="form-check-label" htmlFor="isPatientNo">No</label>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit}>
      {!adminMode && (formData.role === 'none' || formData.role === 'patient') && (
        <div className="mb-3">
          <label className="form-label">Organization Name</label>
          <input
            type="text"
            className="form-control"
            placeholder="Enter your organization name"
            value={formData.organization_name || ''}
            onChange={(e) =>
              setFormData({ ...formData, organization_name: e.target.value })
            }
            required
          />
        </div>
      )}
        <div className="mb-3">
          <label className="form-label">First Name</label>
          <input
            type="text"
            name="first_name"
            className="form-control"
            onChange={handleChange}
            value={formData.first_name}
            required
          />
        </div>

        <div className="mb-3">
          <label className="form-label">Last Name</label>
          <input
            type="text"
            name="last_name"
            className="form-control"
            onChange={handleChange}
            value={formData.last_name}
            required
          />
        </div>

        <div className="mb-3">
          <label className="form-label">Username</label>
          <input
            type="text"
            name="username"
            className="form-control"
            onChange={handleChange}
            value={formData.username}
            required
          />
        </div>

        <div className="mb-3">
          <label className="form-label">Email</label>
          <input
            type="email"
            name="email"
            className="form-control"
            onChange={handleChange}
            value={formData.email}
            required={isPatient && hasProvider === 'no'}
          />
        </div>

        <div className="mb-3">
          <label className="form-label">Phone Number</label>
          <input
            type="text"
            name="phone_number"
            className="form-control"
            placeholder="e.g. (555) 123-4567"
            onChange={handleChange}
            value={formData.phone_number}
            required={isPatient && hasProvider === 'no'}
          />
        </div>

        <div className="mb-3">
          <label className="form-label">Password</label>
          <input
            type="password"
            name="password"
            className="form-control"
            onChange={handleChange}
            value={formData.password}
            required
          />
        </div>

        {/* Provider question - HIDDEN in adminMode */}
        {!adminMode && isPatient && (
          <div className="mb-3">
            <label className="form-label">Do you know/have a Primary Care Provider?</label>
            <div>
              <div className="form-check form-check-inline">
                <input
                  className="form-check-input"
                  type="radio"
                  name="hasProvider"
                  id="providerYes"
                  value="yes"
                  checked={hasProvider === 'yes'}
                  onChange={() => setHasProvider('yes')}
                />
                <label className="form-check-label" htmlFor="providerYes">Yes</label>
              </div>
              <div className="form-check form-check-inline">
                <input
                  className="form-check-input"
                  type="radio"
                  name="hasProvider"
                  id="providerNo"
                  value="no"
                  checked={hasProvider === 'no'}
                  onChange={() => setHasProvider('no')}
                />
                <label className="form-check-label" htmlFor="providerNo">No</label>
              </div>
            </div>
          </div>
        )}

        {isPatient && hasProvider === 'yes' && (
          <div className="mb-3">
            <label className="form-label">Select Doctor</label>
            <Select
              options={doctors.map((doc) => ({
                value: doc.id,
                label: `Dr. ${doc.first_name} ${doc.last_name}`,
              }))}
              placeholder="Search or select doctor..."
              onChange={(selected) =>
                setFormData({ ...formData, assigned_doctor: selected?.value || '' })
              }
              isClearable
            />
          </div>
        )}

        {/* Show the message ONLY for patients who answered 'no' to provider */}
        {!localStorage.getItem('access_token') && isPatient && hasProvider === 'no' && (
          <div className="mb-3">
            {(formData.email === '' || formData.phone_number === '') ? (
              <p style={{ color: 'red' }}>
                Please provide us with your contact details.
              </p>
            ) : (
              <p style={{ color: 'blue', fontWeight: 'bold' }}>
                A representative will reach out to you shortly after registration. Thank you!
              </p>
            )}
          </div>
        )}
        <div className="mb-3">
          <button type="submit" className="btn btn-primary w-12.5">Register</button>
        </div>
      </form>
    </div>
  );
}

export default RegisterPage;
