// src/pages/AdminPage.js
import { useNavigate } from 'react-router-dom';
import { Button, Card } from 'react-bootstrap';
import { FaTools, FaCalendarCheck, FaUserCog } from 'react-icons/fa';


function AdminPage() {
  const navigate = useNavigate();

  return (
    <div className="container mt-5">
      <Card className="text-center shadow">
        <Card.Body>
          <h2 className="mb-6">Configuration</h2>
          <hr />
          <div className="d-flex justify-content-center gap-3">
            <Button
              variant="primary"
              size="lg"
              onClick={() => navigate('/patients')}
              style={{
                width: '120px',
                height: '120px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center'
              }}
            >
              
              <FaCalendarCheck size={24} className="mb-1" />
              Patient Visits
            </Button>


              {true && (
                <Button
                variant="success"
                size="lg"
                onClick={() => navigate('/maintenance')}
                style={{
                  width: '120px',
                  height: '120px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center'              
                }}              
                >
                  <FaTools size={24} className="mb-1" />
                  Settings
                </Button>
              )}

            <Button
              variant="secondary"
              size="lg"
              onClick={() => navigate('/profile')}
              style={{
                width: '120px',
                height: '120px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center'
              }}
            >
              <FaUserCog size={24} className="mb-1" />
              Profile Page
            </Button>
          </div>

        </Card.Body>
      </Card>
    </div>
  );
}

export default AdminPage;
