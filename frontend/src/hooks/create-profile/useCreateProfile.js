import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-toastify';
import { API_BASE_URL } from '../../config/api';
import { moduleEnabled } from '../../utils/orgModules';

/**
 * Custom hook for managing create profile functionality
 * Handles form state, organizations loading, and profile creation
 */
export const useCreateProfile = () => {
    const navigate = useNavigate();
    const [organizations, setOrganizations] = useState([]);
    const [submitting, setSubmitting] = useState(false);

    // Form data state
    const [formData, setFormData] = useState({
        username: '',
        email: '',
        password: '',
        first_name: '',
        last_name: '',
        phone_number: '',
        role: '',
        profile_picture: null,
        organization: '',
    });

    // Role choices come from the Roles dictionary (System Dictionaries). If it cannot be loaded, the built-in list is used.
    const [roleDictionary, setRoleDictionary] = useState(null);
    useEffect(() => {
        let alive = true;
        axios.get(`${API_BASE_URL}/api/users/dictionaries/roles/`)
            .then((res) => { if (alive) setRoleDictionary(res.data); })
            .catch(() => {});
        return () => { alive = false; };
    }, []);

    const FALLBACK_ROLES = [
        { value: 'patient', label: 'Patient' },
        { value: 'receptionist', label: 'Receptionist' },
        { value: 'doctor', label: 'Doctor' },
        { value: 'nurse', label: 'Nurse' },
        { value: 'admin', label: 'Admin' },
        { value: 'registrar', label: 'Registrar' },
        { value: 'system_admin', label: 'System Admin' },
        { value: 'staff', label: 'Staff', behaves_like: 'staff' },
    ];
    const rawRoles = roleDictionary
        ? roleDictionary.entries.filter((e) => e.is_active).map((e) => ({ value: e.value, label: e.label, behaves_like: e.behaves_like }))
        : FALLBACK_ROLES;
    // Staff-like roles are offered only when the organization has Staffing
    const roleOptions = [
        { value: '', label: 'Select a role' },
        ...rawRoles.filter((r) => r.behaves_like !== 'staff' || moduleEnabled('staffing')),
    ];
    const roleDisplayType = roleDictionary ? roleDictionary.display_type : 'dropdown';

    // Form field configuration
    const formFields = [
        { name: 'first_name', label: 'First Name', type: 'text' },
        { name: 'last_name', label: 'Last Name', type: 'text' },
        { name: 'username', label: 'Username', type: 'text' },
        { name: 'email', label: 'Email', type: 'email' },
        { name: 'phone_number', label: 'Phone Number', type: 'tel' },
        { name: 'password', label: 'Password', type: 'password' },
    ];

    // Load organizations and current user data
    useEffect(() => {
        const loadData = async () => {
            const token = localStorage.getItem('access_token');
            if (!token) return;

            const headers = { Authorization: `Bearer ${token}` };

            try {
                // Load organizations only
                const orgsResponse = await axios.get(`${API_BASE_URL}/api/users/organizations/`, { headers });
                setOrganizations(orgsResponse.data);
            } catch (error) {
                console.error('Failed to load data:', error);
                toast.error('Failed to load organizations');
            }
        };

        loadData();
    }, []);

    // Handle form field changes
    const handleChange = (e) => {
        const { name, value, files } = e.target;
        setFormData((prev) => ({
            ...prev,
            [name]: files ? files[0] : value,
        }));
    };

    // Add organization to the list
    const addOrganization = (newOrg) => {
        setOrganizations((prev) => [...prev, newOrg]);
    };

    // Handle form submission
    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);

        const formPayload = new FormData();
        for (const key in formData) {
            if (formData[key] !== null && formData[key] !== undefined && formData[key] !== '') {
                formPayload.append(key, formData[key]);
            }
        }

        // Debug: Log form data being sent
        console.log('Form data being sent:', formData);
        console.log('Organization selected:', formData.organization);

        // Debug: Also log what's in the FormData
        console.log('FormData entries:');
        for (let pair of formPayload.entries()) {
            console.log(pair[0] + ': ' + pair[1]);
        }

        try {
            await axios.post(`${API_BASE_URL}/api/auth/register/`, formPayload, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            // An administrator adding someone stays signed in and goes back to Profile;
            // only a brand-new person registering themselves is sent to the login page.
            if (localStorage.getItem('access_token')) {
                toast.success('Profile created.');
                navigate('/profile');
            } else {
                toast.success('Registration successful! Please login.');
                navigate('/login');
            }
        } catch (error) {
            console.error('Registration error:', error);
            toast.error('Registration failed. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    return {
        formData,
        organizations,
        submitting,
        roleOptions,
        roleDisplayType,
        formFields,
        handleChange,
        handleSubmit,
        addOrganization,
    };
};
