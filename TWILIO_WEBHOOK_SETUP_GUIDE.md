# Twilio SMS Webhook Configuration Guide

## Your Application Details

**Production Domain**: `poehr-scheduling.bluedune-dee8c412.centralus.azurecontainerapps.io`  
**SMS Webhook URL**: `https://poehr-scheduling.bluedune-dee8c412.centralus.azurecontainerapps.io/api/communicator/sms-webhook/`

## Step-by-Step Twilio Configuration

### Step 1: Log into Twilio Console

1. Go to [https://console.twilio.com/](https://console.twilio.com/)
2. Sign in with your Twilio account credentials

### Step 2: Navigate to Phone Numbers

1. In the left sidebar, click **"Phone Numbers"**
2. Click **"Manage"**
3. Click **"Active numbers"**

### Step 3: Select Your SMS Number

1. Find and click on your Twilio phone number (the one you use for SMS)
2. This should be the same number configured in your `TWILIO_PHONE_NUMBER` environment variable

### Step 4: Configure the Webhook

1. Scroll down to the **"Messaging"** section
2. In the **"A message comes in"** field:
   - **Webhook URL**: `https://poehr-scheduling.bluedune-dee8c412.centralus.azurecontainerapps.io/api/communicator/sms-webhook/`
   - **HTTP Method**: `HTTP POST`
3. Click **"Save Configuration"** at the bottom

### Step 5: Test the Configuration

#### Option A: Send a Test STOP Message

1. From your personal phone, send a text message to your Twilio number with: `STOP`
2. You should receive a confirmation message back
3. Check your application logs to see the webhook activity

#### Option B: Use Twilio's Webhook Debugger

1. In Twilio Console, go to **"Monitor"** → **"Logs"** → **"Webhooks"**
2. Send a test message and verify the webhook is being called
3. Check for any error responses

## Webhook Testing Commands

### Test the Webhook Endpoint Directly

```bash
# Test if your webhook endpoint is reachable
curl -X POST https://poehr-scheduling.bluedune-dee8c412.centralus.azurecontainerapps.io/api/communicator/sms-webhook/ \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "From=%2B17185550101&Body=STOP&To=%2B19876543210"
```

### Check Application Logs

```bash
# If you have Azure CLI configured
az containerapp logs show --name poehr-scheduling --resource-group poehr-scheduling-rg --follow
```

## Expected Behavior

### When User Sends "STOP"

1. **Twilio receives the message**
2. **Twilio calls your webhook** with message details
3. **Your application processes the request**:
   - Finds the user by phone number
   - Sets `sms_opt_out = True`
   - Sets `sms_opt_out_method = "STOP"`
   - Sets `sms_opt_out_date = current_time`
4. **Confirmation message sent**: "You have been unsubscribed from SMS notifications. Reply START to opt back in."
5. **Future SMS messages blocked** for this user

### When User Sends "START"

1. **Similar process** but reverses the opt-out
2. **Sets `sms_opt_out = False`**
3. **Confirmation message**: "Welcome back! You will now receive SMS notifications. Reply STOP to opt out."

## Supported Keywords

### Opt-Out Keywords (Case Insensitive)

- `STOP`
- `UNSUBSCRIBE`
- `QUIT`
- `END`
- `CANCEL`
- `OPTOUT`

### Opt-In Keywords (Case Insensitive)

- `START`
- `SUBSCRIBE`
- `YES`
- `OPTIN`

## Troubleshooting

### Common Issues

1. **Webhook not receiving requests**

   - Verify the URL is exactly: `https://poehr-scheduling.bluedune-dee8c412.centralus.azurecontainerapps.io/api/communicator/sms-webhook/`
   - Check Twilio webhook logs for errors
   - Ensure HTTP method is set to POST

2. **500 Internal Server Error**

   - Check your application logs
   - Verify database connectivity
   - Test the endpoint manually with curl

3. **User not found errors**
   - Verify phone numbers in database match Twilio format
   - Check if phone numbers are in international format (+1234567890)

### Verification Checklist

- [ ] Webhook URL configured in Twilio console
- [ ] HTTP POST method selected
- [ ] Configuration saved in Twilio
- [ ] Test STOP message sent
- [ ] Confirmation message received
- [ ] Application logs show webhook activity
- [ ] User opt-out status updated in database

## Security Notes

- The webhook endpoint is CSRF-exempt (required for Twilio)
- No authentication required (Twilio webhooks use IP allowlisting)
- All webhook activity is logged for audit purposes
- User phone number validation prevents unauthorized opt-outs

## Support

If you encounter issues:

1. Check the application logs for webhook errors
2. Verify phone number formats in database
3. Test with curl command provided above
4. Review Twilio webhook debugger for delivery issues

---

**Webhook URL**: `https://poehr-scheduling.bluedune-dee8c412.centralus.azurecontainerapps.io/api/communicator/sms-webhook/`  
**Configuration Date**: August 24, 2025  
**Status**: Ready for Production ✅
