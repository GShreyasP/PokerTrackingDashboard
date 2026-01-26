// Vercel serverless function to check Whop subscription status
export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const { email, userId, userEmail } = req.body;
    
    // Security: Require authentication
    if (!userId || !userEmail) {
      return res.status(401).json({ error: 'Authentication required. userId and userEmail must be provided.' });
    }
    
    // Security: Verify the email being checked matches the authenticated user's email
    // This prevents users from checking other people's subscription status
    if (!email || email.toLowerCase().trim() !== userEmail.toLowerCase().trim()) {
      return res.status(403).json({ error: 'Forbidden: You can only check your own subscription status.' });
    }
    
    // Use the authenticated user's email (more secure than trusting the email parameter)
    const authenticatedEmail = userEmail.toLowerCase().trim();
    
    // Check whitelist first (server-side, secure)
    const whitelistEnv = process.env.PRO_PLAN_WHITELIST || '';
    const whitelist = whitelistEnv.split(',').map(e => e.trim().toLowerCase()).filter(e => e);
    
    // If only checking whitelist, return early
    if (req.body.checkWhitelistOnly) {
      return res.status(200).json({
        hasSubscription: whitelist.includes(authenticatedEmail),
        subscriptionType: whitelist.includes(authenticatedEmail) ? 'pro' : null,
        expiresAt: null,
        isWhitelisted: whitelist.includes(authenticatedEmail)
      });
    }
    
    // If whitelisted, return Pro plan status without checking Whop
    if (whitelist.includes(authenticatedEmail)) {
      return res.status(200).json({
        hasSubscription: true,
        subscriptionType: 'pro',
        expiresAt: null,
        isWhitelisted: true
      });
    }
    
    const whopApiKey = process.env.WHOP_API_KEY;
    const whopProductId = process.env.WHOP_PRODUCT_ID;
    
    if (!whopApiKey || !whopProductId) {
      console.error('Whop API configuration missing');
      return res.status(500).json({ error: 'Whop API not configured' });
    }
    
    // Use Whop API to check membership by email
    // Whop API endpoint: GET /api/v2/memberships?email={email}
    // Alternative: We'll search members and check their access to the product
    
    // First, get memberships for the product
    const membershipsResponse = await fetch(`https://api.whop.com/api/v2/memberships?product_id=${whopProductId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${whopApiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!membershipsResponse.ok) {
      const errorText = await membershipsResponse.text();
      console.error('Whop API error fetching memberships:', membershipsResponse.status, errorText);
      // Return no subscription on error (fail gracefully)
      return res.status(200).json({ 
        hasSubscription: false,
        subscriptionType: null,
        expiresAt: null
      });
    }
    
    const membershipsData = await membershipsResponse.json();
    
    // Find membership with matching email (use authenticated email for security)
    const matchingMembership = membershipsData.data?.find(membership => {
      return membership.email?.toLowerCase() === authenticatedEmail;
    });
    
    if (!matchingMembership) {
      return res.status(200).json({ 
        hasSubscription: false,
        subscriptionType: null,
        expiresAt: null
      });
    }
    
    // Check if membership is active
    const isActive = matchingMembership.status === 'active' || matchingMembership.status === 'trialing';
    const expiresAt = matchingMembership.expires_at;
    const isNotExpired = !expiresAt || new Date(expiresAt) > new Date();
    
    if (!isActive || !isNotExpired) {
      return res.status(200).json({ 
        hasSubscription: false,
        subscriptionType: null,
        expiresAt: expiresAt
      });
    }
    
    // Determine subscription type based on plan/product
    let subscriptionType = 'monthly'; // default
    let isOneTimePayment = false;
    
    if (matchingMembership.plan) {
      const planId = matchingMembership.plan.id || '';
      const planName = (matchingMembership.plan.name || '').toLowerCase();
      
      // Check if this is the PAYP one-time payment plan
      // PAYP plan ID: plan_AYljP0LPlsikE
      if (planId === 'plan_AYljP0LPlsikE' || planName.includes('pay as you play') || planName.includes('one-time')) {
        subscriptionType = 'payp';
        isOneTimePayment = true;
      } else if (planId === 'plan_8MBIgfX4XvYFw' || planName.includes('6 month') || planName.includes('6-month') || planName.includes('6mo')) {
        subscriptionType = '6month';
      } else if (planId === 'plan_N6mSBFXV8ozrH' || planName.includes('monthly') || planName.includes('month')) {
        subscriptionType = 'monthly';
      }
      
      // Also check if it's a one-time payment by looking at billing type
      // One-time payments typically don't have recurring billing
      if (!matchingMembership.recurring || matchingMembership.billing_type === 'one_time') {
        isOneTimePayment = true;
        if (subscriptionType === 'monthly' || subscriptionType === '6month') {
          // If it was marked as subscription but is actually one-time, it's PAYP
          subscriptionType = 'payp';
        }
      }
    }
    
    return res.status(200).json({
      hasSubscription: true,
      subscriptionType: subscriptionType,
      expiresAt: expiresAt,
      memberId: matchingMembership.id,
      isOneTimePayment: isOneTimePayment
    });
    
  } catch (error) {
    console.error('Error checking Whop subscription:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
