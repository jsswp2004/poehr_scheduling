import React from 'react';
import {
    Stack,
    TextField,
    MenuItem
} from '@mui/material';
import { US_STATES } from '../../constants/usStates';

/**
 * AccountDetailsStep Component
 * Step 1 of enrollment - Account and organization details
 */
const AccountDetailsStep = ({
    formData,
    onChange
}) => {
    return (
        <Stack spacing={2}>
            <TextField
                label="Organization Name"
                name="organization_name"
                value={formData.organization_name}
                onChange={onChange}
                required
                size="small"
            />
            <TextField
                select
                label="Organization Type"
                name="organization_type"
                value={formData.organization_type}
                onChange={onChange}
                required
                size="small"
            >
                <MenuItem value="personal">Professional</MenuItem>
                <MenuItem value="clinic">Clinic</MenuItem>
                <MenuItem value="group">Group</MenuItem>
            </TextField>
            <TextField
              label="Clinic Address"
              name="address_line1"
              value={formData.address_line1 || ''}
              onChange={onChange}
              size="small"
            />
            <Stack direction="row" spacing={2}>
              <TextField
                label="City"
                name="city"
                value={formData.city || ''}
                onChange={onChange}
                size="small"
                fullWidth
              />
              <TextField
                select
                label="State"
                name="state"
                value={formData.state || ''}
                onChange={onChange}
                size="small"
                sx={{ minWidth: 150 }}
                helperText="Sets the staffing rules that apply"
              >
                <MenuItem value="">Select</MenuItem>
                {US_STATES.map((s) => (
                  <MenuItem key={s.code} value={s.code}>
                    {s.name}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="ZIP"
                name="postal_code"
                value={formData.postal_code || ''}
                onChange={onChange}
                size="small"
                sx={{ minWidth: 110 }}
              />
            </Stack>
            <TextField
                label="First Name"
                name="first_name"
                value={formData.first_name}
                onChange={onChange}
                required
                size="small"
            />
            <TextField
                label="Last Name"
                name="last_name"
                value={formData.last_name}
                onChange={onChange}
                required
                size="small"
            />
            <TextField
                label="Username"
                name="username"
                value={formData.username}
                onChange={onChange}
                required
                size="small"
            />
            <TextField
                label="Email"
                type="email"
                name="email"
                value={formData.email}
                onChange={onChange}
                required
                size="small"
            />
            <TextField
                label="Phone Number"
                name="phone_number"
                value={formData.phone_number}
                onChange={onChange}
                size="small"
            />
            <TextField
                label="Password"
                type="password"
                name="password"
                value={formData.password}
                onChange={onChange}
                required
                size="small"
            />
        </Stack>
    );
};

export default AccountDetailsStep;
