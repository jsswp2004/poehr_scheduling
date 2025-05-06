import axios from 'axios';
import { useEffect, useState } from 'react';
import { Card, Button, Spinner } from 'react-bootstrap';
import BootstrapTable from 'react-bootstrap-table-next';
import paginationFactory from 'react-bootstrap-table2-paginator';
import filterFactory, { textFilter } from 'react-bootstrap-table2-filter';
import { saveAs } from 'file-saver';
import Papa from 'papaparse';
import { useNavigate } from 'react-router-dom';
import CalendarView from '../components/CalendarView';

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
      text: ' ',
      sort: true,
      filter: textFilter({ placeholder: 'Patient Name...' }),
    },
    {
      dataField: 'email',
      text: ' ',
      sort: true,
      filter: textFilter({ placeholder: 'Email...' }),
    },
    {
      dataField: 'provider_name',
      text: ' ',
      formatter: (_, row) =>
        row.provider_name ? `Dr. ${row.provider_name}` : <span className="text-muted">None</span>,
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
      <Button variant="outline-secondary" onClick={() => navigate(-1)} className="mb-3">
        ← Back
      </Button>
      <Card className="shadow-sm">
        <Card.Body>
          <Card.Title className="mb-4 d-flex justify-content-between align-items-center">
            <h4>Patient List</h4>
            <Button variant="success" onClick={exportCSV}>
              Download (.csv)
            </Button>
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
      <div className="mt-5">
        <h4>Calendar</h4>
        <CalendarView />
      </div>
    </div>
  );
}

export default PatientsPage;
