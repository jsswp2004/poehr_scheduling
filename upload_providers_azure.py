#!/usr/bin/env python
"""
Script to upload providers from CSV file directly to Azure database
"""
import os
import sys
import django
import csv
from pathlib import Path

# Add the project directory to Python path
project_root = Path(__file__).parent
sys.path.append(str(project_root))

# Setup Django with Azure database settings
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "poehr_scheduling_backend.settings")

# Override database settings to use Azure
os.environ["DB_NAME"] = "poehr_db"
os.environ["DB_USER"] = "jsswp2004"
os.environ["DB_HOST"] = "poehr-scheduling-postgres.postgres.database.azure.com"
os.environ["DB_PORT"] = "5432"
os.environ["DB_PASSWORD"] = "krat25Miko!"

django.setup()

from users.models import CustomUser, Organization


def upload_providers_to_azure(csv_file_path):
    """Upload providers from CSV file to Azure database"""

    print(f"🔵 Starting provider upload to Azure database from {csv_file_path}")

    # Check if file exists
    if not os.path.exists(csv_file_path):
        print(f"❌ CSV file not found: {csv_file_path}")
        return

    created_count = 0
    updated_count = 0
    errors = []

    try:
        with open(csv_file_path, "r", encoding="utf-8") as file:
            reader = csv.DictReader(file)
            print(f"📊 CSV headers: {reader.fieldnames}")

            for row_count, row in enumerate(reader, 1):
                print(f"🔄 Processing row {row_count}: {row['username']}")

                try:
                    username = row.get("username", "").strip()
                    email = row.get("email", "").strip()
                    first_name = row.get("first_name", "").strip()
                    last_name = row.get("last_name", "").strip()
                    org_name = row.get("organization", "").strip()
                    phone_number = row.get("phone_number", "").strip()
                    provider_username = row.get("provider", "").strip()
                    role = row.get("role", "doctor").strip() or "doctor"
                    password = row.get("password", "").strip()

                    print(f"📋 {username} - {email} - {role}")

                    # Validate required fields
                    if not username or not email:
                        error_msg = f"Missing username or email for row {row_count}"
                        print(f"⚠️ {error_msg}")
                        errors.append(error_msg)
                        continue

                    # Validate role
                    valid_roles = [
                        "patient",
                        "doctor",
                        "receptionist",
                        "admin",
                        "registrar",
                        "none",
                        "system_admin",
                    ]
                    if role not in valid_roles:
                        error_msg = f"Invalid role '{role}' for user '{username}'"
                        print(f"⚠️ {error_msg}")
                        errors.append(error_msg)
                        continue

                    # Clean phone number
                    if phone_number:
                        cleaned_phone = "".join(
                            c
                            for c in phone_number
                            if c.isdigit() or c in ["+", " ", "-", "(", ")"]
                        )
                        if len(cleaned_phone) > 20:
                            error_msg = f"Phone number too long for user '{username}'"
                            print(f"⚠️ {error_msg}")
                            errors.append(error_msg)
                            continue
                        phone_number = cleaned_phone

                    # Get or create organization
                    org = None
                    if org_name:
                        try:
                            org, org_created = Organization.objects.get_or_create(
                                name=org_name
                            )
                            print(
                                f"🏢 Organization: {org.name} ({'created' if org_created else 'existing'})"
                            )
                        except Exception as e:
                            error_msg = f"Organization error for '{org_name}': {str(e)}"
                            print(f"❌ {error_msg}")
                            errors.append(error_msg)
                            continue

                    # Get provider (if specified)
                    provider = None
                    if provider_username:
                        try:
                            provider = CustomUser.objects.get(
                                username=provider_username
                            )
                            print(f"👨‍⚕️ Provider found: {provider.username}")
                        except CustomUser.DoesNotExist:
                            error_msg = f"Provider '{provider_username}' not found"
                            print(f"⚠️ {error_msg}")
                            errors.append(error_msg)
                            continue

                    # Create or update user
                    try:
                        user, created = CustomUser.objects.get_or_create(
                            username=username,
                            defaults={
                                "email": email,
                                "first_name": first_name,
                                "last_name": last_name,
                                "role": role,
                                "organization": org,
                                "phone_number": phone_number,
                            },
                        )
                        print(
                            f"👤 User: {username} ({'created' if created else 'updated'})"
                        )

                        if created:
                            if password:
                                user.set_password(password)
                            else:
                                user.set_password("changeme123")
                            user.save()
                            created_count += 1
                        else:
                            # Update existing user
                            user.email = email
                            user.first_name = first_name
                            user.last_name = last_name
                            user.role = role
                            user.organization = org
                            user.phone_number = phone_number
                            if password:
                                user.set_password(password)
                            user.save()
                            updated_count += 1

                        # Set provider relationship if specified
                        if provider:
                            user.provider = provider
                            user.save()
                            print(f"🔗 Provider relationship set")

                    except Exception as e:
                        error_msg = f"User creation error for '{username}': {str(e)}"
                        print(f"❌ {error_msg}")
                        errors.append(error_msg)
                        continue

                except Exception as e:
                    error_msg = f"Unexpected error processing row {row_count}: {str(e)}"
                    print(f"❌ {error_msg}")
                    errors.append(error_msg)
                    continue

        print(
            f"✅ Azure upload completed - Created: {created_count}, Updated: {updated_count}, Errors: {len(errors)}"
        )

        if errors:
            print("\n❌ Errors encountered:")
            for error in errors:
                print(f"  - {error}")

        return {"created": created_count, "updated": updated_count, "errors": errors}

    except Exception as e:
        print(f"❌ Critical error: {str(e)}")
        return {"error": str(e)}


if __name__ == "__main__":
    csv_file = "test_providers_upload.csv"
    result = upload_providers_to_azure(csv_file)
    print(f"\n📊 Final result: {result}")
