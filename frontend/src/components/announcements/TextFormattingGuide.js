import React from 'react';
import { Box, Paper, Typography } from '@mui/material';

const TextFormattingGuide = () => {
    const formatExamples = [
        {
            code: '&lt;b&gt;text&lt;/b&gt;',
            description: 'Makes text bold',
            example: <strong>bold</strong>
        },
        {
            code: '&lt;i&gt;text&lt;/i&gt;',
            description: 'Makes text italic',
            example: <em>italic</em>
        },
        {
            code: '&lt;u&gt;text&lt;/u&gt;',
            description: 'Underlines text',
            example: <u>Underlines</u>
        },
        {
            code: '&lt;strong&gt;text&lt;/strong&gt;',
            description: 'Important text',
            example: <strong>Important</strong>
        },
    ];

    const layoutExamples = [
        {
            code: '&lt;br&gt;',
            description: 'Line break (new line)'
        },
        {
            code: '&lt;p&gt;text&lt;/p&gt;',
            description: 'Paragraph with spacing'
        },
        {
            code: '&lt;center&gt;text&lt;/center&gt;',
            description: 'Centers text'
        },
    ];

    return (
        <Paper
            sx={{
                p: 2,
                bgcolor: "#f0f8ff",
                border: "1px solid #d1ecf1",
                height: "450px",
                overflow: "auto",
            }}
        >
            <Typography
                variant="h6"
                sx={{
                    mb: 2,
                    color: "primary.main",
                    fontWeight: 600,
                    fontSize: "0.9rem",
                }}
            >
                Text & Layout
            </Typography>

            <Box sx={{ fontSize: "0.75rem" }}>
                {/* Text Formatting */}
                <Typography
                    variant="subtitle2"
                    sx={{
                        mb: 1,
                        color: "#2c3e50",
                        fontSize: "0.8rem",
                        fontWeight: 600,
                    }}
                >
                    Text Formatting
                </Typography>
                <Box sx={{ mb: 2, ml: 1 }}>
                    {formatExamples.map((item, index) => (
                        <Box key={index} sx={{ mb: 1 }}>
                            <code
                                style={{
                                    background: "#e8f4f8",
                                    padding: "1px 3px",
                                    borderRadius: "2px",
                                    fontSize: "0.6rem",
                                }}
                            >
                                {item.code}
                            </code>
                            <Typography
                                variant="caption"
                                sx={{
                                    display: "block",
                                    color: "#666",
                                    mt: 0.3,
                                    fontSize: "0.65rem",
                                }}
                            >
                                {item.description} {item.example && <>({item.example} text)</>}
                            </Typography>
                        </Box>
                    ))}
                </Box>

                {/* Layout */}
                <Typography
                    variant="subtitle2"
                    sx={{
                        mb: 1,
                        color: "#2c3e50",
                        fontSize: "0.8rem",
                        fontWeight: 600,
                    }}
                >
                    Layout
                </Typography>
                <Box sx={{ mb: 2, ml: 1 }}>
                    {layoutExamples.map((item, index) => (
                        <Box key={index} sx={{ mb: 1 }}>
                            <code
                                style={{
                                    background: "#e8f4f8",
                                    padding: "1px 3px",
                                    borderRadius: "2px",
                                    fontSize: "0.6rem",
                                }}
                            >
                                {item.code}
                            </code>
                            <Typography
                                variant="caption"
                                sx={{
                                    display: "block",
                                    color: "#666",
                                    mt: 0.3,
                                    fontSize: "0.65rem",
                                }}
                            >
                                {item.description}
                            </Typography>
                        </Box>
                    ))}
                </Box>
            </Box>
        </Paper>
    );
};

export default TextFormattingGuide;
