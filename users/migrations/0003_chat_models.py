# Chat Message Model Migration
# Generated for Phase 2 Chat Implementation
#
# FIX (2026-09-24): This migration and 0018_chat_models.py were created
# independently on two different branches and both define the same
# ChatMessage/ChatRoom/TypingIndicator tables. They were later stitched
# together by 0019_merge_0003_chat_models_0018_chat_models.py, but since
# neither migration's actual database operations were removed, running
# migrate on a FRESH database applies both CreateModel sets back to back
# and the second one fails with "relation already exists" (0018 runs
# first in Django's topological order, so this file is the one that hit
# the duplicate). Wrapping the operations in SeparateDatabaseAndState
# keeps Django's migration STATE consistent (so later migrations that
# reference these models still work) without re-issuing the CREATE TABLE
# SQL, since 0018_chat_models.py already created the real tables.
#
# This is safe for existing databases that already survived past this
# point too: state-only operations don't touch the database at all.

from django.db import migrations, models
import django.db.models.deletion
from django.utils import timezone


class Migration(migrations.Migration):
    dependencies = [
        ('users', '0017_customuser_is_online_customuser_last_seen'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.CreateModel(
                    name='ChatMessage',
                    fields=[
                        ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                        ('message', models.TextField(help_text='The chat message content')),
                        ('timestamp', models.DateTimeField(default=timezone.now, help_text='When the message was sent')),
                        ('is_read', models.BooleanField(default=False, help_text='Whether the message has been read')),
                        ('message_type', models.CharField(
                            choices=[
                                ('text', 'Text Message'),
                                ('system', 'System Message'),
                                ('notification', 'Notification')
                            ],
                            default='text',
                            max_length=20
                        )),
                        ('sender', models.ForeignKey(
                            on_delete=django.db.models.deletion.CASCADE,
                            related_name='sent_messages',
                            to='users.customuser',
                            help_text='User who sent the message'
                        )),
                        ('recipient', models.ForeignKey(
                            on_delete=django.db.models.deletion.CASCADE,
                            related_name='received_messages',
                            to='users.customuser',
                            help_text='User who should receive the message'
                        )),
                    ],
                    options={
                        'ordering': ['-timestamp'],
                        'verbose_name': 'Chat Message',
                        'verbose_name_plural': 'Chat Messages',
                    },
                ),
                migrations.CreateModel(
                    name='ChatRoom',
                    fields=[
                        ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                        ('name', models.CharField(max_length=255, help_text='Name of the chat room')),
                        ('room_type', models.CharField(
                            choices=[
                                ('direct', 'Direct Message'),
                                ('group', 'Group Chat'),
                                ('team', 'Team Chat')
                            ],
                            default='direct',
                            max_length=20
                        )),
                        ('created_at', models.DateTimeField(default=timezone.now)),
                        ('is_active', models.BooleanField(default=True)),
                        ('participants', models.ManyToManyField(
                            to='users.customuser',
                            related_name='chat_rooms',
                            help_text='Users participating in this chat room'
                        )),
                    ],
                    options={
                        'verbose_name': 'Chat Room',
                        'verbose_name_plural': 'Chat Rooms',
                    },
                ),
                migrations.AddField(
                    model_name='chatmessage',
                    name='room',
                    field=models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='messages',
                        to='users.chatroom',
                        help_text='Chat room this message belongs to'
                    ),
                ),
                migrations.CreateModel(
                    name='TypingIndicator',
                    fields=[
                        ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                        ('is_typing', models.BooleanField(default=False)),
                        ('last_typing_time', models.DateTimeField(default=timezone.now)),
                        ('user', models.ForeignKey(
                            on_delete=django.db.models.deletion.CASCADE,
                            to='users.customuser'
                        )),
                        ('room', models.ForeignKey(
                            on_delete=django.db.models.deletion.CASCADE,
                            to='users.chatroom'
                        )),
                    ],
                    options={
                        'unique_together': {('user', 'room')},
                    },
                ),
            ],
        ),
    ]
