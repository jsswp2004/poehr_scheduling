import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Paper,
  Typography,
  TextField,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  IconButton,
  Box,
  InputAdornment
} from '@mui/material';
import { Search, Delete } from '@mui/icons-material';

function MessageLogTable({ type }) {
  const [logs, setLogs] = useState([]);
  const [search, setSearch] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');

  const fetchLogs = async () => {
    try {
      const token = localStorage.getItem('access_token');
      let url = `http://127.0.0.1:8000/api/communicator/logs/?message_type=${type}`;
      if (start) url += `&created_at__gte=${start}`;
      if (end) url += `&created_at__lte=${end}`;
      const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setLogs(res.data);
    } catch (err) {
      console.error('Failed to fetch logs', err);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [type, start, end]);

  const handleDelete = async (id) => {
    try {
      const token = localStorage.getItem('access_token');
      await axios.delete(`http://127.0.0.1:8000/api/communicator/logs/${id}/`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchLogs();
    } catch (err) {
      console.error('Failed to delete log', err);
    }
  };

  const filtered = logs.filter(
    (log) =>
      log.recipient.toLowerCase().includes(search.toLowerCase()) ||
      log.body.toLowerCase().includes(search.toLowerCase()) ||
      (log.subject && log.subject.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <Paper sx={{ p: 2, flex: 1 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>
        {type === 'sms' ? 'SMS Logs' : 'Email Logs'}
      </Typography>
      <TextField
        label="Search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        fullWidth
        sx={{ mb: 2 }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <Search />
            </InputAdornment>
          )
        }}
      />
      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
        <TextField
          type="date"
          label="From"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          InputLabelProps={{ shrink: true }}
          size="small"
        />
        <TextField
          type="date"
          label="To"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          InputLabelProps={{ shrink: true }}
          size="small"
        />
      </Box>
      <Table size="small">
        <TableHead>
          <TableRow sx={{ bgcolor: '#f5f5f5' }}>
            <TableCell>Recipient</TableCell>
            {type === 'email' && <TableCell>Subject</TableCell>}
            <TableCell>Body</TableCell>
            <TableCell>Date</TableCell>
            <TableCell>Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {filtered.map((log) => (
            <TableRow key={log.id} hover>
              <TableCell>{log.recipient}</TableCell>
              {type === 'email' && <TableCell>{log.subject}</TableCell>}
              <TableCell>{log.body}</TableCell>
              <TableCell>{new Date(log.created_at).toLocaleString()}</TableCell>
              <TableCell>
                <IconButton
                  color="error"
                  size="small"
                  onClick={() => handleDelete(log.id)}
                >
                  <Delete />
                </IconButton>
              </TableCell>
            </TableRow>
          ))}
          {filtered.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={type === 'email' ? 5 : 4}
                align="center"
              >
                <Typography color="text.secondary">No logs found.</Typography>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Paper>
  );
}

export default MessageLogTable;
