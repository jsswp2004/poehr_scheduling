# Account Registration Guide

This guide outlines how patients, doctors, and staff can create accounts in the POWER scheduling system.

## 1. Patient Self‑Registration

Patients can create their own accounts using the public Register page:

1. Navigate to `/register` in the frontend (see route definition in `App.js`).
2. Fill out the registration form. Required fields include first name, last name, username, email, phone number and password. If the patient knows their provider they can select a doctor from the dropdown.
3. Submit the form to POST to `/api/auth/register/`. The API creates the user and returns a success message.
4. After a successful response, patients are redirected to the login page.

## 2. Service Enrollment (Doctors/Admins)

Organizations sign up for the service via the multi‑step Enrollment page. The flow is:

1. Choose a plan on the Pricing page and continue to `/enroll?plan=<plan>&tier=<tier>`.
2. Step through the four enrollment stages: Account Details, Choose Plan, Payment Info and Confirmation.
3. On completion the form posts to `/api/auth/register/` with `is_enrollment: true` which triggers trial subscription creation.
4. After seeing the success confirmation, the new organization admin can log in with their credentials.

## 3. Admin Registration of Patients or Staff

Admins, registrars and system admins can create accounts from within the application:

1. Open the Patients page and select the **Register** tab to add new patients using the Quick Register form.
2. To add staff (doctor, receptionist, admin or registrar) visit `/create-profile` where you can upload a profile picture, choose a role and select an organization.
3. Submitting either form sends a POST request to `/api/auth/register/` with the chosen role and organization, creating the account.

Use these flows to register all user types in the system.
