#!/usr/bin/env python
"""
Test Redis connectivity for POEHR scheduling app
"""
import os
import sys
import django
import logging

# Setup Django environment
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings_production')

try:
    django.setup()
    from channels_redis.core import RedisChannelLayer
    import asyncio
    
    async def test_redis_connection():
        print("Testing Redis connectivity...")
        
        # Test basic Redis connection
        try:
            channel_layer = RedisChannelLayer({
                "hosts": [('10.77.0.3', 6379)],
            })
            
            # Test basic operations
            print("Testing channel layer...")
            
            # Send a test message
            test_channel = "test_channel"
            test_message = {"type": "test.message", "text": "Hello Redis!"}
            
            await channel_layer.send(test_channel, test_message)
            print("✓ Successfully sent message to Redis")
            
            # Receive the test message
            message = await channel_layer.receive(test_channel)
            print(f"✓ Successfully received message: {message}")
            
            print("✅ Redis connectivity test PASSED")
            
        except Exception as e:
            print(f"❌ Redis connectivity test FAILED: {e}")
            import traceback
            traceback.print_exc()
            
    # Run the async test
    asyncio.run(test_redis_connection())
    
except Exception as e:
    print(f"❌ Django setup failed: {e}")
    import traceback
    traceback.print_exc()
