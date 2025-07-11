/**
 * Calendar date utility functions
 */

// Helper function to format date for datetime-local input without timezone conversion
export const formatDateForInput = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}`;
};

// Check if an appointment is in the past
export const isPastAppointment = (dateString) => {
    const now = new Date();
    return new Date(dateString) < now;
};

// Format time for display
export const formatTime = (dateString) => {
    return new Date(dateString).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
    });
};

// Get default view based on user role
export const getDefaultView = (userRole) => {
    if (userRole === "doctor") return "day";
    if (userRole === "registrar") return "work_week";
    return "month";
};
