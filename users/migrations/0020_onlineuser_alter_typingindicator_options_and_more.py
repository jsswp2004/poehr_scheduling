# Generated by Django 4.2 on 2025-06-15 18:10

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0019_merge_0003_chat_models_0018_chat_models'),
    ]

    operations = [
        migrations.CreateModel(
            name='OnlineUser',
            fields=[
                ('user', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, primary_key=True, related_name='online_status_record', serialize=False, to=settings.AUTH_USER_MODEL)),
                ('is_online', models.BooleanField(default=False)),
                ('last_seen', models.DateTimeField(default=django.utils.timezone.now)),
            ],
        ),
        migrations.AlterModelOptions(
            name='typingindicator',
            options={'verbose_name': 'Typing Indicator', 'verbose_name_plural': 'Typing Indicators'},
        ),
        migrations.AlterField(
            model_name='chatmessage',
            name='recipient',
            field=models.ForeignKey(blank=True, help_text='User who should receive the message (for direct messages)', null=True, on_delete=django.db.models.deletion.CASCADE, related_name='received_messages', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AlterField(
            model_name='chatmessage',
            name='timestamp',
            field=models.DateTimeField(auto_now_add=True, help_text='When the message was sent'),
        ),
        migrations.AlterField(
            model_name='chatroom',
            name='created_at',
            field=models.DateTimeField(auto_now_add=True),
        ),
        migrations.AlterField(
            model_name='typingindicator',
            name='last_typing_time',
            field=models.DateTimeField(auto_now=True),
        ),
    ]
