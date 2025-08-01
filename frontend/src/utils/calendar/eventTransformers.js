/**
 * Calendar event transformation utilities
 */

// Transform appointment data to calendar events
export const transformAppointmentsToEvents = (appointments) => {
    return appointments.map((appt) => ({
        id: `appt-${appt.id}`,
        title: `${appt.patient_name || "Unknown Patient"} - ${appt.title || "Untitled Appointment"
            }`,
        start: new Date(appt.appointment_datetime),
        end: new Date(
            new Date(appt.appointment_datetime).getTime() +
            (appt.duration_minutes || 30) * 60 * 1000
        ),
        resource: {
            type: "appointment",
            data: appt,
        },
    }));
};

// Transform availability data to calendar events
export const transformAvailabilityToEvents = (availability) => {
    return availability.map((avail) => {
        // Determine the appropriate title and styling based on blocked status
        const isBlocked = avail.is_blocked;
        const doctorName = avail.doctor_name || "Unknown Provider";

        let title;
        if (isBlocked) {
            const blockType = avail.block_type || "Blocked";
            title = `🚫 ${blockType} - ${doctorName}`;
        } else {
            title = `✅ Available - ${doctorName}`;
        }

        return {
            id: `avail-${avail.id}`,
            title: title,
            start: new Date(avail.start_time),
            end: new Date(avail.end_time),
            resource: {
                type: "availability",
                data: {
                    ...avail,
                    isBlocked: isBlocked,
                },
            },
        };
    });
};

// Transform clinic events to calendar events
export const transformClinicEvents = (clinicEvents) => {
    return clinicEvents.map((event) => ({
        id: `clinic-${event.id}`,
        title: event.title || "Clinic Event",
        start: new Date(event.start_datetime),
        end: new Date(event.end_datetime),
        resource: {
            type: "clinic_event",
            data: event,
        },
    }));
};

// Transform holidays to calendar events
export const transformHolidays = (holidays) => {
    return holidays.map((holiday) => {
        // Create a proper local date to avoid timezone issues
        const localDate = new Date(holiday.date + 'T00:00:00');

        return {
            id: `holiday-${holiday.id}`,
            title: `Holiday: ${holiday.name}`,
            start: localDate,
            end: localDate,
            allDay: true,
            resource: {
                type: "holiday",
                data: holiday,
            },
        };
    });
};

// Filter events based on search query
export const filterEventsBySearch = (events, searchQuery) => {
    if (!searchQuery) return events;

    const query = searchQuery.toLowerCase();
    return events.filter((event) =>
        event.title.toLowerCase().includes(query) ||
        event.resource?.data?.patient_name?.toLowerCase().includes(query) ||
        event.resource?.data?.provider_name?.toLowerCase().includes(query) ||
        event.resource?.data?.doctor_name?.toLowerCase().includes(query)
    );
};
