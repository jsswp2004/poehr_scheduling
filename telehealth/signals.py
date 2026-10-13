from django.dispatch import Signal

# Sent after a session is ended. Phase 3 (draft note stub, billing context)
# should connect here. Provides: sender=TelehealthSession, session=<instance>.
session_ended = Signal()
