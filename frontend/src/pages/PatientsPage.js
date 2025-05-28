import axios from 'axios';
import { useEffect, useState } from 'react';
import {
  Card,
  Form,
  Button,
  Row,
  Col,
  Spinner,
  Tabs,
  Tab,
  Modal,
  OverlayTrigger,
  Tooltip,
} from 'react-bootstrap';
import BootstrapTable from 'react-bootstrap-table-next';
import paginationFactory from 'react-bootstrap-table2-paginator';
import filterFactory, { textFilter } from 'react-bootstrap-table2-filter';
import { saveAs } from 'file-saver';
import Papa from 'papaparse';
import { useNavigate } from 'react-router-dom';
import CalendarView from '../components/CalendarView';
import { jwtDecode } from 'jwt-decode';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faDownload,
  faEye,
  faCommentDots,
  faEnvelope,
  faTrash,
} from '@fortawesome/free-solid-svg-icons';
import RegisterPage from './RegisterPage';

function PatientsPage() {
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [emailForm, setEmailForm] = useState({
    subject: 'Message from your provider',
    message: '',
  });

  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [provider, setProvider] = useState('');
  const [page, setPage] = useState(1);
  const [sizePerPage, setSizePerPage] = useState(10);
  const [totalSize, setTotalSize] = useState(0);
  const navigate = useNavigate();

  const token = localStorage.getItem('access_token');
  let userRole = null;

  if (token) {
    try {
      const decoded = jwtDecode(token);
      userRole = decoded.role;
    } catch (err) {
      console.error('Failed to decode token:', err);
    }
  }

  // Role-based access control for admin, system_admin, doctor, registrar, and receptionist only
  useEffect(() => {
    if (!token) {
      navigate('/login');
      return;
    }
    try {
      const decoded = jwtDecode(token);
      const role = decoded.role || '';
      if (
        role !== 'admin' &&
        role !== 'system_admin' &&
        role !== 'doctor' &&
        role !== 'registrar' &&
        role !== 'receptionist'
      ) {
        navigate('/');
      }
    } catch (err) {
      navigate('/login');
    }
  }, [navigate, token]);

  const fetchPatients = async () => {
    setLoading(true);
    try {
      const res = await axios.get('http://127.0.0.1:8000/api/users/patients/', {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          search,
          provider,
          page,
          page_size: sizePerPage,
        },
      });

      const patientsWithFullName = res.data.results.map((p) => ({
        ...p,
        full_name: `${p.first_name} ${p.last_name}`,
      }));
      setPatients(patientsWithFullName);
      setTotalSize(res.data.count);
    } catch (err) {
      console.error('Failed to fetch patients:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPatients();
  }, [page, sizePerPage]);

  const handleSendText = async (patient) => {
    const phone = patient.phone_number;
    const message = `Hello ${patient.first_name}, this is a reminder from your provider.`;

    if (!phone) {
      toast.warning(`No phone number available for ${patient.first_name}`);
      return;
    }

    try {
      await axios.post(
        'http://127.0.0.1:8000/api/sms/send-sms/',
        {
          phone,
          message,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      toast.success(`Text sent to ${patient.first_name}`);
    } catch (err) {
      console.error('SMS failed:', err);
      toast.error('Failed to send SMS');
    }
  };

  const handleOpenEmailModal = (patient) => {
    setSelectedPatient(patient);
    setEmailForm({ subject: 'Message from your provider', message: '' });
    setShowEmailModal(true);
  };

  const handleSendEmail = async () => {
    try {
      await axios.post(
        'http://127.0.0.1:8000/api/messages/send-email/',
        {
          email: selectedPatient.email,
          subject: emailForm.subject,
          message: emailForm.message,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      toast.success(`Email sent to ${selectedPatient.first_name}`);
      setShowEmailModal(false);
    } catch (err) {
      console.error('Email failed:', err);
      toast.error('Failed to send email');
    }
  };

  const handleDelete = async (id) => {
    const confirmDelete = window.confirm('Are you sure you want to delete this patient?');
    if (!confirmDelete) return;

    try {
      await axios.delete(`http://127.0.0.1:8000/api/users/patients/${id}/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success('Patient deleted!');
      setPage(1);
      setTimeout(() => {
        fetchPatients();
      }, 300);
    } catch (error) {
      console.error('Delete failed:', error);
      toast.error('Failed to delete patient.');
    }
  };

  const exportCSV = () => {
    const csv = Papa.unparse(
      patients.map((p) => ({
        Name: `${p.first_name} ${p.last_name}`,
        Email: p.email,
        Provider: p.provider_name || '',
      }))
    );
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    saveAs(blob, 'patients.csv');
  };

  const columns = [
    {
      dataField: 'id',
      text: '#',
      headerStyle: { width: '60px' },
      formatter: (_, __, index) => (page - 1) * sizePerPage + index + 1,
    },
    {
      dataField: 'full_name',
      text: 'Patient Name',
      sort: true,
    },
    {
      dataField: 'email',
      text: 'Email',
      sort: true,
    },
    {
      dataField: 'provider_name',
      text: 'Provider',
      formatter: (_, row) =>
        row.provider_name ? `Dr. ${row.provider_name}` : <span className="text-muted">None</span>,
      sort: true,
    },
    {
      dataField: 'last_appointment_date',
      text: 'Last Appointment',
      sort: true,
      formatter: (cell) =>
        cell ? new Date(cell).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—',
    },

    {
      dataField: 'actions',
      text: 'Actions',
      formatter: (_, row) => (
        <div className="d-flex justify-content-center gap-1">
          <OverlayTrigger placement="top" overlay={<Tooltip>View patient profile</Tooltip>}>
            <Button variant="outline-primary" size="sm" onClick={() => navigate(`/patients/${row.user_id}`)}>
              <FontAwesomeIcon icon={faEye} />
            </Button>
          </OverlayTrigger>

          <OverlayTrigger placement="top" overlay={<Tooltip>Send SMS</Tooltip>}>
            <Button variant="warning" size="sm" onClick={() => handleSendText(row)}>
              <FontAwesomeIcon icon={faCommentDots} />
            </Button>
          </OverlayTrigger>

          <OverlayTrigger placement="top" overlay={<Tooltip>Send email</Tooltip>}>
            <Button variant="info" size="sm" onClick={() => handleOpenEmailModal(row)}>
              <FontAwesomeIcon icon={faEnvelope} />
            </Button>
          </OverlayTrigger>

          <OverlayTrigger placement="top" overlay={<Tooltip>Delete patient</Tooltip>}>
            <Button variant="danger" size="sm" onClick={() => handleDelete(row.user_id)}>
              <FontAwesomeIcon icon={faTrash} />
            </Button>
          </OverlayTrigger>
        </div>
      ),
      headerStyle: { width: '160px' },
      align: 'center',
    },
  ];

  return (
    <div className="container mt-4">
      <Tabs defaultActiveKey="patients" className="mb-3">
        <Tab eventKey="register" title="Quick Register">
          <RegisterPage adminMode={true} />
        </Tab>
        <Tab eventKey="patients" title="Patient List">
          <Card className="shadow-sm ">
            <Card.Body>
              <Card.Title className="mb-4 justify-content-between align-items-center">
                <div className="d-flex justify-content-between align-items-center mb-3" style={{ padding: '10px', gap: '10px' }}>
                  {(userRole === 'admin' || userRole === 'system_admin') && (
                    <Col xs={12} md={2} className="px-1">
                      <Button className="btn w-12.5" variant="outline-secondary" onClick={() => navigate('/admin')} style={{ height: '38px' }}>
                        ← Back
                      </Button>
                    </Col>
                  )}

                  <div className="d-flex align-items-center gap-2" style={{ flexGrow: 1 }}>
                    <div className="position-relative w-100" style={{ maxWidth: '400px' }}>
                      <Form.Control
                        type="text"
                        placeholder="Search patients..."
                        value={search}
                        onChange={(e) => {
                          setSearch(e.target.value);
                          setPage(1);
                          fetchPatients();
                        }}
                        style={{ height: '38px' }}
                      />
                      {search && (
                        <button
                          type="button"
                          onClick={() => {
                            setSearch('');
                            setPage(1);
                            fetchPatients();
                          }}
                          className="btn btn-sm btn-light position-absolute"
                          style={{
                            right: '8px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            padding: '0 6px',
                            borderRadius: '50%',
                            lineHeight: '1',
                          }}
                        >
                          &times;
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <Button variant="success" onClick={exportCSV} style={{ height: '38px' }}>
                      Export CSV
                    </Button>
                  </div>
                </div>
              </Card.Title>
              {loading ? (
                <div className="text-center py-4">
                  <Spinner animation="border" />
                </div>
              ) : (
                <div className="table-responsive">
                  <BootstrapTable
                    keyField="id"
                    data={patients}
                    columns={columns}
                    bootstrap4
                    bordered
                    hover
                    noDataIndication="No patients found."
                    pagination={paginationFactory({
                      page,
                      sizePerPage,
                      totalSize,
                      showTotal: true,
                      onPageChange: (nextPage) => setPage(nextPage),
                      onSizePerPageChange: (size) => {
                        setSizePerPage(size);
                        setPage(1);
                      },
                    })}
                    filter={filterFactory()}
                  />
                </div>
              )}
            </Card.Body>
          </Card>
        </Tab>
        <Tab eventKey="calendar" title="Calendar View">
          <CalendarView />
        </Tab>
      </Tabs>
      <Modal show={showEmailModal} onHide={() => setShowEmailModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Email {selectedPatient?.first_name}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Group className="mb-2">
            <Form.Label>Subject</Form.Label>
            <Form.Control
              type="text"
              value={emailForm.subject}
              onChange={(e) => setEmailForm({ ...emailForm, subject: e.target.value })}
            />
          </Form.Group>
          <Form.Group>
            <Form.Label>Message</Form.Label>
            <Form.Control
              as="textarea"
              rows={5}
              value={emailForm.message}
              onChange={(e) => setEmailForm({ ...emailForm, message: e.target.value })}
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowEmailModal(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSendEmail}>
            Send
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}

export default PatientsPage;
