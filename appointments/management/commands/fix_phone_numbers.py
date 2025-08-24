from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model

User = get_user_model()

class Command(BaseCommand):
    help = 'Fix phone numbers for Knight and Dawson patients'

    def handle(self, *args, **options):
        # Phone number corrections based on debug analysis
        phone_corrections = [
            {
                'first_name': 'John',
                'last_name': 'Knight',
                'old_phone': '546.865.8964',
                'new_phone': '3018806015'
            },
            {
                'first_name': 'Michael', 
                'last_name': 'Dawson',
                'old_phone': '366.890.4152',
                'new_phone': '6469372978'
            }
        ]
        
        self.stdout.write("🔧 Starting phone number corrections...")
        
        for correction in phone_corrections:
            # First try to find by old phone number
            patients_by_phone = User.objects.filter(
                phone_number=correction['old_phone'],
                role='patient'
            )
            
            # Also try to find by name
            patients_by_name = User.objects.filter(
                first_name=correction['first_name'],
                last_name=correction['last_name'],
                role='patient'
            )
            
            self.stdout.write(f"\n📞 Looking for {correction['first_name']} {correction['last_name']}:")
            self.stdout.write(f"   Old phone: {correction['old_phone']}")
            self.stdout.write(f"   New phone: {correction['new_phone']}")
            
            # Show what we found
            self.stdout.write(f"   Found by phone: {patients_by_phone.count()} patients")
            self.stdout.write(f"   Found by name: {patients_by_name.count()} patients")
            
            # List all matches
            all_matches = (patients_by_phone | patients_by_name).distinct()
            
            for patient in all_matches:
                self.stdout.write(f"   Patient ID {patient.id}: {patient.first_name} {patient.last_name}")
                self.stdout.write(f"     Current phone: '{patient.phone_number}'")
                self.stdout.write(f"     Organization: {patient.organization.name if patient.organization else 'None'}")
                
                # Update the phone number
                old_phone = patient.phone_number
                patient.phone_number = correction['new_phone']
                patient.save()
                
                self.stdout.write(self.style.SUCCESS(
                    f"   ✅ Updated phone from '{old_phone}' to '{correction['new_phone']}'"
                ))
        
        self.stdout.write(self.style.SUCCESS("\n🎉 Phone number corrections completed!"))
        
        # Verify the changes
        self.stdout.write("\n📋 Verification:")
        for correction in phone_corrections:
            updated_patients = User.objects.filter(
                first_name=correction['first_name'],
                last_name=correction['last_name'],
                phone_number=correction['new_phone'],
                role='patient'
            )
            
            if updated_patients.exists():
                patient = updated_patients.first()
                self.stdout.write(self.style.SUCCESS(
                    f"✅ {patient.first_name} {patient.last_name} now has phone: {patient.phone_number}"
                ))
            else:
                self.stdout.write(self.style.ERROR(
                    f"❌ Could not verify update for {correction['first_name']} {correction['last_name']}"
                ))
