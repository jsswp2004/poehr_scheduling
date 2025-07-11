import React from 'react';
import {
    Stack,
    TextField,
    MenuItem
} from '@mui/material';

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
                <MenuItem value="personal">Personal</MenuItem>
                <MenuItem value="clinic">Clinic</MenuItem>
                <MenuItem value="group">Group</MenuItem>
            </TextField>
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
