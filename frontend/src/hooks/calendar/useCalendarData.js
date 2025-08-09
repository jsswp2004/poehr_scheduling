/**
 * Custom hook for managing calendar data
 */
import { useState, useEffect, useCallback, useMemo } from "react";
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
    const [allEvents, setAllEvents] = useState([]); // Store all events separately
    const [doctors, setDoctors] = useState([]);
    const [clinicEvents, setClinicEvents] = useState([]);
    const [holidays, setHolidays] = useState([]);
    const [availabilityEvents, setAvailabilityEvents] = useState([]);
    const [environmentSettings, setEnvironmentSettings] = useState(null);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [searchQuery, setSearchQuery] = useState("");
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
    const [loading, setLoading] = useState(true);

    // User and authentication (support both keys)
    const token =
        localStorage.getItem("access_token") ||
        localStorage.getItem("token");
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

    // Debounce search query to improve performance
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchQuery(searchQuery);
        }, 500); // Increased to 500ms debounce for better performance

        return () => clearTimeout(timer);
    }, [searchQuery]);

    // Fetch all calendar data
    const fetchAllData = useCallback(async () => {
        if (!token) {
            console.log('❌ useCalendarData: No token found');
            return;
        }

        console.log('🚀 useCalendarData: Fetching calendar data...');
        setLoading(true);
        try {
            const [appointmentsData, availabilityData, doctorsData, clinicEventsData, holidaysData, environmentSettingsData] =
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
                    calendarApi.fetchEnvironmentSettings(token).catch(err => {
                        console.error("Failed to fetch environment settings:", err);
                        return null;
                    }),
                ]);

            // Transform data to calendar events
            const appointmentEvents = transformAppointmentsToEvents(appointmentsData);
            const availEvents = transformAvailabilityToEvents(availabilityData);
            const clinicEventsTransformed = transformClinicEvents(clinicEventsData);
            const holidayEvents = transformHolidays(holidaysData);

            // Filter availability events - only show BLOCKED events on calendar, keep all for modal
            const blockedAvailabilityEvents = availEvents.filter(event => {
                const isBlocked = event.resource?.data?.isBlocked || event.resource?.data?.is_blocked;
                return isBlocked === true;
            });

            // Debug: Log what blocked events we found
            console.log('Blocked availability events for calendar:', blockedAvailabilityEvents);
            console.log('All availability events count:', availEvents.length);
            console.log('Blocked availability events count:', blockedAvailabilityEvents.length);

            // Combine all events (include blocked availability events for calendar display)
            const allEvents = [
                ...appointmentEvents,
                ...blockedAvailabilityEvents, // Show blocked availability on calendar
                ...clinicEventsTransformed,
                ...holidayEvents,
            ];

            setAllEvents(allEvents); // Store all events without availability
            setAvailabilityEvents(availEvents); // Store availability events separately
            setDoctors(doctorsData);
            setClinicEvents(clinicEventsData);
            setHolidays(holidaysData);
            setEnvironmentSettings(environmentSettingsData);
            if (environmentSettingsData && environmentSettingsData.blocked_days) {
                console.log('✅ Loaded environment blocked days:', environmentSettingsData.blocked_days);
            } else {
                console.warn('⚠️ No environment blocked days found in response.');
            }
        } catch (error) {
            console.error("Error fetching calendar data:", error);
            toast.error("Failed to load calendar data");
        } finally {
            setLoading(false);
        }
    }, [token]);

    // Initial data load
    useEffect(() => {
        console.log('🔄 useCalendarData: Starting data fetch...');
        fetchAllData();
    }, [fetchAllData]);

    // Memoized filtered events to prevent unnecessary re-calculations
    const filteredEvents = useMemo(() => {
        return filterEventsBySearch(allEvents, debouncedSearchQuery);
    }, [allEvents, debouncedSearchQuery]);

    return {
        // Data
        events: filteredEvents,
        doctors,
        clinicEvents,
        holidays,
        availabilityEvents,
        environmentSettings,

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
