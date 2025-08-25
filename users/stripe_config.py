# Stripe Configuration
from django.conf import settings
import stripe

# Set Stripe API key
stripe.api_key = getattr(settings, 'STRIPE_SECRET_KEY', '')

# Subscription tier configuration
SUBSCRIPTION_TIERS = {
    'basic': {
        'name': 'Professional Plan',
        'price_id': getattr(settings, 'STRIPE_BASIC_PRICE_ID', ''),
        'price': 49.99,
        'features': [
            'Basic scheduling',
            'Basic calendar view',
            'Email notifications',
            # 'Mobile app access',
            'Basic reporting'
        ]
    },
    'premium': {
        'name': 'Clinic Plan', 
        'price_id': getattr(settings, 'STRIPE_PREMIUM_PRICE_ID', ''),
        'price': 299.99,
        'features': [
            'Everything in Personal',
            'Up to 10 providers',
            'Unlimited appointments',
            'Advanced calendar features',
            'Team collaboration tools',
            'SMS + Email notifications',
            'Bulk SMS notifications',
            'Patient management system',
            'Automated reminders',
            'Advanced reporting & analytics'
        ]
    },
    'enterprise': {
        'name': 'Group Plan',
        'price_id': getattr(settings, 'STRIPE_ENTERPRISE_PRICE_ID', ''),
        'price': None,  # Contact sales - no fixed price
        'features': [
            'Everything in Clinic',
            'Unlimited users',
            'Advanced analytics',
            'Priority support',
            'Custom integrations',
            'Multi-organization support',
            'Custom branding',
            '24/7 dedicated support',
            'On-premise deployment option',
            'Custom feature development'
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
