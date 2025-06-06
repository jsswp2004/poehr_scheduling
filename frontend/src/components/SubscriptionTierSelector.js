import React from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Chip,
  Grid,
  Paper
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import StarIcon from '@mui/icons-material/Star';

const SUBSCRIPTION_TIERS = {
  basic: {
    name: 'Personal',
    price: 19.99,
    popular: false,
    features: [
      'Up to 50 appointments per month',
      'Basic scheduling',
      'Email notifications',
      'Mobile app access'
    ]
  },
  premium: {
    name: 'Clinic',
    price: 49.99,
    popular: true,
    features: [
      'Unlimited appointments',
      'Advanced scheduling',
      'SMS + Email notifications',
      'Calendar integrations',
      'Custom branding',
      'Analytics dashboard'
    ]
  },
  enterprise: {
    name: 'Group',
    price: 129.99,
    popular: false,
    features: [
      'Everything in Premium',
      'Multi-location support',
      'API access',
      'Custom integrations',
      'Priority support',
      'Advanced reporting'
    ]
  }
};

const SubscriptionTierSelector = ({ selectedTier, onTierSelect, disabled = false }) => {
  return (
    <Box>
      <Typography variant="h6" align="center" sx={{ mb: 1, fontWeight: 600 }}>
        Choose Your Plan
      </Typography>
      
      <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 3 }}>
        Start with a 7-day free trial. No charges until day 8.
      </Typography>

      <Grid container spacing={2} justifyContent="center">
        {Object.entries(SUBSCRIPTION_TIERS).map(([tierKey, tier]) => (
          <Grid item xs={12} sm={6} md={4} key={tierKey}>
            <Card
              sx={{
                position: 'relative',
                height: '100%',
                cursor: disabled ? 'default' : 'pointer',
                border: selectedTier === tierKey ? 2 : 1,
                borderColor: selectedTier === tierKey ? 'primary.main' : 'divider',
                transform: selectedTier === tierKey ? 'scale(1.02)' : 'scale(1)',
                transition: 'all 0.2s ease-in-out',
                '&:hover': disabled ? {} : {
                  transform: 'scale(1.02)',
                  boxShadow: 4
                },
                opacity: disabled ? 0.7 : 1
              }}
              onClick={() => !disabled && onTierSelect(tierKey)}
            >
              {tier.popular && (
                <Chip
                  icon={<StarIcon />}
                  label="Most Popular"
                  color="primary"
                  size="small"
                  sx={{
                    position: 'absolute',
                    top: -8,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    zIndex: 1
                  }}
                />
              )}
              
              <CardContent sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <Box sx={{ textAlign: 'center', mb: 2 }}>
                  <Typography variant="h6" component="h3" fontWeight="bold">
                    {tier.name}
                  </Typography>
                  
                  <Box display="flex" alignItems="baseline" justifyContent="center" sx={{ mt: 1 }}>
                    <Typography variant="h4" component="span" fontWeight="bold" color="primary">
                      ${tier.price}
                    </Typography>
                    <Typography variant="body1" color="text.secondary" sx={{ ml: 0.5 }}>
                      /month
                    </Typography>
                  </Box>
                  
                  <Paper 
                    elevation={0} 
                    sx={{ 
                      backgroundColor: 'success.light', 
                      color: 'success.contrastText',
                      px: 1, 
                      py: 0.5, 
                      mt: 1,
                      borderRadius: 1
                    }}
                  >
                    <Typography variant="caption" fontWeight="medium">
                      7 Days Free Trial
                    </Typography>
                  </Paper>
                </Box>

                <List dense sx={{ flexGrow: 1 }}>
                  {tier.features.map((feature, index) => (
                    <ListItem key={index} sx={{ px: 0, py: 0.5 }}>
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        <CheckCircleIcon color="success" fontSize="small" />
                      </ListItemIcon>
                      <ListItemText 
                        primary={feature}
                        primaryTypographyProps={{ 
                          variant: 'body2',
                          fontSize: '0.875rem'
                        }}
                      />
                    </ListItem>
                  ))}
                </List>

                <Button
                  variant={selectedTier === tierKey ? "contained" : "outlined"}
                  fullWidth
                  sx={{ mt: 2 }}
                  disabled={disabled}
                >
                  {selectedTier === tierKey ? "Selected" : "Select Plan"}
                </Button>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {selectedTier && (
        <Box sx={{ mt: 3, p: 2, backgroundColor: 'action.hover', borderRadius: 1 }}>
          <Typography variant="body2" color="text.secondary" align="center">
            <strong>Selected:</strong> {SUBSCRIPTION_TIERS[selectedTier].name} - 
            ${SUBSCRIPTION_TIERS[selectedTier].price}/month after 7-day free trial
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default SubscriptionTierSelector;
export { SUBSCRIPTION_TIERS };
