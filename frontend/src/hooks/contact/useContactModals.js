import { useState } from 'react';

/**
 * Custom hook for managing modal states
 */
export const useContactModals = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSmsModalOpen, setIsSmsModalOpen] = useState(false);

    const openEmailModal = () => setIsModalOpen(true);
    const closeEmailModal = () => setIsModalOpen(false);
    const openSmsModal = () => setIsSmsModalOpen(true);
    const closeSmsModal = () => setIsSmsModalOpen(false);

    return {
        isModalOpen,
        isSmsModalOpen,
        openEmailModal,
        closeEmailModal,
        openSmsModal,
        closeSmsModal
    };
};
