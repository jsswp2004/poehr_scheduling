import stripe
from django.conf import settings
from django.utils import timezone
from datetime import timedelta
from .models import CustomUser
from .stripe_config import SUBSCRIPTION_TIERS, TRIAL_PERIOD_DAYS
import logging

logger = logging.getLogger(__name__)

stripe.api_key = settings.STRIPE_SECRET_KEY

# Tier key to display name mapping
TIER_DISPLAY_NAMES = {
    'basic': 'Personal',
    'premium': 'Clinic',
    'enterprise': 'Group'
}

# Reverse mapping: display name to tier key
TIER_KEYS = {v: k for k, v in TIER_DISPLAY_NAMES.items()}

def get_tier_key(tier_name):
    """Convert display name to tier key, or return as-is if already a key"""
    return TIER_KEYS.get(tier_name, tier_name)

def get_tier_display_name(tier_key):
    """Convert tier key to display name, or return as-is if already a display name"""
    return TIER_DISPLAY_NAMES.get(tier_key, tier_key)

class StripeService:
    @staticmethod
    def create_customer(user, payment_method_id=None):
        """Create a Stripe customer for the user"""
        try:
            customer_data = {
                'email': user.email,
                'name': f"{user.first_name} {user.last_name}",
                'metadata': {
                    'user_id': user.id,
                    'username': user.username,
                    'organization': user.organization.name if user.organization else 'N/A'
                }
            }
            
            if payment_method_id:
                customer_data['payment_method'] = payment_method_id
                customer_data['invoice_settings'] = {
                    'default_payment_method': payment_method_id
                }
            
            customer = stripe.Customer.create(**customer_data)
            
            # Update user with Stripe customer ID
            user.stripe_customer_id = customer.id
            user.save()
            
            logger.info(f"Created Stripe customer {customer.id} for user {user.id}")
            return customer
            
        except stripe.error.StripeError as e:
            logger.error(f"Failed to create Stripe customer for user {user.id}: {str(e)}")
            raise

    @staticmethod
    def create_trial_subscription(user, tier='basic', payment_method_id=None):
        """Create a subscription with 7-day trial"""
        try:
            # Ensure user has a Stripe customer ID
            if not user.stripe_customer_id:
                customer = StripeService.create_customer(user, payment_method_id)
            else:
                customer = stripe.Customer.retrieve(user.stripe_customer_id)
                if payment_method_id:
                    # Attach payment method to existing customer
                    stripe.PaymentMethod.attach(
                        payment_method_id,
                        customer=user.stripe_customer_id
                    )
                    stripe.Customer.modify(
                        user.stripe_customer_id,
                        invoice_settings={
                            'default_payment_method': payment_method_id
                        }
                    )
            
            # Get price ID for the tier
            tier_info = SUBSCRIPTION_TIERS.get(tier, SUBSCRIPTION_TIERS['basic'])
            price_id = tier_info['price_id']
            
            if not price_id:
                raise ValueError(f"No price ID configured for tier: {tier}")
            
            # Create subscription with trial
            subscription = stripe.Subscription.create(
                customer=user.stripe_customer_id,
                items=[{'price': price_id}],
                trial_period_days=TRIAL_PERIOD_DAYS,
                metadata={
                    'user_id': user.id,
                    'tier': tier,
                }
            )
              # Update user subscription info
            trial_start = timezone.now()
            trial_end = trial_start + timedelta(days=TRIAL_PERIOD_DAYS)
              # Get display name for the tier
            tier_display_name = get_tier_display_name(tier)
            
            user.stripe_subscription_id = subscription.id
            user.subscription_status = 'trial'
            user.subscription_tier = tier_display_name  # Store display name instead of key
            user.trial_start_date = trial_start
            user.trial_end_date = trial_end
            user.registered = True  # Mark as registered after successful trial setup
            user.save()
            
            logger.info(f"Created trial subscription {subscription.id} for user {user.id}")
            return subscription
            
        except stripe.error.StripeError as e:
            logger.error(f"Failed to create subscription for user {user.id}: {str(e)}")
            raise
    
    @staticmethod
    def get_subscription_status(user):
        """Get current subscription status from Stripe"""
        if not user.stripe_subscription_id:
            return None
            
        try:
            subscription = stripe.Subscription.retrieve(user.stripe_subscription_id)
            return subscription
        except stripe.error.StripeError as e:
            logger.error(f"Failed to retrieve subscription for user {user.id}: {str(e)}")
            return None
    
    @staticmethod
    def cancel_subscription(user):
        """Cancel user's subscription"""
        if not user.stripe_subscription_id:
            return None
            
        try:
            subscription = stripe.Subscription.delete(user.stripe_subscription_id)
            
            # Update user status
            user.subscription_status = 'canceled'
            user.save()
            
            logger.info(f"Canceled subscription {user.stripe_subscription_id} for user {user.id}")
            return subscription
            
        except stripe.error.StripeError as e:
            logger.error(f"Failed to cancel subscription for user {user.id}: {str(e)}")
            raise
    
    @staticmethod
    def update_subscription_tier(user, new_tier):
        """Update user's subscription to a different tier"""
        if not user.stripe_subscription_id:
            raise ValueError("User has no active subscription")
            
        try:
            subscription = stripe.Subscription.retrieve(user.stripe_subscription_id)
            new_tier_info = SUBSCRIPTION_TIERS.get(new_tier, SUBSCRIPTION_TIERS['basic'])
            new_price_id = new_tier_info['price_id']
            
            if not new_price_id:
                raise ValueError(f"No price ID configured for tier: {new_tier}")
              # Update subscription
            stripe.Subscription.modify(
                user.stripe_subscription_id,
                items=[{
                    'id': subscription['items']['data'][0]['id'],
                    'price': new_price_id,
                }]
            )
              # Update user with display name
            tier_display_name = get_tier_display_name(new_tier)
            user.subscription_tier = tier_display_name
            user.save()
            
            logger.info(f"Updated subscription tier to {new_tier} for user {user.id}")
            return subscription
            
        except stripe.error.StripeError as e:
            logger.error(f"Failed to update subscription tier for user {user.id}: {str(e)}")
            raise
