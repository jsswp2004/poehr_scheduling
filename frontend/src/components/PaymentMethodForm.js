import React, { useState } from 'react';
import { CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { 
  Box, 
  Typography, 
  Alert, 
  CircularProgress,
  Paper
} from '@mui/material';

const CARD_ELEMENT_OPTIONS = {
  style: {
    base: {
      fontSize: '16px',
      color: '#424770',
      '::placeholder': {
        color: '#aab7c4',
      },
      fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    },
    invalid: {
      color: '#9e2146',
    },
  },
  hidePostalCode: false,
};

const PaymentMethodForm = ({ onPaymentMethodReady, loading = false, error = null }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [cardError, setCardError] = useState(null);
  const [cardComplete, setCardComplete] = useState(false);

  const handleCardChange = (event) => {
    setCardError(event.error ? event.error.message : null);
    setCardComplete(event.complete);
    
    // Notify parent component about card completion status
    if (onPaymentMethodReady) {
      onPaymentMethodReady(event.complete && !event.error);
    }
  };

  const createPaymentMethod = async () => {
    if (!stripe || !elements) {
      throw new Error('Stripe not loaded');
    }

    const cardElement = elements.getElement(CardElement);
    
    const { error, paymentMethod } = await stripe.createPaymentMethod({
      type: 'card',
      card: cardElement,
    });

    if (error) {
      throw error;
    }

    return paymentMethod;
  };

  // Expose createPaymentMethod to parent component
  React.useImperativeHandle(React.forwardRef(() => null), () => ({
    createPaymentMethod
  }));

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
        Payment Information
      </Typography>
      
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Enter your payment details below. You won't be charged during your 7-day free trial.
      </Typography>
      
      <Paper 
        variant="outlined" 
        sx={{ 
          p: 2, 
          mb: 2,
          backgroundColor: loading ? 'action.disabledBackground' : 'background.paper'
        }}
      >
        <CardElement 
          options={CARD_ELEMENT_OPTIONS}
          onChange={handleCardChange}
          disabled={loading}
        />
      </Paper>

      {/* Card validation error */}
      {cardError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {cardError}
        </Alert>
      )}

      {/* General error */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Loading state */}
      {loading && (
        <Box display="flex" alignItems="center" gap={1} sx={{ mb: 2 }}>
          <CircularProgress size={16} />
          <Typography variant="body2" color="text.secondary">
            Processing payment information...
          </Typography>
        </Box>
      )}

      {/* Success indicator */}
      {cardComplete && !cardError && !loading && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Payment method ready
        </Alert>
      )}
    </Box>
  );
};

// Forward ref version for imperative handle
const PaymentMethodFormWithRef = React.forwardRef((props, ref) => {
  const stripe = useStripe();
  const elements = useElements();
  const [cardError, setCardError] = useState(null);
  const [cardComplete, setCardComplete] = useState(false);

  const handleCardChange = (event) => {
    setCardError(event.error ? event.error.message : null);
    setCardComplete(event.complete);
    
    if (props.onPaymentMethodReady) {
      props.onPaymentMethodReady(event.complete && !event.error);
    }
  };

  const createPaymentMethod = async () => {
    if (!stripe || !elements) {
      throw new Error('Stripe not loaded');
    }

    const cardElement = elements.getElement(CardElement);
    
    const { error, paymentMethod } = await stripe.createPaymentMethod({
      type: 'card',
      card: cardElement,
    });

    if (error) {
      throw error;
    }

    return paymentMethod;
  };

  React.useImperativeHandle(ref, () => ({
    createPaymentMethod
  }));

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
        Payment Information
      </Typography>
      
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Enter your payment details below. You won't be charged during your 7-day free trial.
      </Typography>
      
      <Paper 
        variant="outlined" 
        sx={{ 
          p: 2, 
          mb: 2,
          backgroundColor: props.loading ? 'action.disabledBackground' : 'background.paper'
        }}
      >
        <CardElement 
          options={CARD_ELEMENT_OPTIONS}
          onChange={handleCardChange}
          disabled={props.loading}
        />
      </Paper>

      {cardError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {cardError}
        </Alert>
      )}

      {props.error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {props.error}
        </Alert>
      )}

      {props.loading && (
        <Box display="flex" alignItems="center" gap={1} sx={{ mb: 2 }}>
          <CircularProgress size={16} />
          <Typography variant="body2" color="text.secondary">
            Processing payment information...
          </Typography>
        </Box>
      )}

      {cardComplete && !cardError && !props.loading && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Payment method ready
        </Alert>
      )}
    </Box>
  );
});

PaymentMethodFormWithRef.displayName = 'PaymentMethodForm';

export default PaymentMethodFormWithRef;
