import { toast } from 'react-toastify';
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import Select from 'react-select';

function RegisterPage() {
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
    role: 'patient',
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

    if (hasProvider === 'no' && (!formData.email || !formData.phone_number)) {
      toast.error("Please fill out both email and phone number.");
      return;
    }

    const payload = {
      ...formData,
      role: 'patient',
      provider: formData.assigned_doctor,
    };

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
            required={hasProvider === 'no'}
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
            required={hasProvider === 'no'}
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

        {hasProvider === 'yes' && (
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

        {hasProvider === 'no' && (
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

        <button type="submit" className="btn btn-primary w-100">Register</button>
      </form>
    </div>
  );
}

export default RegisterPage;
