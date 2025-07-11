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
        date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
        return date.toISOString().slice(0, 16);
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
        if (!selectedDoctor || !formData.start_time || !formData.end_time) return;

        const startDate = new Date(formData.start_time);
        if ([0, 6].includes(startDate.getDay()) || isHoliday(formData.start_time)) return;

        const payload = {
            doctor: selectedDoctor.value,
            start_time: new Date(formData.start_time).toISOString(),
            end_time: new Date(formData.end_time).toISOString(),
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
            local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
            return local.toISOString().slice(0, 16);
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
