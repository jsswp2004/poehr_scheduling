import { useAnnouncements } from '../../contexts/AnnouncementContext';

export const useAnnouncementForm = (activeTab) => {
    const { announcements, updateAnnouncement } = useAnnouncements();

    const handleInputChange = (field, value) => {
        updateAnnouncement(announcements[activeTab].id, { [field]: value });
    };

    const handleAttachmentChange = (event) => {
        const files = Array.from(event.target.files || []);
        updateAnnouncement(announcements[activeTab].id, { attachments: files });
    };

    const getCurrentAnnouncement = () => announcements[activeTab] || {};

    return {
        announcements,
        currentAnnouncement: getCurrentAnnouncement(),
        handleInputChange,
        handleAttachmentChange,
        updateAnnouncement,
    };
};
