/**
 * Custom hook for managing calendar data
 */
import { useState, useEffect, useCallback } from "react";
import { jwtDecode } from "jwt-decode";
import { toast } from "react-toastify";
import { calendarApi } from "../../utils/calendar/calendarApi";
import {
    transformAppointmentsToEvents,
    transformAvailabilityToEvents,
    transformClinicEvents,
    transformHolidays,
    filterEventsBySearch,
} from "../../utils/calendar/eventTransformers";
import { getDefaultView } from "../../utils/calendar/dateUtils";

export const useCalendarData = () => {
    // State
    const [events, setEvents] = useState([]);
    const [doctors, setDoctors] = useState([]);
    const [clinicEvents, setClinicEvents] = useState([]);
    const [holidays, setHolidays] = useState([]);
    const [availabilityEvents, setAvailabilityEvents] = useState([]);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [searchQuery, setSearchQuery] = useState("");
    const [loading, setLoading] = useState(true);

    // User and authentication
    const token = localStorage.getItem("access_token");
    let userRole = null;

    if (token) {
        try {
            const decoded = jwtDecode(token);
            userRole = decoded.role;
        } catch (err) {
            console.error("Failed to decode token:", err);
        }
    }

    const [currentView, setCurrentView] = useState(getDefaultView(userRole));

    // Fetch all calendar data
    const fetchAllData = useCallback(async () => {
        if (!token) return;

        setLoading(true);
        try {
            const [appointmentsData, availabilityData, doctorsData, clinicEventsData, holidaysData] =
                await Promise.all([
                    calendarApi.fetchAppointments(token).catch(err => {
                        console.error("Failed to fetch appointments:", err);
                        return [];
                    }),
                    calendarApi.fetchAvailability(token).catch(err => {
                        console.error("Failed to fetch availability:", err);
                        return [];
                    }),
                    calendarApi.fetchDoctors(token).catch(err => {
                        console.error("Failed to fetch doctors:", err);
                        return [];
                    }),
                    calendarApi.fetchClinicEvents(token).catch(err => {
                        console.error("Failed to fetch clinic events:", err);
                        return [];
                    }),
                    calendarApi.fetchHolidays(token).catch(err => {
                        console.error("Failed to fetch holidays:", err);
                        return [];
                    }),
                ]);

            // Transform data to calendar events
            const appointmentEvents = transformAppointmentsToEvents(appointmentsData);
            const availEvents = transformAvailabilityToEvents(availabilityData);
            const clinicEventsTransformed = transformClinicEvents(clinicEventsData);
            const holidayEvents = transformHolidays(holidaysData);

            // Combine all events
            const allEvents = [
                ...appointmentEvents,
                ...availEvents,
                ...clinicEventsTransformed,
                ...holidayEvents,
            ];

            setEvents(allEvents);
            setAvailabilityEvents(availEvents);
            setDoctors(doctorsData);
            setClinicEvents(clinicEventsData);
            setHolidays(holidaysData);
        } catch (error) {
            console.error("Error fetching calendar data:", error);
            toast.error("Failed to load calendar data");
        } finally {
            setLoading(false);
        }
    }, [token]);

    // Initial data load
    useEffect(() => {
        fetchAllData();
    }, [fetchAllData]);

    // Filter events based on search
    const filteredEvents = filterEventsBySearch(events, searchQuery);

    return {
        // Data
        events: filteredEvents,
        doctors,
        clinicEvents,
        holidays,
        availabilityEvents,

        // State
        currentDate,
        setCurrentDate,
        currentView,
        setCurrentView,
        searchQuery,
        setSearchQuery,
        loading,

        // User info
        userRole,
        token,

        // Actions
        refetchData: fetchAllData,
    };
};
