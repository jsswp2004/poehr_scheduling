import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Tabs,
  Tab,
  Alert,
  IconButton,
  Chip,
  FormControlLabel,
  Checkbox,
  LinearProgress
} from '@mui/material';
import {
  Add as AddIcon,
  Upload as UploadIcon,
  Send as SendIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Email as EmailIcon,
  Sms as SmsIcon
} from '@mui/icons-material';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';
import BackButton from '../components/BackButton';
import { toast } from '../components/SimpleToast';

function CommunicatorPage() {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('contacts');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [messageDialogOpen, setMessageDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);

  const [contactForm, setContactForm] = useState({
    name: '',
    phone: '',
    email: ''
  });

  const [messageForm, setMessageForm] = useState({
    message: '',
    subject: 'Notification',
    send_email: false,
    send_sms: true
  });

  const navigate = useNavigate();
  const token = localStorage.getItem('access_token');

  // Role check and authentication
  useEffect(() => {
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
  }, [navigate, token]);
  // Fetch contacts
  const fetchContacts = async (showErrorToast = false) => {
    setLoading(true);
    try {
      const response = await axios.get('http://127.0.0.1:8000/api/communicator/contacts/', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setContacts(response.data);
    } catch (error) {
      console.error('Failed to fetch contacts:', error);
      if (showErrorToast) {
        toast.error('Failed to load contacts');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchContacts();
    }
  }, [token]);

  // Handle contact form changes
  const handleContactFormChange = (field) => (event) => {
    setContactForm(prev => ({
      ...prev,
      [field]: event.target.value
    }));
  };

  // Handle message form changes
  const handleMessageFormChange = (field) => (event) => {
    if (field === 'send_email' || field === 'send_sms') {
      setMessageForm(prev => ({
        ...prev,
        [field]: event.target.checked
      }));
    } else {
      setMessageForm(prev => ({
        ...prev,
        [field]: event.target.value
      }));
    }
  };

  // Save contact (create or update)
  const handleSaveContact = async () => {
    try {
      if (editingContact) {
        // Update existing contact
        await axios.put(
          `http://127.0.0.1:8000/api/communicator/contacts/${editingContact.id}/`,
          contactForm,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        toast.success('Contact updated successfully');
      } else {
        // Create new contact
        await axios.post(
          'http://127.0.0.1:8000/api/communicator/contacts/',
          contactForm,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        toast.success('Contact created successfully');
      }
        setDialogOpen(false);
      setEditingContact(null);
      setContactForm({ name: '', phone: '', email: '' });
      fetchContacts(true); // Show error toast for user actions
    } catch (error) {
      console.error('Failed to save contact:', error);
      toast.error('Failed to save contact');
    }
  };

  // Delete contact
  const handleDeleteContact = async (id) => {
    if (!window.confirm('Are you sure you want to delete this contact?')) {
      return;
    }

    try {
      await axios.delete(`http://127.0.0.1:8000/api/communicator/contacts/${id}/`, {
        headers: { Authorization: `Bearer ${token}` }      });
      toast.success('Contact deleted successfully');
      fetchContacts(true); // Show error toast for user actions
    } catch (error) {
      console.error('Failed to delete contact:', error);
      toast.error('Failed to delete contact');
    }
  };

  // Edit contact
  const handleEditContact = (contact) => {
    setEditingContact(contact);
    setContactForm({
      name: contact.name,
      phone: contact.phone,
      email: contact.email
    });
    setDialogOpen(true);
  };

  // Handle file upload
  const handleFileUpload = async () => {
    if (!selectedFile) {
      toast.error('Please select a file');
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const response = await axios.post(
        'http://127.0.0.1:8000/api/communicator/upload/',
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data'
          }
        }
      );      toast.success(`${response.data.created} contacts uploaded successfully`);
      setUploadDialogOpen(false);
      setSelectedFile(null);
      fetchContacts(true); // Show error toast for user actions
    } catch (error) {
      console.error('Failed to upload contacts:', error);
      toast.error('Failed to upload contacts');
    } finally {
      setUploading(false);
    }
  };

  // Send bulk message
  const handleSendBulkMessage = async () => {
    if (!messageForm.message.trim()) {
      toast.error('Please enter a message');
      return;
    }

    if (!messageForm.send_email && !messageForm.send_sms) {
      toast.error('Please select at least one delivery method (Email or SMS)');
      return;
    }

    setSending(true);
    try {
      const response = await axios.post(
        'http://127.0.0.1:8000/api/communicator/send/',
        messageForm,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success(`Message sent to ${response.data.sent} contacts`);
      setMessageDialogOpen(false);
      setMessageForm({
        message: '',
        subject: 'Notification',
        send_email: false,
        send_sms: true
      });
    } catch (error) {
      console.error('Failed to send message:', error);
      toast.error('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const downloadTemplate = () => {
    const csvContent = "name,phone,email\nJohn Doe,+1234567890,john@example.com\nJane Smith,+0987654321,jane@example.com";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "contacts_template.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Box sx={{ mt: 4, p: 3 }}>      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
          Communicator
        </Typography>
        <BackButton to="/login?redirect=communicator" />
      </Box>

      <Typography variant="body1" sx={{ mb: 3, color: 'text.secondary' }}>
        Manage your contacts and send bulk messages via SMS and email.
      </Typography>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={tab} onChange={(_, newValue) => setTab(newValue)}>
          <Tab 
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <span>Contacts</span>
                <Chip label={contacts.length} size="small" color="primary" />
              </Box>
            } 
            value="contacts" 
          />
          <Tab 
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <SendIcon fontSize="small" />
                <span>Send Message</span>
              </Box>
            } 
            value="message" 
          />
        </Tabs>
      </Box>

      {tab === 'contacts' && (
        <Box>
          <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => {
                setEditingContact(null);
                setContactForm({ name: '', phone: '', email: '' });
                setDialogOpen(true);
              }}
            >
              Add Contact
            </Button>
            <Button
              variant="outlined"
              startIcon={<UploadIcon />}
              onClick={() => setUploadDialogOpen(true)}
            >
              Upload CSV
            </Button>
            <Button
              variant="text"
              onClick={downloadTemplate}
            >
              Download Template
            </Button>
          </Box>

          {loading ? (
            <LinearProgress sx={{ mb: 2 }} />
          ) : (
            <TableContainer component={Paper} elevation={3}>
              <Table>
                <TableHead>
                  <TableRow sx={{ bgcolor: 'primary.light' }}>
                    <TableCell sx={{ fontWeight: 'bold' }}>Name</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Phone</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Email</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Created</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {contacts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                        <Typography variant="body1" color="text.secondary">
                          No contacts found. Add contacts manually or upload a CSV file.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    contacts.map((contact) => (
                      <TableRow key={contact.id} hover>
                        <TableCell>{contact.name}</TableCell>
                        <TableCell>
                          {contact.phone ? (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <SmsIcon fontSize="small" color="success" />
                              {contact.phone}
                            </Box>
                          ) : (
                            <Typography variant="body2" color="text.secondary">-</Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          {contact.email ? (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <EmailIcon fontSize="small" color="info" />
                              {contact.email}
                            </Box>
                          ) : (
                            <Typography variant="body2" color="text.secondary">-</Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          {new Date(contact.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <IconButton
                            onClick={() => handleEditContact(contact)}
                            color="primary"
                            size="small"
                          >
                            <EditIcon />
                          </IconButton>
                          <IconButton
                            onClick={() => handleDeleteContact(contact.id)}
                            color="error"
                            size="small"
                          >
                            <DeleteIcon />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>
      )}

      {tab === 'message' && (
        <Box>
          <Paper elevation={3} sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 3 }}>
              Send Bulk Message
            </Typography>
            
            {contacts.length === 0 ? (
              <Alert severity="warning" sx={{ mb: 3 }}>
                You need to add contacts before you can send messages. Switch to the Contacts tab to add contacts.
              </Alert>
            ) : (
              <Alert severity="info" sx={{ mb: 3 }}>
                This message will be sent to all {contacts.length} contacts in your list.
              </Alert>
            )}

            <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={messageForm.send_sms}
                    onChange={handleMessageFormChange('send_sms')}
                    color="success"
                  />
                }
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <SmsIcon color="success" />
                    Send SMS
                  </Box>
                }
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={messageForm.send_email}
                    onChange={handleMessageFormChange('send_email')}
                    color="info"
                  />
                }
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <EmailIcon color="info" />
                    Send Email
                  </Box>
                }
              />
            </Box>

            {messageForm.send_email && (
              <TextField
                fullWidth
                label="Email Subject"
                value={messageForm.subject}
                onChange={handleMessageFormChange('subject')}
                sx={{ mb: 3 }}
              />
            )}

            <TextField
              fullWidth
              multiline
              rows={6}
              label="Message"
              value={messageForm.message}
              onChange={handleMessageFormChange('message')}
              placeholder="Enter your message here..."
              sx={{ mb: 3 }}
            />

            <Button
              variant="contained"
              size="large"
              startIcon={<SendIcon />}
              onClick={handleSendBulkMessage}
              disabled={contacts.length === 0 || sending}
              sx={{ mr: 2 }}
            >
              {sending ? 'Sending...' : `Send to ${contacts.length} Contacts`}
            </Button>
          </Paper>
        </Box>
      )}

      {/* Add/Edit Contact Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingContact ? 'Edit Contact' : 'Add New Contact'}
        </DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Name"
            value={contactForm.name}
            onChange={handleContactFormChange('name')}
            margin="normal"
            required
          />
          <TextField
            fullWidth
            label="Phone"
            value={contactForm.phone}
            onChange={handleContactFormChange('phone')}
            margin="normal"
            placeholder="+1234567890"
          />
          <TextField
            fullWidth
            label="Email"
            type="email"
            value={contactForm.email}
            onChange={handleContactFormChange('email')}
            margin="normal"
            placeholder="contact@example.com"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSaveContact} variant="contained">
            {editingContact ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Upload CSV Dialog */}
      <Dialog open={uploadDialogOpen} onClose={() => setUploadDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Upload Contacts CSV</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            Upload a CSV file with columns: name, phone, email
          </Alert>
          <input
            type="file"
            accept=".csv"
            onChange={(e) => setSelectedFile(e.target.files[0])}
            style={{ marginBottom: '16px' }}
          />
          {selectedFile && (
            <Typography variant="body2" color="text.secondary">
              Selected: {selectedFile.name}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUploadDialogOpen(false)}>Cancel</Button>
          <Button onClick={downloadTemplate} variant="outlined">
            Download Template
          </Button>
          <Button 
            onClick={handleFileUpload} 
            variant="contained" 
            disabled={!selectedFile || uploading}
          >
            {uploading ? 'Uploading...' : 'Upload'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default CommunicatorPage;
