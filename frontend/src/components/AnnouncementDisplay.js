import React from 'react';
import { 
  Box, 
  Typography, 
  Paper, 
  Stack,
  Chip,
  Link,
  Tooltip
} from '@mui/material';
import { 
  Image as ImageIcon,
  PictureAsPdf as PdfIcon,
  AttachFile as FileIcon
} from '@mui/icons-material';
import { useAnnouncements } from '../contexts/AnnouncementContext';

const AnnouncementDisplay = () => {
  const { announcements } = useAnnouncements();

  const getFileIcon = (fileName) => {
    const extension = fileName.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(extension)) {
      return <ImageIcon fontSize="small" color="info" />;
    } else if (extension === 'pdf') {
      return <PdfIcon fontSize="small" color="error" />;
    } else {
      return <FileIcon fontSize="small" color="action" />;
    }
  };

  const isImageFile = (fileName) => {
    const extension = fileName.split('.').pop().toLowerCase();
    return ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(extension);
  };
  const handleFileClick = (file, fileName) => {
    if (file instanceof File) {
      const url = URL.createObjectURL(file);
      const extension = fileName.split('.').pop().toLowerCase();
      
      if (extension === 'pdf') {
        // Open PDF in new tab
        window.open(url, '_blank');
      } else if (isImageFile(fileName)) {
        // Open image in new tab
        window.open(url, '_blank');
      } else {
        // Download other file types
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
        // Clean up the URL after a delay to ensure download/view completes
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };

  const createImagePreview = (file) => {
    if (file instanceof File) {
      return URL.createObjectURL(file);
    }
    return null;
  };

  const activeAnnouncements = announcements.filter(announcement => announcement.isActive);

  if (activeAnnouncements.length === 0) {
    return (
      <Box sx={{ 
        p: 2, 
        bgcolor: 'grey.50', 
        borderRadius: 1, 
        border: '1px dashed', 
        borderColor: 'grey.300',
        textAlign: 'center'
      }}>
        <Typography variant="body2" color="text.secondary">
          No announcements at this time
        </Typography>
      </Box>
    );
  }

  return (
    <Stack spacing={2}>
      {activeAnnouncements.map((announcement) => (
        <Paper 
          key={announcement.id}
          sx={{ 
            p: 2, 
            bgcolor: 'background.default',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 2,
            '&:hover': {
              boxShadow: 2,
              borderColor: 'primary.light'
            }
          }}
        >
          {/* Header */}
          <Typography 
            variant="subtitle1" 
            sx={{ 
              fontWeight: 600,
              color: 'primary.main',
              mb: 1,
              fontSize: '0.95rem'
            }}
          >
            {announcement.header}
          </Typography>

          {/* Message with HTML support */}
          <Typography 
            variant="body2" 
            sx={{ 
              mb: announcement.attachments && announcement.attachments.length > 0 ? 2 : 0,
              lineHeight: 1.5,
              fontSize: '0.85rem',
              color: 'text.primary'
            }}
            dangerouslySetInnerHTML={{ __html: announcement.message }}
          />

          {/* Attachments */}
          {announcement.attachments && announcement.attachments.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                Attachments:
              </Typography>
              <Stack spacing={1}>
                {announcement.attachments.map((file, index) => {
                  const fileName = file.name || `attachment-${index + 1}`;
                  const imagePreview = createImagePreview(file);
                  
                  return (
                    <Box key={index}>
                      {/* Image Preview */}
                      {isImageFile(fileName) && imagePreview && (
                        <Box sx={{ mb: 1 }}>
                          <img
                            src={imagePreview}
                            alt={fileName}
                            style={{
                              maxWidth: '100%',
                              height: 'auto',
                              maxHeight: '120px',
                              borderRadius: '4px',
                              border: '1px solid #e0e0e0',
                              objectFit: 'cover'
                            }}
                          />
                        </Box>
                      )}                      {/* File Link */}
                      <Tooltip 
                        title={`Click to ${isImageFile(fileName) || fileName.endsWith('.pdf') ? 'view' : 'download'} ${fileName}`}
                        arrow
                      >
                        <Chip
                          icon={getFileIcon(fileName)}
                          label={fileName}
                          variant="outlined"
                          size="small"
                          clickable
                          onClick={() => handleFileClick(file, fileName)}
                          sx={{
                            maxWidth: '100%',
                            height: 'auto',
                            '& .MuiChip-label': {
                              display: 'block',
                              whiteSpace: 'normal',
                              textOverflow: 'ellipsis',
                              overflow: 'hidden',
                              fontSize: '0.75rem'
                            },
                            '&:hover': {
                              backgroundColor: 'action.hover',
                              borderColor: 'primary.main'
                            }
                          }}
                        />
                      </Tooltip>
                    </Box>
                  );
                })}
              </Stack>
            </Box>
          )}
        </Paper>
      ))}
    </Stack>
  );
};

export default AnnouncementDisplay;
