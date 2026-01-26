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
    
    // Fetch payments FIRST - one-time PAYP payments might not create memberships
    // Payments contain the reason field that shows "One time payment"
    let allPayments = [];
    let paypPaymentCount = 0;
    let matchedPaymentsDebug = [];
    
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
        allPayments = paymentsData.data || [];
        
        // Find all PAYP payments for this user ($1, one-time)
        const userPaypPayments = allPayments.filter(payment => {
          const paymentEmail = payment.user?.email || payment.email || '';
          const paymentAmount = payment.amount || payment.plan?.price || 0;
          const paymentReason = (payment.reason || '').toLowerCase();
          const normalizedAmount = typeof paymentAmount === 'number' ? paymentAmount : parseFloat(String(paymentAmount).replace(/[^0-9.]/g, ''));
          
          const emailMatches = paymentEmail.toLowerCase() === authenticatedEmail;
          const isOneDollar = normalizedAmount === 1 || normalizedAmount === 1.0;
          const isOneTime = paymentReason.includes('one time payment') || 
                           paymentReason.includes('one-time payment') || 
                           paymentReason.includes('onetime payment') ||
                           payment.status === 'succeeded';
          
          if (emailMatches && isOneDollar && isOneTime) {
            matchedPaymentsDebug.push({
              id: payment.id,
              email: paymentEmail,
              amount: paymentAmount,
              normalizedAmount: normalizedAmount,
              reason: payment.reason,
              status: payment.status,
              created_at: payment.created_at
            });
            return true;
          }
          
          return false;
        });
        
        paypPaymentCount = userPaypPayments.length;
        
        // If we found PAYP payments, use the first one as matchingPayment
        if (userPaypPayments.length > 0) {
          matchingPayment = userPaypPayments[0];
        }
        
        // If we found PAYP payments but no membership, user still has PAYP subscription
        // (one-time payments might not create active memberships)
        if (paypPaymentCount > 0 && !matchingMembership) {
          console.log('=== PAYP PAYMENTS FOUND BUT NO MEMBERSHIP ===');
          console.log('Found', paypPaymentCount, 'PAYP payments for', authenticatedEmail);
          console.log('Payments:', JSON.stringify(matchedPaymentsDebug, null, 2));
          console.log('Treating as PAYP subscription based on payments');
          console.log('===============================================');
          
          // Return PAYP subscription status based on payments
          return res.status(200).json({
            hasSubscription: true,
            subscriptionType: 'payp',
            expiresAt: null, // One-time payments don't expire
            memberId: null,
            isOneTimePayment: true,
            paypPaymentCount: paypPaymentCount,
            debug: {
              authenticatedEmail: authenticatedEmail,
              membershipEmail: null,
              paymentEmail: matchingPayment?.user?.email || matchingPayment?.email,
              planPrice: matchingPayment?.amount || 1,
              normalizedPrice: 1,
              reason: matchingPayment?.reason || 'one time payment',
              isOneDollar: true,
              isPaypByPriceAndReason: true,
              totalPaymentsFound: allPayments.length,
              matchedPayments: matchedPaymentsDebug,
              note: 'Subscription detected from payments only (no membership found)'
            }
          });
        }
      } else {
        const errorText = await paymentsResponse.text();
        console.error('Error fetching payments:', paymentsResponse.status, errorText);
      }
    } catch (error) {
      console.error('Error fetching payments:', error);
    }
    
    // If no membership AND no payments found, return no subscription
    if (!matchingMembership && paypPaymentCount === 0) {
      console.log('=== NO MEMBERSHIP AND NO PAYMENTS FOUND ===');
      console.log('Email:', authenticatedEmail);
      console.log('Total payments in system:', allPayments.length);
      console.log('===========================================');
      return res.status(200).json({ 
        hasSubscription: false,
        subscriptionType: null,
        expiresAt: null,
        debug: {
          authenticatedEmail: authenticatedEmail,
          totalPaymentsFound: allPayments.length,
          note: 'No membership or PAYP payments found'
        }
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
    const planPrice = matchingPayment?.amount ||  // Payment amount is most reliable
                     matchingPayment?.plan?.price ||
                     matchingMembership.plan?.price || 
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
    console.log('=== WHOP MEMBERSHIP CHECK DEBUG ===');
    console.log('Authenticated Email:', authenticatedEmail);
    console.log('Membership Found:', !!matchingMembership);
    console.log('Payment Found:', !!matchingPayment);
    console.log('Membership Email:', matchingMembership?.email || matchingMembership?.user?.email || matchingMembership?.member?.email || 'NO EMAIL IN MEMBERSHIP');
    console.log('Payment Email:', matchingPayment?.user?.email || matchingPayment?.email || 'NO EMAIL IN PAYMENT');
    console.log('Plan Price:', planPrice);
    console.log('Normalized Price:', normalizedPrice);
    console.log('Reason:', reason || 'NO REASON');
    console.log('Plan Name:', matchingMembership.plan?.name || 'NO PLAN NAME');
    console.log('Plan ID:', matchingMembership.plan?.id || 'NO PLAN ID');
    console.log('Is PAYP by Price and Reason:', isPaypByPriceAndReason);
    console.log('Is One Dollar:', isOneDollar);
    console.log('Subscription Type:', subscriptionType);
    console.log('Is One Time Payment:', isOneTimePayment);
    console.log('Membership Status:', matchingMembership?.status || 'NO STATUS');
    console.log('PAYP Payment Count:', paypPaymentCount);
    console.log('All Payments Sample:', JSON.stringify(allPaymentsDebug.slice(0, 5), null, 2));
    console.log('Matched PAYP Payments:', JSON.stringify(matchedPaymentsDebug, null, 2));
    console.log('Membership Data (sample):', JSON.stringify({
      id: matchingMembership?.id,
      email: matchingMembership?.email || matchingMembership?.user?.email,
      status: matchingMembership?.status,
      plan: matchingMembership?.plan ? {
        id: matchingMembership.plan.id,
        name: matchingMembership.plan.name,
        price: matchingMembership.plan.price
      } : null
    }, null, 2));
    console.log('====================================');
    
    // Use the payment count we already calculated above
    // (paypPaymentCount and matchedPaymentsDebug are already set from the earlier payment fetch)
    
    // Log all payments for debugging (if we haven't already)
    const allPaymentsDebug = allPayments.map(p => ({
      id: p.id,
      email: p.user?.email || p.email || 'no email',
      amount: p.amount || p.plan?.price || 'no amount',
      reason: p.reason || 'no reason',
      status: p.status || 'no status',
      created_at: p.created_at || 'no date'
    }));
    
    // Detailed logging
    console.log('=== PAYP PAYMENT COUNTING DEBUG ===');
    console.log('Authenticated Email:', authenticatedEmail);
    console.log('Total payments in system:', allPayments.length);
    console.log('All payments (first 10):', JSON.stringify(allPaymentsDebug.slice(0, 10), null, 2));
    console.log('Matched PAYP payments:', JSON.stringify(matchedPaymentsDebug, null, 2));
    console.log('PAYP Payment Count:', paypPaymentCount);
    console.log('===================================');
    
    return res.status(200).json({
      hasSubscription: true,
      subscriptionType: subscriptionType,
      expiresAt: expiresAt,
      memberId: matchingMembership.id,
      isOneTimePayment: isOneTimePayment,
      paypPaymentCount: paypPaymentCount, // Number of PAYP payments made
      // Debug information (remove in production)
      debug: {
        authenticatedEmail: authenticatedEmail,
        membershipEmail: matchingMembership?.email || matchingMembership?.user?.email || matchingMembership?.member?.email,
        paymentEmail: matchingPayment?.user?.email || matchingPayment?.email,
        planPrice: planPrice,
        normalizedPrice: normalizedPrice,
        reason: reason,
        isOneDollar: isOneDollar,
        isPaypByPriceAndReason: isPaypByPriceAndReason,
        totalPaymentsFound: allPaymentsDebug.length,
        matchedPayments: matchedPaymentsDebug
      }
    });
    
  } catch (error) {
    console.error('Error checking Whop subscription:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
