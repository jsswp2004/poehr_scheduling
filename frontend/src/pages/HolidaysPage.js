import { useState, useEffect } from 'react';
import { Table, Form, Button, Spinner, Alert } from 'react-bootstrap';
import axios from 'axios';

function HolidaysTab() {
  const [holidayList, setHolidayList] = useState([]);
  const [buffered, setBuffered] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  // ----------- OPTION A: Always ensure holidays for the current year exist ---------
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    const currentYear = new Date().getFullYear();

    async function ensureCurrentYearHolidays() {
      // This will auto-populate the holidays for this year if not present.
      await axios.get(
        `http://127.0.0.1:8000/api/holidays/?year=${currentYear}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
    }

    async function fetchHolidays() {
      setLoading(true);
      // Always ensure current year is available before loading all holidays.
      await ensureCurrentYearHolidays();

      // Now fetch all holidays for all years.
      const res = await axios.get('http://127.0.0.1:8000/api/holidays/', {
        headers: { Authorization: `Bearer ${token}` }
      });
      // Sort holidays by date (oldest to newest)
      const sorted = [...res.data].sort((a, b) => new Date(a.date) - new Date(b.date));
      setHolidayList(sorted);
      setBuffered(sorted.reduce((buf, h) => ({ ...buf, [h.id]: h.is_recognized }), {}));
      setLoading(false);
    }
    fetchHolidays();
  }, []);
  // -------------------------------------------------------------------------------

  const handleHolidayCheckbox = (id, checked) => {
    setBuffered(prev => ({ ...prev, [id]: checked }));
  };

  const handleSave = async () => {
    setSaving(true);
    setStatus('');
    try {
      const token = localStorage.getItem('access_token');
      await Promise.all(
        holidayList.map(h =>
          buffered[h.id] !== h.is_recognized
            ? axios.patch(
                `http://127.0.0.1:8000/api/holidays/${h.id}/`,
                { is_recognized: buffered[h.id] },
                { headers: { Authorization: `Bearer ${token}` } }
              )
            : null
        )
      );
      setStatus('Saved!');
    } catch (e) {
      setStatus('Failed to save.');
      console.error(e);
    }
    setSaving(false);
  };

  return (
    <>
      <Table bordered className="align-middle text-center" style={{ maxWidth: 800, margin: '0 auto' }}>
        <thead>
          <tr>
            <th style={{ width: 80 }}>Year</th>
            <th className="text-start" style={{ minWidth: 250 }}>Holiday</th>
            <th style={{ width: 80 }}>Recognized</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={3}><Spinner animation="border" size="sm" /></td>
            </tr>
          ) : (
            holidayList.map(h => (
              <tr key={h.id}>
                <td>{new Date(h.date).getFullYear()}</td>
                <td className="text-start">{h.name}</td>
                <td>
                  <Form.Check
                    type="checkbox"
                    checked={buffered[h.id] ?? h.is_recognized}
                    onChange={() => handleHolidayCheckbox(h.id, !(buffered[h.id] ?? h.is_recognized))}
                  />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </Table>
      <div className="mt-3">
        <Button variant="primary" onClick={handleSave} disabled={saving || loading}>
          {saving ? <Spinner size="sm" /> : 'Save Holidays'}
        </Button>
        {status && (
          <Alert className="d-inline-block ms-3 py-1 px-3" variant={status === 'Saved!' ? 'success' : 'danger'}>
            {status}
          </Alert>
        )}
      </div>
      <div className="text-muted mt-3">
        <small>
          Select which federal holidays your clinic recognizes as non-working days, for any year. Click <b>Save Holidays</b> to apply your changes.
        </small>
      </div>
    </>
  );
}

export default HolidaysTab;
