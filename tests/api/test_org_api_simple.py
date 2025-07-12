#!/usr/bin/env python3
"""
Test what the organization API endpoint returns
"""
import requests
import json

def test_org_api():
    # Test the organization API endpoint
    url = "http://127.0.0.1:8000/api/organizations/2/"
    
    try:
        response = requests.get(url)
        print(f"Status Code: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print("API Response:")
            print(json.dumps(data, indent=2))
            
            if 'logo' in data:
                logo_url = data['logo']
                print(f"\nLogo field value: {logo_url}")
                
                # Test if logo URL starts with http
                if logo_url.startswith('http'):
                    print("Logo URL is already absolute")
                else:
                    print("Logo URL is relative, needs to be made absolute")
                    full_url = f"http://127.0.0.1:8000/{logo_url}"
                    print(f"Full URL would be: {full_url}")
        else:
            print(f"Error: {response.status_code}")
            print(response.text)
    except Exception as e:
        print(f"Error: {e}")

if __name__ == '__main__':
    test_org_api()
