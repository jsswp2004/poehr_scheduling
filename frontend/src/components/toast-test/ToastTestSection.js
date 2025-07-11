import React from 'react';
import {
    Card,
    CardContent,
    Typography,
    Button,
    Box,
} from '@mui/material';

/**
 * ToastTestSection Component
 * Individual section for testing different toast types
 */
const ToastTestSection = ({ title, tests }) => {
    return (
        <Card>
            <CardContent>
                <Typography variant="h6" gutterBottom>
                    {title}
                </Typography>
                <Box sx={{ display: 'flex', gap: 2, flexDirection: 'column' }}>
                    {tests.map((test) => (
                        <Button
                            key={test.id}
                            variant={test.variant}
                            color={test.color}
                            onClick={test.handler}
                        >
                            {test.label}
                        </Button>
                    ))}
                </Box>
            </CardContent>
        </Card>
    );
};

export default ToastTestSection;
