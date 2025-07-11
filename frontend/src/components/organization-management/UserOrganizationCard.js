/**
 * UserOrganizationCard component - Displays the current user's organization
 */
import React from 'react';
import {
  Paper,
  Box,
  Typography,
  Avatar,
  Stack,
  Chip,
} from '@mui/material';
import { Business } from '@mui/icons-material';
import { getLogoUrl } from '../../utils/organization/organizationUtils';

const UserOrganizationCard = ({ userOrganization, currentUser }) => {
  if (!userOrganization) {
    return (
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Your Organization
        </Typography>
        <Typography color="text.secondary">
          No organization assigned to your account.
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: 3, mb: 3 }}>
      <Typography variant="h6" gutterBottom>
        Your Organization
      </Typography>
      
      <Stack direction="row" spacing={2} alignItems="center">
        <Avatar
          src={getLogoUrl(userOrganization.logo)}
          sx={{ width: 60, height: 60 }}
        >
          <Business />
        </Avatar>
        
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h6">
            {userOrganization.name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Organization ID: {userOrganization.id}
          </Typography>
          {currentUser && (
            <Chip
              label={`Role: ${currentUser.role}`}
              size="small"
              color="primary"
              sx={{ mt: 1 }}
            />
          )}
        </Box>
      </Stack>
    </Paper>
  );
};

export default UserOrganizationCard;
