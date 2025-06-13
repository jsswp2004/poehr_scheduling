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
        <Paper sx={{ p: 3, boxShadow: 2, height: 'auto', overflow: 'visible' }}>
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
        </Tabs>          <Divider sx={{ mb: 3 }} />          <Box sx={{ 
            display: 'grid', 
            gridTemplateColumns: '29% 29% 40%',
            gap: 2, 
            width: '100%',
            overflow: 'visible',
            alignItems: 'start'
          }}>          {/* Left Pane - Editing Form (29%) */}
          <Box sx={{ 
            overflow: 'visible',
            minHeight: 0
          }}>
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
          </Box>          {/* Middle Pane - Preview (29%) */}
          <Box sx={{ 
            overflow: 'visible',
            minHeight: 0
          }}>
            <Paper sx={{ p: 3, bgcolor: '#f8f9fa', border: '1px solid #e9ecef', height: 'auto', overflow: 'visible' }}>
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
                )}              </Box>
            </Paper>
          </Box>            {/* Third Pane - HTML Guide (40% with two-column layout) */}
          <Box sx={{ 
            overflow: 'visible',
            minHeight: 0
          }}>            <Box sx={{ 
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 1, 
              width: '100%',
              overflow: 'visible',
              alignItems: 'start'
            }}>              {/* Left sub-column */}
              <Box sx={{ 
                overflow: 'visible',
                minHeight: 0
              }}>
                <Paper sx={{ p: 2, bgcolor: '#f0f8ff', border: '1px solid #d1ecf1', height: '450px', overflow: 'auto' }}>
                  <Typography variant="h6" sx={{ mb: 2, color: 'primary.main', fontWeight: 600, fontSize: '0.9rem' }}>
                    Text & Layout
                  </Typography>
                  
                  <Box sx={{ fontSize: '0.75rem' }}>
                    {/* Text Formatting */}
                    <Typography variant="subtitle2" sx={{ mb: 1, color: '#2c3e50', fontSize: '0.8rem', fontWeight: 600 }}>
                      Text Formatting
                    </Typography>
                    <Box sx={{ mb: 2, ml: 1 }}>
                      <Box sx={{ mb: 1 }}>
                        <code style={{ background: '#e8f4f8', padding: '1px 3px', borderRadius: '2px', fontSize: '0.6rem' }}>&lt;b&gt;text&lt;/b&gt;</code>
                        <Typography variant="caption" sx={{ display: 'block', color: '#666', mt: 0.3, fontSize: '0.65rem' }}>
                          Makes text <strong>bold</strong>
                        </Typography>
                      </Box>
                      <Box sx={{ mb: 1 }}>
                        <code style={{ background: '#e8f4f8', padding: '1px 3px', borderRadius: '2px', fontSize: '0.6rem' }}>&lt;i&gt;text&lt;/i&gt;</code>
                        <Typography variant="caption" sx={{ display: 'block', color: '#666', mt: 0.3, fontSize: '0.65rem' }}>
                          Makes text <em>italic</em>
                        </Typography>
                      </Box>
                      <Box sx={{ mb: 1 }}>
                        <code style={{ background: '#e8f4f8', padding: '1px 3px', borderRadius: '2px', fontSize: '0.6rem' }}>&lt;u&gt;text&lt;/u&gt;</code>
                        <Typography variant="caption" sx={{ display: 'block', color: '#666', mt: 0.3, fontSize: '0.65rem' }}>
                          <u>Underlines</u> text
                        </Typography>
                      </Box>
                      <Box sx={{ mb: 1 }}>
                        <code style={{ background: '#e8f4f8', padding: '1px 3px', borderRadius: '2px', fontSize: '0.6rem' }}>&lt;strong&gt;text&lt;/strong&gt;</code>
                        <Typography variant="caption" sx={{ display: 'block', color: '#666', mt: 0.3, fontSize: '0.65rem' }}>
                          <strong>Important</strong> text
                        </Typography>
                      </Box>
                    </Box>
                    
                    {/* Layout */}
                    <Typography variant="subtitle2" sx={{ mb: 1, color: '#2c3e50', fontSize: '0.8rem', fontWeight: 600 }}>
                      Layout
                    </Typography>
                    <Box sx={{ mb: 2, ml: 1 }}>
                      <Box sx={{ mb: 1 }}>
                        <code style={{ background: '#e8f4f8', padding: '1px 3px', borderRadius: '2px', fontSize: '0.6rem' }}>&lt;br&gt;</code>
                        <Typography variant="caption" sx={{ display: 'block', color: '#666', mt: 0.3, fontSize: '0.65rem' }}>
                          Line break (new line)
                        </Typography>
                      </Box>
                      <Box sx={{ mb: 1 }}>
                        <code style={{ background: '#e8f4f8', padding: '1px 3px', borderRadius: '2px', fontSize: '0.6rem' }}>&lt;p&gt;text&lt;/p&gt;</code>
                        <Typography variant="caption" sx={{ display: 'block', color: '#666', mt: 0.3, fontSize: '0.65rem' }}>
                          Paragraph with spacing
                        </Typography>
                      </Box>
                      <Box sx={{ mb: 1 }}>
                        <code style={{ background: '#e8f4f8', padding: '1px 3px', borderRadius: '2px', fontSize: '0.6rem' }}>&lt;center&gt;text&lt;/center&gt;</code>
                        <Typography variant="caption" sx={{ display: 'block', color: '#666', mt: 0.3, fontSize: '0.65rem' }}>
                          Centers text
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                </Paper>
              </Box>              {/* Right sub-column */}
              <Box sx={{ 
                overflow: 'visible',
                minHeight: 0
              }}>
                <Paper sx={{ p: 2, bgcolor: '#f8fff0', border: '1px solid #d1f1d1', height: '450px', overflow: 'auto' }}>
                  <Typography variant="h6" sx={{ mb: 2, color: 'primary.main', fontWeight: 600, fontSize: '0.9rem' }}>
                    Lists & Colors
                  </Typography>
                  
                  <Box sx={{ fontSize: '0.75rem' }}>
                    {/* Lists */}
                    <Typography variant="subtitle2" sx={{ mb: 1, color: '#2c3e50', fontSize: '0.8rem', fontWeight: 600 }}>
                      Lists
                    </Typography>
                    <Box sx={{ mb: 2, ml: 1 }}>
                      <Box sx={{ mb: 1 }}>
                        <code style={{ background: '#e8f8e8', padding: '1px 3px', borderRadius: '2px', fontSize: '0.55rem' }}>&lt;ul&gt;&lt;li&gt;item&lt;/li&gt;&lt;/ul&gt;</code>
                        <Typography variant="caption" sx={{ display: 'block', color: '#666', mt: 0.3, fontSize: '0.65rem' }}>
                          Bulleted list
                        </Typography>
                      </Box>
                      <Box sx={{ mb: 1 }}>
                        <code style={{ background: '#e8f8e8', padding: '1px 3px', borderRadius: '2px', fontSize: '0.55rem' }}>&lt;ol&gt;&lt;li&gt;item&lt;/li&gt;&lt;/ol&gt;</code>
                        <Typography variant="caption" sx={{ display: 'block', color: '#666', mt: 0.3, fontSize: '0.65rem' }}>
                          Numbered list
                        </Typography>
                      </Box>
                    </Box>
                    
                    {/* Colors */}
                    <Typography variant="subtitle2" sx={{ mb: 1, color: '#2c3e50', fontSize: '0.8rem', fontWeight: 600 }}>
                      Colors
                    </Typography>
                    <Box sx={{ mb: 2, ml: 1 }}>
                      <Box sx={{ mb: 1 }}>
                        <code style={{ background: '#e8f8e8', padding: '1px 3px', borderRadius: '2px', fontSize: '0.55rem' }}>&lt;font color="red"&gt;text&lt;/font&gt;</code>
                        <Typography variant="caption" sx={{ display: 'block', color: '#666', mt: 0.3, fontSize: '0.65rem' }}>
                          Colored text
                        </Typography>
                      </Box>
                    </Box>
                      {/* Example */}
                    <Typography variant="subtitle2" sx={{ mb: 1, color: '#2c3e50', fontSize: '0.8rem', fontWeight: 600 }}>
                      Example
                    </Typography>
                    <Box sx={{ 
                      background: '#f8f9fa', 
                      p: 1.5, 
                      borderRadius: 1, 
                      border: '1px solid #ddd',
                      mb: 1,
                      wordBreak: 'break-word'
                    }}>
                      <Typography variant="caption" sx={{ 
                        fontFamily: 'monospace', 
                        fontSize: '0.65rem', 
                        lineHeight: 1.4,
                        display: 'block',
                        whiteSpace: 'pre-wrap'
                      }}>
                        &lt;b&gt;Notice:&lt;/b&gt;&lt;br&gt;{'\n'}Please &lt;i&gt;review&lt;/i&gt; the new policy.
                      </Typography>
                    </Box>
                  </Box>
                </Paper>
              </Box>
            </Box>
          </Box>
        </Box>
      </Paper>
    </Box>
  );
}

export default AnnouncementsPage;
