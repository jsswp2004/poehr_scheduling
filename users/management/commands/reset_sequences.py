from django.core.management.base import BaseCommand
from django.db import connection

class Command(BaseCommand):
    help = 'Reset database sequences for specific models'

    def handle(self, *args, **kwargs):
        with connection.cursor() as cursor:
            # First, let's get the max id from the Patient table
            cursor.execute("SELECT MAX(id) FROM users_patient")
            max_id = cursor.fetchone()[0]
            
            if max_id is None:
                self.stdout.write(self.style.WARNING("No patients found in the database, no sequence reset needed."))
                return
            
            # Reset the sequence to be higher than the max id
            sequence_name = "users_patient_id_seq"
            new_id = max_id + 1
            
            cursor.execute(f"SELECT setval('{sequence_name}', {new_id}, true)")
            self.stdout.write(
                self.style.SUCCESS(f"Successfully reset sequence '{sequence_name}' to {new_id}")
            )
            
            # Also reset CustomUser sequence for good measure
            cursor.execute("SELECT MAX(id) FROM users_customuser")
            max_id = cursor.fetchone()[0]
            
            if max_id is not None:
                sequence_name = "users_customuser_id_seq"
                new_id = max_id + 1
                
                cursor.execute(f"SELECT setval('{sequence_name}', {new_id}, true)")
                self.stdout.write(
                    self.style.SUCCESS(f"Successfully reset sequence '{sequence_name}' to {new_id}")
                )
                
        self.stdout.write(self.style.SUCCESS("All sequences have been reset."))
