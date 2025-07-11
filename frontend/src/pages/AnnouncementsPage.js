import React from "react";
import { Box, Typography, Paper } from "@mui/material";
import { useAnnouncementTabs, useAnnouncementForm } from "../hooks/announcements";
import {
    AnnouncementTabs,
    AnnouncementLayout
} from "../components/announcements";

function AnnouncementsPage() {
    const { activeTab, handleTabChange, isReadOnly } = useAnnouncementTabs();
    const {
        currentAnnouncement,
        handleInputChange,
        handleAttachmentChange
    } = useAnnouncementForm(activeTab);

    return (
        <Paper sx={{ p: 3, boxShadow: 2, height: "auto", overflow: "visible" }}>
            <Typography variant="h6" sx={{ mb: 2 }}>
                Manage Announcements
            </Typography>

            <AnnouncementTabs
                activeTab={activeTab}
                onTabChange={handleTabChange}
            />

            <AnnouncementLayout
                announcement={currentAnnouncement}
                isReadOnly={isReadOnly}
                onInputChange={handleInputChange}
                onAttachmentChange={handleAttachmentChange}
            />
        </Paper>
    );
}

export default AnnouncementsPage;
