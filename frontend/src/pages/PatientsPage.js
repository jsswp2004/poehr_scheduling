import axios from 'axios';
import { useEffect, useState } from 'react';
import { Card, Form, Button, Row, Col, Spinner } from 'react-bootstrap';
import BootstrapTable from 'react-bootstrap-table-next';
import paginationFactory from 'react-bootstrap-table2-paginator';
import filterFactory, { textFilter } from 'react-bootstrap-table2-filter';
import { saveAs } from 'file-saver';
import Papa from 'papaparse';
import { useNavigate } from 'react-router-dom';

function PatientsPage() {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [provider, setProvider] = useState('');
  const [doctors, setDoctors] = useState([]);
  const [page, setPage] = useState(1);
  const [sizePerPage, setSizePerPage] = useState(10);
  const [totalSize, setTotalSize] = useState(0);
  const navigate = useNavigate();

  const token = localStorage.getItem('access_token');

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

      const patientsWithFullName = res.data.results.map(p => ({
        ...p,
        full_name: `${p.first_name} ${p.last_name}`
      }));

      // setPatients(res.data.results);
      setPatients(patientsWithFullName);
      setTotalSize(res.data.count);
    } catch (err) {
      console.error('Failed to fetch patients:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchDoctors = async () => {
    try {
      const res = await axios.get('http://127.0.0.1:8000/api/users/doctors/');
      setDoctors(res.data);
    } catch (err) {
      console.error('Failed to load doctors:', err);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    fetchDoctors();
  }, []);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    fetchPatients();
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
      //text: 'Full Name',
      formatter: (_, row) => `${row.first_name} ${row.last_name}`,
      sort: true,
      //filter: textFilter({ placeholder: 'Filter by patient name...' }),
      filter: textFilter({
        //label: 'test',
        placeholder: 'Patient Name...',
        //style: { width: '100%' },
     
        //getFilter: () => {},
      }),
      
    },
    {
        dataField: 'email',
        //text: 'Email',
        sort: true,
        filter: textFilter({ 
            //label: '', 
        placeholder: 'Email...' }),
    },
    {
      dataField: 'provider_name',
      //text: 'Provider',
      formatter: (_, row) => row.provider_name
        ? `Dr. ${row.provider_name}`
        : <span className="text-muted">None</span>,
      sort: true,
      filter: textFilter({ placeholder: 'Provider...' }),
    },
    {
      dataField: 'actions',
      text: 'Patient Details',
      formatter: (_, row) => (
        <Button
          variant="outline-primary"
          size="sm"
          onClick={() => navigate(`/patients/${row.id}`)}
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
      <Card className="shadow-sm">
        <Card.Body>
          <Card.Title className="mb-4 d-flex justify-content-between align-items-center">
            Patient List
            <Button variant="success" onClick={exportCSV}>Export CSV</Button>
          </Card.Title>

          {/* <Form className="mb-3">
            <Row className="g-2">
              <Col md={4}>
                <Form.Control
                  type="text"
                  placeholder="Search by name"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </Col>
              <Col md={4}>
                <Form.Select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                >
                  <option value="">All Providers</option>
                  {doctors.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      Dr. {doc.first_name} {doc.last_name}
                    </option>
                  ))}
                </Form.Select>
              </Col>
              <Col md={2}>
                <Button onClick={() => setPage(1)} variant="primary" className="w-100">
                  Search
                </Button>
              </Col>
            </Row>
          </Form>*/}

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
                  onPageChange: setPage,
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
    </div>
  );
}

export default PatientsPage;
