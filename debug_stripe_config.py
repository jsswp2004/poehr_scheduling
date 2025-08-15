#!/usr/bin/env python
"""
Debug script to check Stripe configuration in production
"""
import os
import sys
import django

# Add the project directory to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Set Django settings module for Azure environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings_azure_env')

try:
    django.setup()
    from django.conf import settings
    
    print("🔍 STRIPE CONFIGURATION DEBUG")
    print("=" * 50)
    
    print(f"Django Settings Module: {os.environ.get('DJANGO_SETTINGS_MODULE')}")
    print(f"DEBUG mode: {settings.DEBUG}")
    print()
    
    print("🔑 Stripe API Keys:")
    stripe_secret = getattr(settings, 'STRIPE_SECRET_KEY', 'NOT_SET')
    if stripe_secret:
        print(f"  ✅ STRIPE_SECRET_KEY: {stripe_secret[:7]}...{stripe_secret[-4:] if len(stripe_secret) > 11 else 'TOO_SHORT'}")
    else:
        print(f"  ❌ STRIPE_SECRET_KEY: NOT SET")
    
    stripe_pub = getattr(settings, 'STRIPE_PUBLISHABLE_KEY', 'NOT_SET')
    if stripe_pub:
        print(f"  ✅ STRIPE_PUBLISHABLE_KEY: {stripe_pub[:7]}...{stripe_pub[-4:] if len(stripe_pub) > 11 else 'TOO_SHORT'}")
    else:
        print(f"  ❌ STRIPE_PUBLISHABLE_KEY: NOT SET")
    
    print()
    print("💰 Stripe Price IDs:")
    
    basic_price = getattr(settings, 'STRIPE_BASIC_PRICE_ID', 'NOT_SET')
    premium_price = getattr(settings, 'STRIPE_PREMIUM_PRICE_ID', 'NOT_SET')
    enterprise_price = getattr(settings, 'STRIPE_ENTERPRISE_PRICE_ID', 'NOT_SET')
    
    print(f"  Basic: {basic_price}")
    print(f"  Premium: {premium_price}")
    print(f"  Enterprise: {enterprise_price}")
    
    # Check if we're using test values
    test_values = ['price_test_basic', 'price_test_premium', 'price_test_enterprise']
    using_test = any(price in test_values for price in [basic_price, premium_price, enterprise_price])
    
    if using_test:
        print("\n⚠️  WARNING: Still using test price IDs!")
        print("   Environment variables may not be set in Azure Container Apps")
    else:
        print("\n✅ Using production price IDs")
    
    print()
    print("🌍 Environment Variables Check:")
    env_vars = ['STRIPE_BASIC_PRICE_ID', 'STRIPE_PREMIUM_PRICE_ID', 'STRIPE_ENTERPRISE_PRICE_ID']
    for var in env_vars:
        value = os.environ.get(var)
        if value:
            print(f"  ✅ {var}: {value}")
        else:
            print(f"  ❌ {var}: NOT SET")
    
    print()
    print("🧪 Test Stripe Configuration:")
    try:
        from users.stripe_config import SUBSCRIPTION_TIERS, get_tier_info
        
        for tier_name, tier_data in SUBSCRIPTION_TIERS.items():
            price_id = tier_data.get('price_id', 'NOT_SET')
            print(f"  {tier_name.title()}: {price_id}")
            
        # Test getting tier info
        basic_tier = get_tier_info('basic')
        print(f"\n🔍 get_tier_info('basic') returns: {basic_tier.get('price_id', 'ERROR')}")
        
    except Exception as e:
        print(f"  ❌ Error importing stripe_config: {e}")
    
    print()
    print("🏥 Database Connection:")
    try:
        from django.db import connection
        cursor = connection.cursor()
        cursor.execute("SELECT 1")
        print("  ✅ Database connection successful")
    except Exception as e:
        print(f"  ❌ Database connection failed: {e}")
    
    print()
    print("=" * 50)
    print("🎯 NEXT STEPS:")
    if using_test:
        print("1. Add environment variables to Azure Container Apps:")
        print("   - STRIPE_BASIC_PRICE_ID=price_1RwC4aFfk7zi0PnMzpA9gILD")
        print("   - STRIPE_PREMIUM_PRICE_ID=price_1RwC59Ffk7zi0PnM0oOnjBmn")
        print("   - STRIPE_ENTERPRISE_PRICE_ID=price_1RwC60Ffk7zi0PnM7vmJn3P1")
        print("2. Restart the container app")
        print("3. Test enrollment again")
    else:
        print("Configuration looks good! Check application logs for specific errors.")

except Exception as e:
    print(f"❌ Failed to load Django settings: {e}")
    print(f"Current working directory: {os.getcwd()}")
    print(f"Python path: {sys.path}")
    import traceback
    traceback.print_exc()
