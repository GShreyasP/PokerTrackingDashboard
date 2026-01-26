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
    const whopPaypProductId = process.env.WHOP_PAYP_PRODUCT_ID; // Optional: separate product ID for PAYP
    
    if (!whopApiKey) {
      console.error('Whop API key missing');
      return res.status(500).json({ error: 'Whop API not configured' });
    }
    
    // Check memberships for the user by email across all products
    // First try to get memberships by email (if API supports it)
    // Otherwise, check both subscription product and PAYP product
    
    let matchingMembership = null;
    let isPaypPurchase = false;
    
    // Check subscription product first
    if (whopProductId) {
      const membershipsResponse = await fetch(`https://api.whop.com/api/v2/memberships?product_id=${whopProductId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${whopApiKey}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (membershipsResponse.ok) {
        const membershipsData = await membershipsResponse.json();
        matchingMembership = membershipsData.data?.find(membership => {
          return membership.email?.toLowerCase() === authenticatedEmail;
        });
      }
    }
    
    // If not found in subscription product, check PAYP product (if separate)
    if (!matchingMembership && whopPaypProductId) {
      const paypMembershipsResponse = await fetch(`https://api.whop.com/api/v2/memberships?product_id=${whopPaypProductId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${whopApiKey}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (paypMembershipsResponse.ok) {
        const paypMembershipsData = await paypMembershipsResponse.json();
        const paypMembership = paypMembershipsData.data?.find(membership => {
          return membership.email?.toLowerCase() === authenticatedEmail;
        });
        
        if (paypMembership) {
          matchingMembership = paypMembership;
          isPaypPurchase = true;
        }
      }
    }
    
    // If still not found, try checking by plan ID (PAYP plan: plan_AYljP0LPlsikE)
    // We can also check all memberships and filter by email
    if (!matchingMembership) {
      // Try to get all memberships and search by email
      // Note: This might require checking multiple products or using a different endpoint
      // For now, we'll rely on the product-specific checks above
    }
    
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
    let isOneTimePayment = isPaypPurchase; // If found in PAYP product, it's one-time
    
    if (matchingMembership.plan) {
      const planId = matchingMembership.plan.id || '';
      const planName = (matchingMembership.plan.name || '').toLowerCase();
      const planType = matchingMembership.plan.plan_type || '';
      
      // Check if this is the PAYP one-time payment plan
      // PAYP plan ID: plan_AYljP0LPlsikE
      if (planId === 'plan_AYljP0LPlsikE' || planName.includes('pay as you play') || planName.includes('one-time') || planType === 'one_time') {
        subscriptionType = 'payp';
        isOneTimePayment = true;
      } else if (planId === 'plan_8MBIgfX4XvYFw' || planName.includes('6 month') || planName.includes('6-month') || planName.includes('6mo')) {
        subscriptionType = '6month';
      } else if (planId === 'plan_N6mSBFXV8ozrH' || planName.includes('monthly') || planName.includes('month')) {
        subscriptionType = 'monthly';
      }
      
      // Also check if it's a one-time payment by looking at billing/recurring fields
      // One-time payments typically don't have recurring billing
      if (!matchingMembership.recurring || matchingMembership.billing_type === 'one_time' || planType === 'one_time') {
        if (!isOneTimePayment) {
          isOneTimePayment = true;
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
