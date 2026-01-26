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
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
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
    
    // Find membership with matching email
    const matchingMembership = membershipsData.data?.find(membership => {
      return membership.email?.toLowerCase() === email.toLowerCase();
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
    if (matchingMembership.plan) {
      const planName = (matchingMembership.plan.name || '').toLowerCase();
      if (planName.includes('6 month') || planName.includes('6-month') || planName.includes('6mo')) {
        subscriptionType = '6month';
      } else if (planName.includes('monthly') || planName.includes('month')) {
        subscriptionType = 'monthly';
      }
    }
    
    return res.status(200).json({
      hasSubscription: true,
      subscriptionType: subscriptionType,
      expiresAt: expiresAt,
      memberId: matchingMembership.id
    });
    
  } catch (error) {
    console.error('Error checking Whop subscription:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
