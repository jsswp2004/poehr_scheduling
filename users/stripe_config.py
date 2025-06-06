# Stripe Configuration
from django.conf import settings
import stripe

# Set Stripe API key
stripe.api_key = getattr(settings, 'STRIPE_SECRET_KEY', '')

# Subscription tier configuration
SUBSCRIPTION_TIERS = {    'basic': {
        'name': 'Basic Plan',
        'price_id': getattr(settings, 'STRIPE_BASIC_PRICE_ID', ''),
        'price': 19.99,
        'features': [
            'Up to 50 appointments per month',
            'Basic scheduling',
            'Email notifications',
            'Mobile app access'
        ]
    },
    'premium': {
        'name': 'Premium Plan', 
        'price_id': getattr(settings, 'STRIPE_PREMIUM_PRICE_ID', ''),
        'price': 49.99,
        'features': [
            'Unlimited appointments',
            'Advanced scheduling',
            'SMS + Email notifications',
            'Calendar integrations',
            'Custom branding',
            'Analytics dashboard'
        ]
    },
    'enterprise': {
        'name': 'Enterprise Plan',
        'price_id': getattr(settings, 'STRIPE_ENTERPRISE_PRICE_ID', ''),
        'price': 129.99,
        'features': [
            'Everything in Premium',
            'Multi-location support',
            'API access',
            'Custom integrations',
            'Priority support',
            'Advanced reporting'
        ]
    }
}

# Trial configuration
TRIAL_PERIOD_DAYS = 7

def get_tier_info(tier_name):
    """Get tier information by name"""
    return SUBSCRIPTION_TIERS.get(tier_name, SUBSCRIPTION_TIERS['basic'])

def get_all_tiers():
    """Get all available subscription tiers"""
    return SUBSCRIPTION_TIERS
