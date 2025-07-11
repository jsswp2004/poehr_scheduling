import { useState } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../../config/api';

export const useHolidayDialog = (getAuthHeaders, loadHolidays, setStatus) => {
    const [showHolidayDialog, setShowHolidayDialog] = useState(false);
    const [editingHoliday, setEditingHoliday] = useState(null);
    const [holidayFormData, setHolidayFormData] = useState({
        name: '',
        date: '',
        is_recognized: true,
    });
    const [saving, setSaving] = useState(false);

    const handleOpenHolidayDialog = (holiday) => {
        if (holiday) {
            setEditingHoliday(holiday);
            setHolidayFormData({
                name: holiday.name,
                date: holiday.date.split('T')[0],
                is_recognized: holiday.is_recognized,
            });
        } else {
            setEditingHoliday(null);
            setHolidayFormData({
                name: '',
                date: '',
                is_recognized: true,
            });
        }
        setShowHolidayDialog(true);
    };

    const handleCloseHolidayDialog = () => {
        setShowHolidayDialog(false);
        setEditingHoliday(null);
    };

    const handleSaveHoliday = async () => {
        setSaving(true);
        setStatus('');
        try {
            const payload = {
                name: holidayFormData.name,
                date: holidayFormData.date,
                is_recognized: holidayFormData.is_recognized,
            };
            if (editingHoliday) {
                await axios.patch(
                    `${API_BASE_URL}/api/holidays/${editingHoliday.id}/`,
                    payload,
                    {
                        headers: getAuthHeaders(),
                    }
                );
                setStatus('Holiday updated!');
            } else {
                await axios.post(`${API_BASE_URL}/api/holidays/`, payload, {
                    headers: getAuthHeaders(),
                });
                setStatus('Holiday added!');
            }
            handleCloseHolidayDialog();
            await loadHolidays();
        } catch (e) {
            setStatus('Failed to save holiday.');
            console.error(e);
        }
        setSaving(false);
    };

    const updateHolidayFormData = (field, value) => {
        setHolidayFormData(prev => ({ ...prev, [field]: value }));
    };

    return {
        showHolidayDialog,
        editingHoliday,
        holidayFormData,
        saving,
        handleOpenHolidayDialog,
        handleCloseHolidayDialog,
        handleSaveHoliday,
        updateHolidayFormData,
    };
};
