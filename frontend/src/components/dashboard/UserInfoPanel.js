import React from "react";
import {
  Box,
  Stack,
  Typography,
  TextField,
  Button,
  Paper,
  Chip,
  FormControlLabel,
  Checkbox,
  IconButton,
  Divider,
  Grid,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import SaveIcon from "@mui/icons-material/Save";
import CancelIcon from "@mui/icons-material/Cancel";
import PhoneIcon from "@mui/icons-material/Phone";
import EmailIcon from "@mui/icons-material/Email";

/**
 * User information panel component
 */
const UserInfoPanel = ({
  currentUser,
  phoneEditing,
  smsConsentEditing,
  tempPhoneNumber,
  tempSmsConsent,
  onPhoneEdit,
  onPhoneCancel,
  onPhoneSave,
  onSmsConsentEdit,
  onSmsConsentCancel,
  onSmsConsentSave,
  onTempPhoneChange,
  onTempSmsConsentChange,
}) => {
  // Debug logging
  console.log('👤 UserInfoPanel currentUser:', currentUser);
  console.log('📧 Email:', currentUser?.email);
  console.log('📱 Phone:', currentUser?.phone_number);

  if (!currentUser) {
    return (
      <Paper elevation={2} sx={{ padding: 3 }}>
        <Typography variant="body1">Loading user information...</Typography>
      </Paper>
    );
  }

  return (
    <Stack spacing={3}>
      <Typography variant="h6">My Information</Typography>

      {/* User Details Section */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Profile Information
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <TextField
              label="First Name"
              value={currentUser.first_name || ""}
              fullWidth
              disabled
              variant="outlined"
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              label="Last Name"
              value={currentUser.last_name || ""}
              fullWidth
              disabled
              variant="outlined"
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              label="Email"
              value={currentUser.email || ""}
              fullWidth
              disabled
              variant="outlined"
              helperText={`Debug: email value is "${currentUser.email || "EMPTY"}"`}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <Box>
              <TextField
                label="Phone Number"
                value={
                  phoneEditing
                    ? tempPhoneNumber
                    : currentUser.phone_number || ""
                }
                onChange={(e) => onTempPhoneChange(e.target.value)}
                fullWidth
                disabled={!phoneEditing}
                variant="outlined"
                helperText={phoneEditing ? "Enter your phone number" : `Debug: phone value is "${currentUser.phone_number || "EMPTY"}"`}
              />
              <Box sx={{ mt: 1 }}>
                {phoneEditing ? (
                  <Stack direction="row" spacing={1}>
                    <Button
                      size="small"
                      variant="contained"
                      onClick={onPhoneSave}
                      disabled={!tempPhoneNumber.trim()}
                    >
                      Save
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={onPhoneCancel}
                    >
                      Cancel
                    </Button>
                  </Stack>
                ) : (
                  <Button
                    size="small"
                    startIcon={<EditIcon />}
                    onClick={onPhoneEdit}
                  >
                    Edit Phone
                  </Button>
                )}
              </Box>
            </Box>
          </Grid>
        </Grid>
      </Paper>

      {/* SMS Consent Section for Patients */}
      {currentUser.role === "patient" && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Notifications
          </Typography>

          <Box>
            <FormControlLabel
              control={
                <Checkbox
                  checked={
                    smsConsentEditing
                      ? tempSmsConsent
                      : currentUser.sms_consent || false
                  }
                  onChange={(e) => onTempSmsConsentChange(e.target.checked)}
                  disabled={!smsConsentEditing && !phoneEditing}
                />
              }
              label={
                <Box>
                  <Typography variant="body2">
                    {currentUser.sms_consent ? "SMS Enabled" : "SMS Disabled"}
                  </Typography>
                </Box>
              }
            />

            <Box sx={{ mt: 2 }}>
              {smsConsentEditing || phoneEditing ? (
                <Stack direction="row" spacing={1}>
                  <Button
                    size="small"
                    variant="contained"
                    onClick={onSmsConsentSave}
                    disabled={tempSmsConsent && !tempPhoneNumber.trim()}
                  >
                    Save Preferences
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={onSmsConsentCancel}
                  >
                    Cancel
                  </Button>
                </Stack>
              ) : (
                <IconButton size="small" onClick={onSmsConsentEdit}>
                  <EditIcon fontSize="small" />
                </IconButton>
              )}
            </Box>
          </Box>
        </Paper>
      )}
    </Stack>
  );
};

export default UserInfoPanel;
