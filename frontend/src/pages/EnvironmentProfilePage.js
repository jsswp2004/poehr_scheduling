import { useState, useEffect } from 'react';
import { Card, Table, Form, Button, Alert, Spinner } from 'react-bootstrap';
import axios from 'axios';

const DAYS = [
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
  { label: 'Sun', value: 0 },
];

function EnvironmentProfilePage() {
  const [blockedDays, setBlockedDays] = useState([0, 6]);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);

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
    <Card className="shadow-sm">
      <Card.Body>
        <h4 className="fw-bold mb-4">Environment Profile</h4>
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
      </Card.Body>
    </Card>
  );
}

export default EnvironmentProfilePage;
