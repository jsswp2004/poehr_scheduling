import React from "react";
import { Box, Typography, Paper } from "@mui/material";
import { useAnnouncementTabs, useAnnouncementForm } from "../hooks/announcements";
import {
    AnnouncementTabs,
    AnnouncementLayout
} from "../components/announcements";

function AnnouncementsPage({ inShell = false }) {
    const { activeTab, handleTabChange, isReadOnly } = useAnnouncementTabs();
    const {
        currentAnnouncement,
        handleInputChange,
        handleAttachmentChange
    } = useAnnouncementForm(activeTab);

    return (
        <Paper variant={inShell ? "outlined" : "elevation"} sx={{ p: 3, boxShadow: inShell ? 0 : 2, borderRadius: inShell ? 2 : undefined, height: "auto", overflow: "visible" }}>
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
