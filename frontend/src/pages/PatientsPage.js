import axios from 'axios';
import { useEffect, useState } from 'react';

function PatientsPage() {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPatients = async () => {
      try {
        const token = localStorage.getItem('access_token');
        const res = await axios.get('http://127.0.0.1:8000/api/patients/', {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        setPatients(res.data);
      } catch (err) {
        console.error('Failed to fetch patients:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchPatients();
  }, []);

  if (loading) return <p className="text-center mt-5">Loading patients...</p>;

  return (
    <div className="container mt-4">
      <h2 className="mb-4">Patient List</h2>
      {patients.length === 0 ? (
        <p>No patients found.</p>
      ) : (
        <ul className="list-group">
          {patients.map((patient) => (
            <li key={patient.id} className="list-group-item">
              <strong>{patient.first_name} {patient.last_name}</strong> - {patient.email}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default PatientsPage;
