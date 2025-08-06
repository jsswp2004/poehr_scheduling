#!/usr/bin/env python3
"""
Update Azure Container App to use v6 image with django-redis dependency
"""

import os
import subprocess
import json

def run_command(command):
    """Run a command and return the result"""
    try:
        result = subprocess.run(command, shell=True, capture_output=True, text=True)
        if result.returncode == 0:
            return result.stdout.strip()
        else:
            print(f"Error running command: {command}")
            print(f"Error: {result.stderr}")
            return None
    except Exception as e:
        print(f"Exception running command: {e}")
        return None

def update_container_app():
    """Update the Azure Container App to use v6 image"""
    
    # Azure Container App details
    app_name = "poehr-scheduling"
    resource_group = "poehr-scheduling-rg"
    new_image = "poehrschedulingacr.azurecr.io/poehr-scheduling:v6"
    
    print(f"Updating Container App '{app_name}' to use image '{new_image}'...")
    
    # Update the container app
    update_command = f'az containerapp update --name {app_name} --resource-group {resource_group} --image {new_image}'
    
    result = run_command(update_command)
    
    if result:
        print("✅ Container App updated successfully!")
        print("Response:", result)
        return True
    else:
        print("❌ Failed to update Container App")
        return False

def check_app_status():
    """Check the status of the container app"""
    app_name = "poehr-scheduling"
    resource_group = "poehr-scheduling-rg"
    
    print(f"\nChecking status of Container App '{app_name}'...")
    
    status_command = f'az containerapp show --name {app_name} --resource-group {resource_group} --query "properties.provisioningState" -o tsv'
    
    result = run_command(status_command)
    
    if result:
        print(f"Container App status: {result}")
        return result
    else:
        print("Failed to get Container App status")
        return None

if __name__ == "__main__":
    print("🚀 Starting Azure Container App update process...")
    
    # Update the container app
    if update_container_app():
        # Check status
        status = check_app_status()
        
        if status == "Succeeded":
            print("\n✅ Container App is running successfully with v6 image!")
            print("The django-redis dependency should now be available.")
        else:
            print(f"\n⚠️  Container App status: {status}")
            print("Please check the Azure portal for more details.")
    else:
        print("\n❌ Update failed. Please check your Azure CLI authentication and permissions.")
