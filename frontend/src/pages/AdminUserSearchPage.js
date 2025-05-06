import { useState } from 'react';
import axios from 'axios';
import { Table, Form, Button } from 'react-bootstrap';

function AdminUserSearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const token = localStorage.getItem('access_token');

  const handleSearch = async () => {
    try {
      const res = await axios.get(`http://127.0.0.1:8000/api/users/search/?q=${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setResults(res.data);
    } catch (err) {
      console.error('Search failed', err);
    }
  };

  return (
    <div className="container mt-4">
      <h3>Search Users</h3>
      <Form className="d-flex mb-3">
        <Form.Control
          type="text"
          placeholder="Search by name, username, or email"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Button onClick={handleSearch} className="ms-2">Search</Button>
      </Form>

      <Table bordered hover>
        <thead>
          <tr>
            <th>Username</th><th>Name</th><th>Email</th><th>Role</th>
          </tr>
        </thead>
        <tbody>
          {results.map((user) => (
            <tr key={user.id}>
              <td>{user.username}</td>
              <td>{user.first_name} {user.last_name}</td>
              <td>{user.email}</td>
              <td>{user.role}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

export default AdminUserSearchPage;
