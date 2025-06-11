import React, { createContext, useContext, useState } from 'react';

const AnnouncementContext = createContext();

export const useAnnouncements = () => {
  const context = useContext(AnnouncementContext);
  if (!context) {
    throw new Error('useAnnouncements must be used within an AnnouncementProvider');
  }
  return context;
};

export const AnnouncementProvider = ({ children }) => {
  const [announcements, setAnnouncements] = useState([
    {
      id: 1,
      header: 'Welcome to Our Patient Portal',
      message: 'Welcome to our patient portal! We are excited to serve you and provide the best healthcare experience. Please explore all the features available to you.',
      attachments: [],
      isActive: true
    },
    {
      id: 2,
      header: 'Updated Office Hours',
      message: 'Please note our updated office hours effective immediately:<br/><br/><strong>Monday - Friday:</strong> 8:00 AM - 5:00 PM<br/><strong>Saturday:</strong> 9:00 AM - 1:00 PM<br/><strong>Sunday:</strong> Closed<br/><br/>Emergency services are available 24/7.',
      attachments: [],
      isActive: true
    },
    {
      id: 3,
      header: 'Important Appointment Reminder',
      message: 'Please remember:<br/>• Arrive <strong>15 minutes early</strong> for your appointment<br/>• Bring a valid photo ID<br/>• Bring your insurance card<br/>• Update your emergency contact information<br/><br/>Thank you for helping us serve you better!',
      attachments: [],
      isActive: true
    }
  ]);

  const updateAnnouncement = (id, updatedData) => {
    setAnnouncements(prev => 
      prev.map(announcement => 
        announcement.id === id 
          ? { ...announcement, ...updatedData }
          : announcement
      )
    );
  };

  const value = {
    announcements,
    setAnnouncements,
    updateAnnouncement
  };

  return (
    <AnnouncementContext.Provider value={value}>
      {children}
    </AnnouncementContext.Provider>
  );
};
