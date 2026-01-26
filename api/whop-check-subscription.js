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
    
    // Check for PAYP based on plan price ($1) and reason ("one time payment")
    // This is the most reliable way to identify PAYP users
    const planPrice = matchingMembership.plan?.price || matchingMembership.plan?.amount || matchingMembership.price || matchingMembership.amount;
    const reason = (matchingMembership.reason || '').toLowerCase();
    const planName = (matchingMembership.plan?.name || '').toLowerCase();
    
    // Check if plan price is $1 and reason is "one time payment"
    const isPaypByPriceAndReason = (
      (planPrice === 1 || planPrice === 1.00 || planPrice === '$1' || planPrice === '$1.00' || 
       String(planPrice).includes('1.00') || String(planPrice).replace(/[^0-9.]/g, '') === '1') &&
      (reason.includes('one time payment') || reason.includes('one-time payment'))
    );
    
    if (matchingMembership.plan) {
      const planId = matchingMembership.plan.id || '';
      const planType = matchingMembership.plan.plan_type || '';
      
      // Primary check: Plan price is $1 AND reason is "one time payment" = PAYP
      if (isPaypByPriceAndReason) {
        subscriptionType = 'payp';
        isOneTimePayment = true;
      }
      // Secondary check: PAYP plan ID
      else if (planId === 'plan_AYljP0LPlsikE') {
        subscriptionType = 'payp';
        isOneTimePayment = true;
      }
      // Tertiary check: Plan name contains PAYP keywords
      else if (planName.includes('pay as you play') || planName.includes('one-time') || planName.includes('payp')) {
        subscriptionType = 'payp';
        isOneTimePayment = true;
      }
      // Check for 6-month subscription
      else if (planId === 'plan_8MBIgfX4XvYFw' || planName.includes('6 month') || planName.includes('6-month') || planName.includes('6mo')) {
        subscriptionType = '6month';
      }
      // Check for monthly subscription
      else if (planId === 'plan_N6mSBFXV8ozrH' || planName.includes('monthly') || planName.includes('month')) {
        subscriptionType = 'monthly';
      }
      
      // Also check if it's a one-time payment by looking at billing/recurring fields
      // But only if we haven't already identified it as PAYP
      if (!isOneTimePayment) {
        if (!matchingMembership.recurring || matchingMembership.billing_type === 'one_time' || planType === 'one_time') {
          // If price is $1, it's likely PAYP even without explicit reason
          if (planPrice === 1 || planPrice === 1.00 || planPrice === '$1' || planPrice === '$1.00' || 
              String(planPrice).includes('1.00') || String(planPrice).replace(/[^0-9.]/g, '') === '1') {
            subscriptionType = 'payp';
            isOneTimePayment = true;
          }
        }
      }
    } else {
      // No plan object, but check membership-level fields
      if (isPaypByPriceAndReason) {
        subscriptionType = 'payp';
        isOneTimePayment = true;
      }
    }
    
    // Log for debugging (remove in production or make conditional)
    console.log('Whop membership check:', {
      planPrice,
      reason,
      planName: matchingMembership.plan?.name,
      planId: matchingMembership.plan?.id,
      isPaypByPriceAndReason,
      subscriptionType,
      isOneTimePayment
    });
    
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
