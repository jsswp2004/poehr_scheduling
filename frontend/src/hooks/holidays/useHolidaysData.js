import { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../../config/api';

export const useHolidaysData = (getAuthHeaders) => {
    const [holidayList, setHolidayList] = useState([]);
    const [buffered, setBuffered] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState('');
    const [deletingId, setDeletingId] = useState(null);

    const loadHolidays = async () => {
        setLoading(true);
        setStatus('');
        try {
            const res = await axios.get(
                `${API_BASE_URL}/api/holidays/?t=${Date.now()}`,
                {
                    headers: getAuthHeaders(),
                }
            );
            const sorted = [...res.data].sort(
                (a, b) => new Date(a.date) - new Date(b.date)
            );
            setHolidayList(sorted);
            setBuffered(
                sorted.reduce((buf, h) => ({ ...buf, [h.id]: h.is_recognized }), {})
            );
        } catch (err) {
            console.error('Failed to fetch holidays:', err);
            setStatus('Failed to fetch holidays.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadHolidays();
    }, []);

    const handleHolidayCheckbox = (id, checked) => {
        setBuffered((prev) => ({ ...prev, [id]: checked }));
    };

    const handleSave = async () => {
        setSaving(true);
        setStatus('');
        try {
            await Promise.all(
                holidayList.map((h) =>
                    buffered[h.id] !== h.is_recognized
                        ? axios.patch(
                            `${API_BASE_URL}/api/holidays/${h.id}/`,
                            { is_recognized: buffered[h.id] },
                            { headers: getAuthHeaders() }
                        )
                        : null
                )
            );
            setStatus('Saved!');
            await loadHolidays();
        } catch (e) {
            setStatus('Failed to save.');
            console.error(e);
        }
        setSaving(false);
    };

    const handleDelete = (id) => {
        if (!window.confirm('Are you sure you want to delete this holiday?'))
            return;
        setDeletingId(id);
        setStatus('');

        const performDelete = async () => {
            try {
                await axios.patch(
                    `${API_BASE_URL}/api/holidays/${id}/`,
                    {
                        suppressed: true,
                    },
                    {
                        headers: getAuthHeaders(),
                    }
                );
                setStatus('Deleted!');
                await loadHolidays();
            } catch (e) {
                setStatus('Failed to delete.');
                console.error(e.response?.data || e.message);
            } finally {
                setTimeout(() => setDeletingId(null), 100);
            }
        };

        performDelete();
    };

    return {
        holidayList,
        buffered,
        loading,
        saving,
        status,
        deletingId,
        setStatus,
        loadHolidays,
        handleHolidayCheckbox,
        handleSave,
        handleDelete,
    };
};
