Azure Blob Storage integration

Overview

- We configured django-storages to use Azure Blob for media when USE_AZURE_MEDIA=true and Azure creds are present.
- Settings updated in `poehr_scheduling_backend/settings_azure.py` and `poehr_scheduling_backend/settings_azure_env.py`.
- Media URL will be the blob endpoint; existing code that serializes ImageField URLs will return absolute blob URLs.

Environment variables (must be set in Azure Container App):

- USE_AZURE_MEDIA=true
- AZURE_STORAGE_ACCOUNT_NAME=...
- AZURE_STORAGE_ACCOUNT_KEY=... (or AZURE_STORAGE_CONNECTION_STRING)
- AZURE_STORAGE_CONTAINER=media
- Optional: AZURE_STORAGE_CUSTOM_DOMAIN=cdn.example.com/container

One-off migration of existing media

- Command added: `python manage.py migrate_media_to_azure [--dry-run] [--rewrite-db]`.
- It uploads all files under MEDIA_ROOT to the target container and can normalize DB paths by stripping `/media/` prefixes.

Recommended rollout

1. Set env vars, deploy. New uploads will go to Azure automatically.
2. Run `python manage.py migrate_media_to_azure --dry-run` to preview.
3. Run `python manage.py migrate_media_to_azure --rewrite-db` to upload and normalize DB fields.
4. Verify logos/profile pictures resolve correctly from the blob endpoint.

Fallback behavior

- Backend `urls.py` serves a 1x1 transparent PNG for missing `/media/...` files to reduce noisy 404s during migration.
