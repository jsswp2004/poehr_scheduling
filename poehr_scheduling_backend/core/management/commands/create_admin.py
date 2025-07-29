from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from django.contrib.auth.hashers import make_password


class Command(BaseCommand):
    help = 'Create a superuser for production deployment'

    def add_arguments(self, parser):
        parser.add_argument('--username', type=str, help='Username for the superuser', default='jsswp2004')
        parser.add_argument('--email', type=str, help='Email for the superuser', default='jsswp2004@powerhealth.com')
        parser.add_argument('--password', type=str, help='Password for the superuser', default='krat25Miko!')

    def handle(self, *args, **options):
        username = options['username']
        email = options['email']
        password = options['password']

        try:
            # Check if user already exists
            if User.objects.filter(username=username).exists():
                self.stdout.write(
                    self.style.WARNING(f'Superuser "{username}" already exists!')
                )
                user = User.objects.get(username=username)
                self.stdout.write(f'Existing user: {user.username} - {user.email}')
                return

            # Create the superuser
            user = User.objects.create(
                username=username,
                email=email,
                password=make_password(password),
                is_staff=True,
                is_active=True,
                is_superuser=True,
                first_name="System",
                last_name="Administrator"
            )

            self.stdout.write(
                self.style.SUCCESS(f'Successfully created superuser "{username}"')
            )
            self.stdout.write(f'Email: {email}')
            self.stdout.write('Access admin at: /admin/')
            self.stdout.write(
                self.style.WARNING('IMPORTANT: Consider changing the password after first login!')
            )

        except Exception as e:
            self.stdout.write(
                self.style.ERROR(f'Error creating superuser: {e}')
            )
