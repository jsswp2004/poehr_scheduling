/**
 * PatientRegistrationModal component
 * A modal version of the RegisterPage for quick patient registration from the appointment modal
 */
import React, { useState, useEffect } from "react";
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    TextField,
    FormControl,
    FormLabel,
    RadioGroup,
    FormControlLabel,
    Radio,
    Alert,
    Stack,
    Box,
    Typography,
    IconButton,
} from "@mui/material";
import { Close, PersonAdd } from "@mui/icons-material";
import axios from "axios";
import { toast } from "react-toastify";
import { getValidToken } from "../../utils/authUtils";

const PatientRegistrationModal = ({ open, onClose, onPatientCreated }) => {
    const [hasProvider, setHasProvider] = useState("yes"); // Default to 'yes' for appointment creation
    const [doctors, setDoctors] = useState([]);
    const [loading, setLoading] = useState(false);

    const [formData, setFormData] = useState({
        username: "",
        email: "",
        password: "",
        first_name: "",
        last_name: "",
        role: "patient",
        assigned_doctor: "",
        phone_number: "",
        organization_name: "",
    });

    // Fetch doctors when modal opens
    useEffect(() => {
        if (open) {
            fetchDoctors();
            fetchCurrentUserOrg();
        }
    }, [open]);

    const fetchDoctors = async () => {
        try {
            const token = await getValidToken();
            if (!token) {
                console.log("No valid token available for fetching doctors");
                return;
            }

            const res = await axios.get("http://127.0.0.1:8000/api/users/doctors/", {
                headers: { Authorization: `Bearer ${token}` },
            });
            setDoctors(res.data);
        } catch (err) {
            console.error("Failed to load doctors:", err);
            toast.error("Failed to load doctors");
        }
    };

    const fetchCurrentUserOrg = async () => {
        try {
            const token = await getValidToken();
            if (!token) return;

            const response = await axios.get("http://127.0.0.1:8000/api/users/me/", {
                headers: { Authorization: `Bearer ${token}` },
            });
            const userData = response.data;

            if (userData.organization_name) {
                setFormData((prevState) => ({
                    ...prevState,
                    organization_name: userData.organization_name,
                }));
            }
        } catch (error) {
            console.error("Failed to fetch current user information:", error);
        }
    };

    const handleChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value,
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        if (hasProvider === "no" && (!formData.email || !formData.phone_number)) {
            toast.error("Please fill out both email and phone number.");
            setLoading(false);
            return;
        }

        const payload = {
            ...formData,
            role: "patient",
            provider: formData.assigned_doctor,
        };

        try {
            const token = await getValidToken();
            if (!token) {
                toast.error("Authentication required");
                setLoading(false);
                return;
            }

            const response = await axios.post(
                "http://127.0.0.1:8000/api/auth/register/",
                payload,
                { headers: { Authorization: `Bearer ${token}` } }
            );

            console.log("Registration response:", response.data);
            toast.success("Patient registered successfully!");

            // Fetch the newly created patient data
            try {
                const patientResponse = await axios.get(
                    `http://127.0.0.1:8000/api/users/patients/`,
                    {
                        headers: { Authorization: `Bearer ${token}` },
                        params: { search: formData.username },
                    }
                );

                if (patientResponse.data.results && patientResponse.data.results.length > 0) {
                    const newPatient = patientResponse.data.results[0];
                    // Call the callback with the new patient data
                    if (onPatientCreated) {
                        onPatientCreated(newPatient);
                    }
                }
            } catch (fetchError) {
                console.error("Failed to fetch new patient:", fetchError);
                // Still close the modal even if we can't fetch the patient
                if (onPatientCreated) {
                    onPatientCreated(null);
                }
            }

            // Reset form and close modal
            resetForm();
            onClose();
        } catch (error) {
            console.error("Registration failed:", error);
            toast.error(error.response?.data?.detail || "Registration failed");
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setFormData({
            username: "",
            email: "",
            password: "",
            first_name: "",
            last_name: "",
            role: "patient",
            assigned_doctor: "",
            phone_number: "",
            organization_name: "",
        });
        setHasProvider("yes");
    };

    const handleClose = () => {
        resetForm();
        onClose();
    };

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
            <DialogTitle>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="h6" component="div" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <PersonAdd />
                        Register New Patient
                    </Typography>
                    <IconButton onClick={handleClose} size="small">
                        <Close />
                    </IconButton>
                </Box>
            </DialogTitle>

            <DialogContent dividers>
                <Box component="form" onSubmit={handleSubmit}>
                    <Stack spacing={3}>
                        {/* Provider Assignment */}
                        <FormControl component="fieldset">
                            <FormLabel component="legend">Does this patient have a provider?</FormLabel>
                            <RadioGroup
                                row
                                value={hasProvider}
                                onChange={(e) => setHasProvider(e.target.value)}
                            >
                                <FormControlLabel value="yes" control={<Radio />} label="Yes" />
                                <FormControlLabel value="no" control={<Radio />} label="No" />
                            </RadioGroup>
                        </FormControl>

                        {/* Basic Information */}
                        <Stack direction="row" spacing={2}>
                            <TextField
                                name="first_name"
                                label="First Name"
                                value={formData.first_name}
                                onChange={handleChange}
                                required
                                fullWidth
                            />
                            <TextField
                                name="last_name"
                                label="Last Name"
                                value={formData.last_name}
                                onChange={handleChange}
                                required
                                fullWidth
                            />
                        </Stack>

                        <Stack direction="row" spacing={2}>
                            <TextField
                                name="username"
                                label="Username"
                                value={formData.username}
                                onChange={handleChange}
                                required
                                fullWidth
                            />
                            <TextField
                                name="email"
                                label="Email"
                                type="email"
                                value={formData.email}
                                onChange={handleChange}
                                required={hasProvider === "no"}
                                fullWidth
                            />
                        </Stack>

                        <Stack direction="row" spacing={2}>
                            <TextField
                                name="phone_number"
                                label="Phone Number"
                                value={formData.phone_number}
                                onChange={handleChange}
                                required={hasProvider === "no"}
                                fullWidth
                            />
                            <TextField
                                name="password"
                                label="Password"
                                type="password"
                                value={formData.password}
                                onChange={handleChange}
                                required
                                fullWidth
                            />
                        </Stack>

                        {/* Provider Selection */}
                        {hasProvider === "yes" && (
                            <FormControl fullWidth required>
                                <TextField
                                    select
                                    name="assigned_doctor"
                                    label="Assigned Provider"
                                    value={formData.assigned_doctor}
                                    onChange={handleChange}
                                    SelectProps={{
                                        native: true,
                                    }}
                                >
                                    <option value="">Select a provider</option>
                                    {doctors.map((doctor) => (
                                        <option key={doctor.id} value={doctor.id}>
                                            Dr. {doctor.first_name} {doctor.last_name}
                                        </option>
                                    ))}
                                </TextField>
                            </FormControl>
                        )}

                        {/* Organization */}
                        <TextField
                            name="organization_name"
                            label="Organization"
                            value={formData.organization_name}
                            onChange={handleChange}
                            fullWidth
                            disabled // Usually pre-filled from current user's org
                        />

                        {hasProvider === "no" && (
                            <Alert severity="info">
                                Patients without an assigned provider must provide both email and phone number for communication.
                            </Alert>
                        )}
                    </Stack>
                </Box>
            </DialogContent>

            <DialogActions sx={{ p: 2 }}>
                <Button onClick={handleClose} disabled={loading}>
                    Cancel
                </Button>
                <Button
                    variant="contained"
                    onClick={handleSubmit}
                    disabled={loading}
                    startIcon={<PersonAdd />}
                >
                    {loading ? "Registering..." : "Register Patient"}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default PatientRegistrationModal;
