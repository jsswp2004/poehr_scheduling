import React from 'react';
import { Box } from '@mui/material';
import TextFormattingGuide from './TextFormattingGuide';
import ListsColorsGuide from './ListsColorsGuide';

const HTMLGuideSection = () => {
    return (
        <Box
            sx={{
                overflow: "visible",
                minHeight: 0,
            }}
        >
            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 1,
                    width: "100%",
                    overflow: "visible",
                    alignItems: "start",
                }}
            >
                {/* Left sub-column */}
                <Box
                    sx={{
                        overflow: "visible",
                        minHeight: 0,
                    }}
                >
                    <TextFormattingGuide />
                </Box>

                {/* Right sub-column */}
                <Box
                    sx={{
                        overflow: "visible",
                        minHeight: 0,
                    }}
                >
                    <ListsColorsGuide />
                </Box>
            </Box>
        </Box>
    );
};

export default HTMLGuideSection;
