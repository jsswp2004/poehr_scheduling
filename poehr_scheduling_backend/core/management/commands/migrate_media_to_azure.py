import os
import hashlib
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

try:
    from azure.storage.blob import BlobServiceClient, ContentSettings
except Exception:  # pragma: no cover - package may not be available locally
    BlobServiceClient = None
    ContentSettings = None


def file_md5(path: Path) -> str:
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


class Command(BaseCommand):
    help = (
        "Upload all files from MEDIA_ROOT to an Azure Blob container and optionally"
        " normalize DB ImageField paths (strip '/media/' prefixes)."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--container",
            default=os.environ.get("AZURE_STORAGE_CONTAINER", "media"),
            help='Azure Blob container name to upload into (default: env AZURE_STORAGE_CONTAINER or "media").',
        )
        parser.add_argument(
            "--connection-string",
            default=os.environ.get("AZURE_STORAGE_CONNECTION_STRING"),
            help="Azure Storage connection string (preferred). If omitted, will try account/key.",
        )
        parser.add_argument(
            "--account-name",
            default=os.environ.get("AZURE_STORAGE_ACCOUNT_NAME"),
            help="Azure Storage account name (used when connection string not provided).",
        )
        parser.add_argument(
            "--account-key",
            default=os.environ.get("AZURE_STORAGE_ACCOUNT_KEY"),
            help="Azure Storage account key (used when connection string not provided).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Only print what would happen, no uploads.",
        )
        parser.add_argument(
            "--rewrite-db",
            action="store_true",
            help="Normalize DB ImageField paths by stripping '/media/' prefixes.",
        )

    def handle(self, *args, **options):
        if BlobServiceClient is None:
            raise CommandError(
                "azure-storage-blob is not installed. Add it to requirements and install."
            )

        media_root = Path(settings.MEDIA_ROOT)
        if not media_root.exists():
            raise CommandError(f"MEDIA_ROOT does not exist: {media_root}")

        container_name = options["container"]
        conn_str = options["connection_string"]
        account_name = options["account_name"]
        account_key = options["account_key"]
        dry_run = options["dry_run"]
        rewrite_db = options["rewrite_db"]

        # Connect to Azure
        if conn_str:
            bsc = BlobServiceClient.from_connection_string(conn_str)
        else:
            if not (account_name and account_key):
                raise CommandError(
                    "Provide either --connection-string or both --account-name and --account-key."
                )
            endpoint = f"https://{account_name}.blob.core.windows.net"
            bsc = BlobServiceClient(account_url=endpoint, credential=account_key)

        container_client = bsc.get_container_client(container_name)
        try:
            container_client.create_container()
            self.stdout.write(
                self.style.SUCCESS(f"Created container: {container_name}")
            )
        except Exception:
            # Already exists
            pass

        uploaded = 0
        skipped = 0

        self.stdout.write(f"Scanning media files in: {media_root}")
        for file_path in media_root.rglob("*"):
            if file_path.is_dir():
                continue
            # Blob name is path relative to MEDIA_ROOT with forward slashes
            blob_name = str(file_path.relative_to(media_root)).replace("\\", "/")

            # Compare by content length + MD5 (optional)
            exists_and_same = False
            try:
                props = container_client.get_blob_client(
                    blob_name
                ).get_blob_properties()
                # If Content-MD5 is present, compare; otherwise compare length only
                local_md5 = file_md5(file_path)
                remote_md5 = None
                if props.content_settings and getattr(
                    props.content_settings, "content_md5", None
                ):
                    remote_md5 = (
                        props.content_settings.content_md5.hex()
                        if isinstance(
                            props.content_settings.content_md5, (bytes, bytearray)
                        )
                        else None
                    )
                if remote_md5 and local_md5 == remote_md5:
                    exists_and_same = True
                elif props.size == file_path.stat().st_size:
                    # Best-effort skip
                    exists_and_same = True
            except Exception:
                exists_and_same = False

            if exists_and_same:
                skipped += 1
                continue

            self.stdout.write(f"Uploading: {blob_name}")
            if not dry_run:
                with open(file_path, "rb") as data:
                    content_type = self._guess_content_type(file_path)
                    container_client.upload_blob(
                        name=blob_name,
                        data=data,
                        overwrite=True,
                        content_settings=(
                            ContentSettings(content_type=content_type)
                            if ContentSettings
                            else None
                        ),
                    )
                uploaded += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Upload complete. Uploaded: {uploaded}, Skipped: {skipped}"
            )
        )

        if rewrite_db:
            self._rewrite_db_paths()

    def _guess_content_type(self, path: Path) -> str:
        ext = path.suffix.lower()
        return {
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".gif": "image/gif",
            ".svg": "image/svg+xml",
            ".webp": "image/webp",
            ".pdf": "application/pdf",
        }.get(ext, "application/octet-stream")

    def _rewrite_db_paths(self):
        from users.models import Organization, CustomUser

        fixed = 0
        with transaction.atomic():
            for org in Organization.objects.exclude(logo="").exclude(logo__isnull=True):
                name = str(org.logo.name)
                new_name = self._normalize_media_name(name)
                if new_name != name:
                    org.logo.name = new_name
                    org.save(update_fields=["logo"])
                    fixed += 1
            # Also normalize user profile pictures if present
            for u in CustomUser.objects.exclude(profile_picture="").exclude(
                profile_picture__isnull=True
            ):
                name = str(u.profile_picture.name)
                new_name = self._normalize_media_name(name)
                if new_name != name:
                    u.profile_picture.name = new_name
                    u.save(update_fields=["profile_picture"])
                    fixed += 1

        self.stdout.write(self.style.SUCCESS(f"Normalized DB image paths: {fixed}"))

    @staticmethod
    def _normalize_media_name(name: str) -> str:
        # Strip leading / or media/ prefixes
        n = name.lstrip("/")
        if n.startswith("media/"):
            n = n[len("media/") :]
        return n
