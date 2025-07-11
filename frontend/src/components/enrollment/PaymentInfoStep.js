import React from 'react';
import PaymentMethodForm from '../PaymentMethodForm';

/**
 * PaymentInfoStep Component
 * Step 3 of enrollment - Payment method information
 */
const PaymentInfoStep = React.forwardRef(({
    onPaymentMethodReady,
    loading,
    error
}, ref) => {
    return (
        <PaymentMethodForm
            ref={ref}
            onPaymentMethodReady={onPaymentMethodReady}
            loading={loading}
            error={error}
        />
    );
});

PaymentInfoStep.displayName = 'PaymentInfoStep';

export default PaymentInfoStep;
