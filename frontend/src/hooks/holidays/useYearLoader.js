import { useState } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../../config/api';

export const useYearLoader = (getAuthHeaders, loadHolidays, setStatus) => {
    const [yearInput, setYearInput] = useState(new Date().getFullYear());
    const [loadingYear, setLoadingYear] = useState(false);

    const handleLoadYear = async () => {
        setLoadingYear(true);
        setStatus('');
        try {
            await axios.get(`${API_BASE_URL}/api/holidays/?year=${yearInput}`, {
                headers: getAuthHeaders(),
            });
            setStatus(`Holidays for ${yearInput} loaded!`);
            await loadHolidays();
        } catch (e) {
            setStatus('Failed to load holidays for year.');
            console.error(e);
        }
        setLoadingYear(false);
    };

    return {
        yearInput,
        setYearInput,
        loadingYear,
        handleLoadYear,
    };
};
