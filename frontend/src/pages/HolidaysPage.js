import { useState, useEffect } from 'react';
import { Table, Form, Button, Spinner, Alert, InputGroup } from 'react-bootstrap';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';

function HolidaysTab() {
  const navigate = useNavigate();
  const [holidayList, setHolidayList] = useState([]);
  const [buffered, setBuffered] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [yearInput, setYearInput] = useState(new Date().getFullYear());
  const [loadingYear, setLoadingYear] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  // Role-based access control for admin, system_admin, and registrar only
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      navigate('/login');
      return;
    }
    try {
      const decoded = jwtDecode(token);
      const role = decoded.role || '';
      if (role !== 'admin' && role !== 'system_admin' && role !== 'registrar') {
        navigate('/');
      }
    } catch (err) {
      navigate('/login');
    }
  }, [navigate]);

  const loadHolidays = async () => {
    setLoading(true);
    setStatus('');
    try {
      const token = localStorage.getItem('access_token');
      const res = await axios.get(`http://127.0.0.1:8000/api/holidays/?t=${Date.now()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const sorted = [...res.data].sort((a, b) => new Date(a.date) - new Date(b.date));
      setHolidayList(sorted);
      setBuffered(sorted.reduce((buf, h) => ({ ...buf, [h.id]: h.is_recognized }), {}));
    } catch (err) {
      console.error('Failed to fetch holidays:', err);
      setStatus('Failed to fetch holidays.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHolidays();
  }, []);

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
      await loadHolidays();
    } catch (e) {
      setStatus('Failed to save.');
      console.error(e);
    }
    setSaving(false);
  };

  const handleDelete = (id) => {
    if (!window.confirm('Are you sure you want to delete this holiday?')) return;
    setDeletingId(id);
    setHolidayList(prev => prev.filter(h => h.id !== id));

    const performDelete = async () => {
      try {
        const token = localStorage.getItem('access_token');
        await axios.delete(`http://127.0.0.1:8000/api/holidays/${id}/`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setStatus('Deleted!');
        requestIdleCallback(() => loadHolidays());
      } catch (e) {
        setStatus('Failed to delete.');
        console.error(e.response?.data || e.message);
      } finally {
        setTimeout(() => setDeletingId(null), 100);
      }
    };

    requestIdleCallback(performDelete);
  };

  const handleLoadYear = async () => {
    setLoadingYear(true);
    setStatus('');
    try {
      const token = localStorage.getItem('access_token');
      await axios.get(`http://127.0.0.1:8000/api/holidays/?year=${yearInput}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setStatus(`Holidays for ${yearInput} loaded!`);
      await loadHolidays();
    } catch (e) {
      setStatus('Failed to load holidays for year.');
      console.error(e);
    }
    setLoadingYear(false);
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString(undefined, {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };;

  return (
    <>
      <div className="mb-3 d-flex align-items-center gap-2">
        <InputGroup style={{ maxWidth: 230 }}>
          <Form.Control
            type="number"
            min={1900}
            value={yearInput}
            onChange={e => setYearInput(e.target.value)}
            placeholder="Year"
            size="sm"
          />
          <Button
            variant="outline-primary"
            size="sm"
            onClick={handleLoadYear}
            disabled={loadingYear}
          >
            {loadingYear ? <Spinner size="sm" /> : 'Load Holidays'}
          </Button>
        </InputGroup>
        <div className="ms-auto">
          <Button variant="primary" onClick={handleSave} disabled={saving || loading}>
            {saving ? <Spinner size="sm" /> : 'Save Holidays'}
          </Button>
        </div>
      </div>
      <Table bordered className="align-middle text-center" style={{ maxWidth: 900, margin: '0 auto' }}>
        <thead>
          <tr>
            <th style={{ width: 130 }}>Date</th>
            <th className="text-start" style={{ minWidth: 250 }}>Holiday</th>
            <th style={{ width: 80 }}>Recognized</th>
            <th style={{ width: 80 }}>Delete</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={4}><Spinner animation="border" size="sm" /></td>
            </tr>
          ) : (
            holidayList.map(h => (
              <tr key={h.id}>
                <td>{formatDate(h.date)}</td>
                <td className="text-start">{h.name}</td>
                <td>
                  <Form.Check
                    type="checkbox"
                    checked={buffered[h.id] ?? h.is_recognized}
                    onChange={() => handleHolidayCheckbox(h.id, !(buffered[h.id] ?? h.is_recognized))}
                  />
                </td>
                <td>
                  <Button
                    variant="outline-danger"
                    size="sm"
                    onClick={() => handleDelete(h.id)}
                    disabled={deletingId === h.id}
                  >
                    {deletingId === h.id ? <Spinner size="sm" /> : 'Delete'}
                  </Button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </Table>
      <div className="mt-3">
        {status && (
          <Alert className="d-inline-block ms-3 py-1 px-3" variant={status.includes('Failed') ? 'danger' : 'success'}>
            {status}
          </Alert>
        )}
      </div>
      <div className="text-muted mt-3">
        <small>
          <b>Tip:</b> Click "Load Holidays" to auto-create US federal holidays for any year. The Date column shows the exact holiday date. Use the delete button to remove any unwanted holidays.
        </small>
      </div>
    </>
  );
}

export default HolidaysTab;
