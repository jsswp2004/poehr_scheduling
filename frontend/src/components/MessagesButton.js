import React from 'react';
import {
    IconButton,
    Badge,
    Tooltip,
    Box,
} from '@mui/material';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCommentDots } from '@fortawesome/free-solid-svg-icons';

const MessagesButton = ({ 
    onClick, 
    totalUnreadCount = 0,
    sx = {} 
}) => {
    return (
        <Box sx={{ display: 'flex', alignItems: 'center', ...sx }}>
            <Tooltip title={`Messages${totalUnreadCount > 0 ? ` (${totalUnreadCount} unread)` : ''}`}>
                <IconButton
                    onClick={onClick}
                    sx={{
                        color: totalUnreadCount > 0 ? '#ff4444' : 'primary.main',
                        bgcolor: 'background.paper',
                        border: '1px solid',
                        borderColor: totalUnreadCount > 0 ? '#ff4444' : 'divider',
                        '&:hover': {
                            bgcolor: totalUnreadCount > 0 ? '#ff444411' : 'action.hover',
                        },
                        position: 'relative',
                    }}
                >
                    <Badge 
                        badgeContent={totalUnreadCount > 0 ? totalUnreadCount : null} 
                        color="error"
                        sx={{
                            '& .MuiBadge-badge': {
                                fontSize: '0.6rem',
                                height: '16px',
                                minWidth: '16px',
                            }
                        }}
                    >
                        <FontAwesomeIcon icon={faCommentDots} />
                    </Badge>
                </IconButton>
            </Tooltip>
        </Box>
    );
};

export default MessagesButton;
