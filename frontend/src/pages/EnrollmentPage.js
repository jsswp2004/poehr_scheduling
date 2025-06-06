import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import Header from '../components/Header';
import Footer from '../components/Footer';
import StripeProvider from '../components/StripeProvider';
import SubscriptionTierSelector from '../components/SubscriptionTierSelector';
import PaymentMethodForm from '../components/PaymentMethodForm';
import { 
  Container, 
  Paper, 
  Typography, 
  TextField, 
  Button, 
  Stack, 
  MenuItem, 
  Alert, 
  Box,
  Stepper,
  Step,
  StepLabel,
  Divider
} from '@mui/material';
import { useNavigate, useSearchParams } from 'react-router-dom';

function EnrollmentPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const paymentFormRef = useRef();
  
  // Get parameters from URL
  const urlPlan = searchParams.get('plan'); // 'personal', 'clinic', 'group'
  const urlTier = searchParams.get('tier'); // 'basic', 'premium', 'enterprise'
  
  // Map URL parameters to form values
  const getInitialOrgType = () => {
    if (urlPlan) {
      switch (urlPlan.toLowerCase()) {
        case 'personal': return 'personal';
        case 'clinic': return 'clinic';
        case 'group': return 'group';
        default: return 'personal';
      }
    }
    return 'personal';
  };
  
  const getInitialTier = () => {
    if (urlTier) {
      switch (urlTier.toLowerCase()) {
        case 'basic': return 'basic';
        case 'premium': return 'premium';
        case 'enterprise': return 'enterprise';
        default: return 'premium';
      }
    }
    // If plan is specified but tier isn't, map plan to default tier
    if (urlPlan) {
      switch (urlPlan.toLowerCase()) {
        case 'personal': return 'basic';
        case 'clinic': return 'premium';
        case 'group': return 'enterprise';
        default: return 'premium';
      }
    }
    return 'premium';
  };
  
  // Multi-step form state
  const [currentStep, setCurrentStep] = useState(0);
  const steps = ['Account Details', 'Choose Plan', 'Payment Info', 'Confirmation'];
  
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    first_name: '',
    last_name: '',
    phone_number: '',
    organization_name: '',
    organization_type: getInitialOrgType(),
    subscription_tier: getInitialTier(),
  });
  
  const [status, setStatus] = useState({ type: '', message: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentMethodReady, setPaymentMethodReady] = useState(false);
  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleTierSelect = (tier) => {
    setFormData({
      ...formData,
      subscription_tier: tier,
    });
  };

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setStatus({ type: '', message: '' });
    
    try {
      // Step 1: Create payment method if we're on the payment step
      let paymentMethodId = null;
      if (paymentFormRef.current) {
        const paymentMethod = await paymentFormRef.current.createPaymentMethod();
        paymentMethodId = paymentMethod.id;
      }

      // Step 2: Register user with subscription info
      const registrationData = {
        ...formData,
        payment_method_id: paymentMethodId
      };

      const response = await axios.post('http://127.0.0.1:8000/api/auth/register/', registrationData);
      
      setStatus({ 
        type: 'success', 
        message: `Enrollment successful! Your ${formData.subscription_tier} plan trial has started. Redirecting to login...` 
      });
      
      // Redirect to login after showing success message
      setTimeout(() => {
        navigate('/login');
      }, 3000);
      
    } catch (err) {
      console.error('Enrollment failed:', err);
      let errorMessage = 'Enrollment failed. Please try again.';
      
      // Extract specific error messages from the response
      if (err.response?.data) {
        const errors = err.response.data;
        if (typeof errors === 'object') {
          const errorMessages = Object.entries(errors)
            .map(([field, messages]) => `${field}: ${Array.isArray(messages) ? messages.join(', ') : messages}`)
            .join('; ');
          errorMessage = `Enrollment failed: ${errorMessages}`;
        } else if (typeof errors === 'string') {
          errorMessage = `Enrollment failed: ${errors}`;
        }
      }
      
      setStatus({ type: 'error', message: errorMessage });
      
    } finally {
      setIsSubmitting(false);
    }  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 0: // Account Details
        return (
          <Stack spacing={2}>
            <TextField
              label="Organization Name"
              name="organization_name"
              value={formData.organization_name}
              onChange={handleChange}
              required
              size="small"
            />
            <TextField
              select
              label="Organization Type"
              name="organization_type"
              value={formData.organization_type}
              onChange={handleChange}
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
              onChange={handleChange} 
              required 
              size="small" 
            />
            <TextField 
              label="Last Name" 
              name="last_name" 
              value={formData.last_name} 
              onChange={handleChange} 
              required 
              size="small" 
            />
            <TextField 
              label="Username" 
              name="username" 
              value={formData.username} 
              onChange={handleChange} 
              required 
              size="small" 
            />
            <TextField 
              label="Email" 
              type="email" 
              name="email" 
              value={formData.email} 
              onChange={handleChange} 
              required 
              size="small" 
            />
            <TextField 
              label="Phone Number" 
              name="phone_number" 
              value={formData.phone_number} 
              onChange={handleChange} 
              size="small" 
            />
            <TextField 
              label="Password" 
              type="password" 
              name="password" 
              value={formData.password} 
              onChange={handleChange} 
              required 
              size="small" 
            />
          </Stack>
        );

      case 1: // Choose Plan
        return (
          <SubscriptionTierSelector
            selectedTier={formData.subscription_tier}
            onTierSelect={handleTierSelect}
            disabled={isSubmitting}
          />
        );

      case 2: // Payment Info
        return (
          <PaymentMethodForm
            ref={paymentFormRef}
            onPaymentMethodReady={setPaymentMethodReady}
            loading={isSubmitting}
            error={status.type === 'error' ? status.message : null}
          />
        );

      case 3: // Confirmation
        return (
          <Box>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
              Review Your Information
            </Typography>
            
            <Stack spacing={2}>
              <Box>
                <Typography variant="subtitle2" color="text.secondary">Organization</Typography>
                <Typography>{formData.organization_name} ({formData.organization_type})</Typography>
              </Box>
              
              <Box>
                <Typography variant="subtitle2" color="text.secondary">Account</Typography>
                <Typography>{formData.first_name} {formData.last_name}</Typography>
                <Typography variant="body2" color="text.secondary">{formData.email}</Typography>
              </Box>
              
              <Box>
                <Typography variant="subtitle2" color="text.secondary">Selected Plan</Typography>
                <Typography>{formData.subscription_tier.charAt(0).toUpperCase() + formData.subscription_tier.slice(1)} Plan</Typography>
                <Typography variant="body2" color="text.secondary">7-day free trial, then monthly billing</Typography>
              </Box>
            </Stack>
          </Box>
        );

      default:
        return null;
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 0:
        return formData.organization_name && formData.first_name && formData.last_name && 
               formData.username && formData.email && formData.password;
      case 1:
        return formData.subscription_tier;
      case 2:
        return paymentMethodReady;
      case 3:
        return true;
      default:
        return false;
    }
  };

  return (
    <StripeProvider>
      <div className="enrollment-page">
        <Header />
        <Container maxWidth="md" sx={{ my: 4 }}>
          <Paper elevation={4} sx={{ p: 4 }}>
            <Typography variant="h5" sx={{ mb: 3, fontWeight: 700, textAlign: 'center' }}>
              Create Your Account
            </Typography>

            {/* Progress Stepper */}
            <Stepper activeStep={currentStep} sx={{ mb: 4 }}>
              {steps.map((label) => (
                <Step key={label}>
                  <StepLabel>{label}</StepLabel>
                </Step>
              ))}
            </Stepper>

            {/* Status Alert */}
            {status.message && (
              <Box sx={{ mb: 3 }}>
                <Alert 
                  severity={status.type} 
                  sx={{ 
                    borderRadius: 1,
                    '& .MuiAlert-message': {
                      fontWeight: 500
                    }
                  }}
                >
                  {status.message}
                </Alert>
              </Box>
            )}

            {/* Step Content */}
            <Box sx={{ mb: 4 }}>
              {renderStepContent()}
            </Box>

            <Divider sx={{ mb: 3 }} />

            {/* Navigation Buttons */}
            <Box display="flex" justifyContent="space-between">
              <Button
                onClick={handleBack}
                disabled={currentStep === 0 || isSubmitting}
                variant="outlined"
              >
                Back
              </Button>

              {currentStep === steps.length - 1 ? (
                <Button
                  onClick={handleSubmit}
                  disabled={!canProceed() || isSubmitting}
                  variant="contained"
                  sx={{
                    backgroundColor: status.type === 'success' ? 'success.main' : 'primary.main',
                    '&:hover': {
                      backgroundColor: status.type === 'success' ? 'success.dark' : 'primary.dark',
                    }
                  }}
                >
                  {isSubmitting ? 'Creating Account...' : status.type === 'success' ? 'Success!' : 'Complete Enrollment'}
                </Button>
              ) : (
                <Button
                  onClick={handleNext}
                  disabled={!canProceed() || isSubmitting}
                  variant="contained"
                >
                  Next
                </Button>
              )}
            </Box>
          </Paper>
        </Container>
        <Footer pricingLink="/pricing" featuresLink="/features" />
      </div>
    </StripeProvider>
  );
}

export default EnrollmentPage;
