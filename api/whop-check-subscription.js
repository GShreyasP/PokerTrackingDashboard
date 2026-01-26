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
    const { email, getAllPayments, getAllMemberships } = req.body;
    
    // If getAllMemberships is true, return all memberships for debugging
    if (getAllMemberships) {
      const whopApiKey = process.env.WHOP_API_KEY;
      
      if (!whopApiKey) {
        return res.status(500).json({ error: 'Whop API not configured' });
      }
      
      let allMemberships = [];
      
      try {
        // Fetch all memberships with pagination
        let page = 1;
        let hasMorePages = true;
        
        while (hasMorePages) {
          const membershipsResponse = await fetch(`https://api.whop.com/api/v2/memberships?per_page=100&page=${page}`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${whopApiKey}`,
              'Content-Type': 'application/json'
            }
          });
          
          if (!membershipsResponse.ok) {
            const errorText = await membershipsResponse.text();
            console.error(`Error fetching memberships page ${page}:`, membershipsResponse.status, errorText);
            break;
          }
          
          const membershipsData = await membershipsResponse.json();
          
          // Handle different response structures
          let pageMemberships = [];
          if (Array.isArray(membershipsData)) {
            pageMemberships = membershipsData;
          } else if (Array.isArray(membershipsData.data)) {
            pageMemberships = membershipsData.data;
          } else if (membershipsData.memberships && Array.isArray(membershipsData.memberships)) {
            pageMemberships = membershipsData.memberships;
          }
          
          allMemberships = [...allMemberships, ...pageMemberships];
          
          // Check if there are more pages
          const meta = membershipsData.meta || {};
          const totalPages = meta.total_pages || meta.last_page || 1;
          hasMorePages = page < totalPages;
          page++;
          
          // Safety limit: don't fetch more than 10 pages
          if (page > 10) break;
        }
        
        // Return all memberships with key fields for inspection
        const membershipSummary = allMemberships.map(m => ({
          id: m.id,
          membershipId: m.id,
          email: m.email || m.user?.email || m.member?.email || 'no email',
          userId: m.user?.id || m.member?.id || 'no user id',
          status: m.status || 'no status',
          created_at: m.created_at || 'no date',
          expires_at: m.expires_at || 'no expiry',
          product: m.product?.title || m.product?.name || 'no product',
          productId: m.product?.id || 'no product id',
          plan: m.plan?.name || 'no plan',
          planId: m.plan?.id || 'no plan id',
          planPrice: m.plan?.price || m.plan?.amount || 'no price',
          // Include full membership object for deep inspection (limit size)
          fullMembership: JSON.stringify(m).substring(0, 500)
        }));
        
        return res.status(200).json({
          totalMemberships: allMemberships.length,
          memberships: membershipSummary,
          sampleRawMembership: allMemberships[0] || null
        });
        
      } catch (error) {
        console.error('Error fetching all memberships:', error);
        return res.status(500).json({ 
          error: 'Failed to fetch memberships',
          details: error.message 
        });
      }
    }
    
    // If getAllPayments is true, return all payments for debugging
    if (getAllPayments) {
      const whopApiKey = process.env.WHOP_API_KEY;
      
      if (!whopApiKey) {
        return res.status(500).json({ error: 'Whop API not configured' });
      }
      
      let allPayments = [];
      
      try {
        // Fetch all payments with pagination
        let page = 1;
        let hasMorePages = true;
        
        while (hasMorePages) {
          const paymentsResponse = await fetch(`https://api.whop.com/api/v2/payments?per_page=100&page=${page}`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${whopApiKey}`,
              'Content-Type': 'application/json'
            }
          });
          
          if (!paymentsResponse.ok) {
            const errorText = await paymentsResponse.text();
            console.error(`Error fetching payments page ${page}:`, paymentsResponse.status, errorText);
            break;
          }
          
          const paymentsData = await paymentsResponse.json();
          
          // Handle different response structures
          let pagePayments = [];
          if (Array.isArray(paymentsData)) {
            pagePayments = paymentsData;
          } else if (Array.isArray(paymentsData.data)) {
            pagePayments = paymentsData.data;
          } else if (paymentsData.payments && Array.isArray(paymentsData.payments)) {
            pagePayments = paymentsData.payments;
          }
          
          allPayments = [...allPayments, ...pagePayments];
          
          // Check if there are more pages
          const meta = paymentsData.meta || {};
          const totalPages = meta.total_pages || meta.last_page || 1;
          hasMorePages = page < totalPages;
          page++;
          
          // Safety limit: don't fetch more than 10 pages
          if (page > 10) break;
        }
        
        // Return all payments with key fields for inspection
        const paymentSummary = allPayments.map(p => ({
          id: p.id,
          email: p.user?.email || p.email || p.member?.email || 'no email',
          userId: p.user?.id || p.member?.id || 'no user id',
          amount: p.amount || p.total || p.total_spend || p.plan?.price || p.plan?.amount || 'no amount',
          amountRaw: p.amount,
          totalRaw: p.total,
          totalSpendRaw: p.total_spend,
          planPriceRaw: p.plan?.price,
          planAmountRaw: p.plan?.amount,
          reason: p.reason || 'no reason',
          status: p.status || 'no status',
          created_at: p.created_at || 'no date',
          product: p.product?.title || p.product?.name || 'no product',
          plan: p.plan?.name || 'no plan',
          planId: p.plan?.id || 'no plan id',
          // Include full payment object for deep inspection (limit size)
          fullPayment: JSON.stringify(p).substring(0, 500)
        }));
        
        return res.status(200).json({
          totalPayments: allPayments.length,
          payments: paymentSummary,
          sampleRawPayment: allPayments[0] || null
        });
        
      } catch (error) {
        console.error('Error fetching all payments:', error);
        return res.status(500).json({ 
          error: 'Failed to fetch payments',
          details: error.message 
        });
      }
    }
    
    // Security: Require email for normal subscription check
    if (!email) {
      return res.status(401).json({ error: 'Email is required.' });
    }
    
    // Use the provided email
    const authenticatedEmail = email.toLowerCase().trim();
    
    // Check whitelist first (server-side, secure)
    const whitelistEnv = process.env.PRO_PLAN_WHITELIST || '';
    const whitelist = whitelistEnv.split(',').map(e => e.trim().toLowerCase()).filter(e => e);
    
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
    
    if (!whopApiKey) {
      console.error('Whop API key missing');
      return res.status(500).json({ error: 'Whop API not configured' });
    }
    
    // APPROACH: Check memberships first (they have email), then match payments by membership ID
    let userMembershipIds = [];
    let userPayments = [];
    
    try {
      // Step 1: Find user's memberships by email (memberships have email, payments don't)
      const membershipsResponse = await fetch(`https://api.whop.com/api/v2/memberships`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${whopApiKey}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (membershipsResponse.ok) {
        const membershipsData = await membershipsResponse.json();
        const allMemberships = Array.isArray(membershipsData) 
          ? membershipsData 
          : (Array.isArray(membershipsData.data) ? membershipsData.data : []);
        
        // Find memberships matching this email
        const userMemberships = allMemberships.filter(membership => {
          const memEmail = (membership.email || membership.user?.email || membership.member?.email || '').toLowerCase().trim();
          const authUsername = authenticatedEmail.split('@')[0];
          const memUsername = memEmail.split('@')[0];
          
          // Exact match or username match (handles typos)
          return memEmail === authenticatedEmail || authUsername === memUsername;
        });
        
        // Extract membership IDs
        userMembershipIds = userMemberships.map(m => m.id).filter(Boolean);
        
        console.log(`Found ${userMemberships.length} memberships for ${authenticatedEmail}`);
        console.log(`Membership IDs:`, userMembershipIds);
      }
      
      // Step 2: Fetch all payments and match by membership ID
      let page = 1;
      let hasMorePages = true;
      
      while (hasMorePages) {
        const paymentsResponse = await fetch(`https://api.whop.com/api/v2/payments?per_page=100&page=${page}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${whopApiKey}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (!paymentsResponse.ok) {
          const errorText = await paymentsResponse.text();
          console.error(`Error fetching payments page ${page}:`, paymentsResponse.status, errorText);
          break;
        }
        
        const paymentsData = await paymentsResponse.json();
        
        // Handle different response structures
        let pagePayments = [];
        if (Array.isArray(paymentsData)) {
          pagePayments = paymentsData;
        } else if (Array.isArray(paymentsData.data)) {
          pagePayments = paymentsData.data;
        } else if (paymentsData.payments && Array.isArray(paymentsData.payments)) {
          pagePayments = paymentsData.payments;
        }
        
        // Filter payments by membership ID
        const matchingPayments = pagePayments.filter(payment => {
          const paymentMembershipId = payment.membership_id || payment.membership?.id;
          return paymentMembershipId && userMembershipIds.includes(paymentMembershipId);
        });
        
        userPayments = [...userPayments, ...matchingPayments];
        
        // Check if there are more pages
        const meta = paymentsData.meta || {};
        const totalPages = meta.total_pages || meta.last_page || 1;
        hasMorePages = page < totalPages;
        page++;
        
        // Safety limit: don't fetch more than 10 pages
        if (page > 10) break;
      }
      
      console.log(`Found ${userPayments.length} payments for ${authenticatedEmail} (matched by membership IDs)`);
      
    } catch (error) {
      console.error('Error fetching memberships/payments:', error);
      return res.status(500).json({ 
        error: 'Failed to fetch memberships/payments',
        details: error.message 
      });
    }
    
    // If no payments found, return no subscription
    if (userPayments.length === 0) {
      return res.status(200).json({ 
        hasSubscription: false,
        subscriptionType: null,
        expiresAt: null,
        paypPaymentCount: 0
      });
    }
    
    // Categorize based on total spend amount
    // Check each payment's amount and categorize accordingly
    let subscriptionType = null;
    let paypPaymentCount = 0;
    let monthlyPaymentCount = 0;
    let sixMonthPaymentCount = 0;
    let highestAmount = 0;
    let latestPayment = null;
    
    userPayments.forEach(payment => {
      // Get payment amount - use 'amount' field as primary source
      const amount = payment.amount || 0;
      
      // Normalize amount to number
      const normalizedAmount = typeof amount === 'number' 
        ? amount 
        : parseFloat(String(amount).replace(/[^0-9.]/g, '')) || 0;
      
      // Track latest payment
      if (!latestPayment || (payment.created_at && payment.created_at > latestPayment.created_at)) {
        latestPayment = payment;
      }
      
      // Categorize by amount
      if (normalizedAmount === 1 || normalizedAmount === 1.0) {
        paypPaymentCount++;
        if (!subscriptionType) subscriptionType = 'payp';
      } else if (normalizedAmount === 4.99 || normalizedAmount === 4.99) {
        monthlyPaymentCount++;
        if (!subscriptionType || subscriptionType === 'payp') subscriptionType = 'monthly';
      } else if (normalizedAmount === 19.99 || normalizedAmount === 19.99) {
        sixMonthPaymentCount++;
        if (!subscriptionType || subscriptionType === 'payp' || subscriptionType === 'monthly') {
          subscriptionType = '6month';
        }
      }
      
      if (normalizedAmount > highestAmount) {
        highestAmount = normalizedAmount;
      }
    });
    
    // Determine final subscription type based on highest payment or most recent
    // Priority: 6-month > monthly > PAYP
    if (sixMonthPaymentCount > 0) {
      subscriptionType = '6month';
    } else if (monthlyPaymentCount > 0) {
      subscriptionType = 'monthly';
    } else if (paypPaymentCount > 0) {
      subscriptionType = 'payp';
    }
    
    // For recurring subscriptions, check if they're still active
    let expiresAt = null;
    let hasSubscription = true;
    
    if (subscriptionType === 'monthly' || subscriptionType === '6month') {
      // For recurring subscriptions, check memberships for expiration
      try {
        const membershipsResponse = await fetch(`https://api.whop.com/api/v2/memberships`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${whopApiKey}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (membershipsResponse.ok) {
          const membershipsData = await membershipsResponse.json();
          const memberships = Array.isArray(membershipsData) 
            ? membershipsData 
            : (Array.isArray(membershipsData.data) ? membershipsData.data : []);
          
          const userMembership = memberships.find(m => {
            const memEmail = (m.email || m.user?.email || m.member?.email || '').toLowerCase().trim();
            const authUsername = authenticatedEmail.split('@')[0];
            const memUsername = memEmail.split('@')[0];
            return memEmail === authenticatedEmail || authUsername === memUsername;
          });
          
          if (userMembership) {
            expiresAt = userMembership.expires_at;
            const isActive = userMembership.status === 'active' || userMembership.status === 'trialing';
            const isNotExpired = !expiresAt || new Date(expiresAt) > new Date();
            hasSubscription = isActive && isNotExpired;
          }
        }
      } catch (error) {
        console.error('Error checking memberships:', error);
        // If membership check fails, assume subscription is valid based on payments
      }
    }
    
    // PAYP users always have subscription (one-time payments don't expire)
    if (subscriptionType === 'payp') {
      hasSubscription = true;
      expiresAt = null;
    }
    
    console.log('=== SUBSCRIPTION CHECK RESULTS ===');
    console.log('Email:', authenticatedEmail);
    console.log('Total Payments:', userPayments.length);
    console.log('PAYP Payments:', paypPaymentCount);
    console.log('Monthly Payments:', monthlyPaymentCount);
    console.log('6-Month Payments:', sixMonthPaymentCount);
    console.log('Subscription Type:', subscriptionType);
    console.log('Has Subscription:', hasSubscription);
    console.log('Expires At:', expiresAt);
    console.log('==================================');
    
    return res.status(200).json({
      hasSubscription: hasSubscription,
      subscriptionType: subscriptionType,
      expiresAt: expiresAt,
      isOneTimePayment: subscriptionType === 'payp',
      paypPaymentCount: paypPaymentCount,
      monthlyPaymentCount: monthlyPaymentCount,
      sixMonthPaymentCount: sixMonthPaymentCount,
      totalPayments: userPayments.length
    });
    
  } catch (error) {
    console.error('Error checking Whop subscription:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
}
