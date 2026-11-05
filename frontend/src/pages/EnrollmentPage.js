import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../config/api';
import Header from '../components/Header';
import Footer from '../components/Footer';
import StripeProvider from '../components/StripeProvider';
import ServicesPicker from '../components/enrollment/ServicesPicker';
import { formatMoney, planMonthlyTotal, pricedModules, userLimitLabel } from '../utils/modulePricing';
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
import { US_STATES } from '../constants/usStates';

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
  const steps = ['Account Details', 'Plan and Services', 'Payment Info', 'Confirmation'];

  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    first_name: '',
    last_name: '',
    phone_number: '',
    organization_name: '',
    organization_type: getInitialOrgType(),
    address_line1: '',
    city: '',
    state: '',
    postal_code: '',
    subscription_tier: getInitialTier(),
    modules: [],
  });

  // Plans and services come from the server so prices and names are never out of step with billing.
  const [catalog, setCatalog] = useState({ plans: [], modules: [], planPricing: null });
  const [catalogError, setCatalogError] = useState('');
  useEffect(() => {
    let alive = true;
    axios.get(`${API_BASE_URL}/api/users/modules/`)
      .then((r) => { if (alive) setCatalog({ plans: r.data.plans, modules: r.data.modules, planPricing: r.data.pricing?.plans || null }); })
      .catch(() => { if (alive) setCatalogError('Could not load plans and services. Please refresh the page.'); });
    return () => { alive = false; };
  }, []);

  const handleModuleToggle = (code) => {
    setFormData((prev) => ({
      ...prev,
      modules: prev.modules.includes(code) ? prev.modules.filter((c) => c !== code) : [...prev.modules, code],
    }));
  };

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
      }      // Step 2: Register user with subscription info
      const registrationData = {
        ...formData,
        payment_method_id: paymentMethodId,
        is_enrollment: true  // Flag to indicate this is service enrollment, not patient registration
      };

      const response = await axios.post(`${API_BASE_URL}/api/auth/register/`, registrationData);

      setStatus({
        type: 'success',
        message: `Enrollment successful! Your 7-day free trial has started. Redirecting to login...`
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
    }
  };

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
              <MenuItem value="personal">Professional</MenuItem>
              <MenuItem value="clinic">Clinic</MenuItem>
              <MenuItem value="group">Group</MenuItem>
            </TextField>
            <TextField
              label="Clinic Address"
              name="address_line1"
              value={formData.address_line1 || ''}
              onChange={handleChange}
              size="small"
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="City"
                name="city"
                value={formData.city || ''}
                onChange={handleChange}
                size="small"
                fullWidth
              />
              <TextField
                select
                label="State"
                name="state"
                value={formData.state || ''}
                onChange={handleChange}
                size="small"
                sx={{ minWidth: { sm: 150 } }}
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
                onChange={handleChange}
                size="small"
                sx={{ minWidth: { sm: 110 } }}
              />
            </Stack>
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
          catalogError ? (
            <Alert severity="error">{catalogError}</Alert>
          ) : (
            <ServicesPicker
              plans={catalog.plans}
              planPricing={catalog.planPricing}
              modules={catalog.modules}
              plan={formData.subscription_tier}
              onPlan={handleTierSelect}
              selected={formData.modules}
              onToggle={handleModuleToggle}
              disabled={isSubmitting}
            />
          )
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
                {(() => {
                  const plan = catalog.plans.find((p) => p.key === formData.subscription_tier);
                  return <Typography>{plan ? `${plan.label} (${userLimitLabel(plan.user_limit)})` : formData.subscription_tier}</Typography>;
                })()}
                <Typography variant="body2" color="text.secondary">
                  {pricedModules(formData.modules, catalog.modules).length} service(s) chosen,{' '}
                  {(() => {
                    const total = planMonthlyTotal(formData.modules, catalog.modules, catalog.planPricing, formData.subscription_tier);
                    return total === null ? 'priced by a quote' : `${formatMoney(total)}/month`;
                  })()}{' '}after the 7-day free trial
                </Typography>
                {formData.modules.map((c) => (
                  <Typography key={c} variant="body2" color="text.secondary">
                    {catalog.modules.find((m) => m.code === c)?.label}
                  </Typography>
                ))}
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
        return formData.subscription_tier && formData.modules.length > 0 && !catalogError;
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
        <Container maxWidth="md" sx={{ my: { xs: 2, sm: 4 }, px: { xs: 1.5, sm: 3 } }}>
          <Paper elevation={4} sx={{ p: { xs: 2, sm: 4 } }}>
            <Typography variant="h5" sx={{ mb: 3, fontWeight: 700, textAlign: 'center' }}>
              Create Your Account
            </Typography>

            {/* Progress Stepper */}
            <Stepper
              activeStep={currentStep}
              alternativeLabel
              sx={{ mb: 4, '& .MuiStepLabel-label': { fontSize: { xs: '0.75rem', sm: '0.875rem' } } }}
            >
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
