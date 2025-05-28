import { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { Card, Spinner, Button, Form, Collapse, Image } from 'react-bootstrap';
import { jwtDecode } from 'jwt-decode';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import Select from 'react-select';
import CreatableSelect from 'react-select/creatable';

function ProfilePage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);

  const navigate = useNavigate();
  const token = localStorage.getItem('access_token');
  const fileInputRef = useRef();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
  });

  const [passwordData, setPasswordData] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });

  const [organizations, setOrganizations] = useState([]);

  useEffect(() => {
    if (!token) return;

    const decoded = jwtDecode(token);
    const userId = decoded.user_id;

    axios.get(`http://127.0.0.1:8000/api/users/${userId}/`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => {
        if (!res.data) {
          toast.error('No user profile found.');
          return;
        }
        setUser(res.data);
        setFormData({
          first_name: res.data.first_name,
          last_name: res.data.last_name,
          email: res.data.email,
          organization: res.data.organization, // Add organization to formData
        });
      })
      .catch(err => {
        console.error('Failed to load user', err);
        toast.error('Could not load profile');
      })
      .finally(() => setLoading(false));

    // Fetch organizations for dropdown
    axios.get('http://127.0.0.1:8000/api/users/organizations/', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => setOrganizations(res.data))
      .catch(() => setOrganizations([]));
  }, [token]);

