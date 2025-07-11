import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { API_BASE_URL } from '../../config/api';

export const useScheduleManagement = (selectedDoctor, token) => {
    const [schedules, setSchedules] = useState([]);
    const [editingId, setEditingId] = useState(null);
    const isFetchingRef = useRef(false);

    // Unique by doctor, start_time, end_time, is_blocked (dedupes recurrences)
    const uniqueByTime = (arr) => {
        const seen = new Set();
        return arr.filter(item => {
            const key = `${item.doctor}_${item.start_time}_${item.end_time}_${item.is_blocked}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    };

    const fetchSchedules = useCallback(async () => {
        if (!selectedDoctor || isFetchingRef.current) return;
        try {
            isFetchingRef.current = true;
            const res = await axios.get(`${API_BASE_URL}/api/availability/`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const doctorSchedules = res.data.filter(
                s => String(s.doctor) === String(selectedDoctor.value)
            );
            setSchedules(uniqueByTime(doctorSchedules));
        } catch (err) {
            toast.error('Failed to load schedules.');
        } finally {
            isFetchingRef.current = false;
        }
    }, [selectedDoctor, token]);

    useEffect(() => {
        if (selectedDoctor) fetchSchedules();
    }, [selectedDoctor, fetchSchedules]);

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this schedule?')) return;
        try {
            await axios.delete(`${API_BASE_URL}/api/availability/${id}/`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success('Deleted.');
            await fetchSchedules();
        } catch (err) {
            toast.error('Failed to delete schedule.');
        }
    };

    return {
        schedules,
        editingId,
        setEditingId,
        fetchSchedules,
        handleDelete,
    };
};
