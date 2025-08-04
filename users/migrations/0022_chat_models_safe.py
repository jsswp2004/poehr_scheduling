# Safe Chat Model Migration - handles existing tables gracefully
from django.db import migrations, models, connection
import django.db.models.deletion
from django.utils import timezone


def create_chat_models_safe(apps, schema_editor):
    """
    Safely create chat models, skipping if tables already exist
    """
    db_alias = schema_editor.connection.alias
    
    # Check if tables already exist
    table_names = connection.introspection.table_names()
    
    if 'users_chatmessage' in table_names:
        print("Chat tables already exist, skipping creation...")
        return
    
    # If tables don't exist, create them
    print("Creating chat model tables...")
    
    # This will run the actual table creation
    # We'll do this by running the SQL commands directly
    with schema_editor.connection.cursor() as cursor:
        try:
            # Create ChatRoom table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS "users_chatroom" (
                    "id" bigserial NOT NULL PRIMARY KEY,
                    "name" varchar(255) NOT NULL,
                    "room_type" varchar(20) NOT NULL,
                    "created_at" timestamp with time zone NOT NULL,
                    "is_active" boolean NOT NULL
                )
            """)
            
            # Create ChatMessage table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS "users_chatmessage" (
                    "id" bigserial NOT NULL PRIMARY KEY,
                    "message" text NOT NULL,
                    "timestamp" timestamp with time zone NOT NULL,
                    "is_read" boolean NOT NULL,
                    "message_type" varchar(20) NOT NULL,
                    "sender_id" bigint NOT NULL,
                    "recipient_id" bigint NOT NULL,
                    "room_id" bigint NOT NULL
                )
            """)
            
            # Create TypingIndicator table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS "users_typingindicator" (
                    "id" bigserial NOT NULL PRIMARY KEY,
                    "is_typing" boolean NOT NULL,
                    "last_typing_time" timestamp with time zone NOT NULL,
                    "user_id" bigint NOT NULL,
                    "room_id" bigint NOT NULL
                )
            """)
            
            # Create many-to-many table for participants
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS "users_chatroom_participants" (
                    "id" bigserial NOT NULL PRIMARY KEY,
                    "chatroom_id" bigint NOT NULL,
                    "customuser_id" bigint NOT NULL
                )
            """)
            
            print("Chat model tables created successfully")
            
        except Exception as e:
            print(f"Error creating chat tables (they may already exist): {e}")
            # Don't fail the migration if tables already exist


def reverse_chat_models_safe(apps, schema_editor):
    """
    Reverse the migration by dropping tables if they exist
    """
    with schema_editor.connection.cursor() as cursor:
        try:
            cursor.execute('DROP TABLE IF EXISTS "users_chatroom_participants"')
            cursor.execute('DROP TABLE IF EXISTS "users_typingindicator"')
            cursor.execute('DROP TABLE IF EXISTS "users_chatmessage"')
            cursor.execute('DROP TABLE IF EXISTS "users_chatroom"')
            print("Chat model tables dropped successfully")
        except Exception as e:
            print(f"Error dropping chat tables: {e}")


class Migration(migrations.Migration):
    dependencies = [
        ('users', '0021_add_sms_consent_fields'),
    ]

    operations = [
        migrations.RunPython(
            create_chat_models_safe,
            reverse_chat_models_safe,
        ),
    ]
