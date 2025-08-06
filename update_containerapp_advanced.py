#!/usr/bin/env python3
"""
Update Azure Container App using REST API
"""

import requests
import json
import os

def get_access_token():
    """Get Azure access token using Azure CLI"""
    import subprocess
    try:
        # Try different paths for Azure CLI
        cli_paths = [
            "az",
            "C:\\Program Files (x86)\\Microsoft SDKs\\Azure\\CLI2\\wbin\\az.cmd",
            "C:\\Program Files\\Microsoft SDKs\\Azure\\CLI2\\wbin\\az.cmd"
        ]
        
        for cli_path in cli_paths:
            try:
                result = subprocess.run([cli_path, "account", "get-access-token"], 
                                      capture_output=True, text=True, timeout=30)
                if result.returncode == 0:
                    token_info = json.loads(result.stdout)
                    return token_info['accessToken']
            except:
                continue
        
        print("Could not find Azure CLI or get access token")
        return None
    except Exception as e:
        print(f"Error getting access token: {e}")
        return None

def update_container_app_rest():
    """Update container app using REST API"""
    
    # Get access token
    access_token = get_access_token()
    if not access_token:
        print("❌ Could not get Azure access token")
        return False
    
    # Azure subscription and resource details
    subscription_id = "your_subscription_id"  # You'll need to provide this
    resource_group = "poehr-scheduling-rg"
    app_name = "poehr-scheduling"
    
    # Container App REST API endpoint
    url = f"https://management.azure.com/subscriptions/{subscription_id}/resourceGroups/{resource_group}/providers/Microsoft.App/containerApps/{app_name}"
    
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }
    
    # First, get current configuration
    print("Getting current container app configuration...")
    response = requests.get(f"{url}?api-version=2022-03-01", headers=headers)
    
    if response.status_code != 200:
        print(f"❌ Failed to get current configuration: {response.status_code}")
        print(response.text)
        return False
    
    current_config = response.json()
    
    # Update the image
    new_image = "poehrschedulingacr.azurecr.io/poehr-scheduling:v6"
    
    # Modify the container configuration
    containers = current_config["properties"]["template"]["containers"]
    for container in containers:
        container["image"] = new_image
    
    # Update the container app
    print(f"Updating container app to use image: {new_image}")
    
    response = requests.patch(f"{url}?api-version=2022-03-01", 
                            headers=headers, 
                            json=current_config)
    
    if response.status_code in [200, 201, 202]:
        print("✅ Container App update initiated successfully!")
        return True
    else:
        print(f"❌ Failed to update container app: {response.status_code}")
        print(response.text)
        return False

def simple_update():
    """Try a simple approach using subprocess with different CLI paths"""
    import subprocess
    
    # Try different Azure CLI paths
    cli_paths = [
        "az",
        "C:\\Program Files (x86)\\Microsoft SDKs\\Azure\\CLI2\\wbin\\az.cmd",
        "C:\\Program Files\\Microsoft SDKs\\Azure\\CLI2\\wbin\\az.cmd",
        "/usr/bin/az",
        "/usr/local/bin/az"
    ]
    
    command_args = [
        "containerapp", "update", 
        "--name", "poehr-scheduling",
        "--resource-group", "poehr-scheduling-rg", 
        "--image", "poehrschedulingacr.azurecr.io/poehr-scheduling:v6"
    ]
    
    for cli_path in cli_paths:
        try:
            print(f"Trying Azure CLI at: {cli_path}")
            result = subprocess.run([cli_path] + command_args, 
                                  capture_output=True, text=True, timeout=120)
            
            if result.returncode == 0:
                print("✅ Container App updated successfully!")
                print("Output:", result.stdout)
                return True
            else:
                print(f"Error with {cli_path}: {result.stderr}")
                
        except FileNotFoundError:
            print(f"Azure CLI not found at: {cli_path}")
            continue
        except Exception as e:
            print(f"Error using {cli_path}: {e}")
            continue
    
    return False

if __name__ == "__main__":
    print("🚀 Attempting to update Azure Container App...")
    
    # Try simple approach first
    if simple_update():
        print("\n✅ Update completed successfully!")
        print("The Container App should now be running with the v6 image containing django-redis.")
    else:
        print("\n❌ Could not update using Azure CLI. Please try updating manually:")
        print("az containerapp update --name poehr-scheduling --resource-group poehr-scheduling-rg --image poehrschedulingacr.azurecr.io/poehr-scheduling:v6")
