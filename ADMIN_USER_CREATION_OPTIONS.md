# ADMIN USER CREATION OPTIONS - Choose What Works Best

Since we're having authentication issues pushing v8.1 to the registry, here are **3 working options** to create your admin user:

## 🎯 OPTION 1: Use Emergency API Endpoint (QUICKEST)

The emergency endpoint is already in your current v8 deployment. Try this:

1. **Make a POST request** to create admin user:
   ```bash
   curl -X POST https://poehr-scheduling.bluedune-dee8c412.centralus.azurecontainerapps.io/create-admin/ \
        -H "Content-Type: application/json" \
        -d '{}'
   ```

2. **Or visit in browser**: https://poehr-scheduling.bluedune-dee8c412.centralus.azurecontainerapps.io/create-admin/

3. **Then test login** at: https://poehr-scheduling.bluedune-dee8c412.centralus.azurecontainerapps.io/

---

## 🎯 OPTION 2: Run Script in Azure Console (MOST RELIABLE)

1. **Go to Azure Portal** → Container Apps → poehr-scheduling
2. **Click "Console" tab** (or "Execute command")
3. **Upload the script** `create_admin_azure.py` or copy/paste its contents
4. **Run the script**:
   ```bash
   python create_admin_azure.py
   ```

---

## 🎯 OPTION 3: Manual Database Creation via Azure Console

1. **Go to Azure Portal** → Container Apps → poehr-scheduling → Console
2. **Run Django shell**:
   ```bash
   python manage.py shell --settings=poehr_scheduling_backend.settings_azure_env
   ```

3. **Execute this code**:
   ```python
   from users.models import CustomUser, Organization
   from django.contrib.auth.hashers import make_password
   
   # Create organization
   org, created = Organization.objects.get_or_create(
       name='POWER Health Systems',
       defaults={
           'organization_type': 'clinic',
           'address': 'Admin Office',
           'phone_number': '+1234567890',
           'subscription_tier': 'enterprise'
       }
   )
   
   # Create admin user
   admin = CustomUser.objects.create(
       username='jsswp2004',
       email='jsswp2004@powerhealth.com',
       password=make_password('krat25Miko!'),
       is_staff=True,
       is_active=True,
       is_superuser=True,
       first_name='System',
       last_name='Administrator',
       role='system_admin',
       organization=org,
       phone_number='+1234567890'
   )
   
   print(f"✅ Created admin user: {admin.username}")
   ```

---

## 🎯 OPTION 4: When Authentication is Fixed

Once Docker authentication is resolved, we can deploy v8.1 which will automatically create the admin user on startup.

---

## 🔐 LOGIN CREDENTIALS

**Username**: `jsswp2004`  
**Password**: `krat25Miko!`

## 🌐 ACCESS POINTS

- **Django Admin**: https://poehr-scheduling.bluedune-dee8c412.centralus.azurecontainerapps.io/admin/
- **Frontend**: https://poehr-scheduling.bluedune-dee8c412.centralus.azurecontainerapps.io/

---

## ✅ VERIFICATION

After creating the admin user, test login at:
https://poehr-scheduling.bluedune-dee8c412.centralus.azurecontainerapps.io/

The 500 errors should be resolved and you should get proper authentication responses.

---

**RECOMMENDATION**: Try Option 1 first (emergency endpoint), then Option 2 if needed.
