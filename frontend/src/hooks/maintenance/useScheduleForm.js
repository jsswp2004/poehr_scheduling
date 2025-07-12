import { useState } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { API_BASE_URL } from '../../config/api';

export const useScheduleForm = (
    selectedDoctor,
    token,
    editingId,
    setEditingId,
    fetchSchedules,
    holidays
) => {
    const getTodayAt = (hour, minute = 0) => {
        const date = new Date();
        date.setHours(hour, minute, 0, 0);
        // Format as local datetime-local input value without UTC conversion
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    };

    const [formData, setFormData] = useState({
        start_time: getTodayAt(8),
        end_time: getTodayAt(17),
        is_blocked: false,
        recurrence: 'none',
        recurrence_end_date: '',
        block_type: 'Lunch',
    });

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData({
            ...formData,
            [name]: type === 'checkbox' ? checked : value
        });
    };

    const updateFormData = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const isHoliday = (dateStr) => {
        const date = new Date(dateStr);
        return holidays.some(h =>
            new Date(h.date).toDateString() === date.toDateString()
        );
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Validation with user feedback
        if (!selectedDoctor) {
            toast.error('Please select a clinician before saving.');
            return;
        }

        if (!formData.start_time) {
            toast.error('Please enter a start time.');
            return;
        }

        if (!formData.end_time) {
            toast.error('Please enter an end time.');
            return;
        }

        const startDate = new Date(formData.start_time);
        const endDate = new Date(formData.end_time);

        // Check if end time is after start time
        if (endDate <= startDate) {
            toast.error('End time must be after start time.');
            return;
        }

        // Check for weekends and holidays with user feedback
        if ([0, 6].includes(startDate.getDay())) {
            toast.error('Cannot schedule on weekends (Saturday/Sunday).');
            return;
        }

        if (isHoliday(formData.start_time)) {
            toast.error('Cannot schedule on holidays.');
            return;
        }

        const payload = {
            doctor: selectedDoctor.value,
            // Keep times as-is for timezone-aware Django backend
            start_time: formData.start_time,
            end_time: formData.end_time,
            is_blocked: formData.is_blocked,
            recurrence: formData.recurrence,
            recurrence_end_date: formData.recurrence_end_date || null,
            block_type: formData.is_blocked ? formData.block_type : null,
        };

        try {
            if (editingId) {
                await axios.put(`${API_BASE_URL}/api/availability/${editingId}/`, payload, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                toast.success('Schedule updated!');
            } else {
                await axios.post(`${API_BASE_URL}/api/availability/`, payload, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                toast.success('Schedule saved!');
            }

            setFormData({
                start_time: getTodayAt(8),
                end_time: getTodayAt(17),
                is_blocked: false,
                recurrence: 'none',
                recurrence_end_date: '',
                block_type: 'Lunch'
            });
            setEditingId(null);
            await fetchSchedules();
        } catch (err) {
            toast.error('Failed to save schedule.');
        }
    };

    const handleCancel = () => {
        setFormData({
            start_time: getTodayAt(8),
            end_time: getTodayAt(17),
            is_blocked: false,
            recurrence: 'none',
            recurrence_end_date: '',
            block_type: 'Lunch'
        });
        setEditingId(null);
    };

    const populateEditForm = (schedule, doctors) => {
        const toLocalDatetimeInputValue = (isoString) => {
            const local = new Date(isoString);
            // Format as local datetime-local input value without UTC conversion
            const year = local.getFullYear();
            const month = String(local.getMonth() + 1).padStart(2, '0');
            const day = String(local.getDate()).padStart(2, '0');
            const hours = String(local.getHours()).padStart(2, '0');
            const minutes = String(local.getMinutes()).padStart(2, '0');
            return `${year}-${month}-${day}T${hours}:${minutes}`;
        };

        setEditingId(schedule.id);
        setFormData({
            start_time: toLocalDatetimeInputValue(schedule.start_time),
            end_time: toLocalDatetimeInputValue(schedule.end_time),
            is_blocked: schedule.is_blocked,
            recurrence: schedule.recurrence || 'none',
            recurrence_end_date: schedule.recurrence_end_date || '',
            block_type: schedule.block_type || 'Lunch',
        });
    };

    return {
        formData,
        handleChange,
        updateFormData,
        handleSubmit,
        handleCancel,
        populateEditForm,
    };
};
