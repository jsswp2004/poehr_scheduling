#!/usr/bin/env python
"""
Script to create Stripe prices for testing the subscription tiers.
Run this script to create the required price objects in your Stripe test account.
"""

import os
import sys
import django
from pathlib import Path

# Add the project directory to Python path
project_dir = Path(__file__).parent
sys.path.insert(0, str(project_dir))

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

import stripe
from django.conf import settings

# Initialize Stripe
stripe.api_key = settings.STRIPE_SECRET_KEY

def create_stripe_prices():
    """Create Stripe prices for our subscription tiers"""
    
    print("🔧 Creating Stripe prices for subscription tiers...")
    print(f"📡 Using Stripe Secret Key: {settings.STRIPE_SECRET_KEY[:12]}...")
    
    # Define the pricing tiers
    tiers = [
        {
            'name': 'Basic Plan',
            'price': 1999,  # $19.99 in cents
            'tier_key': 'basic'
        },
        {
            'name': 'Premium Plan',
            'price': 4999,  # $49.99 in cents
            'tier_key': 'premium'
        },
        {
            'name': 'Enterprise Plan',
            'price': 12999,  # $129.99 in cents
            'tier_key': 'enterprise'
        }
    ]
    
    created_prices = {}
    
    try:
        for tier in tiers:
            print(f"\n📋 Creating price for {tier['name']}...")
            
            # Create a product first
            product = stripe.Product.create(
                name=f"POEHR Scheduling - {tier['name']}",
                description=f"{tier['name']} subscription for POEHR Scheduling Platform"
            )
            
            # Create a price for the product
            price = stripe.Price.create(
                unit_amount=tier['price'],
                currency='usd',
                recurring={'interval': 'month'},
                product=product.id,
                metadata={
                    'tier': tier['tier_key'],
                    'plan_name': tier['name']
                }
            )
            
            created_prices[tier['tier_key']] = price.id
            print(f"✅ Created price: {price.id} for {tier['name']} (${tier['price']/100}/month)")
    
        print("\n🎉 Successfully created all Stripe prices!")
        print("\n📝 Add these to your .env file:")
        print("=" * 60)
        print(f"STRIPE_BASIC_PRICE_ID={created_prices['basic']}")
        print(f"STRIPE_PREMIUM_PRICE_ID={created_prices['premium']}")
        print(f"STRIPE_ENTERPRISE_PRICE_ID={created_prices['enterprise']}")
        print("=" * 60)
        
        return created_prices
        
    except stripe.error.StripeError as e:
        print(f"❌ Stripe error: {str(e)}")
        return None
    except Exception as e:
        print(f"❌ Unexpected error: {str(e)}")
        return None

if __name__ == "__main__":
    if not settings.STRIPE_SECRET_KEY or settings.STRIPE_SECRET_KEY == 'sk_test_your_stripe_secret_key_here':
        print("❌ Error: Please set your actual Stripe secret key in the .env file first!")
        print("Your current key looks like a placeholder.")
        sys.exit(1)
    
    created_prices = create_stripe_prices()
    
    if created_prices:
        print(f"\n🚀 Next steps:")
        print("1. Copy the price IDs above and update your .env file")
        print("2. Restart your Django server")
        print("3. Test the enrollment flow at http://localhost:3000/enrollment")
