import { useState } from 'react';

export const useAnnouncementTabs = () => {
    const [activeTab, setActiveTab] = useState(0);
    const [editingTab, setEditingTab] = useState(null);

    const handleTabChange = (event, newValue) => {
        setActiveTab(newValue);
        setEditingTab(newValue);
    };

    const isReadOnly = editingTab !== activeTab;

    return {
        activeTab,
        setActiveTab,
        editingTab,
        setEditingTab,
        handleTabChange,
        isReadOnly,
    };
};
