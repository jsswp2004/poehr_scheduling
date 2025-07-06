# Google Places API Setup Instructions

## Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Note your project ID

## Step 2: Enable Places API

1. Go to [APIs & Services > Library](https://console.cloud.google.com/apis/library)
2. Search for "Places API (New)"
3. Click on it and click "Enable"

## Step 3: Create API Key

1. Go to [APIs & Services > Credentials](https://console.cloud.google.com/apis/credentials)
2. Click "Create Credentials" > "API Key"
3. Copy the generated API key

## Step 4: Secure Your API Key (Recommended)

1. Click on your newly created API key to edit it
2. Under "Application restrictions", select "HTTP referrers (web sites)"
3. Add your domain(s):
   - `http://localhost:3000/*` (for development)
   - `https://yourdomain.com/*` (for production)
4. Under "API restrictions", select "Restrict key"
5. Choose "Places API (New)" from the list
6. Save your changes

## Step 5: Add API Key to Your Project

1. Open `frontend/.env` file
2. Uncomment and replace the Google API key line:
   ```
   REACT_APP_GOOGLE_PLACES_API_KEY=your_actual_api_key_here
   ```
3. Restart your React development server

## Step 6: Enable Billing (Required for Google Places API)

1. Go to [Billing](https://console.cloud.google.com/billing) in Google Cloud Console
2. Link a billing account to your project
3. You get $200 free credit monthly (~4,444 address autocomplete requests)

## Pricing Information

- **Places Autocomplete**: ~$0.045 per request
- **Free tier**: $200/month = ~4,444 requests/month
- **Typical usage**: Small practice ~100-500 requests/month

## Fallback Behavior

- If no API key is provided, the system automatically falls back to OpenStreetMap (Photon)
- If Google API fails, it falls back to OpenStreetMap
- If both fail, it provides intelligent local suggestions

## Testing

After setup, the address autocomplete should provide much more accurate suggestions from Google's database while maintaining the same user experience.
