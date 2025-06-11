import React, { useState } from 'react';
import { 
  Box, 
  Typography, 
  Paper, 
  Tabs, 
  Tab, 
  TextField, 
  Button,
  Divider
} from '@mui/material';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import { useAnnouncements } from '../contexts/AnnouncementContext';

function AnnouncementsPage() {
  const [activeTab, setActiveTab] = useState(0);
  const [editingTab, setEditingTab] = useState(null);
  const { announcements, updateAnnouncement } = useAnnouncements();

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
    setEditingTab(newValue);
  };

  const handleInputChange = (field, value) => {
    updateAnnouncement(announcements[activeTab].id, { [field]: value });
  };

  const handleAttachmentChange = (event) => {
    const files = Array.from(event.target.files || []);
    updateAnnouncement(announcements[activeTab].id, { attachments: files });
  };

  const isReadOnly = editingTab !== activeTab;

  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="h6" sx={{ mb: 3, fontWeight: 600 }}>
        Manage Announcements
      </Typography>
      
      <Paper sx={{ p: 3, boxShadow: 2 }}>
        <Tabs 
          value={activeTab} 
          onChange={handleTabChange}
          sx={{
            mb: 3,
            '& .MuiTabs-indicator': {
              backgroundColor: 'primary.main',
            },
            '& .MuiTab-root': {
              textTransform: 'none',
              fontWeight: 500,
              minWidth: 120,
            }
          }}
        >
          <Tab label="Message #1" />
          <Tab label="Message #2" />
          <Tab label="Message #3" />
        </Tabs>
        
        <Divider sx={{ mb: 3 }} />
          <Box sx={{ maxWidth: 600 }}>
          <TextField
            label="Header"
            fullWidth
            value={announcements[activeTab]?.header || ''}
            onChange={(e) => handleInputChange('header', e.target.value)}
            InputProps={{
              readOnly: isReadOnly,
            }}
            sx={{ 
              mb: 3,
              '& .MuiInputBase-input': {
                backgroundColor: isReadOnly ? 'grey.50' : 'transparent',
              }
            }}
          />
          
          <TextField
            label="Message"
            fullWidth
            multiline
            rows={4}
            value={announcements[activeTab]?.message || ''}
            onChange={(e) => handleInputChange('message', e.target.value)}
            InputProps={{
              readOnly: isReadOnly,
            }}
            sx={{ 
              mb: 3,
              '& .MuiInputBase-input': {
                backgroundColor: isReadOnly ? 'grey.50' : 'transparent',
              }
            }}
          />
          
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Button
              variant="outlined"
              startIcon={<AttachFileIcon />}
              component="label"
              disabled={isReadOnly}
              sx={{ 
                opacity: isReadOnly ? 0.6 : 1,
                cursor: isReadOnly ? 'not-allowed' : 'pointer'
              }}
            >
              Attachment
              <input
                type="file"
                multiple
                accept="image/*,.pdf,.doc,.docx,.txt"
                hidden
                onChange={handleAttachmentChange}
                disabled={isReadOnly}
              />
            </Button>
            
            {announcements[activeTab]?.attachments?.length > 0 && (
              <Typography variant="body2" color="text.secondary">
                {announcements[activeTab].attachments.length} file(s) selected
              </Typography>
            )}
          </Box>
          
          {announcements[activeTab]?.attachments?.map((file, index) => (
            <Typography key={index} variant="caption" sx={{ display: 'block', mt: 1, ml: 1 }}>
              {file.name}
            </Typography>
          ))}
          
          {isReadOnly && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2, fontStyle: 'italic' }}>
              Click on a tab to edit that message
            </Typography>
          )}
        </Box>
      </Paper>
    </Box>
  );
}

export default AnnouncementsPage;
