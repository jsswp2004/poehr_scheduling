"""Retire the old staff chat (replaced by the secure_messaging app).

The old chat's messages are deleted, as agreed: the tables are dropped. The SQL is "IF EXISTS" because
these tables were first created by a hand-written "safe" migration (0022) and may differ between databases.
Presence (users.OnlineUser and CustomUser.is_online) is untouched.
"""
from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("users", "0040_user_facilities"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunSQL('DROP TABLE IF EXISTS "users_typingindicator" CASCADE', migrations.RunSQL.noop),
                migrations.RunSQL('DROP TABLE IF EXISTS "users_chatmessage" CASCADE', migrations.RunSQL.noop),
                migrations.RunSQL('DROP TABLE IF EXISTS "users_chatroom_participants" CASCADE', migrations.RunSQL.noop),
                migrations.RunSQL('DROP TABLE IF EXISTS "users_chatroom" CASCADE', migrations.RunSQL.noop),
            ],
            state_operations=[
                migrations.RemoveField(model_name="chatroom", name="participants"),
                migrations.AlterUniqueTogether(name="typingindicator", unique_together=None),
                migrations.RemoveField(model_name="typingindicator", name="room"),
                migrations.RemoveField(model_name="typingindicator", name="user"),
                migrations.DeleteModel(name="ChatMessage"),
                migrations.DeleteModel(name="ChatRoom"),
                migrations.DeleteModel(name="TypingIndicator"),
            ],
        ),
    ]