const handleSearch = async () => {
  try {
    const res = await axios.get(`http://127.0.0.1:8000/api/users/search/?q=${searchQuery}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    setSearchResults(res.data);

    if (res.data.length === 0) {
      toast.info('No matching users found.');
    }
  } catch (err) {
    toast.error('Search failed.');
  }
};


  const handleChange = (e) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSave = async () => {
    try {
      const response = await axios.patch(`http://127.0.0.1:8000/api/users/${user.id}/`, formData, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUser(response.data);
      setIsEditing(false);
      toast.success('Profile updated!');
    } catch (error) {
      console.error('Failed to update profile', error);
      toast.error('Update failed.');
    }
  };

  const handlePasswordChange = async () => {
    try {
      await axios.post('http://127.0.0.1:8000/api/users/change-password/', passwordData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Password changed successfully');
      setPasswordData({ current_password: '', new_password: '', confirm_password: '' });
      setShowPasswordForm(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to change password');
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const uploadFormData = new FormData();
    uploadFormData.append('profile_picture', file);
    setUploading(true);

    try {
      const res = await axios.patch(
        `http://127.0.0.1:8000/api/users/${user.id}/`,
        uploadFormData,
        {
          headers: {
            //'Content-Type': 'multipart/form-data',
            Authorization: `Bearer ${token}`,
          },
        }
      );
      setUser(res.data);
      toast.success('Profile picture updated!');
      fileInputRef.current.value = '';
    } catch (err) {
      console.error(err);
      toast.error('Failed to upload profile picture');
    } finally {
      setUploading(false);
    }
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !user.organization) return;

    const logoFormData = new FormData();
    logoFormData.append('logo', file);

    setUploading(true);
    try {
      const res = await axios.patch(
        `http://127.0.0.1:8000/api/users/organizations/${user.organization}/`,
        logoFormData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      toast.success('Organization logo updated!');
      // Optional: refresh user/org data
    } catch (err) {
      console.error(err);
      toast.error('Failed to upload organization logo');
    } finally {
      setUploading(false);
    }
  };


  if (loading) {
    return <div className="text-center my-5"><Spinner animation="border" /></div>;
  }

  if (!user) return <p className="text-danger text-center">User not found.</p>;

  return (
    <div className="container mt-4">

      <Card className="shadow-sm p-4"> 
        {user && ['admin', 'system_admin', 'registrar', 'patient'].includes(user.role)  && (         
              <div className="mb-3 d-flex justify-content-between  align-items-right">
                  <Button variant="outline-secondary" onClick={() => navigate(-1)} className="mb-3 w-12.5">
                  ←  Back
                  </Button>               
                  <Form className="mb-3 d-flex gap-2">
                    <Form.Control
                    type="text"
                    placeholder="Search Profile 🔍"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    <Button variant="primary" style={{ width: '100px', height: '38px' }} onClick={handleSearch}>
                    Search
                    </Button>
                </Form>
                <Button
                  variant="success"
                  style={{ width: '200px', height: '38px' }}
                  onClick={() => navigate('/create-profile')}
                >
                  Create Profile
                </Button>

              </div>                     
        )}
        {searchResults.length > 0 && (
          <div className="mb-3 border rounded p-3" style={{ maxHeight: '250px', overflowY: 'auto' }}>
            <strong>Search Results</strong>
            <table className="table table-sm mt-2 mb-0">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Select</th>
                </tr>
              </thead>
              <tbody>
                {searchResults.map((result) => (
                  <tr key={result.id}>
                    <td>{result.first_name} {result.last_name}</td>
                    <td>{result.email}</td>
                    <td>{result.role}</td>
                    <td>
                      <Button
                        size="sm"
                        variant="outline-primary"
                        onClick={() => {
                          setUser(result);
                          setFormData({
                            first_name: result.first_name,
                            last_name: result.last_name,
                            email: result.email,
                          });
                          setSearchResults([]); // optional: hide results after selection
                        }}
                      >
                        Select
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <hr />
        <div className="mb-3 d-flex justify-content-between align-items-right">     
          <h5>User Information</h5>
        </div>
        {/* Display organization name if available */}
        {user.organization && (
          <div className="mb-3">
            <strong>Organization:</strong> {typeof user.organization === 'object' ? user.organization.name : (user.organization_name || '')}
          </div>
        )}
        <Form>
          {user.profile_picture && (
            <div className="mb-3 text-center">
              <Image
                src={user.profile_picture.startsWith('http') ? user.profile_picture : `http://127.0.0.1:8000${user.profile_picture}`}
                roundedCircle
                width="150"
                height="150"
                alt="Profile"
              />
            </div>
          )}

          <Form.Group className="mb-3">
            <Form.Label>Upload Organization Logo</Form.Label>
            <Form.Control
              type="file"
              accept="image/png, image/jpeg"
              onChange={handleLogoUpload}
              disabled={uploading}
          />
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>Upload New Profile Picture</Form.Label>
            <div className="d-flex align-items-center gap-3">
              <Form.Control type="file" accept="image/png, image/jpeg" ref={fileInputRef} onChange={handleUpload} />
              {uploading && <Spinner animation="border" size="sm" />}
            </div>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>First Name</Form.Label>
            <Form.Control
              name="first_name"
              value={formData.first_name}
              onChange={handleChange}
              disabled={!isEditing}
            />
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>Last Name</Form.Label>
            <Form.Control
              name="last_name"
              value={formData.last_name}
              onChange={handleChange}
              disabled={!isEditing}
            />
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>Email</Form.Label>
            <Form.Control
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              disabled={!isEditing}
            />
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>Organization</Form.Label>
            {isEditing ? (
              <CreatableSelect
                name="organization"
                value={
                  organizations
                    .map(org => ({ value: org.id, label: org.name, id: org.id }))
                    .find(opt => String(opt.value) === String(formData.organization)) || null
                }
                onChange={option => {
                  if (option && option.__isNew__) {
                    axios.post('http://127.0.0.1:8000/api/users/organizations/', { name: option.label }, {
                      headers: { Authorization: `Bearer ${token}` },
                    }).then(res => {
                      setOrganizations(prev => [...prev, res.data]);
                      setFormData({ ...formData, organization: res.data.id });
                      toast.success('Organization created!');
                    }).catch(() => toast.error('Failed to create organization'));
                  } else {
                    setFormData({ ...formData, organization: option ? option.value : '' });
                  }
                }}
                options={organizations.map(org => ({ value: org.id, label: org.name, id: org.id }))}
                isClearable
                isSearchable
                placeholder="Select or type to add organization..."
                formatCreateLabel={inputValue => `Add "${inputValue}"`}
              />
            ) : (
              <div className="form-control-plaintext">
                {user.organization && (typeof user.organization === 'object' ? user.organization.name : (user.organization_name || ''))}
              </div>
            )}
          </Form.Group>

          {!isEditing ? (
            <Button className="btn w-12.5" variant="primary" onClick={() => setIsEditing(true)}>Edit</Button>
          ) : (
            <div className="d-flex gap-2">
              <Button variant="success" onClick={handleSave} disabled={uploading}>Save</Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setIsEditing(false);
                  setFormData({
                    first_name: user.first_name,
                    last_name: user.last_name,
                    email: user.email,
                  });
                }}
              >
                Cancel
              </Button>
            </div>
          )}
        </Form>

        <hr />
        {/*<h5>Change Password</h5>*/}
        <div className="mb-3 w-12.5">
        <Button
          variant="outline-primary"
          className="mb-3 w-12.5"
          onClick={() => setShowPasswordForm(!showPasswordForm)}
        >
          {showPasswordForm ? 'Cancel' : 'Change Password'}
        </Button>
        </div>
        <Collapse in={showPasswordForm}>
          <div>
            <Form.Group className="mb-2">
              <Form.Label>Current Password</Form.Label>
              <Form.Control
                type="password"
                name="current_password"
                value={passwordData.current_password}
                onChange={(e) => setPasswordData({ ...passwordData, current_password: e.target.value })}
              />
            </Form.Group>

            <Form.Group className="mb-2">
              <Form.Label>New Password</Form.Label>
              <Form.Control
                type="password"
                name="new_password"
                value={passwordData.new_password}
                onChange={(e) => setPasswordData({ ...passwordData, new_password: e.target.value })}
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Confirm New Password</Form.Label>
              <Form.Control
                type="password"
                name="confirm_password"
                value={passwordData.confirm_password}
                onChange={(e) => setPasswordData({ ...passwordData, confirm_password: e.target.value })}
              />
            </Form.Group>

            <Button variant="success" onClick={handlePasswordChange}>Save New Password</Button>
          </div>
        </Collapse>
      </Card>
    </div>
  );
}

export default ProfilePage;
