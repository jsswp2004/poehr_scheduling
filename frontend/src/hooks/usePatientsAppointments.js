import { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';

export const usePatientsAppointments = () => {
    const [appointmentsQuery, setAppointmentsQuery] = useState('');
    const [appointmentsResults, setAppointmentsResults] = useState([]);
    const [appointmentsPage, setAppointmentsPage] = useState(1);
    const [selectedAppointment, setSelectedAppointment] = useState(null);
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [todaysAppointments, setTodaysAppointments] = useState([]);
    const [appointmentsTab, setAppointmentsTab] = useState('today');

    // Fetch all appointments and filter client-side for main appointments table
    const fetchAppointments = async (searchText = '', token) => {
        try {
            const res = await axios.get(`http://127.0.0.1:8000/api/appointments/`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const lowerQuery = searchText.trim().toLowerCase();

            if (!lowerQuery) {
                setAppointmentsResults(res.data);
                return;
            }

            const filtered = res.data.filter((appt) => {
                const patientName =
                    appt.patient_name ||
                    (appt.patient
                        ? `${appt.patient.first_name} ${appt.patient.last_name}`
                        : '');
                const providerName =
                    appt.provider_name ||
                    (appt.provider
                        ? `Dr. ${appt.provider.first_name || ''} ${appt.provider.last_name || ''
                            }`.trim()
                        : '');
                let dateTimeFormats = [];
                if (appt.appointment_datetime) {
                    const dateObj = new Date(appt.appointment_datetime);
                    dateTimeFormats.push(dateObj.toLocaleString());
                    dateTimeFormats.push(dateObj.toLocaleDateString());
                    dateTimeFormats.push(dateObj.toLocaleTimeString());
                    dateTimeFormats.push(dateObj.toISOString().slice(0, 10));
                    dateTimeFormats.push(
                        `${dateObj.getMonth() + 1}/${dateObj.getDate()}`
                    );
                }
                const dateTimeStr = dateTimeFormats.join(' ');
                const description = appt.description || '';
                const duration = appt.duration_minutes
                    ? appt.duration_minutes.toString()
                    : '';
                const status = appt.status || '';
                const clinic = appt.title || '';
                const id = appt.id ? appt.id.toString() : '';
                const combined = `
          ${patientName} 
          ${providerName} 
          ${dateTimeStr} 
          ${description} 
          ${duration} 
          ${status}
          ${clinic}
          ${id}
        `.toLowerCase();

                return combined.includes(lowerQuery);
            });

            setAppointmentsResults(filtered);
        } catch (err) {
            console.error('Failed to fetch appointments:', err);
            setAppointmentsResults([]);
        }
    };

    // Fetch today's appointments for the summary panel
    const fetchTodaysAppointments = async (token) => {
        try {
            const res = await axios.get(`http://127.0.0.1:8000/api/appointments/`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            const filtered = res.data.filter((appt) => {
                if (!appt.appointment_datetime) return false;
                const apptDate = new Date(appt.appointment_datetime);
                return apptDate >= today && apptDate < tomorrow;
            });

            setTodaysAppointments(filtered);
        } catch (err) {
            console.error("Failed to fetch today's appointments:", err);
            setTodaysAppointments([]);
        }
    };

    // Handle appointment status updates (arrived/no_show)
    const handleStatusUpdate = async (appointmentId, field, value, token) => {
        try {
            const updateData = {};

            // Implement mutual exclusion logic
            if (field === 'arrived' && value) {
                updateData.arrived = true;
                updateData.no_show = false;
            } else if (field === 'no_show' && value) {
                updateData.arrived = false;
                updateData.no_show = true;
            } else {
                // If unchecking, just set that field to false
                updateData[field] = false;
            }

            await axios.patch(
                `http://127.0.0.1:8000/api/appointments/${appointmentId}/status/`,
                updateData,
                { headers: { Authorization: `Bearer ${token}` } }
            );

            // Update the local state to reflect the changes
            setTodaysAppointments((prev) =>
                prev.map((appt) =>
                    appt.id === appointmentId ? { ...appt, ...updateData } : appt
                )
            );

            toast.success(`Appointment status updated successfully`);
        } catch (err) {
            console.error('Failed to update appointment status:', err);
            toast.error('Failed to update appointment status');
        }
    };

    return {
        appointmentsQuery,
        setAppointmentsQuery,
        appointmentsResults,
        setAppointmentsResults,
        appointmentsPage,
        setAppointmentsPage,
        selectedAppointment,
        setSelectedAppointment,
        detailsOpen,
        setDetailsOpen,
        todaysAppointments,
        setTodaysAppointments,
        appointmentsTab,
        setAppointmentsTab,
        fetchAppointments,
        fetchTodaysAppointments,
        handleStatusUpdate,
    };
};
