import { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../../config/api';

/**
 * Custom hook for managing SMS execution and analytics
 * Handles running SMS now and fetching monthly totals
 */
export const useSMSExecution = (getAuthToken) => {
    const [runNowStatus, setRunNowStatus] = useState('');
    const [monthlySMSTotal, setMonthlySMSTotal] = useState(0);

    const fetchMonthlyTotal = async () => {
        try {
            const token = getAuthToken();
            const now = new Date();
            const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
            const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

            const startDate = firstDay.toISOString().split('T')[0];
            const endDate = lastDay.toISOString().split('T')[0];

            const res = await axios.get(
                `${API_BASE_URL}/api/communicator/logs/?message_type=sms&created_at__gte=${startDate}&created_at__lte=${endDate}`,
                {
                    headers: { Authorization: `Bearer ${token}` },
                }
            );

            setMonthlySMSTotal(res.data.length);
        } catch (err) {
            console.error('Failed to fetch monthly SMS total:', err);
        }
    };

    useEffect(() => {
        if (getAuthToken) {
            fetchMonthlyTotal();
        }
    }, [getAuthToken]);

    const handleRunNow = async () => {
        setRunNowStatus('Running...');
        try {
            const token = getAuthToken();
            await axios.post(
                `${API_BASE_URL}/api/run-patient-reminders-now/`,
                {},
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setRunNowStatus('SMS messages are being sent!');
            // Recalculate monthly total after sending SMS
            setTimeout(() => {
                fetchMonthlyTotal();
            }, 2000); // Wait 2 seconds for SMS to be logged
        } catch (e) {
            setRunNowStatus('Failed to trigger SMS.');
            console.error('Error triggering reminders:', e);
        }
    };

    const getCurrentMonthName = () => {
        return new Date().toLocaleDateString('en-US', {
            month: 'long',
            year: 'numeric',
        });
    };

    return {
        runNowStatus,
        monthlySMSTotal,
        handleRunNow,
        fetchMonthlyTotal,
        getCurrentMonthName
    };
};
