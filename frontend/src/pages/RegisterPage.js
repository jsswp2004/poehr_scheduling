import { toast } from 'react-toastify';
import { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

function RegisterPage() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    first_name: '',
    last_name: '',
    role: 'patient', // Default role
  });

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post('http://127.0.0.1:8000/api/auth/register/', formData);
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
            required
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

        <div className="mb-4">
          <label className="form-label">Role</label>
          <select
            name="role"
            className="form-select"
            onChange={handleChange}
            value={formData.role}
            required
          >
            <option value="patient">Patient</option>
            <option value="receptionist">Receptionist</option>
            <option value="doctor">Doctor</option>
            <option value="admin">Admin</option>
          </select>
        </div>

        <button type="submit" className="btn btn-primary w-100">Register</button>
      </form>
    </div>
  );
}

export default RegisterPage;
