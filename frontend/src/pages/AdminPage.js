// src/pages/AdminPage.js
import { useNavigate } from 'react-router-dom';
import { Button, Card } from 'react-bootstrap';

function AdminPage() {
  const navigate = useNavigate();

  return (
    <div className="container mt-5">
      <Card className="text-center shadow">
        <Card.Body>
          <h2 className="mb-4">Admin Dashboard</h2>
          <div className="d-grid gap-3">
            <Button variant="primary" size="lg" onClick={() => navigate('/patients')}>
              Patient List
            </Button>
            <Button variant="success" size="lg" onClick={() => navigate('/appointments')}>
              Manage Appointments
            </Button>
            <Button variant="secondary" size="lg" onClick={() => navigate('/profile')}>
              Profile Page
            </Button>
          </div>
        </Card.Body>
      </Card>
    </div>
  );
}

export default AdminPage;
