import os
import logging
from google.cloud import secretmanager

logger = logging.getLogger(__name__)

def get_secret(secret_id, default=None):
    """
    Retrieve a secret from Google Secret Manager.
    Falls back to environment variable if Secret Manager is unavailable.
    
    Args:
        secret_id: The ID of the secret in Secret Manager
        default: Default value if secret cannot be retrieved
        
    Returns:
        The secret value as a string
    """
    # First, try to get from environment variable
    env_value = os.getenv(secret_id)
    if env_value:
        return env_value
    
    # If in Cloud Run, try Secret Manager
    if os.getenv('K_SERVICE'):  # K_SERVICE is set by Cloud Run
        try:
            client = secretmanager.SecretManagerServiceClient()
            project_id = os.getenv('GOOGLE_CLOUD_PROJECT', 'poehr-364520')
            
            # Build the secret name
            secret_name = f"projects/{project_id}/secrets/{secret_id}/versions/latest"
            
            # Access the secret
            response = client.access_secret_version(request={"name": secret_name})
            secret_value = response.payload.data.decode('UTF-8')
            
            logger.info(f"Successfully retrieved secret: {secret_id}")
            return secret_value
            
        except Exception as e:
            logger.error(f"Failed to retrieve secret {secret_id} from Secret Manager: {e}")
    
    # Return default if all else fails
    if default is None:
        logger.warning(f"No value found for secret: {secret_id}")
    return default