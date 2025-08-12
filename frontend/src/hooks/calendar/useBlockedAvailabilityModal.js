/**
 * Custom hook for managing blocked availability modal functionality
 */
import { useState, useCallback } from "react";

export const useBlockedAvailabilityModal = () => {
    const [showBlockedAvailabilityModal, setShowBlockedAvailabilityModal] = useState(false);
    const [selectedBlockedEvent, setSelectedBlockedEvent] = useState(null);

    // Open blocked availability modal for a specific blocked event
    const openBlockedAvailabilityModal = useCallback((event) => {
        setSelectedBlockedEvent(event);
        setShowBlockedAvailabilityModal(true);
    }, []);

    // Close blocked availability modal
    const closeBlockedAvailabilityModal = useCallback(() => {
        setShowBlockedAvailabilityModal(false);
        setSelectedBlockedEvent(null);
    }, []);

    return {
        showBlockedAvailabilityModal,
        selectedBlockedEvent,
        openBlockedAvailabilityModal,
        closeBlockedAvailabilityModal,
    };
};
