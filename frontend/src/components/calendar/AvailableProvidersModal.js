/**
 * Modal component to display available providers for a specific date
 */
import React from "react";
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    List,
    ListItem,
    ListItemAvatar,
    ListItemText,
    Avatar,
    Typography,
    Box,
    Divider,
} from "@mui/material";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUserMd, faClock } from "@fortawesome/free-solid-svg-icons";

const AvailableProvidersModal = ({
    open,
    onClose,
    selectedDate,
    availableProviders
}) => {
    const formatDate = (date) => {
        if (!date) return "";
        return date.toLocaleDateString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
        });
    };

    const formatTime = (timeStr) => {
        if (!timeStr) return "";

        let time;
        if (typeof timeStr === 'string') {
            // Handle ISO datetime string or time string
            if (timeStr.includes('T') || timeStr.includes('-')) {
                time = new Date(timeStr);
            } else {
                // Handle time only string like "14:30:00"
                time = new Date(`1970-01-01T${timeStr}`);
            }
        } else if (timeStr instanceof Date) {
            // Handle Date object
            time = timeStr;
        } else {
            return "";
        }

        if (isNaN(time.getTime())) {
            return "";
        }

        return time.toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
        });
    };

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="sm"
            fullWidth
            PaperProps={{
                sx: {
                    borderRadius: 2,
                    boxShadow: 3,
                }
            }}
        >
            <DialogTitle sx={{
                pb: 1,
                borderBottom: 1,
                borderColor: 'divider',
                display: 'flex',
                alignItems: 'center',
                gap: 1
            }}>
                <FontAwesomeIcon icon={faUserMd} style={{ color: '#1976d2' }} />
                Available Providers
            </DialogTitle>

            <DialogContent sx={{ pt: 2 }}>
                <Typography variant="h6" gutterBottom sx={{ color: 'text.secondary' }}>
                    {formatDate(selectedDate)}
                </Typography>

                {availableProviders && availableProviders.length > 0 ? (
                    <List sx={{ width: '100%', bgcolor: 'background.paper' }}>
                        {availableProviders.map((provider, index) => (
                            <React.Fragment key={index}>
                                <ListItem
                                    sx={{
                                        borderRadius: 1,
                                        mb: 1,
                                        bgcolor: 'grey.50',
                                        '&:hover': {
                                            bgcolor: 'grey.100',
                                        },
                                    }}
                                >
                                    <ListItemAvatar>
                                        <Avatar sx={{ bgcolor: '#1976d2' }}>
                                            <FontAwesomeIcon icon={faUserMd} />
                                        </Avatar>
                                    </ListItemAvatar>
                                    <ListItemText
                                        primary={
                                            <Typography variant="subtitle1" fontWeight="medium">
                                                Dr. {provider.name || 'Unknown Provider'}
                                            </Typography>
                                        }
                                        secondary={
                                            provider.timeSlots ? (
                                                <Box sx={{ mt: 0.5 }}>
                                                    {provider.timeSlots.map((slot, slotIndex) => (
                                                        <Box key={slotIndex} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                                                            <FontAwesomeIcon icon={faClock} style={{ fontSize: '12px', color: '#666' }} />
                                                            <Typography variant="body2" color="text.secondary">
                                                                {formatTime(slot.start_time)} - {formatTime(slot.end_time)}
                                                            </Typography>
                                                        </Box>
                                                    ))}
                                                </Box>
                                            ) : (
                                                <Typography variant="body2" color="text.secondary">
                                                    Available all day
                                                </Typography>
                                            )
                                        }
                                    />
                                </ListItem>
                                {index < availableProviders.length - 1 && <Divider variant="middle" />}
                            </React.Fragment>
                        ))}
                    </List>
                ) : (
                    <Box sx={{
                        textAlign: 'center',
                        py: 4,
                        color: 'text.secondary'
                    }}>
                        <FontAwesomeIcon icon={faUserMd} style={{ fontSize: '48px', opacity: 0.3 }} />
                        <Typography variant="h6" sx={{ mt: 2, mb: 1 }}>
                            No Providers Available
                        </Typography>
                        <Typography variant="body2">
                            No providers are scheduled to be available on this date.
                        </Typography>
                    </Box>
                )}
            </DialogContent>

            <DialogActions sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
                <Button onClick={onClose} variant="outlined">
                    Close
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default AvailableProvidersModal;
