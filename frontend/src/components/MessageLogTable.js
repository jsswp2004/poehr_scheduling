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
  InputAdornment,
  Pagination,
  Stack,
  Button
} from '@mui/material';
import { Search, Delete, Print, Download } from '@mui/icons-material';
import { jwtDecode } from 'jwt-decode';

function MessageLogTable({ type }) {
  const [logs, setLogs] = useState([]);
  const [search, setSearch] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [appliedStart, setAppliedStart] = useState('');
  const [appliedEnd, setAppliedEnd] = useState('');
  const [page, setPage] = useState(1);
  const [isSystemAdmin, setIsSystemAdmin] = useState(false);
  const rowsPerPage = 10;const fetchLogs = async () => {
    try {
      const token = localStorage.getItem('access_token');
      let url = `http://127.0.0.1:8000/api/communicator/logs/?message_type=${type}`;
      if (appliedStart) url += `&created_at__gte=${appliedStart}`;
      if (appliedEnd) url += `&created_at__lte=${appliedEnd}`;
      
      // Debug: Log the URL being called
      console.log('Fetching logs with URL:', url);
      
      const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      console.log('Logs fetched:', res.data.length);
      setLogs(res.data);
    } catch (err) {
      console.error('Failed to fetch logs', err);
    }
  };  useEffect(() => {
    fetchLogs();
  }, [type, appliedStart, appliedEnd]);

  useEffect(() => {
    // Check user role on component mount
    const token = localStorage.getItem('access_token');
    if (token) {
      try {
        const decoded = jwtDecode(token);
        setIsSystemAdmin(decoded.role === 'system_admin');
      } catch (err) {
        console.error('Error decoding token:', err);
        setIsSystemAdmin(false);
      }
    }
  }, []);

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

  // Pagination logic
  const totalPages = Math.ceil(filtered.length / rowsPerPage);
  const startIndex = (page - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const paginatedLogs = filtered.slice(startIndex, endIndex);

  const handlePageChange = (event, newPage) => {
    setPage(newPage);
  };
  // Reset to page 1 when search changes
  useEffect(() => {
    setPage(1);
  }, [search, appliedStart, appliedEnd]);

  const handleSetFilters = () => {
    setAppliedStart(start);
    setAppliedEnd(end);
    setPage(1);
  };
  const handleClearFilters = () => {
    setStart('');
    setEnd('');
    setAppliedStart('');
    setAppliedEnd('');
    setPage(1);
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    const currentMonth = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const logType = type === 'sms' ? 'SMS' : 'Email';
    
    let printContent = `
      <html>
        <head>
          <title>${logType} Logs Report</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            h1 { color: #333; border-bottom: 2px solid #333; padding-bottom: 10px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f5f5f5; font-weight: bold; }
            tr:nth-child(even) { background-color: #f9f9f9; }
            .summary { margin-bottom: 20px; padding: 10px; background-color: #f8f9fa; border: 1px solid #e9ecef; }
          </style>
        </head>
        <body>
          <h1>${logType} Logs Report</h1>
          <div class="summary">
            <p><strong>Generated on:</strong> ${new Date().toLocaleString()}</p>
            <p><strong>Total records:</strong> ${filtered.length}</p>
            ${appliedStart || appliedEnd ? `<p><strong>Date range:</strong> ${appliedStart || 'All'} to ${appliedEnd || 'All'}</p>` : ''}
          </div>
          <table>
            <thead>
              <tr>
                <th>Recipient</th>
                ${type === 'email' ? '<th>Subject</th>' : ''}
                <th>Body</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
    `;
    
    filtered.forEach(log => {
      printContent += `
        <tr>
          <td>${log.recipient}</td>
          ${type === 'email' ? `<td>${log.subject || ''}</td>` : ''}
          <td>${log.body}</td>
          <td>${new Date(log.created_at).toLocaleString()}</td>
        </tr>
      `;
    });
    
    printContent += `
            </tbody>
          </table>
        </body>
      </html>
    `;
    
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.print();
  };

  const handleDownloadCSV = () => {
    const logType = type === 'sms' ? 'SMS' : 'Email';
    const currentDate = new Date().toISOString().split('T')[0];
    
    // Prepare CSV headers
    const headers = type === 'email' 
      ? ['Recipient', 'Subject', 'Body', 'Date']
      : ['Recipient', 'Body', 'Date'];
    
    // Prepare CSV data
    const csvData = filtered.map(log => {
      const row = [
        `"${log.recipient.replace(/"/g, '""')}"`,
        ...(type === 'email' ? [`"${(log.subject || '').replace(/"/g, '""')}"`] : []),
        `"${log.body.replace(/"/g, '""')}"`,
        `"${new Date(log.created_at).toLocaleString()}"`
      ];
      return row.join(',');
    });
    
    // Combine headers and data
    const csvContent = [headers.join(','), ...csvData].join('\n');
    
    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `${logType}_Logs_${currentDate}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <Paper sx={{ p: 2, flex: 1 }}>
      <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center' }}>
        <Typography variant="h6" sx={{ minWidth: 'fit-content' }}>
          {type === 'sms' ? 'SMS Logs' : 'Email Logs'}
        </Typography>
        <TextField
          label="Search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ flex: 1 }}
          size="small"
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search />
              </InputAdornment>
            )
          }}
        />
        <TextField
          type="date"
          label="From"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          InputLabelProps={{ shrink: true }}
          size="small"
          sx={{ minWidth: 140 }}
        />        <TextField
          type="date"
          label="To"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          InputLabelProps={{ shrink: true }}
          size="small"
          sx={{ minWidth: 140 }}
        />
        <Button
          variant="contained"
          size="small"
          onClick={handleSetFilters}
          sx={{ minWidth: 60 }}
        >
          Set
        </Button>        <Button
          variant="outlined"
          size="small"
          onClick={handleClearFilters}
          sx={{ minWidth: 60 }}
        >
          Clear
        </Button>
        <Button
          variant="contained"
          size="small"
          onClick={handlePrint}
          startIcon={<Print />}
          sx={{ minWidth: 80 }}
        >
          Print
        </Button>
        <Button
          variant="contained"
          size="small"
          onClick={handleDownloadCSV}
          startIcon={<Download />}
          sx={{ minWidth: 100 }}
        >
          CSV
        </Button>
      </Box><Table size="small" sx={{ '& .MuiTableCell-root': { fontSize: '0.75rem' } }}>        <TableHead>
          <TableRow sx={{ bgcolor: '#f5f5f5' }}>
            <TableCell>Recipient</TableCell>
            {type === 'email' && <TableCell>Subject</TableCell>}
            <TableCell>Body</TableCell>
            <TableCell>Date</TableCell>
            {isSystemAdmin && <TableCell>Actions</TableCell>}
          </TableRow>
        </TableHead>        <TableBody>
          {paginatedLogs.map((log) => (
            <TableRow key={log.id} hover>
              <TableCell>{log.recipient}</TableCell>
              {type === 'email' && <TableCell>{log.subject}</TableCell>}
              <TableCell>{log.body}</TableCell>
              <TableCell>{new Date(log.created_at).toLocaleString()}</TableCell>
              {isSystemAdmin && (
                <TableCell>
                  <IconButton
                    color="error"
                    size="small"
                    onClick={() => handleDelete(log.id)}
                  >
                    <Delete />
                  </IconButton>
                </TableCell>
              )}
            </TableRow>
          ))}
          {paginatedLogs.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={type === 'email' ? (isSystemAdmin ? 5 : 4) : (isSystemAdmin ? 4 : 3)}
                align="center"
              >
                <Typography color="text.secondary">No logs found.</Typography>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      
      {/* Pagination */}
      {filtered.length > rowsPerPage && (
        <Stack direction="row" justifyContent="center" sx={{ mt: 2 }}>
          <Pagination
            count={totalPages}
            page={page}
            onChange={handlePageChange}
            color="primary"
            size="medium"
            showFirstButton
            showLastButton
          />
        </Stack>
      )}
    </Paper>
  );
}

export default MessageLogTable;
