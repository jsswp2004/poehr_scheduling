import { useState, useEffect } from 'react';
import {
  Box, Stack, Typography, Button, TextField, IconButton, Tooltip, Paper, Dialog, DialogTitle,
  DialogContent, DialogActions, MenuItem, FormControl, InputLabel, Select as MUISelect,
  Alert, Table, TableHead, TableRow, TableCell, TableBody, Checkbox,
  CircularProgress, TableContainer, Divider
} from '@mui/material';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faTrash, faEdit, faXmark, faSpinner } from '@fortawesome/free-solid-svg-icons';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [showHolidayDialog, setShowHolidayDialog] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState(null);
  const [holidayFormData, setHolidayFormData] = useState({
    name: '',
    date: '',
    is_recognized: true,
  });

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
    setStatus('');

    const performDelete = async () => {
      try {
        const token = localStorage.getItem('access_token');
        const res = await axios.patch(`http://127.0.0.1:8000/api/holidays/${id}/`, {
          suppressed: true
        }, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setStatus('Deleted!');
        await loadHolidays();
      } catch (e) {
        setStatus('Failed to delete.');
        console.error(e.response?.data || e.message);
      } finally {
        setTimeout(() => setDeletingId(null), 100);
      }
    };

    performDelete();
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
  };

  const handleOpenHolidayDialog = (holiday) => {
    if (holiday) {
      setEditingHoliday(holiday);
      setHolidayFormData({
        name: holiday.name,
        date: holiday.date.split('T')[0],
        is_recognized: holiday.is_recognized,
      });
    } else {
      setEditingHoliday(null);
      setHolidayFormData({
        name: '',
        date: '',
        is_recognized: true,
      });
    }
    setShowHolidayDialog(true);
  };

  const handleCloseHolidayDialog = () => {
    setShowHolidayDialog(false);
    setEditingHoliday(null);
  };

  const handleSaveHoliday = async () => {
    setSaving(true);
    setStatus('');
    try {
      const token = localStorage.getItem('access_token');
      const payload = {
        name: holidayFormData.name,
        date: holidayFormData.date,
        is_recognized: holidayFormData.is_recognized,
      };
      if (editingHoliday) {
        await axios.patch(`http://127.0.0.1:8000/api/holidays/${editingHoliday.id}/`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setStatus('Holiday updated!');
      } else {
        await axios.post(`http://127.0.0.1:8000/api/holidays/`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setStatus('Holiday added!');
      }
      handleCloseHolidayDialog();
      await loadHolidays();
    } catch (e) {
      setStatus('Failed to save holiday.');
      console.error(e);
    }
    setSaving(false);
  };

  const filteredHolidays = holidayList.filter(holiday =>
    holiday.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f5f6fa', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', pt: 6 }}>
      <Card sx={{ width: '100%', maxWidth: 1100, boxShadow: 6, borderRadius: 3 }}>
        <CardContent>
          <Typography variant="h5" sx={{ mb: 2, fontWeight: 700 }}>Holidays</Typography>

          <Stack direction="row" spacing={2} alignItems="center" justifyContent="flex-end" sx={{ mb: 2 }}>
            <TextField
              label="Year"
              type="number"
              size="small"
              value={yearInput}
              onChange={e => setYearInput(e.target.value)}
              sx={{ maxWidth: 120 }}
              disabled={loadingYear}
            />
            <Button variant="outlined" color="primary" onClick={handleLoadYear} disabled={loadingYear}>
              {loadingYear ? <FontAwesomeIcon icon={faSpinner} spin style={{ marginRight: 8 }} /> : null}
              Load Year
            </Button>
          </Stack>

          <Stack direction="row" spacing={2} justifyContent="space-between" sx={{ mb: 3 }}>
            <TextField
              size="small"
              variant="outlined"
              placeholder="Search holidays..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              sx={{ maxWidth: 350 }}
              InputProps={{
                endAdornment: searchQuery && (
                  <IconButton size="small" onClick={() => setSearchQuery('')}>
                    <FontAwesomeIcon icon={faXmark} />
                  </IconButton>
                )
              }}
            />
            <Button variant="contained" color="primary" onClick={() => handleOpenHolidayDialog(null)}>
              <FontAwesomeIcon icon={faPlus} style={{ marginRight: 6 }} />
              Add Holiday
            </Button>
          </Stack>

          <Divider sx={{ mb: 3 }} />

          <Box sx={{ borderRadius: 2, boxShadow: 2, bgcolor: '#fff', mb: 3 }}>
            <TableContainer component={Box}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell style={{ width: 180 }}>Date</TableCell>
                    <TableCell style={{ minWidth: 250, fontWeight: 700 }}>Holiday</TableCell>
                    <TableCell style={{ width: 100 }}>Recognized</TableCell>
                    <TableCell style={{ width: 100 }}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={4} align="center"><CircularProgress size={24} /></TableCell></TableRow>
                  ) : filteredHolidays.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} align="center" sx={{ color: 'text.secondary', py: 4 }}>No holidays found.</TableCell>
                    </TableRow>
                  ) : (
                    filteredHolidays.map(h => (
                      <TableRow key={h.id} hover>
                        <TableCell>{formatDate(h.date)}</TableCell>
                        <TableCell sx={{ fontWeight: 500 }}>{h.name}</TableCell>
                        <TableCell>
                          <Checkbox
                            checked={buffered[h.id] ?? h.is_recognized}
                            onChange={() => handleHolidayCheckbox(h.id, !(buffered[h.id] ?? h.is_recognized))}
                          />
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', gap: 1 }}>
                            <Tooltip title="Edit">
                              <IconButton size="small" onClick={() => handleOpenHolidayDialog(h)}>
                                <FontAwesomeIcon icon={faEdit} />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Delete">
                              <IconButton size="small" color="error" onClick={() => handleDelete(h.id)} disabled={deletingId === h.id}>
                                {deletingId === h.id
                                  ? <FontAwesomeIcon icon={faSpinner} spin />
                                  : <FontAwesomeIcon icon={faTrash} />}
                              </IconButton>
                            </Tooltip>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>

          {status && (
            <Alert severity={status.includes('Failed') ? 'error' : 'success'} sx={{ mt: 2 }}>
              {status}
            </Alert>
          )}

          <Divider sx={{ my: 2 }} />

          <Typography variant="body2" color="text.secondary">
            <b>Tip:</b> Click "Add Holiday" to create a new holiday. Use the delete button to remove any unwanted holidays.
          </Typography>
        </CardContent>

        <Dialog open={showHolidayDialog} onClose={handleCloseHolidayDialog} maxWidth="sm" fullWidth>
          <DialogTitle>{editingHoliday ? 'Edit Holiday' : 'Add Holiday'}</DialogTitle>
          <DialogContent dividers>
            <Stack spacing={2} mt={2}>
              <TextField
                label="Name"
                value={holidayFormData.name}
                onChange={e => setHolidayFormData({ ...holidayFormData, name: e.target.value })}
                fullWidth
                size="small"
              />
              <TextField
                label="Date"
                type="date"
                value={holidayFormData.date}
                onChange={e => setHolidayFormData({ ...holidayFormData, date: e.target.value })}
                fullWidth
                size="small"
                InputLabelProps={{ shrink: true }}
              />
              <FormControl fullWidth size="small">
                <InputLabel id="recognized-label">Recognized</InputLabel>
                <MUISelect
                  labelId="recognized-label"
                  value={holidayFormData.is_recognized ? 'yes' : 'no'}
                  label="Recognized"
                  onChange={e => setHolidayFormData({ ...holidayFormData, is_recognized: e.target.value === 'yes' })}
                >
                  <MenuItem value="yes">Yes</MenuItem>
                  <MenuItem value="no">No</MenuItem>
                </MUISelect>
              </FormControl>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseHolidayDialog} color="secondary">Cancel</Button>
            <Button onClick={handleSaveHoliday} variant="contained" color="primary">Save</Button>
          </DialogActions>
        </Dialog>
      </Card>
    </Box>
  );
}

export default HolidaysTab;
