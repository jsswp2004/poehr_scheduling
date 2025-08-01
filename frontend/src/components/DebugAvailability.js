import React, { useEffect, useState } from 'react';
import { calendarApi } from '../utils/calendar/calendarApi';

const DebugAvailability = () => {
    const [availability, setAvailability] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            const token = localStorage.getItem('access_token');
            if (token) {
                try {
                    const data = await calendarApi.fetchAvailability(token);
                    setAvailability(data);
                    console.log('Raw availability data:', data);
                } catch (error) {
                    console.error('Error fetching availability:', error);
                }
            }
            setLoading(false);
        };
        fetchData();
    }, []);

    if (loading) return <div>Loading...</div>;

    return (
        <div style={{ padding: '20px', fontFamily: 'monospace' }}>
            <h2>Debug: Availability Records</h2>
            <p>Total records: {availability.length}</p>
            
            <h3>Blocked Records:</h3>
            {availability.filter(a => a.is_blocked).map(record => (
                <div key={record.id} style={{ marginBottom: '10px', padding: '10px', border: '1px solid red' }}>
                    <strong>ID:</strong> {record.id}<br/>
                    <strong>Doctor:</strong> {record.doctor_name}<br/>
                    <strong>Start:</strong> {record.start_time}<br/>
                    <strong>End:</strong> {record.end_time}<br/>
                    <strong>is_blocked:</strong> {String(record.is_blocked)}<br/>
                    <strong>block_type:</strong> {record.block_type}<br/>
                </div>
            ))}
            
            <h3>Available Records (first 5):</h3>
            {availability.filter(a => !a.is_blocked).slice(0, 5).map(record => (
                <div key={record.id} style={{ marginBottom: '10px', padding: '10px', border: '1px solid green' }}>
                    <strong>ID:</strong> {record.id}<br/>
                    <strong>Doctor:</strong> {record.doctor_name}<br/>
                    <strong>Start:</strong> {record.start_time}<br/>
                    <strong>End:</strong> {record.end_time}<br/>
                    <strong>is_blocked:</strong> {String(record.is_blocked)}<br/>
                    <strong>block_type:</strong> {record.block_type}<br/>
                </div>
            ))}
        </div>
    );
};

export default DebugAvailability;
