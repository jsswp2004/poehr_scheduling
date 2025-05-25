import { toast } from 'react-toastify';
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import Select from 'react-select';

function CreateProfile() {
  const navigate = useNavigate();
  const [doctors, setDoctors] = useState([]);

  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    first_name: '',
    last_name: '',
    role: 'patient', // still defaulting to patient
    profile_picture: null,
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
  
    const formPayload = new FormData();
  
    // Append only existing fields
    for (const key in formData) {
      if (formData[key]) {
        formPayload.append(key, formData[key]);
      }
    }
  
    try {
      await axios.post('http://127.0.0.1:8000/api/auth/register/', formPayload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('Registration successful! Please login.');
      navigate('/login');
    } catch (error) {
      console.error('Registration error:', error);
      toast.error('Registration failed. Please try again.');
    }
  };
  

  return (
    <div className="container mt-5">
      <h2 className="mb-4">Create Profile</h2>
      <form onSubmit={handleSubmit}>
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
        <div className="mb-3">
        <label className="form-label">Profile Picture</label>
        <input
            type="file"
            className="form-control"
            onChange={(e) => setFormData({ ...formData, profile_picture: e.target.files[0] })}
            accept="image/*"
        />
        </div>
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
            <option value="registrar">Registrar</option>
          </select>
        </div>


        <button type="submit" className="btn btn-primary w-12.5">Save</button>
      </form>
    </div>
  );
}

export default CreateProfile;
