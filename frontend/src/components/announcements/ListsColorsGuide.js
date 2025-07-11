import React from 'react';
import { Box, Paper, Typography } from '@mui/material';

const ListsColorsGuide = () => {
    const listExamples = [
        {
            code: '&lt;ul&gt;&lt;li&gt;item&lt;/li&gt;&lt;/ul&gt;',
            description: 'Bulleted list'
        },
        {
            code: '&lt;ol&gt;&lt;li&gt;item&lt;/li&gt;&lt;/ol&gt;',
            description: 'Numbered list'
        },
    ];

    const colorExamples = [
        {
            code: '&lt;font color="red"&gt;text&lt;/font&gt;',
            description: 'Colored text'
        },
    ];

    return (
        <Paper
            sx={{
                p: 2,
                bgcolor: "#f8fff0",
                border: "1px solid #d1f1d1",
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
                Lists & Colors
            </Typography>

            <Box sx={{ fontSize: "0.75rem" }}>
                {/* Lists */}
                <Typography
                    variant="subtitle2"
                    sx={{
                        mb: 1,
                        color: "#2c3e50",
                        fontSize: "0.8rem",
                        fontWeight: 600,
                    }}
                >
                    Lists
                </Typography>
                <Box sx={{ mb: 2, ml: 1 }}>
                    {listExamples.map((item, index) => (
                        <Box key={index} sx={{ mb: 1 }}>
                            <code
                                style={{
                                    background: "#e8f8e8",
                                    padding: "1px 3px",
                                    borderRadius: "2px",
                                    fontSize: "0.55rem",
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

                {/* Colors */}
                <Typography
                    variant="subtitle2"
                    sx={{
                        mb: 1,
                        color: "#2c3e50",
                        fontSize: "0.8rem",
                        fontWeight: 600,
                    }}
                >
                    Colors
                </Typography>
                <Box sx={{ mb: 2, ml: 1 }}>
                    {colorExamples.map((item, index) => (
                        <Box key={index} sx={{ mb: 1 }}>
                            <code
                                style={{
                                    background: "#e8f8e8",
                                    padding: "1px 3px",
                                    borderRadius: "2px",
                                    fontSize: "0.55rem",
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

                {/* Example */}
                <Typography
                    variant="subtitle2"
                    sx={{
                        mb: 1,
                        color: "#2c3e50",
                        fontSize: "0.8rem",
                        fontWeight: 600,
                    }}
                >
                    Example
                </Typography>
                <Box
                    sx={{
                        background: "#f8f9fa",
                        p: 1.5,
                        borderRadius: 1,
                        border: "1px solid #ddd",
                        mb: 1,
                        wordBreak: "break-word",
                    }}
                >
                    <Typography
                        variant="caption"
                        sx={{
                            fontFamily: "monospace",
                            fontSize: "0.65rem",
                            lineHeight: 1.4,
                            display: "block",
                            whiteSpace: "pre-wrap",
                        }}
                    >
                        &lt;b&gt;Notice:&lt;/b&gt;&lt;br&gt;{"\n"}Please &lt;i&gt;review&lt;/i&gt; the new policy.
                    </Typography>
                </Box>
            </Box>
        </Paper>
    );
};

export default ListsColorsGuide;
