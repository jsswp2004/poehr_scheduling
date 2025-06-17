import { useState, useEffect } from 'react';
import {
  Autocomplete,
  TextField,
  Chip,
  Box,
  Typography,
  CircularProgress
} from '@mui/material';
import axios from 'axios';

function OrganizationSelector({ selectedOrganizations, onSelectionChange, userRole }) {
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchOrganizations = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const response = await axios.get('http://127.0.0.1:8000/api/users/organizations/', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Add "All Organizations" option at the beginning
      const allOption = { id: 'all', name: 'All Organizations' };
      setOrganizations([allOption, ...response.data]);
    } catch (error) {
      console.error('Error fetching organizations:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrganizations();
  }, []);

  // Only show for system administrators
  if (userRole !== 'system_admin') {
    return null;
  }

  const handleSelectionChange = (event, newValue) => {
    // If "All Organizations" is selected, clear other selections
    if (newValue.some(org => org.id === 'all')) {
      if (selectedOrganizations.some(org => org.id === 'all')) {
        // If "All" was already selected and user clicked something else, 
        // remove "All" and keep the new selection
        onSelectionChange(newValue.filter(org => org.id !== 'all'));
      } else {
        // If "All" is newly selected, select only "All"
        onSelectionChange([{ id: 'all', name: 'All Organizations' }]);
      }
    } else {
      onSelectionChange(newValue);
    }
  };

  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.secondary' }}>
        Target Organizations
      </Typography>
      <Autocomplete
        multiple
        options={organizations}
        getOptionLabel={(option) => option.name}
        value={selectedOrganizations}
        onChange={handleSelectionChange}
        loading={loading}
        renderInput={(params) => (
          <TextField
            {...params}
            placeholder="Select organizations..."
            helperText="Choose which organizations to send messages to"
            InputProps={{
              ...params.InputProps,
              endAdornment: (
                <>
                  {loading ? <CircularProgress color="inherit" size={20} /> : null}
                  {params.InputProps.endAdornment}
                </>
              ),
            }}
          />
        )}
        renderTags={(tagValue, getTagProps) =>
          tagValue.map((option, index) => (
            <Chip
              label={option.name}
              {...getTagProps({ index })}
              key={option.id}
              size="small"
              color={option.id === 'all' ? 'primary' : 'default'}
            />
          ))
        }
        renderOption={(props, option) => (
          <Box component="li" {...props} key={option.id}>
            <Typography
              variant="body2"
              sx={{
                fontWeight: option.id === 'all' ? 'bold' : 'normal',
                color: option.id === 'all' ? 'primary.main' : 'inherit'
              }}
            >
              {option.name}
            </Typography>
          </Box>
        )}
        isOptionEqualToValue={(option, value) => option.id === value.id}
        disableCloseOnSelect
        fullWidth
      />
    </Box>
  );
}

export default OrganizationSelector;
