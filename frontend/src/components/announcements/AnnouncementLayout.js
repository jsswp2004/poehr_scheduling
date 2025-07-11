import React from 'react';
import { Box } from '@mui/material';
import AnnouncementEditor from './AnnouncementEditor';
import AnnouncementPreview from './AnnouncementPreview';
import HTMLGuideSection from './HTMLGuideSection';

const AnnouncementLayout = ({
    announcement,
    isReadOnly,
    onInputChange,
    onAttachmentChange
}) => {
    return (
        <Box
            sx={{
                display: "grid",
                gridTemplateColumns: "29% 29% 40%",
                gap: 2,
                width: "100%",
                overflow: "visible",
                alignItems: "start",
            }}
        >
            {/* Left Pane - Editing Form (29%) */}
            <AnnouncementEditor
                announcement={announcement}
                isReadOnly={isReadOnly}
                onInputChange={onInputChange}
                onAttachmentChange={onAttachmentChange}
            />

            {/* Middle Pane - Preview (29%) */}
            <AnnouncementPreview announcement={announcement} />

            {/* Third Pane - HTML Guide (40% with two-column layout) */}
            <HTMLGuideSection />
        </Box>
    );
};

export default AnnouncementLayout;
