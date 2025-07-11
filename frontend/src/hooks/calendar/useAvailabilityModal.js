/**
 * Custom hook for managing availability modal functionality
 */
import { useState, useCallback } from "react";

export const useAvailabilityModal = (availabilityEvents) => {
    const [showAvailabilityModal, setShowAvailabilityModal] = useState(false);
    const [selectedDateAvailability, setSelectedDateAvailability] = useState(null);

    // Open availability modal for a specific date
    const openAvailabilityModal = useCallback((date) => {
        // Filter availability events for the selected date
        const dateString = date.toDateString();
        const availableOnDate = availabilityEvents.filter(event => {
            const eventDate = new Date(event.start).toDateString();
            return eventDate === dateString;
        });

        setSelectedDateAvailability({
            date: date,
            availability: availableOnDate,
        });
        setShowAvailabilityModal(true);
    }, [availabilityEvents]);

    // Close availability modal
    const closeAvailabilityModal = useCallback(() => {
        setShowAvailabilityModal(false);
        setSelectedDateAvailability(null);
    }, []);

    return {
        showAvailabilityModal,
        selectedDateAvailability,
        openAvailabilityModal,
        closeAvailabilityModal,
    };
};
