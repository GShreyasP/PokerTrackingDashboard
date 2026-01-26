# Whop Subscription Integration Setup

This guide will help you set up the Whop API integration to track user subscriptions.

## What You Need to Do

### 1. Get Your Whop API Key
1. Go to your Whop Developer Dashboard: https://dev.whop.com
2. Navigate to your app settings
3. Copy your **API Key** (it should look like: `whop_xxxxxxxxxxxxx`)

### 2. Get Your Product ID
1. In your Whop dashboard, go to **Products**
2. Find your SettleUP subscription product
3. Copy the **Product ID** (it should look like: `prod_xxxxxxxxxxxxx`)

### 3. Add Environment Variables in Vercel
1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add the following variables:

   ```
   WHOP_API_KEY=whop_xxxxxxxxxxxxx
   WHOP_PRODUCT_ID=prod_xxxxxxxxxxxxx
   ```

4. Make sure to select the appropriate environments (Production, Preview, Development)
5. Click **Save**

### 4. Redeploy Your Application
After adding the environment variables, you need to redeploy:
- Vercel will automatically redeploy if you push to your main branch
- Or manually trigger a redeploy from the Vercel dashboard

## How It Works

1. **On User Login**: The app automatically checks subscription status from Whop
2. **When Creating Trackers**: The app checks if the user has an active subscription
   - **Free users**: Limited to 2 trackers
   - **Subscribed users**: Unlimited trackers
3. **Caching**: Subscription status is cached in Firestore and refreshed every hour

## Testing

1. Sign in with a test account
2. Try creating trackers:
   - Free users should be limited to 2 trackers
   - Subscribed users should be able to create unlimited trackers
3. Check the browser console for any errors

## Troubleshooting

### Subscription not detected?
- Verify your API key and Product ID are correct in Vercel environment variables
- Check that the user's email in your app matches the email in Whop
- Check the browser console and Vercel function logs for errors

### API errors?
- Make sure your Whop API key has the correct permissions
- Verify the Product ID matches your subscription product in Whop
- Check Vercel function logs: **Vercel Dashboard** → **Your Project** → **Functions** → **whop-check-subscription**

## Notes

- The subscription check happens asynchronously and won't block the UI
- Subscription status is cached for 1 hour to reduce API calls
- The integration uses email matching to identify users between your app and Whop
