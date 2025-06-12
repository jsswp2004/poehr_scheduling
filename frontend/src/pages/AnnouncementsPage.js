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
        
        <Box sx={{ display: 'flex', gap: 3, height: 'auto' }}>
          {/* Left Pane - Editing Form */}
          <Box sx={{ flex: '0 0 400px' }}>
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
          
          {/* Right Pane - Preview */}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Paper sx={{ p: 3, bgcolor: '#f8f9fa', border: '1px solid #e9ecef', minHeight: 300 }}>
              <Typography variant="h6" sx={{ mb: 2, color: 'primary.main', fontWeight: 600 }}>
                Preview
              </Typography>
              
              <Box sx={{ 
                bgcolor: 'white', 
                p: 3, 
                borderRadius: 2, 
                border: '1px solid #ddd',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                minHeight: 200
              }}>                {/* Preview Header */}
                {announcements[activeTab]?.header && (
                  <div 
                    style={{ 
                      marginBottom: '16px', 
                      fontWeight: 'bold',
                      color: '#2c3e50',
                      borderBottom: '2px solid #3498db',
                      paddingBottom: '8px',
                      fontSize: '1.5rem',
                      fontFamily: '"Roboto","Helvetica","Arial",sans-serif'
                    }}
                    dangerouslySetInnerHTML={{ __html: announcements[activeTab].header }}
                  />
                )}
                
                {/* Preview Message */}
                {announcements[activeTab]?.message && (
                  <div 
                    style={{ 
                      marginBottom: '16px',
                      lineHeight: 1.6,
                      color: '#34495e',
                      whiteSpace: 'pre-wrap',
                      fontSize: '1rem',
                      fontFamily: '"Roboto","Helvetica","Arial",sans-serif'
                    }}
                    dangerouslySetInnerHTML={{ __html: announcements[activeTab].message }}
                  />
                )}
                
                {/* Preview Attachments */}
                {announcements[activeTab]?.attachments?.length > 0 && (
                  <Box sx={{ mt: 3, pt: 2, borderTop: '1px solid #eee' }}>
                    <Typography variant="subtitle2" sx={{ mb: 1, color: '#7f8c8d', fontWeight: 600 }}>
                      Attachments:
                    </Typography>
                    {announcements[activeTab].attachments.map((file, index) => (
                      <Box 
                        key={index} 
                        sx={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: 1, 
                          mb: 1,
                          p: 1,
                          bgcolor: '#ecf0f1',
                          borderRadius: 1,
                          border: '1px solid #bdc3c7'
                        }}
                      >
                        <AttachFileIcon sx={{ fontSize: 16, color: '#7f8c8d' }} />
                        <Typography variant="body2" sx={{ color: '#2c3e50' }}>
                          {file.name}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                )}
                
                {/* Empty State */}
                {!announcements[activeTab]?.header && !announcements[activeTab]?.message && (
                  <Box sx={{ textAlign: 'center', py: 4 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                      Start typing to see preview...
                    </Typography>
                  </Box>
                )}
              </Box>
            </Paper>
          </Box>
        </Box>
      </Paper>
    </Box>
  );
}

export default AnnouncementsPage;
