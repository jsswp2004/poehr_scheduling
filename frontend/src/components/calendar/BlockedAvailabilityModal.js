/**
 * BlockedAvailabilityModal component for editing blocked availability events
 */
import React, { useState, useEffect } from "react";
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Typography,
    Box,
    TextField,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    Alert,
    CircularProgress,
} from "@mui/material";
import { formatTime } from "../../utils/calendar/dateUtils";
import { getValidToken } from "../../utils/auth";
import { API_BASE_URL } from "../../config/api";
import axios from "axios";
import { toast } from "react-toastify";

const BLOCK_TYPE_OPTIONS = [
    "Vacation",
    "Sick Leave",
    "Conference",
    "Training",
    "Lunch",
    "Personal",
    "Other",
];

const BlockedAvailabilityModal = ({
    open,
    onClose,
    selectedEvent,
    onUpdate, // Callback to refresh calendar data
}) => {
    const [formData, setFormData] = useState({
        start_time: "",
        end_time: "",
        block_type: "Vacation",
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    // Convert datetime to local datetime-local input format
    const toLocalDatetimeInputValue = (isoString) => {
        const local = new Date(isoString);
        local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
        return local.toISOString().slice(0, 16);
    };

    // Initialize form when event changes
    useEffect(() => {
        if (selectedEvent) {
            console.log("🔍 Selected Event Data:", selectedEvent);
            console.log("🔍 Event Resource:", selectedEvent.resource);
            console.log("🔍 Event Resource Data:", selectedEvent.resource?.data);
            
            setFormData({
                start_time: toLocalDatetimeInputValue(selectedEvent.start),
                end_time: toLocalDatetimeInputValue(selectedEvent.end),
                block_type: selectedEvent.resource?.data?.block_type || "Vacation",
            });
            setError("");
        }
    }, [selectedEvent]);

    const handleInputChange = (field, value) => {
        setFormData((prev) => ({
            ...prev,
            [field]: value,
        }));
        setError("");
    };

    const validateForm = () => {
        if (!formData.start_time || !formData.end_time) {
            setError("Please fill in all required fields.");
            return false;
        }

        const startTime = new Date(formData.start_time);
        const endTime = new Date(formData.end_time);

        if (startTime >= endTime) {
            setError("End time must be after start time.");
            return false;
        }

        return true;
    };

    const handleSave = async () => {
        if (!validateForm()) return;

        setLoading(true);
        setError("");

        try {
            const token = await getValidToken();
            if (!token) {
                setError("Authentication required. Please log in again.");
                return;
            }

            console.log("🔧 Updating blocked availability:", {
                id: selectedEvent.resource.data.id,
                url: `${API_BASE_URL}/api/availability/${selectedEvent.resource.data.id}/`,
                token: token ? "✅ Token available" : "❌ No token"
            });

            // Try multiple possible doctor field names
            const doctorId = selectedEvent.resource?.data?.doctor || 
                           selectedEvent.resource?.data?.doctor_id ||
                           selectedEvent.resource?.data?.doctorId;

            const updateData = {
                doctor: doctorId,
                start_time: new Date(formData.start_time).toISOString(),
                end_time: new Date(formData.end_time).toISOString(),
                is_blocked: true,
                block_type: formData.block_type,
                recurrence: "none", // Default recurrence value
                recurrence_end_date: null, // Default recurrence end date
            };

            console.log("🔧 Doctor ID found:", doctorId);
            console.log("🔧 Form data times:", {
                start_local: formData.start_time,
                end_local: formData.end_time,
                start_iso: new Date(formData.start_time).toISOString(),
                end_iso: new Date(formData.end_time).toISOString()
            });
            console.log("🔧 Update payload:", updateData);

            const response = await axios.put(
                `${API_BASE_URL}/api/availability/${selectedEvent.resource.data.id}/`,
                updateData,
                {
                    headers: { Authorization: `Bearer ${token}` },
                }
            );

            console.log("✅ Update successful:", response.data);

            toast.success("Block period updated successfully!");
            onUpdate(); // Refresh calendar data
            onClose();
        } catch (err) {
            console.error("❌ Error updating blocked availability:", err);
            console.error("❌ Error response:", err.response?.data);
            console.error("❌ Error status:", err.response?.status);
            console.error("❌ Error headers:", err.response?.headers);
            setError(
                err.response?.data?.detail ||
                err.response?.data?.error ||
                JSON.stringify(err.response?.data) ||
                "Failed to update block period."
            );
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!window.confirm("Are you sure you want to delete this block period?")) {
            return;
        }

        setLoading(true);
        setError("");

        try {
            const token = await getValidToken();
            if (!token) {
                setError("Authentication required. Please log in again.");
                return;
            }

            console.log("🗑️ Deleting blocked availability:", {
                id: selectedEvent.resource.data.id,
                url: `${API_BASE_URL}/api/availability/${selectedEvent.resource.data.id}/`,
                token: token ? "✅ Token available" : "❌ No token"
            });

            await axios.delete(
                `${API_BASE_URL}/api/availability/${selectedEvent.resource.data.id}/`,
                {
                    headers: { Authorization: `Bearer ${token}` },
                }
            );

            toast.success("Block period deleted successfully!");
            onUpdate(); // Refresh calendar data
            onClose();
        } catch (err) {
            console.error("❌ Error deleting blocked availability:", err);
            console.error("❌ Error response:", err.response?.data);
            console.error("❌ Error status:", err.response?.status);
            setError(
                err.response?.data?.detail ||
                err.response?.data?.error ||
                JSON.stringify(err.response?.data) ||
                "Failed to delete block period."
            );
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        setError("");
        onClose();
    };

    if (!selectedEvent) return null;

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
            <DialogTitle>
                Edit Block Period
                <Typography variant="subtitle2" color="text.secondary">
                    {selectedEvent.resource?.data?.provider_name && (
                        `Dr. ${selectedEvent.resource.data.provider_name}`
                    )}
                </Typography>
            </DialogTitle>

            <DialogContent>
                <Box sx={{ mt: 2 }}>
                    {error && (
                        <Alert severity="error" sx={{ mb: 2 }}>
                            {error}
                        </Alert>
                    )}

                    <TextField
                        label="Start Time"
                        type="datetime-local"
                        value={formData.start_time}
                        onChange={(e) => handleInputChange("start_time", e.target.value)}
                        fullWidth
                        margin="normal"
                        InputLabelProps={{ shrink: true }}
                        disabled={loading}
                    />

                    <TextField
                        label="End Time"
                        type="datetime-local"
                        value={formData.end_time}
                        onChange={(e) => handleInputChange("end_time", e.target.value)}
                        fullWidth
                        margin="normal"
                        InputLabelProps={{ shrink: true }}
                        disabled={loading}
                    />

                    <FormControl fullWidth margin="normal" disabled={loading}>
                        <InputLabel>Block Type</InputLabel>
                        <Select
                            value={formData.block_type}
                            onChange={(e) => handleInputChange("block_type", e.target.value)}
                            label="Block Type"
                        >
                            {BLOCK_TYPE_OPTIONS.map((type) => (
                                <MenuItem key={type} value={type}>
                                    {type}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>

                    <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                        Current: {formatTime(selectedEvent.start)} - {formatTime(selectedEvent.end)}
                        {selectedEvent.resource?.data?.block_type && 
                            ` (${selectedEvent.resource.data.block_type})`
                        }
                    </Typography>
                </Box>
            </DialogContent>

            <DialogActions>
                <Button 
                    onClick={handleDelete} 
                    color="error" 
                    disabled={loading}
                    variant="outlined"
                >
                    Delete
                </Button>
                <Button onClick={handleClose} disabled={loading}>
                    Cancel
                </Button>
                <Button 
                    onClick={handleSave} 
                    color="primary" 
                    variant="contained"
                    disabled={loading}
                >
                    {loading ? <CircularProgress size={20} /> : "Save Changes"}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default BlockedAvailabilityModal;
