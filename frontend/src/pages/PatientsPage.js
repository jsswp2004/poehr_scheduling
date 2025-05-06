import axios from 'axios';
import { useEffect, useState } from 'react';
import { Card, Form, Button, Row, Col, Spinner, Tabs, Tab} from 'react-bootstrap';
import BootstrapTable from 'react-bootstrap-table-next';
import paginationFactory from 'react-bootstrap-table2-paginator';
import filterFactory, { textFilter } from 'react-bootstrap-table2-filter';
import { saveAs } from 'file-saver';
import Papa from 'papaparse';
import { useNavigate } from 'react-router-dom';
import CalendarView from '../components/CalendarView';
import { jwtDecode } from 'jwt-decode';

function PatientsPage() {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, sizePerPage]);

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
      //filter: textFilter({ placeholder: 'Patient Name...' }),
    },
    {
      dataField: 'email',
      text: 'Email',
      sort: true,
      //filter: textFilter({ placeholder: 'Email...' }),
    },
    {
      dataField: 'provider_name',
      text: 'Provider',
      formatter: (_, row) =>
        row.provider_name ? `Dr. ${row.provider_name}` : <span className="text-muted">None</span>,
      sort: true,
      //filter: textFilter({ placeholder: 'Provider...' }),
    },
    {
      dataField: 'actions',
      text: 'Details',
      formatter: (_, row) => (
        <Button
          variant="outline-primary"
          size="sm"
          onClick={() => navigate(`/patients/${row.user_id}`)}
        >
          View
        </Button>
      ),
      headerStyle: { width: '90px' },
      align: 'center',
    },
  ];

  return (
<div className="container mt-4">
    {userRole === 'admin' && (
      <Button variant="outline-secondary" onClick={() => navigate("/admin")} className="mb-3">
        ← Back
      </Button>
    )}

  <Tabs defaultActiveKey="patients" className="mb-3">
    <Tab eventKey="patients" title="Patient List">
      <Card className="shadow-sm">
        <Card.Body>
          <Card.Title className="mb-4 d-flex justify-content-between align-items-right">
            <h4> </h4>
            <Button variant="success" onClick={exportCSV}>Download (.csv)</Button>
          </Card.Title>

          <Form
            className="mb-3"
            onSubmit={(e) => {
              e.preventDefault();  // Prevent page reload
              fetchPatients();     // Trigger search
            }}
          >
            <Row className="g-2 align-items-center">
              <Col md={6}>
                <div className="position-relative">
                  <Form.Control
                    type="text"
                    placeholder="Search patients by name, email, or provider..."
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearch('');
                        setPage(1);
                        setTimeout(() => {
                          fetchPatients();
                        }, 0);  // ✅ Refresh on clear
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
              </Col>
              <Col md="auto">
                <Button variant="primary" type="submit">Search</Button>
              </Col>
            </Row>
          </Form>


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
      <div className="mt-4">
        <CalendarView />
      </div>
    </Tab>
  </Tabs>
</div>

  );
}

export default PatientsPage;
