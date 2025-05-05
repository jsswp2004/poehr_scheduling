import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import axios from 'axios';
import CreateAppointmentForm from '../components/CreateAppointmentForm';

function PatientDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [patient, setPatient] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [showAppointmentForm, setShowAppointmentForm] = useState(false); // ✅ toggle
  const [formData, setFormData] = useState({});
  const token = localStorage.getItem('access_token');

  useEffect(() => {
    axios.get(`http://127.0.0.1:8000/api/users/patients/by-user/${id}/`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        setPatient(res.data);
        setFormData(res.data);
      })
      .catch((err) => console.error('Error fetching patient:', err));
  }, [id, token]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.put(`http://127.0.0.1:8000/api/users/patients/by-user/${id}/edit/`, formData, {
        headers: { Authorization: `Bearer ${token}` },
      });
      alert('Patient updated successfully!');
      setEditMode(false);
      setPatient(formData);
    } catch (err) {
      console.error('Update error:', err);
      alert('Failed to update patient.');
    }
  };

  if (!patient) return <div>Loading patient details...</div>;

  return (
    <div className="container mt-4">
      <h2>Patient Details</h2>

      {!showAppointmentForm && (
        <form onSubmit={handleSubmit}>
          <ul className="list-group mb-3">
            <li className="list-group-item">
              <strong>Name:</strong> {patient.first_name} {patient.last_name}
            </li>
            <li className="list-group-item">
              <strong>Username:</strong> {patient.username}
            </li>
            <li className="list-group-item">
              <strong>Email:</strong> {patient.email}
            </li>
            <li className="list-group-item">
              <strong>Provider:</strong> {patient.provider_name}
            </li>
            <li className="list-group-item">
              <strong>Phone:</strong>{' '}
              {editMode ? (
                <input
                  type="text"
                  name="phone_number"
                  className="form-control"
                  value={formData.phone_number || ''}
                  onChange={handleChange}
                />
              ) : (
                patient.phone_number || '—'
              )}
            </li>
            <li className="list-group-item">
              <strong>Date of Birth:</strong>{' '}
              {editMode ? (
                <input
                  type="date"
                  name="date_of_birth"
                  className="form-control"
                  value={formData.date_of_birth || ''}
                  onChange={handleChange}
                />
              ) : (
                patient.date_of_birth || '—'
              )}
            </li>
            <li className="list-group-item">
              <strong>Address:</strong>{' '}
              {editMode ? (
                <input
                  type="text"
                  name="address"
                  className="form-control"
                  value={formData.address || ''}
                  onChange={handleChange}
                />
              ) : (
                patient.address || '—'
              )}
            </li>
            <li className="list-group-item">
              <strong>Medical History:</strong>{' '}
              {editMode ? (
                <textarea
                  name="medical_history"
                  className="form-control"
                  value={formData.medical_history || ''}
                  onChange={handleChange}
                />
              ) : (
                patient.medical_history || '—'
              )}
            </li>
          </ul>

          {editMode ? (
            <>
              <button type="submit" className="btn btn-primary me-2">Save</button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setEditMode(false);
                  setFormData(patient);
                }}
              >
                Cancel
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-warning" onClick={() => setEditMode(true)}>
              Edit
            </button>
          )}

          <button
            type="button"
            className="btn btn-danger ms-2"
            onClick={() => navigate('/patients')}
          >
            Back to Patients
          </button>

          <button
            type="button"
            className="btn btn-success ms-2"
            onClick={() => setShowAppointmentForm(true)} // ✅ toggle form
          >
            Create Appointment
          </button>
        </form>
      )}

      {showAppointmentForm && (
        <div className="mt-4">
          <CreateAppointmentForm
            defaultDoctorId={patient.provider} // ✅ pass provider ID
            patientName={`${patient.first_name} ${patient.last_name}`}
            onSuccess={() => {
              setShowAppointmentForm(false);
              navigate('/patients'); // or return to this patient detail page
            }}
          />
          {false && (
            <button
              className="btn btn-secondary mt-3"
              onClick={() => setShowAppointmentForm(false)}
            >
              Cancel Appointment Creation
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default PatientDetailPage;
