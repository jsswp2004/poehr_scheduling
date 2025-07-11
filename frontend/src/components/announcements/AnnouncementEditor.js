import React from 'react';
import { Box, TextField, Button, Typography } from '@mui/material';
import AttachFileIcon from '@mui/icons-material/AttachFile';

const AnnouncementEditor = ({
    announcement,
    isReadOnly,
    onInputChange,
    onAttachmentChange
}) => {
    return (
        <Box
            sx={{
                overflow: "visible",
                minHeight: 0,
            }}
        >
            <TextField
                label="Header"
                fullWidth
                value={announcement?.header || ""}
                onChange={(e) => onInputChange("header", e.target.value)}
                InputProps={{
                    readOnly: isReadOnly,
                }}
                sx={{
                    mb: 3,
                    "& .MuiInputBase-input": {
                        backgroundColor: isReadOnly ? "grey.50" : "transparent",
                    },
                }}
            />

            <TextField
                label="Message"
                fullWidth
                multiline
                rows={4}
                value={announcement?.message || ""}
                onChange={(e) => onInputChange("message", e.target.value)}
                InputProps={{
                    readOnly: isReadOnly,
                }}
                sx={{
                    mb: 3,
                    "& .MuiInputBase-input": {
                        backgroundColor: isReadOnly ? "grey.50" : "transparent",
                    },
                }}
            />

            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                <Button
                    variant="outlined"
                    startIcon={<AttachFileIcon />}
                    component="label"
                    disabled={isReadOnly}
                    sx={{
                        opacity: isReadOnly ? 0.6 : 1,
                        cursor: isReadOnly ? "not-allowed" : "pointer",
                    }}
                >
                    Attachment
                    <input
                        type="file"
                        multiple
                        accept="image/*,.pdf,.doc,.docx,.txt"
                        hidden
                        onChange={onAttachmentChange}
                        disabled={isReadOnly}
                    />
                </Button>

                {announcement?.attachments?.length > 0 && (
                    <Typography variant="body2" color="text.secondary">
                        {announcement.attachments.length} file(s) selected
                    </Typography>
                )}
            </Box>

            {announcement?.attachments?.map((file, index) => (
                <Typography
                    key={index}
                    variant="caption"
                    sx={{ display: "block", mt: 1, ml: 1 }}
                >
                    {file.name}
                </Typography>
            ))}

            {isReadOnly && (
                <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mt: 2, fontStyle: "italic" }}
                >
                    Click on a tab to edit that message
                </Typography>
            )}
        </Box>
    );
};

export default AnnouncementEditor;
