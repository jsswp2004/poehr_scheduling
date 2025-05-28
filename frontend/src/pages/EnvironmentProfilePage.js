import { useState, useEffect } from 'react';
import { Card, Table, Form, Button, Alert, Spinner, Tabs, Tab, Col } from 'react-bootstrap';
import axios from 'axios';
import HolidaysTab from './HolidaysPage';
import { useNavigate } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';

const DAYS = [
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
  { label: 'Sun', value: 0 },
];

const HOLIDAYS = [
  { name: 'New Year\'s Day', date: '2024-01-01' },
  { name: 'Martin Luther King, Jr. Day', date: '2024-01-15' },
  { name: 'Washington’s Birthday', date: '2024-02-19' },
  { name: 'Memorial Day', date: '2024-05-27' },
  { name: 'Juneteenth National Independence Day', date: '2024-06-19' },
  { name: 'Independence Day', date: '2024-07-04' },
  { name: 'Labor Day', date: '2024-09-02' },
  { name: 'Columbus Day', date: '2024-10-14' },
  { name: 'Veterans Day', date: '2024-11-11' },
  { name: 'Thanksgiving Day', date: '2024-11-28' },
  { name: 'Christmas Day', date: '2024-12-25' }
];

function UploadTab() {
  const [file, setFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState('');
  const token = localStorage.getItem('access_token');

  const handleDownload = async () => {
    const token = localStorage.getItem('access_token');
    try {
      const response = await axios.get('http://127.0.0.1:8000/api/upload/clinic-events/template/', {
        headers: {
          Authorization: `Bearer ${token}`
        },
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'clinic_events_template.csv');
      document.body.appendChild(link);
      link.click();
    } catch (err) {
      console.error(err);
      setUploadStatus('❌ Download failed.');
    }
  };


  const handleUpload = async () => {
    if (!file) {
      setUploadStatus('❌ Please select a file to upload.');
      return;
    }
    const formData = new FormData();
    formData.append('file', file);

    try {
      await axios.post('http://127.0.0.1:8000/api/upload/clinic-events/', formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
      });
      setUploadStatus('✅ Upload successful.');
    } catch (err) {
      console.error(err);
      setUploadStatus('❌ Upload failed.');
    }
  };

  return (
    <>

      <Table bordered className="text-center mt-3">
        <thead>
          <tr>
            <th>Items</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Clinic Events</td>
            <td>
              <div className="d-flex gap-2 justify-content-center flex-wrap">
                <Button variant="outline-primary" onClick={handleDownload}>
                  Download Template
                </Button>
                <Form.Control
                  type="file"
                  accept=".csv"
                  onChange={(e) => setFile(e.target.files[0])}
                  style={{ width: '200px' }}
                />
                <Button variant="success" onClick={handleUpload}>
                  Upload CSV
                </Button>
              </div>
            </td>
          </tr>
        </tbody>
      </Table>
      {uploadStatus && (
        <Alert variant={uploadStatus.startsWith('✅') ? 'success' : 'danger'} className="mt-3">
          {uploadStatus}
        </Alert>
      )}
    </>
  );
}

function EnvironmentProfilePage() {
  const [blockedDays, setBlockedDays] = useState([0, 6]);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedHolidays, setSelectedHolidays] = useState([]);
  const [tabKey, setTabKey] = useState('blocked-days');
  const navigate = useNavigate();

  useEffect(() => {
    // Role-based access control for admin and system_admin only
    const token = localStorage.getItem('access_token');
    if (!token) {
      navigate('/login');
      return;
    }
    try {
      const decoded = jwtDecode(token);
      const role = decoded.role || '';
      if (role !== 'admin' && role !== 'system_admin') {
        navigate('/');
      }
    } catch (err) {
      navigate('/login');
    }
  }, [navigate]);

  useEffect(() => {
    async function fetchSettings() {
      setLoading(true);
      try {
        const token = localStorage.getItem('access_token');
        const res = await axios.get('http://127.0.0.1:8000/api/settings/environment/', {
          headers: { Authorization: `Bearer ${token}` },
        });
        setBlockedDays(res.data.blocked_days || []);
      } catch (err) {
        setStatus('Failed to load settings.');
        console.error(err);
      }
      setLoading(false);
    }
    fetchSettings();
  }, []);

  const handleCheckbox = (dayValue) => {
    setBlockedDays((prev) =>
      prev.includes(dayValue)
        ? prev.filter((d) => d !== dayValue)
        : [...prev, dayValue]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setStatus('');
    try {
      const token = localStorage.getItem('access_token');
      await axios.post(
        'http://127.0.0.1:8000/api/settings/environment/',
        { blocked_days: blockedDays },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setStatus('Saved!');
    } catch (e) {
      setStatus('Failed to save.');
      console.error(e);
    }
    setSaving(false);
  };

  return (
    <Col className="d-flex justify-content-center align-items-left flex-column mt-5">
      <Card className="shadow-sm">
        <Card.Body>
          <Tabs activeKey={tabKey} onSelect={setTabKey} className="mb-3">
            <Tab eventKey="blocked-days" title="Default Blocked Days">
              <Table bordered className="align-middle text-center" style={{ maxWidth: 800 }}>
                <thead>
                  <tr>
                    <th style={{ minWidth: 220 }}>Setting</th>
                    {DAYS.map((d) => (
                      <th key={d.value}>{d.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="text-start"><b>Default Blocked Days</b></td>
                    {DAYS.map((d) => (
                      <td key={d.value}>
                        <Form.Check
                          type="checkbox"
                          checked={blockedDays.includes(d.value)}
                          onChange={() => handleCheckbox(d.value)}
                          disabled={loading || saving}
                        />
                      </td>
                    ))}
                  </tr>
                </tbody>
              </Table>
              <div className="mt-3">
                <Button variant="primary" onClick={handleSave} disabled={saving || loading}>
                  {saving ? <Spinner size="sm" /> : 'Save Settings'}
                </Button>
                {status && (
                  <Alert className="d-inline-block ms-3 py-1 px-3" variant={status === 'Saved!' ? 'success' : 'danger'}>
                    {status}
                  </Alert>
                )}
              </div>
              <div className="text-muted mt-3">
                <small>
                  Select which days are <b>blocked by default</b> for clinic scheduling. Unchecked days are available for appointments.
                </small>
              </div>
            </Tab>

            <Tab eventKey="holidays" title="Holidays">
              <HolidaysTab />
            </Tab>

            <Tab eventKey="uploads" title="Uploads">
              <UploadTab />
            </Tab>
          </Tabs>
        </Card.Body>
      </Card>

      <div>
        <Button
          variant="outline-secondary"
          onClick={() => navigate("/admin")}
          className="mt-2 mb-3 d-inline-block w-12.5"
          style={{ padding: '2px 12px', fontSize: '1rem', minWidth: 0 }}
        >
          ← Back
        </Button>
      </div>
    </Col>
  );
}

export default EnvironmentProfilePage;
