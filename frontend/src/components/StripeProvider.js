import React from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';

// Initialize Stripe with error handling
const stripePublishableKey = process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY;

// Temporarily disable Stripe to avoid loading errors
const STRIPE_TEMPORARILY_DISABLED = false;

console.log('🔧 Stripe configuration:', {
  temporarilyDisabled: STRIPE_TEMPORARILY_DISABLED,
  keyPresent: !!stripePublishableKey,
  keyFormat: stripePublishableKey ? `${stripePublishableKey.substring(0, 10)}...` : 'Not set'
});

let stripePromise;

if (STRIPE_TEMPORARILY_DISABLED) {
  console.log('🚫 Stripe temporarily disabled');
  stripePromise = Promise.resolve(null);
} else if (stripePublishableKey) {
  try {
    stripePromise = loadStripe(stripePublishableKey);
  } catch (error) {
    console.error('❌ Failed to load Stripe:', error);
    stripePromise = Promise.resolve(null);
  }
} else {
  console.error('❌ REACT_APP_STRIPE_PUBLISHABLE_KEY is not set in environment variables');
  stripePromise = Promise.resolve(null);
}

const StripeProvider = ({ children }) => {
  if (!stripePublishableKey) {
    console.warn('⚠️ Stripe not configured. Payment features will be disabled.');
    return (
      <div>
        <div style={{ 
          padding: '16px', 
          backgroundColor: '#fff3cd', 
          border: '1px solid #ffeaa7', 
          borderRadius: '4px',
          marginBottom: '16px',
          color: '#856404'
        }}>
          ⚠️ Payment features are currently unavailable. Stripe configuration needed.
        </div>
        {children}
      </div>
    );
  }

  return (
    <Elements stripe={stripePromise}>
      {children}
    </Elements>
  );
};

export default StripeProvider;
