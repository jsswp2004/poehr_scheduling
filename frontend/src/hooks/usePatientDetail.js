import { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';
import { toast } from '../components/SimpleToast';

export const usePatientDetail = (patientId) => {
    const navigate = useNavigate();
    const [patient, setPatient] = useState(null);
    const [editMode, setEditMode] = useState(false);
    const [formData, setFormData] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const token = localStorage.getItem('access_token');

    // Role-based access control
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

    // Fetch patient data
    useEffect(() => {
        if (!patientId || !token) return;

        setLoading(true);
        axios
            .get(`http://127.0.0.1:8000/api/users/patients/by-user/${patientId}/`, {
                headers: { Authorization: `Bearer ${token}` },
            })
            .then((res) => {
                setPatient(res.data);
                setFormData(res.data);
            })
            .catch((err) => {
                console.error('Error fetching patient:', err);
                toast.error('Failed to load patient details');
            })
            .finally(() => {
                setLoading(false);
            });
    }, [patientId, token]);

    // Handle form field changes
    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({
            ...prev,
            [name]: value,
        }));
    };

    // Handle form submission
    const handleSubmit = async (e) => {
        e.preventDefault();

        // Validation
        if (!formData.first_name?.trim() || !formData.last_name?.trim()) {
            toast.error('First name and last name are required');
            return;
        }

        setSaving(true);
        try {
            const res = await axios.patch(
                `http://127.0.0.1:8000/api/users/patients/${patient.id}/`,
                formData,
                {
                    headers: { Authorization: `Bearer ${token}` },
                }
            );

            setPatient(res.data);
            setFormData(res.data);
            setEditMode(false);
            toast.success('Patient information updated successfully!');
        } catch (err) {
            console.error('Error updating patient:', err);
            toast.error('Failed to update patient information');
        } finally {
            setSaving(false);
        }
    };

    // Handle profile picture upload
    const handleProfilePictureUpload = async (file) => {
        if (!file) return;

        const formDataPic = new FormData();
        formDataPic.append('profile_picture', file);

        try {
            const res = await axios.patch(
                `http://127.0.0.1:8000/api/users/${patient.user_id || patient.id}/`,
                formDataPic,
                {
                    headers: {
                        'Content-Type': 'multipart/form-data',
                        Authorization: `Bearer ${token}`,
                    },
                }
            );

            setPatient((prev) => ({
                ...prev,
                profile_picture: res.data.profile_picture,
            }));
            setFormData((prev) => ({
                ...prev,
                profile_picture: res.data.profile_picture,
            }));

            toast.success('Profile picture updated successfully! 📸');
        } catch (err) {
            console.error('Profile picture upload error:', err);
            toast.error('Failed to upload profile picture. Please try again.');
        }
    };

    // Handle password reset
    const handleResetPassword = async () => {
        if (!patient || !patient.email) {
            toast.error('Patient email not found. Cannot reset password.');
            return;
        }

        // Get admin password for verification
        const adminPassword = window.prompt(
            `To reset the password for ${patient.first_name} ${patient.last_name}, please enter your admin password:`
        );

        if (!adminPassword) {
            return; // User cancelled
        }

        // Generate a temporary password
        const tempPassword = `Temp${Math.random().toString(36).slice(2, 8)}!`;

        // Confirm action with user
        const confirmed = window.confirm(
            `Are you sure you want to reset the password for ${patient.first_name} ${patient.last_name}?\n\n` +
            `New temporary password: ${tempPassword}\n\n` +
            `This temporary password will be sent via email to the client. Provide it to them if access to email is not available and instruct them to change it immediately after logging in.`
        );

        if (!confirmed) return;

        try {
            await axios.post(
                'http://127.0.0.1:8000/api/admin/reset-user-password/',
                {
                    user_id: patient.user_id,
                    new_password: tempPassword,
                    admin_password: adminPassword,
                },
                {
                    headers: { Authorization: `Bearer ${token}` },
                }
            );

            toast.success(
                `Password reset successfully! Temporary password: ${tempPassword}. Please provide this to the patient and instruct them to change it immediately.`
            );
        } catch (err) {
            console.error('Password reset error:', err);
            if (err.response?.status === 403) {
                toast.error('Incorrect admin password or insufficient permissions.');
            } else if (err.response?.status === 404) {
                toast.error('User not found.');
            } else {
                toast.error('Failed to reset password. Please try again.');
            }
        }
    };

    // Cancel edit mode
    const handleCancel = () => {
        setFormData(patient); // Reset form data to original patient data
        setEditMode(false);
    };

    return {
        patient,
        editMode,
        setEditMode,
        formData,
        loading,
        saving,
        handleChange,
        handleSubmit,
        handleCancel,
        handleProfilePictureUpload,
        handleResetPassword,
    };
};
