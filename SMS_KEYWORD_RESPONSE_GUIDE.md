# SMS Keyword Response Guide - Updated for Your Specific Keywords

## Overview
Your SMS system now responds to specific keywords that patients can text to your Twilio number. Here's exactly what happens for each keyword.

## Your Opt-Out Keywords
When a patient texts any of these words, they will be **opted out** of SMS notifications:

### Keywords: `OPTOUT`, `CANCEL`, `END`, `QUIT`, `UNSUBSCRIBE`, `REVOKE`, `STOP`, `STOPALL`

**What Happens:**
1. User's `sms_opt_out` field set to `True`
2. User's `sms_opt_out_date` set to current timestamp
3. User's `sms_opt_out_method` set based on keyword used:
   - `UNSUBSCRIBE` → method = "UNSUBSCRIBE"
   - All others → method = "STOP"
4. Confirmation message sent: *"You have been unsubscribed from SMS notifications. Reply START to opt back in."*
5. All future SMS messages blocked until they opt back in

## Your Opt-In Keywords
When a patient texts any of these words, they will be **opted back in** to SMS notifications:

### Keywords: `JOIN`, `START`, `YES`, `UNSTOP`, `IN`

**What Happens:**
1. User's `sms_opt_out` field set to `False`
2. User's `sms_opt_out_date` cleared (set to `None`)
3. User's `sms_opt_out_method` cleared (set to `None`)
4. User's `sms_consent` field set to `True`
5. User's `sms_consent_date` set to current timestamp
6. Confirmation message sent: *"Welcome back! You will now receive SMS notifications. Reply STOP to opt out."*
7. SMS messages will now be delivered again

## Help Keywords
When a patient texts any of these words, they get contextual help:

### Keywords: `HELP`, `INFO`, `?`, `COMMANDS`

**What Happens:**
Personalized help message based on their current status:

### If User is Opted In:
```
SMS Help - [Organization Name]:

You are currently OPTED IN for SMS notifications.

Commands:
• OPTOUT, CANCEL, END, QUIT, UNSUBSCRIBE, REVOKE, STOP, or STOPALL - Stop receiving SMS notifications
• HELP - Show this help message

You will receive appointment reminders and important health notifications. For support, contact your healthcare provider.
```

### If User is Opted Out:
```
SMS Help - [Organization Name]:

You are currently OPTED OUT of SMS notifications.

Commands:
• JOIN, START, YES, UNSTOP, or IN - Opt back in to receive notifications
• HELP - Show this help message

For support, contact your healthcare provider.
```

### If User Exists But Not Enrolled:
```
SMS Help - [Organization Name]:

You are currently NOT ENROLLED for SMS notifications.

To receive appointment reminders:
1. Log into your patient portal
2. Enable SMS notifications in your profile

Commands:
• HELP - Show this help message

For support, contact your healthcare provider.
```

### If Unknown Phone Number:
```
SMS Help - POWER Healthcare IT Systems:

Commands:
• OPTOUT, CANCEL, END, QUIT, UNSUBSCRIBE, REVOKE, STOP, or STOPALL - Stop receiving SMS notifications
• JOIN, START, YES, UNSTOP, or IN - Resume SMS notifications
• HELP - Show this help message

If you received this message in error, please contact your healthcare provider.
```

## Example User Interactions

### Scenario 1: Patient Wants to Stop Notifications
```
Patient texts: "STOP"
System responds: "You have been unsubscribed from SMS notifications. Reply START to opt back in."
Result: Patient stops receiving appointment reminders
```

### Scenario 2: Patient Wants to Resume Notifications
```
Patient texts: "START"
System responds: "Welcome back! You will now receive SMS notifications. Reply STOP to opt out."
Result: Patient resumes receiving appointment reminders
```

### Scenario 3: Patient Wants Help
```
Patient texts: "HELP"
System responds: [Personalized help message based on their current status]
Result: Patient receives guidance on available commands
```

### Scenario 4: Unknown Message
```
Patient texts: "Hello doctor"
System response: No automatic response (logged but ignored)
Result: Message logged for admin review, no action taken
```

## Technical Implementation Details

### Database Changes
- User records updated immediately when keywords are processed
- All actions logged in MessageLog table for compliance audit trail
- Timestamps tracked for consent and opt-out dates

### Keyword Processing
- **Case Insensitive**: "stop", "STOP", "Stop" all work the same
- **Exact Word Match**: "STOP" and "UNSTOP" are treated as separate keywords
- **Priority Order**: HELP → OPT-OUT → OPT-IN → Unknown

### Message Delivery Rules
1. **Help Messages**: Always delivered (bypass opt-out status)
2. **Confirmation Messages**: Always delivered (bypass opt-out status)  
3. **Regular SMS**: Blocked if user hasn't consented OR has opted out

### Compliance Features
- All keyword interactions logged with timestamps
- Immediate processing of opt-out requests (TCPA compliant)
- Clear confirmation messages for all actions
- Audit trail for regulatory compliance

## Admin Visibility

Administrators can view SMS opt-out activity through:
- **Admin Dashboard**: `/api/users/sms-optout-management/`
- **Message Logs**: All keyword interactions logged with details
- **User Records**: Opt-out status visible in user profiles

## Testing Your Keywords

You can test any keyword by texting it to your Twilio number:
- Text `HELP` to see current status and available commands
- Text `STOP` to opt out, then `START` to opt back in
- Check the admin dashboard to verify database updates

---

**Keyword System Status**: ✅ Production Ready  
**Compliance**: TCPA/GDPR Compliant  
**Last Updated**: August 24, 2025
