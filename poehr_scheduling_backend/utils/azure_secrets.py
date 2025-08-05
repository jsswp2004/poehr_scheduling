import os
import logging
from azure.keyvault.secrets import SecretClient
from azure.identity import DefaultAzureCredential

logger = logging.getLogger(__name__)

def get_azure_secret(secret_name, default=None):
    """
    Retrieve a secret from Azure Key Vault.
    
    Args:
        secret_name (str): Name of the secret to retrieve
        default: Default value to return if secret is not found
        
    Returns:
        str: Secret value or default
    """
    
    # If running locally or Key Vault not configured, use environment variables
    keyvault_name = os.getenv('AZURE_KEYVAULT_NAME')
    if not keyvault_name:
        logger.info(f"Azure Key Vault not configured, using environment variable for {secret_name}")
        return os.getenv(secret_name.upper().replace('-', '_'), default)
    
    try:
        # Create credential using Azure identity (works with managed identity in Azure)
        credential = DefaultAzureCredential()
        
        # Create Key Vault client
        vault_url = f"https://{keyvault_name}.vault.azure.net/"
        client = SecretClient(vault_url=vault_url, credential=credential)
        
        # Retrieve secret
        secret = client.get_secret(secret_name)
        logger.info(f"Successfully retrieved secret '{secret_name}' from Azure Key Vault")
        return secret.value
        
    except Exception as e:
        logger.error(f"Failed to retrieve secret '{secret_name}' from Azure Key Vault: {e}")
        
        # Fallback to environment variable
        env_var_name = secret_name.upper().replace('-', '_')
        fallback_value = os.getenv(env_var_name, default)
        
        if fallback_value and fallback_value != default:
            logger.warning(f"Using environment variable {env_var_name} as fallback for {secret_name}")
            return fallback_value
        
        logger.warning(f"Using default value for {secret_name}")
        return default

def test_azure_secrets():
    """
    Test function to verify Azure Key Vault connectivity
    """
    keyvault_name = os.getenv('AZURE_KEYVAULT_NAME')
    if not keyvault_name:
        print("❌ AZURE_KEYVAULT_NAME not set")
        return False
    
    try:
        credential = DefaultAzureCredential()
        vault_url = f"https://{keyvault_name}.vault.azure.net/"
        client = SecretClient(vault_url=vault_url, credential=credential)
        
        # Try to list secrets (this will test authentication)
        secrets = list(client.list_properties_of_secrets())
        print(f"✅ Successfully connected to Azure Key Vault: {keyvault_name}")
        print(f"📋 Found {len(secrets)} secrets")
        return True
        
    except Exception as e:
        print(f"❌ Failed to connect to Azure Key Vault: {e}")
        return False

if __name__ == "__main__":
    test_azure_secrets()
