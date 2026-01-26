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
    // Also fetch payments to get the "reason" field
    
    let matchingMembership = null;
    let matchingPayment = null;
    let isPaypPurchase = false;
    
    // Helper function to check if membership matches email
    const membershipMatchesEmail = (membership) => {
      const email = membership.email || membership.user?.email || membership.member?.email || '';
      return email.toLowerCase() === authenticatedEmail;
    };
    
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
        matchingMembership = membershipsData.data?.find(membershipMatchesEmail);
      } else {
        console.error('Error fetching memberships:', membershipsResponse.status, await membershipsResponse.text());
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
        const paypMembership = paypMembershipsData.data?.find(membershipMatchesEmail);
        
        if (paypMembership) {
          matchingMembership = paypMembership;
          isPaypPurchase = true;
        }
      }
    }
    
    // If still not found, try fetching all memberships (without product filter)
    // This is a fallback in case PAYP is in a different product
    if (!matchingMembership) {
      try {
        const allMembershipsResponse = await fetch(`https://api.whop.com/api/v2/memberships`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${whopApiKey}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (allMembershipsResponse.ok) {
          const allMembershipsData = await allMembershipsResponse.json();
          matchingMembership = allMembershipsData.data?.find(membershipMatchesEmail);
          
          // If found, check if it's PAYP by plan ID
          if (matchingMembership && matchingMembership.plan?.id === 'plan_AYljP0LPlsikE') {
            isPaypPurchase = true;
          }
        }
      } catch (error) {
        console.error('Error fetching all memberships:', error);
      }
    }
    
    // Fetch payments to get the "reason" field
    // Payments contain the reason field that shows "One time payment"
    try {
      const paymentsResponse = await fetch(`https://api.whop.com/api/v2/payments`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${whopApiKey}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (paymentsResponse.ok) {
        const paymentsData = await paymentsResponse.json();
        // Find payment for this user
        matchingPayment = paymentsData.data?.find(payment => {
          const paymentEmail = payment.user?.email || payment.email || '';
          return paymentEmail.toLowerCase() === authenticatedEmail;
        });
      }
    } catch (error) {
      console.error('Error fetching payments:', error);
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
    // Check multiple possible locations for price and reason fields
    const planPrice = matchingMembership.plan?.price || 
                     matchingMembership.plan?.amount || 
                     matchingMembership.plan?.initial_price ||
                     matchingMembership.plan?.renewal_price ||
                     matchingMembership.price || 
                     matchingMembership.amount;
    
    // Get reason from payment object (most reliable source)
    const reason = (matchingPayment?.reason || 
                   matchingMembership.reason || 
                   matchingMembership.payment?.reason ||
                   matchingMembership.plan?.reason || '').toLowerCase();
    
    const planName = (matchingMembership.plan?.name || '').toLowerCase();
    
    // Normalize price to number for comparison (handle $1, $1.00, 1, 1.00, etc.)
    const normalizePrice = (price) => {
      if (!price && price !== 0) return null;
      if (typeof price === 'number') return price;
      const numStr = String(price).replace(/[^0-9.]/g, '');
      const num = parseFloat(numStr);
      return isNaN(num) ? null : num;
    };
    
    const normalizedPrice = normalizePrice(planPrice);
    const isOneDollar = normalizedPrice === 1 || normalizedPrice === 1.0;
    
    // Check if plan price is $1 and reason is "one time payment"
    const isPaypByPriceAndReason = (
      isOneDollar &&
      (reason.includes('one time payment') || reason.includes('one-time payment') || reason.includes('onetime payment'))
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
          if (isOneDollar) {
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
      authenticatedEmail,
      membershipFound: !!matchingMembership,
      paymentFound: !!matchingPayment,
      membershipEmail: matchingMembership?.email || matchingMembership?.user?.email || matchingMembership?.member?.email,
      paymentEmail: matchingPayment?.user?.email || matchingPayment?.email,
      planPrice,
      normalizedPrice,
      reason,
      planName: matchingMembership.plan?.name,
      planId: matchingMembership.plan?.id,
      isPaypByPriceAndReason,
      isOneDollar,
      subscriptionType,
      isOneTimePayment,
      membershipStatus: matchingMembership?.status,
      membershipData: JSON.stringify(matchingMembership, null, 2).substring(0, 500),
      paymentData: matchingPayment ? JSON.stringify(matchingPayment, null, 2).substring(0, 500) : 'No payment found'
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
