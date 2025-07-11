import React from 'react';
import { Box, Paper, Typography } from '@mui/material';
import AttachFileIcon from '@mui/icons-material/AttachFile';

const AnnouncementPreview = ({ announcement }) => {
    return (
        <Box
            sx={{
                overflow: "visible",
                minHeight: 0,
            }}
        >
            <Paper
                sx={{
                    p: 3,
                    bgcolor: "#f8f9fa",
                    border: "1px solid #e9ecef",
                    height: "auto",
                    overflow: "visible",
                }}
            >
                <Typography
                    variant="h6"
                    sx={{ mb: 2, color: "primary.main", fontWeight: 600 }}
                >
                    Preview
                </Typography>

                <Box
                    sx={{
                        bgcolor: "white",
                        p: 3,
                        borderRadius: 2,
                        border: "1px solid #ddd",
                        boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                        minHeight: 200,
                    }}
                >
                    {/* Preview Header */}
                    {announcement?.header && (
                        <div
                            style={{
                                marginBottom: "16px",
                                fontWeight: "bold",
                                color: "#2c3e50",
                                borderBottom: "2px solid #3498db",
                                paddingBottom: "8px",
                                fontSize: "1.5rem",
                                fontFamily: '"Roboto","Helvetica","Arial",sans-serif',
                            }}
                            dangerouslySetInnerHTML={{
                                __html: announcement.header,
                            }}
                        />
                    )}

                    {/* Preview Message */}
                    {announcement?.message && (
                        <div
                            style={{
                                marginBottom: "16px",
                                lineHeight: 1.6,
                                color: "#34495e",
                                whiteSpace: "pre-wrap",
                                fontSize: "1rem",
                                fontFamily: '"Roboto","Helvetica","Arial",sans-serif',
                            }}
                            dangerouslySetInnerHTML={{
                                __html: announcement.message,
                            }}
                        />
                    )}

                    {/* Preview Attachments */}
                    {announcement?.attachments?.length > 0 && (
                        <Box sx={{ mt: 3, pt: 2, borderTop: "1px solid #eee" }}>
                            <Typography
                                variant="subtitle2"
                                sx={{ mb: 1, color: "#7f8c8d", fontWeight: 600 }}
                            >
                                Attachments:
                            </Typography>
                            {announcement.attachments.map((file, index) => (
                                <Box
                                    key={index}
                                    sx={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 1,
                                        mb: 1,
                                        p: 1,
                                        bgcolor: "#ecf0f1",
                                        borderRadius: 1,
                                        border: "1px solid #bdc3c7",
                                    }}
                                >
                                    <AttachFileIcon
                                        sx={{ fontSize: 16, color: "#7f8c8d" }}
                                    />
                                    <Typography variant="body2" sx={{ color: "#2c3e50" }}>
                                        {file.name}
                                    </Typography>
                                </Box>
                            ))}
                        </Box>
                    )}

                    {/* Empty State */}
                    {!announcement?.header && !announcement?.message && (
                        <Box sx={{ textAlign: "center", py: 4 }}>
                            <Typography
                                variant="body2"
                                color="text.secondary"
                                sx={{ fontStyle: "italic" }}
                            >
                                Start typing to see preview...
                            </Typography>
                        </Box>
                    )}
                </Box>
            </Paper>
        </Box>
    );
};

export default AnnouncementPreview;
