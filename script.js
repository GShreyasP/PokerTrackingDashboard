// State management
let state = {
    people: [],
    stackValue: 0, // Dollar value of 1 stack
    chipsPerStack: 0,
    sameValue: true,
    chipValue: 0, // $ per chip when all chips are same
    chipValues: { // Individual chip values when different
        black: 0,
        white: 0,
        green: 0,
        red: 0,
        blue: 0
    },
    chipCounts: { // Number of each chip color per stack when different
        black: 0,
        white: 0,
        green: 0,
        red: 0,
        blue: 0
    },
    transactions: [],
    trackerId: null, // ID of current tracker (for multi-tracker support)
    trackerName: null // Name of current tracker
};

// User's trackers list (for multi-tracker support)
let userTrackers = [];

// Tracker viewing state
let trackerViewState = {
    isViewingFriendTracker: false,
    viewingTrackerOwnerId: null,
    hasEditAccess: false,
    isOwner: true,
    ownTrackerState: null // Store user's own tracker state when switching to friend's tracker
};

// Real-time listener for tracker updates
let trackerRealtimeListener = null;

// Clean up tracker real-time listener
function cleanupTrackerListener() {
    if (trackerRealtimeListener) {
        trackerRealtimeListener();
        trackerRealtimeListener = null;
        console.log('Tracker real-time listener cleaned up');
    }
}

// Set up real-time listener for own tracker
function setupTrackerRealtimeListener(trackerId) {
    if (!window.firebaseDb || !window.currentUser || !trackerId) {
        return;
    }
    
    // Clean up existing listener first
    cleanupTrackerListener();
    
    const userId = window.currentUser.uid;
    const docRef = window.firebaseDb.collection('users').doc(userId);
    
    console.log('Setting up real-time listener for tracker:', trackerId);
    
    trackerRealtimeListener = docRef.onSnapshot((doc) => {
        if (!doc.exists) {
            console.log('Tracker document does not exist');
            return;
        }
        
        const userData = doc.data();
        const trackers = userData.trackers || [];
        const tracker = trackers.find(t => t.id === trackerId);
        
        if (!tracker || !tracker.state) {
            console.log('Tracker not found in document');
            return;
        }
        
        // Only update if we're still viewing this tracker (check to avoid stale updates)
        if (state.trackerId === trackerId && !trackerViewState.isViewingFriendTracker) {
            // Compare with current state to avoid unnecessary updates
            const newState = tracker.state;
            
            // Always update on listener changes (Firebase only fires on actual document changes)
            // The listener will fire for changes from other users/devices
            console.log('Real-time update received for tracker:', trackerId);
            restoreState(newState);
            state.trackerId = tracker.id;
            state.trackerName = tracker.name;
            updateTotalPot();
            updateChipValueDisplay();
            updateTotalChips();
            renderPeopleWidgets();
            renderLog();
        }
    }, (error) => {
        console.error('Error in tracker real-time listener:', error);
    });
}

// Set up real-time listener for friend's tracker
function setupFriendTrackerRealtimeListener(friendId, trackerId) {
    if (!window.firebaseDb || !friendId) {
        return;
    }
    
    // Clean up existing listener first
    cleanupTrackerListener();
    
    const docRef = window.firebaseDb.collection('users').doc(friendId);
    
    console.log('Setting up real-time listener for friend tracker:', friendId, trackerId);
    
    trackerRealtimeListener = docRef.onSnapshot((doc) => {
        if (!doc.exists) {
            console.log('Friend tracker document does not exist');
            return;
        }
        
        const userData = doc.data();
        const trackers = userData.trackers || [];
        const tracker = trackers.find(t => t.id === trackerId);
        
        if (!tracker || !tracker.state) {
            console.log('Friend tracker not found in document');
            return;
        }
        
        // Only update if we're still viewing this friend's tracker
        if (trackerViewState.isViewingFriendTracker && 
            trackerViewState.viewingTrackerOwnerId === friendId &&
            state.trackerId === trackerId) {
            
            // Always update on listener changes (Firebase only fires on actual document changes)
            const newState = tracker.state;
            console.log('Real-time update received for friend tracker:', friendId, trackerId);
            restoreState(newState);
            state.trackerId = tracker.id;
            state.trackerName = tracker.name;
            updateTotalPot();
            updateChipValueDisplay();
            updateTotalChips();
            renderPeopleWidgets();
            renderLog();
        }
    }, (error) => {
        console.error('Error in friend tracker real-time listener:', error);
    });
}

// DOM Elements
const mainScreen = document.getElementById('main-screen');
const setupSection = document.getElementById('setup-section');
const trackingSection = document.getElementById('tracking-section');
const numPeopleInput = document.getElementById('num-people');
const stackValueInput = document.getElementById('stack-value');
const chipsPerStackInput = document.getElementById('chips-per-stack');
const sameValueToggle = document.getElementById('same-value-toggle');
const differentChipsSection = document.getElementById('different-chips-section');
const setupBtn = document.getElementById('setup-btn');
const peopleWidgetsDiv = document.getElementById('people-widgets');
const totalPotAmount = document.getElementById('total-pot-amount');
const chipValueDisplay = document.getElementById('chip-value-display');
const totalChipsAmount = document.getElementById('total-chips-amount');
const chipsWarning = document.getElementById('chips-warning');
const logEntriesDiv = document.getElementById('log-entries');
const liveTablesContainer = document.getElementById('live-tables-container');

// Generate a short unique ID for users (6 characters: 2 letters + 4 numbers)
function generateUniqueId() {
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // Exclude I, O to avoid confusion
    const numbers = '0123456789';
    
    let id = '';
    // First 2 characters: letters
    for (let i = 0; i < 2; i++) {
        id += letters.charAt(Math.floor(Math.random() * letters.length));
    }
    // Next 4 characters: numbers
    for (let i = 0; i < 4; i++) {
        id += numbers.charAt(Math.floor(Math.random() * numbers.length));
    }
    
    return id;
}

// Get or create unique ID for current user
async function getOrCreateUniqueId(userId) {
    if (!window.firebaseDb) return null;
    
    try {
        const userRef = window.firebaseDb.collection('users').doc(userId);
        const userDoc = await userRef.get();
        
        if (userDoc.exists) {
            const userData = userDoc.data();
            if (userData.uniqueId) {
                return userData.uniqueId;
            }
        }
        
        // Generate new unique ID
        let uniqueId;
        let attempts = 0;
        let isUnique = false;
        
        // Check for uniqueness (try up to 10 times)
        while (!isUnique && attempts < 10) {
            uniqueId = generateUniqueId();
            const existingUser = await window.firebaseDb.collection('users')
                .where('uniqueId', '==', uniqueId)
                .limit(1)
                .get();
            
            if (existingUser.empty) {
                isUnique = true;
            } else {
                attempts++;
            }
        }
        
        if (!isUnique) {
            // Fallback: use first 6 characters of userId
            uniqueId = userId.substring(0, 6).toUpperCase();
        }
        
        // Save unique ID to user document
        await userRef.set({ uniqueId }, { merge: true });
        
        return uniqueId;
    } catch (error) {
        console.error('Error getting/creating unique ID:', error);
        // Fallback: use first 6 characters of userId
        return userId.substring(0, 6).toUpperCase();
    }
}

// Initialize
sameValueToggle.addEventListener('change', toggleChipValueMode);
setupBtn.addEventListener('click', startTracking);

// Validate number of people input
if (numPeopleInput) {
    numPeopleInput.addEventListener('input', function() {
        const numPeopleError = document.getElementById('num-people-error');
        const value = parseInt(this.value);
        
        if (numPeopleError) {
            if (value > 20) {
                numPeopleError.classList.remove('hidden');
            } else {
                numPeopleError.classList.add('hidden');
            }
        }
    });
}

// Load state from localStorage (fallback) or Firestore
function loadState() {
    const savedState = localStorage.getItem('pokerTrackerState');
    if (savedState) {
        try {
            const parsed = JSON.parse(savedState);
            restoreState(parsed);
            return true; // Data was loaded
        } catch (e) {
            console.error('Error loading state:', e);
        }
    }
    return false; // No data was loaded
}

// Restore state from parsed data
function restoreState(parsed) {
    // Restore state
    Object.assign(state, parsed);
    
    // Convert timestamp strings/objects back to Date objects
    if (state.transactions) {
        state.transactions.forEach(t => {
            if (t.timestamp) {
                // Handle Firestore Timestamp objects
                if (t.timestamp.toDate && typeof t.timestamp.toDate === 'function') {
                    t.timestamp = t.timestamp.toDate();
                }
                // Handle ISO string timestamps
                else if (typeof t.timestamp === 'string') {
                    t.timestamp = new Date(t.timestamp);
                }
                // Handle number timestamps
                else if (typeof t.timestamp === 'number') {
                    t.timestamp = new Date(t.timestamp);
                }
                // Already a Date object, keep it
                else if (t.timestamp instanceof Date) {
                    // Keep as is
                }
                // Fallback: try to create Date anyway
                else {
                    t.timestamp = new Date(t.timestamp);
                }
                
                // Validate the date
                if (isNaN(t.timestamp.getTime())) {
                    console.warn('Invalid date in transaction:', t, 'Using current date');
                    t.timestamp = new Date();
                }
            } else {
                // No timestamp, use current date
                t.timestamp = new Date();
            }
        });
    }
    
    // Migrate old data: ensure all people have moneyPutIn and moneyReturned
    if (state.people) {
        state.people.forEach(person => {
            if (person.moneyPutIn === undefined) {
                // For old data, use initialMoney or totalMoney as moneyPutIn
                person.moneyPutIn = person.initialMoney || person.totalMoney || 0;
            }
            if (person.moneyReturned === undefined) {
                person.moneyReturned = 0;
            }
        });
    }
    
    // If we have people, show tracking section
    if (state.people && state.people.length > 0) {
        mainScreen.classList.add('hidden');
        setupSection.classList.add('hidden');
        trackingSection.classList.remove('hidden');
        renderPeopleWidgets();
        updateTotalPot();
        updateChipValueDisplay();
        updateTotalChips();
        renderLog();
        
        // Update UI based on viewing mode
        const hasEditAccess = trackerViewState.isOwner || trackerViewState.hasEditAccess;
        updateUIForViewingMode(hasEditAccess);
        
        // Save viewing state if viewing own tracker
        if (!trackerViewState.isViewingFriendTracker && state.trackerId) {
            saveViewingState();
        }
    } else {
        // No data, show main screen
        mainScreen.classList.remove('hidden');
        setupSection.classList.add('hidden');
        trackingSection.classList.add('hidden');
        
        // Load live tables
        if (window.firebaseDb && window.currentUser) {
            loadLiveTables();
        }
    }
}

// Save viewing state to localStorage
function saveViewingState() {
    try {
        // Check if we're on main screen
        const mainScreen = document.getElementById('main-screen');
        const isOnMainScreen = mainScreen && !mainScreen.classList.contains('hidden');
        
        const viewingState = {
            isViewingFriendTracker: trackerViewState.isViewingFriendTracker,
            viewingTrackerOwnerId: trackerViewState.viewingTrackerOwnerId,
            hasEditAccess: trackerViewState.hasEditAccess,
            isOwner: trackerViewState.isOwner,
            currentTrackerId: state.trackerId, // Save current tracker ID if viewing own tracker
            isOnMainScreen: isOnMainScreen // Save if we're on main screen
        };
        localStorage.setItem('pokerViewingState', JSON.stringify(viewingState));
    } catch (error) {
        console.error('Error saving viewing state:', error);
    }
}

// Load viewing state from localStorage
function loadViewingState() {
    try {
        const savedState = localStorage.getItem('pokerViewingState');
        if (savedState) {
            const parsed = JSON.parse(savedState);
            return parsed;
        }
    } catch (error) {
        console.error('Error loading viewing state:', error);
    }
    return null;
}

// Clear viewing state from localStorage
function clearViewingState() {
    try {
        localStorage.removeItem('pokerViewingState');
    } catch (error) {
        console.error('Error clearing viewing state:', error);
    }
}

// Load user data from Firestore
async function loadUserData(userId) {
    if (!window.firebaseDb || !window.firebaseReady) {
        // Firebase not ready, use localStorage
        loadState();
        // Check for saved viewing state
        const savedViewingState = loadViewingState();
        if (savedViewingState && savedViewingState.isViewingFriendTracker && savedViewingState.viewingTrackerOwnerId) {
            // Restore friend tracker view
            try {
                await viewFriendTracker(savedViewingState.viewingTrackerOwnerId);
            } catch (error) {
                console.error('Error restoring friend tracker view:', error);
            }
        }
        return;
    }
    
    try {
        // First check if we were on main screen
        const savedViewingState = loadViewingState();
        if (savedViewingState && savedViewingState.isOnMainScreen) {
            // User was on main screen, stay there
            console.log('Restoring main screen view');
            await showMainScreen();
            return;
        }
        
        // Check if we were viewing a friend's tracker
        if (savedViewingState && savedViewingState.isViewingFriendTracker && savedViewingState.viewingTrackerOwnerId) {
            // Restore friend tracker view
            console.log('Restoring friend tracker view:', savedViewingState.viewingTrackerOwnerId);
            try {
                await viewFriendTracker(savedViewingState.viewingTrackerOwnerId);
                return; // Successfully restored, exit
            } catch (error) {
                console.error('Error restoring friend tracker view:', error);
                // If restoration fails, continue to load own data
            }
        }
        
        // Check if we were viewing our own tracker
        if (savedViewingState && savedViewingState.currentTrackerId && !savedViewingState.isViewingFriendTracker) {
            // Try to load the specific tracker
            const docRef = window.firebaseDb.collection('users').doc(userId);
            const doc = await docRef.get();
            
            if (doc.exists && doc.data().trackers) {
                const trackers = doc.data().trackers;
                const tracker = trackers.find(t => t.id === savedViewingState.currentTrackerId);
                
                if (tracker) {
                    restoreState(tracker.state);
                    state.trackerId = tracker.id;
                    state.trackerName = tracker.name;
                    
                    // Update viewing state
                    trackerViewState.isViewingFriendTracker = false;
                    trackerViewState.isOwner = true;
                    trackerViewState.viewingTrackerOwnerId = null;
                    trackerViewState.hasEditAccess = false;
                    
                    // Set up real-time listener for own tracker
                    setupTrackerRealtimeListener(tracker.id);
                    
                    // Show tracking section
                    const mainScreen = document.getElementById('main-screen');
                    const setupSection = document.getElementById('setup-section');
                    const trackingSection = document.getElementById('tracking-section');
                    const settingsPage = document.getElementById('settings-page');
                    const analyticsPage = document.getElementById('analytics-page');
                    // Hide all other pages with inline styles
                    if (mainScreen) {
                        mainScreen.classList.add('hidden');
                        mainScreen.style.display = 'none';
                    }
                    if (setupSection) {
                        setupSection.classList.add('hidden');
                        setupSection.style.display = 'none';
                    }
                    if (settingsPage) {
                        settingsPage.classList.add('hidden');
                        settingsPage.style.display = 'none';
                    }
                    if (analyticsPage) {
                        analyticsPage.classList.add('hidden');
                        analyticsPage.style.display = 'none';
                    }
                    if (trackingSection) {
                        trackingSection.classList.remove('hidden');
                        trackingSection.style.display = '';
                    }
                    
                    renderPeopleWidgets();
                    updateTotalPot();
                    updateChipValueDisplay();
                    updateTotalChips();
                    renderLog();
                    
                    updateUIForViewingMode(true);
                    
                    // Save viewing state
                    saveViewingState();
                    return; // Successfully restored, exit
                }
            }
        }
        
        // Normal load - check user's own data
        // Only auto-load tracker if we weren't on main screen
        const docRef = window.firebaseDb.collection('users').doc(userId);
        const doc = await docRef.get();
        
        // Initialize credits for user
        await initializeCredits(userId);
        
        if (doc.exists) {
            const data = doc.data();
            
            // Check if user has trackers array (new multi-tracker system)
            if (data.trackers && data.trackers.length > 0) {
                // Only auto-load if we weren't on main screen
                if (!savedViewingState || !savedViewingState.isOnMainScreen) {
                    // Load the most recently updated tracker
                    const sortedTrackers = data.trackers.sort((a, b) => {
                        const dateA = new Date(a.updatedAt || 0);
                        const dateB = new Date(b.updatedAt || 0);
                        return dateB - dateA;
                    });
                    
                    const latestTracker = sortedTrackers[0];
                    restoreState(latestTracker.state);
                    state.trackerId = latestTracker.id;
                    state.trackerName = latestTracker.name;
                    
                    // Store all trackers
                    userTrackers = data.trackers;
                    
                    // Set up real-time listener for own tracker
                    setupTrackerRealtimeListener(latestTracker.id);
                    
                    // Save viewing state (viewing own tracker)
                    trackerViewState.isViewingFriendTracker = false;
                    trackerViewState.isOwner = true;
                    saveViewingState();
                } else {
                    // User was on main screen, show it
                    userTrackers = data.trackers;
                    await showMainScreen();
                }
            } else if (data.state) {
                // Fallback to old single-tracker system
                // Only auto-load if we weren't on main screen
                if (!savedViewingState || !savedViewingState.isOnMainScreen) {
                    restoreState(data.state);
                    // Save viewing state (viewing own tracker)
                    trackerViewState.isViewingFriendTracker = false;
                    trackerViewState.isOwner = true;
                    saveViewingState();
                } else {
                    // User was on main screen, show it
                    await showMainScreen();
                }
            } else {
                // No data in Firestore, try localStorage
                const hasLocalData = loadState();
                // If no local data either, show main screen
                if (!hasLocalData) {
                    await showMainScreen();
                } else {
                    // We loaded data, but only if we weren't on main screen
                    if (!savedViewingState || !savedViewingState.isOnMainScreen) {
                        // Save viewing state
                        trackerViewState.isViewingFriendTracker = false;
                        trackerViewState.isOwner = true;
                        saveViewingState();
                    } else {
                        // User was on main screen, show it
                        await showMainScreen();
                    }
                }
            }
        } else {
            // No data in Firestore, try localStorage
            const hasLocalData = loadState();
            // If no local data either, show main screen
            if (!hasLocalData) {
                await showMainScreen();
            } else {
                // We loaded data, but only if we weren't on main screen
                if (!savedViewingState || !savedViewingState.isOnMainScreen) {
                    // Save viewing state
                    trackerViewState.isViewingFriendTracker = false;
                    trackerViewState.isOwner = true;
                    saveViewingState();
                } else {
                    // User was on main screen, show it
                    await showMainScreen();
                }
            }
        }
    } catch (error) {
        console.error('Error loading user data:', error);
        // Fall back to localStorage
        const hasLocalData = loadState();
        if (!hasLocalData) {
            await showMainScreen();
        }
    }
}

// Show main screen
async function showMainScreen() {
    // Clean up tracker real-time listener when leaving tracker view
    cleanupTrackerListener();
    
    // Clear viewing state when going to main screen
    clearViewingState();
    trackerViewState.isViewingFriendTracker = false;
    trackerViewState.viewingTrackerOwnerId = null;
    trackerViewState.hasEditAccess = false;
    trackerViewState.isOwner = true;
    
    const mainScreen = document.getElementById('main-screen');
    const setupSection = document.getElementById('setup-section');
    const trackingSection = document.getElementById('tracking-section');
    const authPage = document.getElementById('auth-page');
    const analyticsPage = document.getElementById('analytics-page');
    const settingsPage = document.getElementById('settings-page');
    const upgradePage = document.getElementById('upgrade-page');
    // IMPORTANT: Always hide setup section first when showing main screen
    if (setupSection) {
        setupSection.classList.add('hidden');
        setupSection.style.display = 'none'; // Force hide with inline style
    }
    
    // Hide auth page, analytics page, settings page, and upgrade page if visible
    if (authPage) authPage.classList.add('hidden');
    if (analyticsPage) {
        analyticsPage.classList.add('hidden');
        analyticsPage.style.display = 'none';
    }
    if (settingsPage) {
        settingsPage.classList.add('hidden');
        settingsPage.style.display = 'none';
    }
    if (upgradePage) {
        upgradePage.classList.add('hidden');
        upgradePage.style.display = 'none';
    }
    
    // Hide tracking section first (with inline style for robustness)
    if (trackingSection) {
        trackingSection.classList.add('hidden');
        trackingSection.style.display = 'none';
    }
    
    // Double-check setup section is hidden
    if (setupSection) {
        setupSection.classList.add('hidden');
        setupSection.style.display = 'none';
    }
    
    // Show main screen (with inline style to ensure visibility)
    if (mainScreen) {
        mainScreen.classList.remove('hidden');
        mainScreen.style.display = ''; // Ensure it's visible
        // Load user trackers and live tables
        if (window.firebaseDb && window.currentUser) {
            await loadUserTrackers();
            await loadLiveTables();
            // Stats are now on analytics page, no need to update here
        }
    }
    
    // Save viewing state (on main screen)
    saveViewingState();
}

// ==================== SUBSCRIPTION MANAGEMENT ====================

// Check if an email is whitelisted for Pro plan (server-side check)
async function isEmailWhitelisted(email) {
    if (!email || !window.currentUser) {
        return false;
    }
    
    try {
        // Check whitelist via serverless function (secure, server-side)
        // Pass authentication info for security
        const response = await fetch('/api/whop-check-subscription', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                email: email,
                userId: window.currentUser.uid,
                userEmail: window.currentUser.email,
                checkWhitelistOnly: true 
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            return data.isWhitelisted === true;
        }
    } catch (error) {
        console.error('Error checking whitelist:', error);
    }
    
    return false;
}

// Check user's subscription status from Whop
async function checkWhopSubscriptionStatus(userEmail) {
    if (!userEmail || !window.currentUser) {
        console.error('No email or user authentication provided for subscription check');
        return null;
    }
    
    try {
        // Pass authentication info for security - server will verify email matches authenticated user
        const response = await fetch('/api/whop-check-subscription', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                email: userEmail,
                userId: window.currentUser.uid,
                userEmail: window.currentUser.email
            })
        });
        
        if (!response.ok) {
            console.error('Failed to check subscription status:', response.status);
            return null;
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error checking subscription status:', error);
        return null;
    }
}

// Get subscription status from Firestore (cached)
async function getSubscriptionStatus(userId, userEmail = null) {
    if (!window.firebaseDb || !userId) {
        return null;
    }
    
    // Check if user is whitelisted first (async check)
    if (userEmail) {
        const whitelisted = await isEmailWhitelisted(userEmail);
        if (whitelisted) {
            return {
                hasSubscription: true,
                subscriptionType: 'pro',
                expiresAt: null, // Never expires for whitelisted users
                lastChecked: null,
                isWhitelisted: true
            };
        }
    }
    
    try {
        const userRef = window.firebaseDb.collection('users').doc(userId);
        const userDoc = await userRef.get();
        
        if (userDoc.exists) {
            const userData = userDoc.data();
            return {
                hasSubscription: userData.hasSubscription || false,
                subscriptionType: userData.subscriptionType || null,
                expiresAt: userData.subscriptionExpiresAt || null,
                lastChecked: userData.subscriptionLastChecked || null,
                isWhitelisted: false,
                isOneTimePayment: userData.isOneTimePayment || false
            };
        }
    } catch (error) {
        console.error('Error getting subscription status:', error);
    }
    
    return null;
}

// Update subscription status in Firestore
async function updateSubscriptionStatus(userId, subscriptionData) {
    if (!window.firebaseDb || !userId) {
        return;
    }
    
    try {
        const userRef = window.firebaseDb.collection('users').doc(userId);
        const userDoc = await userRef.get();
        const userData = userDoc.exists ? userDoc.data() : {};
        
        // Check if user just got PAYP subscription (didn't have it before)
        const wasPayp = userData.subscriptionType === 'payp' || userData.isOneTimePayment;
        const isNowPayp = subscriptionData.subscriptionType === 'payp' || subscriptionData.isOneTimePayment;
        
        await userRef.set({
            hasSubscription: subscriptionData.hasSubscription || false,
            subscriptionType: subscriptionData.subscriptionType || null,
            subscriptionExpiresAt: subscriptionData.expiresAt || null,
            subscriptionLastChecked: firebase.firestore.FieldValue.serverTimestamp(),
            isOneTimePayment: subscriptionData.isOneTimePayment || false
        }, { merge: true });
        
        // Initialize credits for all users
        await initializeCredits(userId);
        
        // Sync credits based on PAYP payment count if user has PAYP
        if (isNowPayp) {
            // We need to get the payment count from subscription data
            // This will be handled in refreshSubscriptionStatus which calls syncPaypCredits
        }
        
        // Update plan display after updating status
        updatePlanDisplay(subscriptionData);
    } catch (error) {
        console.error('Error updating subscription status:', error);
    }
}

// Sync credits based on PAYP payment count
async function syncPaypCredits(userId, paypPaymentCount) {
    if (!window.firebaseDb || !userId || !paypPaymentCount) {
        return;
    }
    
    try {
        const userRef = window.firebaseDb.collection('users').doc(userId);
        await initializeCredits(userId); // Ensure credits exist first
        
        const userDoc = await userRef.get();
        
        if (userDoc.exists) {
            const userData = userDoc.data();
            const currentCredits = userData.credits !== undefined ? userData.credits : 3;
            const creditsFromPayp = userData.creditsFromPayp || 0; // Track how many credits came from PAYP
            
            // Calculate how many credits should come from PAYP (each payment = +1 credit)
            // Start with 3 base credits, then add 1 per PAYP payment
            const expectedCreditsFromPayp = paypPaymentCount;
            const creditsToAdd = expectedCreditsFromPayp - creditsFromPayp;
            
            if (creditsToAdd > 0) {
                const newCredits = currentCredits + creditsToAdd;
                const newCreditsFromPayp = expectedCreditsFromPayp;
                
                await userRef.set({
                    credits: newCredits,
                    creditsFromPayp: newCreditsFromPayp
                }, { merge: true });
                
                console.log(`PAYP credits synced. Added ${creditsToAdd} credit(s). Total credits: ${newCredits} (${newCreditsFromPayp} from PAYP)`);
                
                // Update credits display in settings if visible
                const creditsDisplay = document.getElementById('settings-credits-display');
                if (creditsDisplay && !creditsDisplay.textContent.includes('Unlimited')) {
                    creditsDisplay.textContent = newCredits;
                }
            }
        }
    } catch (error) {
        console.error('Error syncing PAYP credits:', error);
    }
}

// Add +1 credit when PAYP plan is purchased (legacy function, kept for backward compatibility)
async function addPaypCredit(userId) {
    if (!window.firebaseDb || !userId) {
        return;
    }
    
    try {
        const userRef = window.firebaseDb.collection('users').doc(userId);
        await initializeCredits(userId); // Ensure credits exist first
        
        const userDoc = await userRef.get();
        
        if (userDoc.exists) {
            const userData = userDoc.data();
            const currentCredits = userData.credits !== undefined ? userData.credits : 3;
            const creditsFromPayp = userData.creditsFromPayp || 0;
            const newCredits = currentCredits + 1;
            const newCreditsFromPayp = creditsFromPayp + 1;
            
            await userRef.set({
                credits: newCredits,
                creditsFromPayp: newCreditsFromPayp
            }, { merge: true });
            
            console.log(`PAYP plan purchased. Credits increased from ${currentCredits} to ${newCredits}`);
            
            // Update credits display in settings if visible
            const creditsDisplay = document.getElementById('settings-credits-display');
            if (creditsDisplay && !creditsDisplay.textContent.includes('Unlimited')) {
                creditsDisplay.textContent = newCredits;
            }
        }
    } catch (error) {
        console.error('Error adding PAYP credit:', error);
    }
}

// Refresh subscription status from Whop and update Firestore
async function refreshSubscriptionStatus() {
    if (!window.currentUser || !window.currentUser.email) {
        return null;
    }
    
    const userId = window.currentUser.uid;
    const userEmail = window.currentUser.email;
    
    // Get old subscription status to check if it just expired
    const oldStatus = await getSubscriptionStatus(userId, userEmail);
    const oldExpiresAt = oldStatus?.expiresAt ? new Date(oldStatus.expiresAt) : null;
    const wasActive = oldStatus?.hasSubscription && (!oldExpiresAt || oldExpiresAt > new Date());
    
    // Check if user is whitelisted first (async)
    const whitelisted = await isEmailWhitelisted(userEmail);
    if (whitelisted) {
        const whitelistedStatus = {
            hasSubscription: true,
            subscriptionType: 'pro',
            expiresAt: null,
            isWhitelisted: true
        };
        // Update plan display
        updatePlanDisplay(whitelistedStatus);
        return whitelistedStatus;
    }
    
    // Check subscription status from Whop
    const subscriptionData = await checkWhopSubscriptionStatus(userEmail);
    
    if (subscriptionData) {
        // Check if subscription just expired
        const newExpiresAt = subscriptionData.expiresAt ? new Date(subscriptionData.expiresAt) : null;
        const isNowExpired = newExpiresAt && newExpiresAt < new Date();
        const subscriptionJustExpired = wasActive && (!subscriptionData.hasSubscription || isNowExpired);
        
        // Update Firestore with latest status
        await updateSubscriptionStatus(userId, subscriptionData);
        
        // Initialize credits for all users
        await initializeCredits(userId);
        
        // Sync credits based on PAYP payment count (handles multiple payments)
        if (subscriptionData.subscriptionType === 'payp' || subscriptionData.isOneTimePayment) {
            const paypPaymentCount = subscriptionData.paypPaymentCount || 0;
            if (paypPaymentCount > 0) {
                await syncPaypCredits(userId, paypPaymentCount);
            } else {
                // Fallback: if payment count not available, use old method
                await addPaypCredit(userId);
            }
        }
        
        // If subscription just expired, mark all trackers for expiration
        if (subscriptionJustExpired && !subscriptionData.isOneTimePayment) {
            await markTrackersForExpiration(userId);
        }
        
        // Update plan display
        updatePlanDisplay(subscriptionData);
        return subscriptionData;
    }
    
    // If we had an active subscription but now don't, subscription expired
    if (wasActive && !oldStatus?.isWhitelisted) {
        await markTrackersForExpiration(userId);
    }
    
    // Update plan display even if no subscription data (show Free Tier)
    updatePlanDisplay({ hasSubscription: false });
    return null;
}

// Mark all user's trackers for expiration (7 days from now)
async function markTrackersForExpiration(userId) {
    if (!window.firebaseDb || !userId) {
        return;
    }
    
    try {
        const docRef = window.firebaseDb.collection('users').doc(userId);
        const doc = await docRef.get();
        
        if (!doc.exists) {
            return;
        }
        
        const userData = doc.data();
        const trackers = userData.trackers || [];
        
        if (trackers.length === 0) {
            return;
        }
        
        // Set expiration to 7 days from now for all trackers
        const expirationDate = new Date(new Date().getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
        
        const updatedTrackers = trackers.map(tracker => ({
            ...tracker,
            expiresAt: expirationDate
        }));
        
        await docRef.set({
            trackers: updatedTrackers,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        console.log('Marked all trackers for expiration after subscription expired');
    } catch (error) {
        console.error('Error marking trackers for expiration:', error);
    }
}

// Clean up expired trackers
async function cleanupExpiredTrackers() {
    if (!window.firebaseDb || !window.currentUser) {
        return;
    }
    
    try {
        const userId = window.currentUser.uid;
        const docRef = window.firebaseDb.collection('users').doc(userId);
        const doc = await docRef.get();
        
        if (!doc.exists) {
            return;
        }
        
        const userData = doc.data();
        const trackers = userData.trackers || [];
        
        if (trackers.length === 0) {
            return;
        }
        
        const now = new Date();
        const activeTrackers = trackers.filter(tracker => {
            // Keep trackers that don't have expiration or haven't expired yet
            if (!tracker.expiresAt) {
                return true;
            }
            
            const expiresAt = new Date(tracker.expiresAt);
            return expiresAt > now;
        });
        
        // Only update if we removed some trackers
        if (activeTrackers.length < trackers.length) {
            const deletedCount = trackers.length - activeTrackers.length;
            console.log(`Cleaning up ${deletedCount} expired tracker(s)`);
            
            await docRef.set({
                trackers: activeTrackers,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            
            // If we were viewing a deleted tracker, go back to main screen
            if (state.trackerId) {
                const trackerStillExists = activeTrackers.some(t => t.id === state.trackerId);
                if (!trackerStillExists) {
                    console.log('Current tracker was deleted, returning to main screen');
                    await showMainScreen();
                }
            }
        }
    } catch (error) {
        console.error('Error cleaning up expired trackers:', error);
    }
}

// Get plan name from subscription status
function getPlanName(subscriptionStatus) {
    if (!subscriptionStatus) {
        return 'Free Tier';
    }
    
    // Check if user is whitelisted (permanent Pro access)
    if (subscriptionStatus.isWhitelisted) {
        return 'Pro Plan';
    }
    
    if (!subscriptionStatus.hasSubscription) {
        return 'Free Tier';
    }
    
    // Check if subscription is expired
    if (subscriptionStatus.expiresAt) {
        const expiresAt = new Date(subscriptionStatus.expiresAt);
        if (expiresAt < new Date()) {
            return 'Free Tier';
        }
    }
    
    // Determine plan type
    const subscriptionType = subscriptionStatus.subscriptionType;
    if (subscriptionType === 'payp' || subscriptionStatus.isOneTimePayment) {
        return 'PAYP Plan';
    }
    if (subscriptionType === '6month' || subscriptionType === 'monthly' || subscriptionType === 'pro') {
        return 'Pro Plan';
    }
    
    // Default to Pro Plan for any active subscription
    return 'Pro Plan';
}

// Update plan display in header
function updatePlanDisplay(subscriptionStatus) {
    const planBadge = document.getElementById('user-plan-badge');
    if (!planBadge) {
        return;
    }
    
    const planName = getPlanName(subscriptionStatus);
    planBadge.textContent = planName;
    
    // Set data attribute for styling
    if (planName === 'Free Tier') {
        planBadge.setAttribute('data-plan', 'free');
    } else if (planName === 'Pro Plan') {
        planBadge.setAttribute('data-plan', 'pro');
    } else if (planName === 'PAYP Plan') {
        planBadge.setAttribute('data-plan', 'payp');
    }
    
    // Show badge if user is authenticated
    if (window.currentUser) {
        planBadge.classList.remove('hidden');
    } else {
        planBadge.classList.add('hidden');
    }
}

// Load and display plan status
async function loadPlanDisplay() {
    if (!window.currentUser) {
        const planBadge = document.getElementById('user-plan-badge');
        if (planBadge) {
            planBadge.classList.add('hidden');
        }
        return;
    }
    
    const userId = window.currentUser.uid;
    const userEmail = window.currentUser.email;
    const subscriptionStatus = await getSubscriptionStatus(userId, userEmail);
    
    if (subscriptionStatus) {
        updatePlanDisplay(subscriptionStatus);
    } else {
        // Default to Free Tier if no status found
        updatePlanDisplay({ hasSubscription: false });
    }
}

// Initialize credits for new users (3 credits)
async function initializeCredits(userId) {
    if (!window.firebaseDb || !userId) {
        return;
    }
    
    try {
        const userRef = window.firebaseDb.collection('users').doc(userId);
        const userDoc = await userRef.get();
        
        if (userDoc.exists) {
            const userData = userDoc.data();
            // Only initialize if credits don't exist
            if (userData.credits === undefined || userData.credits === null) {
                await userRef.set({
                    credits: 3
                }, { merge: true });
                console.log('Credits initialized to 3 for user');
            }
        } else {
            // New user, set credits to 3
            await userRef.set({
                credits: 3
            }, { merge: true });
            console.log('Credits initialized to 3 for new user');
        }
    } catch (error) {
        console.error('Error initializing credits:', error);
    }
}

// Check if user can create more trackers
async function canCreateTracker() {
    if (!window.firebaseDb || !window.currentUser) {
        return { canCreate: false, reason: 'Not authenticated' };
    }
    
    try {
        const userId = window.currentUser.uid;
        const userEmail = window.currentUser.email;
        
        // Initialize credits if needed
        await initializeCredits(userId);
        
        // Check if user is whitelisted first (async)
        const whitelisted = await isEmailWhitelisted(userEmail);
        if (whitelisted) {
            return { canCreate: true, subscriptionType: 'pro', isWhitelisted: true, hasUnlimitedCredits: true };
        }
        
        const userRef = window.firebaseDb.collection('users').doc(userId);
        const userDoc = await userRef.get();
        
        if (!userDoc.exists) {
            return { canCreate: true }; // New user, can create first tracker (credits will be initialized)
        }
        
        const userData = userDoc.data();
        const trackers = userData.trackers || [];
        
        // Check subscription status to see if user has Pro plan (unlimited credits)
        let subscriptionStatus = await getSubscriptionStatus(userId, userEmail);
        
        // If subscription status is old (more than 1 hour), refresh it
        const lastChecked = subscriptionStatus?.lastChecked;
        const shouldRefresh = !subscriptionStatus?.isWhitelisted && (!lastChecked || 
            (lastChecked.toDate && new Date() - lastChecked.toDate() > 3600000)); // 1 hour
        
        if (shouldRefresh) {
            subscriptionStatus = await refreshSubscriptionStatus();
        }
        
        // Check if user has Pro plan (monthly or 6-month subscription)
        const hasProPlan = subscriptionStatus?.hasSubscription && 
                           (subscriptionStatus?.subscriptionType === 'monthly' || 
                            subscriptionStatus?.subscriptionType === '6month' ||
                            subscriptionStatus?.subscriptionType === 'pro') &&
                           !subscriptionStatus?.isOneTimePayment;
        
        // Check if subscription is expired
        let isSubscriptionActive = hasProPlan;
        if (hasProPlan && subscriptionStatus?.expiresAt) {
            const expiresAt = new Date(subscriptionStatus.expiresAt);
            isSubscriptionActive = expiresAt > new Date();
        }
        
        // Pro plan users have unlimited credits - skip credit check
        if (isSubscriptionActive || whitelisted) {
            // Active limit: 2 active trackers max for all users (DDoS protection)
            if (trackers.length >= 2) {
                return { 
                    canCreate: false, 
                    reason: 'You can only have 2 active tables at once. Delete a table to create a new one.' 
                };
            }
            return { canCreate: true, hasUnlimitedCredits: true };
        }
        
        // For non-Pro users, check credits
        const credits = userData.credits !== undefined ? userData.credits : 3; // Default to 3 if not set
        if (credits <= 0) {
            return {
                canCreate: false,
                reason: 'You have no credits remaining. Please purchase the Pay as you Play plan ($1.00) to add more credits.',
                needsCredits: true
            };
        }
        
        // Active limit: 2 active trackers max for all users (DDoS protection)
        if (trackers.length >= 2) {
            return { 
                canCreate: false, 
                reason: 'You can only have 2 active tables at once. Delete a table to create a new one.' 
            };
        }
        
        // All users can create trackers if they have credits and aren't at active limit
        return { canCreate: true };
    } catch (error) {
        console.error('Error checking if user can create tracker:', error);
        // On error, allow creation (fail open)
        return { canCreate: true };
    }
}

// Show setup section
async function showSetupSection() {
    // Check if user can create more trackers
    const canCreate = await canCreateTracker();
    
    if (!canCreate.canCreate) {
        // Show error message
        const errorDiv = document.getElementById('tracker-limit-error');
        const errorMessage = document.getElementById('tracker-limit-error-message');
        const upgradeBtn = document.getElementById('tracker-limit-upgrade-btn');
        
        if (errorDiv && errorMessage) {
            const reason = canCreate.reason || 'Upgrade to the next tier to create more tables';
            errorMessage.textContent = reason;
            errorDiv.classList.remove('hidden');
            
            // Show upgrade button if it's the lifetime limit error or PAYP credit error
            if ((reason.includes('lifetime limit') || reason.includes('no credits')) && upgradeBtn) {
                upgradeBtn.classList.remove('hidden');
            } else if (upgradeBtn) {
                upgradeBtn.classList.add('hidden');
            }
        }
        return;
    }
    
    // Show confirmation for users with credits (skip for Pro plan users with unlimited)
    if (!canCreate.hasUnlimitedCredits) {
        const userId = window.currentUser.uid;
        await initializeCredits(userId);
        
        const userRef = window.firebaseDb.collection('users').doc(userId);
        const userDoc = await userRef.get();
        const userData = userDoc.exists ? userDoc.data() : {};
        const credits = userData.credits !== undefined ? userData.credits : 3;
        
        if (credits > 0) {
            // Show confirmation modal for users with limited credits
            showConfirmModal(credits);
            return; // Don't proceed yet, wait for confirmation
        }
    }
    
    // Hide error message if visible
    const errorDiv = document.getElementById('tracker-limit-error');
    if (errorDiv) {
        errorDiv.classList.add('hidden');
    }
    
    // Proceed with showing setup section
    proceedToSetupSection();
}

// Proceed to setup section (called after confirmation or for non-PAYP users)
function proceedToSetupSection() {
    
    // Clear tracker ID and name to ensure a new tracker is created
    state.trackerId = null;
    state.trackerName = null;
    
    // Clear people array to start fresh
    state.people = [];
    state.transactions = [];
    
    const mainScreen = document.getElementById('main-screen');
    const setupSection = document.getElementById('setup-section');
    const trackingSection = document.getElementById('tracking-section');
    const settingsPage = document.getElementById('settings-page');
    const analyticsPage = document.getElementById('analytics-page');
    const upgradePage = document.getElementById('upgrade-page');
    // Hide all other pages with inline styles
    if (mainScreen) {
        mainScreen.classList.add('hidden');
        mainScreen.style.display = 'none'; // Force hide
    }
    if (settingsPage) {
        settingsPage.classList.add('hidden');
        settingsPage.style.display = 'none';
    }
    if (analyticsPage) {
        analyticsPage.classList.add('hidden');
        analyticsPage.style.display = 'none';
    }
    if (upgradePage) {
        upgradePage.classList.add('hidden');
        upgradePage.style.display = 'none';
    }
    if (setupSection) {
        setupSection.classList.remove('hidden');
        setupSection.style.display = ''; // Show setup section
    }
    if (trackingSection) {
        trackingSection.classList.add('hidden');
        trackingSection.style.display = 'none';
    }
    
}

// Helper function to prepare state for Firestore (convert Dates to ISO strings)
function prepareStateForFirestore(stateData) {
    const stateCopy = JSON.parse(JSON.stringify(stateData));
    
    // Convert Date objects in transactions to ISO strings
    if (stateCopy.transactions) {
        stateCopy.transactions = stateCopy.transactions.map(t => ({
            ...t,
            timestamp: t.timestamp instanceof Date ? t.timestamp.toISOString() : t.timestamp
        }));
    }
    
    return stateCopy;
}

// Save state to Firestore (if signed in) or localStorage (fallback)
async function saveState() {
    // Don't save if viewing friend's tracker and don't have edit access
    if (trackerViewState.isViewingFriendTracker && !trackerViewState.hasEditAccess) {
        console.log('Cannot save: viewing friend tracker in read-only mode');
        return;
    }
    
    // If viewing friend's tracker with edit access, save to friend's document
    if (trackerViewState.isViewingFriendTracker && trackerViewState.hasEditAccess && trackerViewState.viewingTrackerOwnerId) {
        if (window.firebaseDb && window.firebaseReady) {
            try {
                const ownerId = trackerViewState.viewingTrackerOwnerId;
                const docRef = window.firebaseDb.collection('users').doc(ownerId);
                const stateToSave = prepareStateForFirestore(state);
                await docRef.set({
                    state: stateToSave,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
                return;
            } catch (error) {
                console.error('Error saving friend tracker state:', error);
                alert('Error saving changes. Please check console for details and verify Firestore rules.');
                return;
            }
        }
    }
    
    // If user is signed in, save to Firestore
    if (window.currentUser && window.firebaseDb && window.firebaseReady) {
        try {
            const userId = window.currentUser.uid;
            const docRef = window.firebaseDb.collection('users').doc(userId);
            const stateToSave = prepareStateForFirestore(state);
            
            // If we have a tracker ID, also update it in the trackers array
            if (state.trackerId) {
                const doc = await docRef.get();
                let trackers = [];
                if (doc.exists && doc.data().trackers) {
                    trackers = doc.data().trackers;
                }
                
                const existingIndex = trackers.findIndex(t => t.id === state.trackerId);
                const isNewTracker = existingIndex < 0;
                
                // Get subscription status to determine expiration
                const userEmail = window.currentUser.email;
                let subscriptionStatus = await getSubscriptionStatus(userId, userEmail);
                
                // Calculate expiration date
                let expiresAt = null;
                if (isNewTracker) {
                    const now = new Date();
                    
                    // Check if user is PAYP (one-time payment)
                    if (subscriptionStatus?.isOneTimePayment || subscriptionStatus?.subscriptionType === 'payp') {
                        // PAYP users: expire 7 days from creation
                        expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
                    } else if (subscriptionStatus?.hasSubscription && subscriptionStatus?.expiresAt) {
                        // Subscription users: expire 7 days after subscription expires
                        const subExpiresAt = new Date(subscriptionStatus.expiresAt);
                        const expirationDate = new Date(subExpiresAt.getTime() + 7 * 24 * 60 * 60 * 1000);
                        expiresAt = expirationDate.toISOString();
                    }
                    // Free users: no expiration (they have lifetime limit instead)
                } else {
                    // For existing trackers, preserve existing expiration unless subscription just expired
                    const existingTracker = trackers[existingIndex];
                    expiresAt = existingTracker.expiresAt || null;
                    
                    // If subscription expired, update expiration to 7 days from now
                    if (subscriptionStatus?.expiresAt) {
                        const subExpiresAt = new Date(subscriptionStatus.expiresAt);
                        if (subExpiresAt < new Date() && !subscriptionStatus?.isOneTimePayment) {
                            // Subscription expired, set tracker to expire in 7 days
                            expiresAt = new Date(new Date().getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
                        }
                    }
                }
                
                const trackerData = {
                    id: state.trackerId,
                    name: state.trackerName || `Table ${new Date().toLocaleDateString()}`,
                    state: stateToSave,
                    updatedAt: new Date().toISOString()
                };
                
                // Add timestamps for new trackers
                if (isNewTracker) {
                    trackerData.createdAt = new Date().toISOString();
                    if (expiresAt) {
                        trackerData.expiresAt = expiresAt;
                    }
                } else if (expiresAt) {
                    // Update expiration for existing tracker if needed
                    trackerData.expiresAt = expiresAt;
                    if (trackers[existingIndex].createdAt) {
                        trackerData.createdAt = trackers[existingIndex].createdAt;
                    }
                } else if (trackers[existingIndex].createdAt) {
                    trackerData.createdAt = trackers[existingIndex].createdAt;
                }
                
                if (existingIndex >= 0) {
                    trackers[existingIndex] = trackerData;
                } else {
                    trackers.push(trackerData);
                }
                
                // If this is a new tracker, increment totalTrackersCreated
                const updateData = {
                    state: stateToSave, // Keep for backward compatibility
                    trackers: trackers,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                };
                
                if (isNewTracker) {
                    const currentTotal = doc.exists ? (doc.data().totalTrackersCreated || trackers.length) : 0;
                    updateData.totalTrackersCreated = currentTotal + 1;
                }
                
                await docRef.set(updateData, { merge: true });
            } else {
                // No tracker ID, just save state (backward compatibility)
                await docRef.set({
                    state: stateToSave,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            }
            
            console.log('State saved successfully to Firestore');
        } catch (error) {
            console.error('Error saving to Firestore:', error);
            console.error('Error code:', error.code);
            console.error('Error message:', error.message);
            
            // Fall back to localStorage
            try {
                localStorage.setItem('pokerTrackerState', JSON.stringify(state));
                console.log('Fell back to localStorage');
            } catch (e) {
                console.error('Error saving to localStorage:', e);
            }
        }
    } else {
        // Not signed in, use localStorage
        try {
            localStorage.setItem('pokerTrackerState', JSON.stringify(state));
        } catch (e) {
            console.error('Error saving state:', e);
        }
    }
}

// Show login form
function showLoginForm() {
    document.getElementById('login-form').classList.remove('hidden');
    document.getElementById('signup-form').classList.add('hidden');
    const forgotPasswordForm = document.getElementById('forgot-password-form');
    if (forgotPasswordForm) forgotPasswordForm.classList.add('hidden');
    document.querySelectorAll('.auth-tab').forEach(tab => tab.classList.remove('active'));
    event.target.classList.add('active');
    clearAuthErrors();
}

// Show signup form
function showSignupForm() {
    document.getElementById('signup-form').classList.remove('hidden');
    document.getElementById('login-form').classList.add('hidden');
    document.querySelectorAll('.auth-tab').forEach(tab => tab.classList.remove('active'));
    event.target.classList.add('active');
    clearAuthErrors();
}

// Clear auth error messages
function clearAuthErrors() {
    document.getElementById('login-error').classList.add('hidden');
    document.getElementById('signup-error').classList.add('hidden');
    const resetError = document.getElementById('reset-error');
    const resetSuccess = document.getElementById('reset-success');
    if (resetError) resetError.classList.add('hidden');
    if (resetSuccess) resetSuccess.classList.add('hidden');
}

// Show forgot password form
function showForgotPasswordForm() {
    const loginForm = document.getElementById('login-form');
    const forgotPasswordForm = document.getElementById('forgot-password-form');
    const resetEmail = document.getElementById('reset-email');
    const loginEmail = document.getElementById('login-email');
    
    if (loginForm) loginForm.classList.add('hidden');
    if (forgotPasswordForm) forgotPasswordForm.classList.remove('hidden');
    
    // Pre-fill email if user already entered it
    if (resetEmail && loginEmail && loginEmail.value) {
        resetEmail.value = loginEmail.value;
    }
    
    clearAuthErrors();
}

// Back to login form
function backToLogin() {
    const loginForm = document.getElementById('login-form');
    const forgotPasswordForm = document.getElementById('forgot-password-form');
    
    if (loginForm) loginForm.classList.remove('hidden');
    if (forgotPasswordForm) forgotPasswordForm.classList.add('hidden');
    
    clearAuthErrors();
}

// Send password reset email
async function sendPasswordReset() {
    if (!window.firebaseAuth || !window.firebaseReady) {
        showError('reset-error', 'Firebase is not ready. Please refresh the page.');
        return;
    }
    
    const email = document.getElementById('reset-email').value.trim();
    
    if (!email) {
        showError('reset-error', 'Please enter your email address.');
        return;
    }
    
    try {
        await window.firebaseAuth.sendPasswordResetEmail(email);
        // Show success message
        const resetError = document.getElementById('reset-error');
        const resetSuccess = document.getElementById('reset-success');
        if (resetError) resetError.classList.add('hidden');
        if (resetSuccess) {
            resetSuccess.textContent = 'Password reset email sent! It should arrive within 1-2 minutes. Check your inbox (and spam folder) and follow the instructions to reset your password.';
            resetSuccess.classList.remove('hidden');
        }
    } catch (error) {
        console.error('Password reset error:', error);
        let errorMessage = 'Error sending reset email. ';
        if (error.code === 'auth/user-not-found') {
            errorMessage += 'No account found with this email.';
        } else if (error.code === 'auth/invalid-email') {
            errorMessage += 'Invalid email address.';
        } else {
            errorMessage += error.message;
        }
        showError('reset-error', errorMessage);
        const resetSuccess = document.getElementById('reset-success');
        if (resetSuccess) resetSuccess.classList.add('hidden');
    }
}

// Login with email and password
async function loginWithEmail() {
    if (!window.firebaseAuth || !window.firebaseReady) {
        showError('login-error', 'Firebase is not ready. Please refresh the page.');
        return;
    }
    
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    
    if (!email || !password) {
        showError('login-error', 'Please enter both email and password.');
        return;
    }
    
    try {
        await window.firebaseAuth.signInWithEmailAndPassword(email, password);
        // Auth state change will handle UI update
    } catch (error) {
        console.error('Login error:', error);
        let errorMessage = 'Error signing in. ';
        if (error.code === 'auth/user-not-found') {
            errorMessage += 'No account found with this email.';
        } else if (error.code === 'auth/wrong-password') {
            errorMessage += 'Incorrect password.';
        } else if (error.code === 'auth/invalid-email') {
            errorMessage += 'Invalid email address.';
        } else {
            errorMessage += error.message;
        }
        showError('login-error', errorMessage);
    }
}

// Signup with email and password
async function signupWithEmail() {
    if (!window.firebaseAuth || !window.firebaseReady) {
        showError('signup-error', 'Firebase is not ready. Please refresh the page.');
        return;
    }
    
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;
    const name = document.getElementById('signup-name').value.trim();
    
    if (!email || !password) {
        showError('signup-error', 'Please enter both email and password.');
        return;
    }
    
    if (password.length < 6) {
        showError('signup-error', 'Password must be at least 6 characters.');
        return;
    }
    
    try {
        const userCredential = await window.firebaseAuth.createUserWithEmailAndPassword(email, password);
        
        // Update display name if provided
        if (name && userCredential.user) {
            await userCredential.user.updateProfile({
                displayName: name
            });
        }
        
        // Auth state change will handle UI update
    } catch (error) {
        console.error('Signup error:', error);
        let errorMessage = 'Error creating account. ';
        if (error.code === 'auth/email-already-in-use') {
            errorMessage += 'An account with this email already exists.';
        } else if (error.code === 'auth/invalid-email') {
            errorMessage += 'Invalid email address.';
        } else if (error.code === 'auth/weak-password') {
            errorMessage += 'Password is too weak.';
        } else {
            errorMessage += error.message;
        }
        showError('signup-error', errorMessage);
    }
}

// Show error message
function showError(errorId, message) {
    const errorDiv = document.getElementById(errorId);
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.classList.remove('hidden');
    }
}

// Sign in with Google
async function signInWithGoogle() {
    if (!window.firebaseAuth || !window.firebaseReady) {
        alert('Firebase is not ready. Please refresh the page.');
        return;
    }
    
    const provider = new firebase.auth.GoogleAuthProvider();
    try {
        await window.firebaseAuth.signInWithPopup(provider);
        // Auth state change will handle UI update
    } catch (error) {
        console.error('Sign-in error:', error);
        alert('Error signing in: ' + error.message);
    }
}

// Sign out
async function signOut() {
    if (!window.firebaseAuth) return;
    
    try {
        // Clean up tracker real-time listener
        cleanupTrackerListener();
        
        // Update online status before signing out
        if (window.currentUser && window.updateOnlineStatus) {
            await updateOnlineStatus(false);
        }
        
        await window.firebaseAuth.signOut();
        // Clear local state
        state = {
            people: [],
            stackValue: 0,
            chipsPerStack: 0,
            sameValue: true,
            chipValue: 0,
            chipValues: {
                black: 0,
                white: 0,
                green: 0,
                red: 0,
                blue: 0
            },
            chipCounts: {
                black: 0,
                white: 0,
                green: 0,
                red: 0,
                blue: 0
            },
            transactions: []
        };
        // Clear localStorage
        localStorage.removeItem('pokerTrackerState');
        
        // Clean up tracker join requests listener
        if (window.trackerJoinRequestsListener) {
            window.trackerJoinRequestsListener();
            window.trackerJoinRequestsListener = null;
        }
        
        // Hide friends button
        hideFriendsButton();
        
        // Close friends sidebar if open
        const sidebar = document.getElementById('friends-sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        if (sidebar) sidebar.classList.add('hidden');
        if (overlay) overlay.classList.add('hidden');
        
        // Auth state change will handle showing auth page
    } catch (error) {
        console.error('Sign-out error:', error);
    }
}

// Delete current table/tracker
async function deleteCurrentTable() {
    // Don't allow delete if viewing friend's tracker
    if (trackerViewState.isViewingFriendTracker) {
        showAlertModal('You cannot delete a table when viewing a friend\'s tracker.');
        return;
    }

    if (!state.trackerId) {
        showAlertModal('No table to delete.');
        return;
    }

    if (confirm('Are you sure you want to delete this table? This cannot be undone.')) {
        // Record analytics for all users in the tracker before deleting
        if (window.firebaseDb && window.currentUser && state.people && state.people.length > 0) {
            try {
                const gameDate = state.trackerName ? extractDateFromTrackerName(state.trackerName) : new Date();
                const trackerId = state.trackerId;
                const trackerName = state.trackerName || 'Unknown Table';
                
                // Get all users from Firestore to match against people in tracker
                const usersRef = window.firebaseDb.collection('users');
                const usersSnapshot = await usersRef.get();
                
                // Build a map of user data for quick lookup
                const userMap = new Map();
                usersSnapshot.forEach(doc => {
                    const userData = doc.data();
                    const userId = doc.id;
                    const name = (userData.displayName || userData.name || userData.email || '').trim().toLowerCase();
                    const email = (userData.email || '').trim().toLowerCase();
                    const uniqueId = (userData.uniqueId || '').trim().toLowerCase();
                    
                    // Store user data keyed by name, email, and uniqueId for matching
                    if (name) userMap.set(name, { userId, userData });
                    if (email) userMap.set(email, { userId, userData });
                    if (uniqueId) userMap.set(uniqueId, { userId, userData });
                });
                
                // Process each person in the tracker
                const analyticsPromises = [];
                const currentUserId = window.currentUser.uid;
                
                console.log('Recording analytics for', state.people.length, 'people in tracker');
                console.log('Current user ID:', currentUserId);
                
                // Get current user's name for comparison
                const currentUserDoc = await window.firebaseDb.collection('users').doc(currentUserId).get();
                let currentUserName = window.currentUser.displayName || '';
                if (currentUserDoc.exists) {
                    const currentUserData = currentUserDoc.data();
                    if (currentUserData.name) {
                        currentUserName = currentUserData.name;
                    } else if (!currentUserName && currentUserData.email) {
                        currentUserName = currentUserData.email.split('@')[0];
                    }
                }
                console.log('Current user name for matching:', currentUserName);
                
                for (const person of state.people) {
                    const personName = (person.name || '').trim();
                    if (!personName) {
                        console.log('Skipping person with empty name');
                        continue; // Skip empty names
                    }
                    
                    const personNameLower = personName.toLowerCase();
                    const currentUserNameLower = currentUserName.toLowerCase();
                    console.log(`Looking for user matching: "${personName}"`);
                    
                    // Try to find matching user (exact match or partial match)
                    let matchedUser = null;
                    let matchedUserId = null;
                    
                    // First, check if this person is the current user (table creator)
                    // This is important because the current user might have added themselves manually
                    if (personNameLower === currentUserNameLower || 
                        (currentUserNameLower && personNameLower.includes(currentUserNameLower)) ||
                        (currentUserNameLower && currentUserNameLower.includes(personNameLower))) {
                        matchedUser = currentUserDoc.exists ? currentUserDoc.data() : {};
                        matchedUserId = currentUserId;
                        console.log(`✅ Matched to current user (table creator): "${personName}" -> userId=${matchedUserId}`);
                    }
                    // Try exact match first (by name, email, or uniqueId)
                    else if (userMap.has(personNameLower)) {
                        const match = userMap.get(personNameLower);
                        matchedUser = match.userData;
                        matchedUserId = match.userId;
                        console.log(`Found exact match for "${personName}": userId=${matchedUserId}`);
                    } else {
                        // Try partial matching by checking all users
                        usersSnapshot.forEach(doc => {
                            if (matchedUser) return; // Already found a match
                            
                            const userData = doc.data();
                            const userId = doc.id;
                            const userName = (userData.displayName || userData.name || '').trim();
                            const userEmail = (userData.email || '').trim().toLowerCase();
                            const userUniqueId = (userData.uniqueId || '').trim().toLowerCase();
                            const userNameLower = userName.toLowerCase();
                            
                            // Check for exact match on displayName/name (case-insensitive)
                            if (userName && personNameLower === userNameLower) {
                                matchedUser = userData;
                                matchedUserId = userId;
                                console.log(`Found exact name match for "${personName}": userId=${matchedUserId}, userName="${userName}"`);
                            }
                            // Check for email match
                            else if (userEmail && personNameLower === userEmail) {
                                matchedUser = userData;
                                matchedUserId = userId;
                                console.log(`Found email match for "${personName}": userId=${matchedUserId}`);
                            }
                            // Check if person name contains uniqueId or vice versa
                            else if (userUniqueId && (personNameLower.includes(userUniqueId) || personNameLower === userUniqueId)) {
                                matchedUser = userData;
                                matchedUserId = userId;
                                console.log(`Found uniqueId match for "${personName}": userId=${matchedUserId}, uniqueId=${userUniqueId}`);
                            }
                            // Check if person name is contained in or contains user name (but only if names are reasonably similar)
                            else if (userName && userNameLower.length > 0) {
                                // Check if one contains the other (but avoid false positives)
                                const nameParts = userNameLower.split(/\s+/);
                                const personParts = personNameLower.split(/\s+/);
                                
                                // If all parts of one name are in the other, consider it a match
                                const allPartsMatch = nameParts.length > 0 && nameParts.every(part => 
                                    part.length > 2 && personNameLower.includes(part)
                                ) || personParts.length > 0 && personParts.every(part => 
                                    part.length > 2 && userNameLower.includes(part)
                                );
                                
                                if (allPartsMatch) {
                                    matchedUser = userData;
                                    matchedUserId = userId;
                                    console.log(`Found partial name match for "${personName}": userId=${matchedUserId}, userName="${userName}"`);
                                }
                            }
                        });
                    }
                    
                    // If we found a matching user, record analytics
                    if (matchedUser && matchedUserId) {
                        const finalPNL = (person.moneyReturned || 0) - (person.moneyPutIn || 0);
                        
                        // Get user document
                        const userDocRef = window.firebaseDb.collection('users').doc(matchedUserId);
                        const userDoc = await userDocRef.get();
                        
                        // Get existing analytics or create new array
                        const existingData = userDoc.exists ? userDoc.data() : {};
                        const existingAnalytics = existingData.analytics || [];
                        
                        // Add new game record
                        const newGameRecord = {
                            date: gameDate,
                            pnl: finalPNL,
                            trackerId: trackerId,
                            trackerName: trackerName
                        };
                        
                        existingAnalytics.push(newGameRecord);
                        
                        // Update user document with analytics (merge to preserve other data)
                        analyticsPromises.push(
                            userDocRef.set({
                                analytics: existingAnalytics,
                                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                            }, { merge: true }).then(() => {
                                console.log(`✅ Analytics recorded for "${person.name}" (userId: ${matchedUserId}):`, newGameRecord);
                            }).catch(err => {
                                console.error(`❌ Error recording analytics for "${person.name}":`, err);
                            })
                        );
                    } else {
                        console.log(`⚠️ No user match found for "${personName}" - skipping analytics`);
                    }
                }
                
                // Wait for all analytics updates to complete (but don't block deletion if they fail)
                if (analyticsPromises.length > 0) {
                    await Promise.allSettled(analyticsPromises);
                }
            } catch (error) {
                console.error('Error recording analytics:', error);
                // Don't block deletion if analytics fails
            }
        }
        
        // Delete from Firestore trackers array
        if (window.firebaseDb && window.currentUser) {
            try {
                const userId = window.currentUser.uid;
                const docRef = window.firebaseDb.collection('users').doc(userId);
                const doc = await docRef.get();
                
                if (doc.exists && doc.data().trackers) {
                    const trackers = doc.data().trackers;
                    // Remove the current tracker from the array
                    const filteredTrackers = trackers.filter(t => t.id !== state.trackerId);
                    
                    await docRef.set({
                        trackers: filteredTrackers,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });
                    
                    console.log('Tracker deleted from Firestore');
                }
            } catch (error) {
                console.error('Error deleting tracker:', error);
                showAlertModal('Error deleting table. Please try again.');
                return;
            }
        }
        
        // Clear localStorage
        localStorage.removeItem('pokerTrackerState');
        
        // Reset state
        state = {
            people: [],
            stackValue: 0,
            chipsPerStack: 0,
            sameValue: true,
            chipValue: 0,
            chipValues: {
                black: 0,
                white: 0,
                green: 0,
                red: 0,
                blue: 0
            },
            chipCounts: {
                black: 0,
                white: 0,
                green: 0,
                red: 0,
                blue: 0
            },
            transactions: [],
            trackerId: null,
            trackerName: null
        };
        
        // Show main screen (which will load remaining trackers)
        await showMainScreen();
    }
}

// Extract date from tracker name (e.g., "Table 1/3/2026" -> Date object)
function extractDateFromTrackerName(trackerName) {
    try {
        // Try to parse date from common formats
        const dateMatch = trackerName.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (dateMatch) {
            const [, month, day, year] = dateMatch;
            return new Date(year, month - 1, day);
        }
    } catch (error) {
        console.error('Error extracting date from tracker name:', error);
    }
    // Fallback to current date
    return new Date();
}

// Toggle between same/different chip values
function toggleChipValueMode() {
    const sameValue = sameValueToggle.checked;
    state.sameValue = sameValue;
    // Hide chip value options when checkbox is checked (all chips worth the same)
    differentChipsSection.classList.toggle('hidden', sameValue);
}

// Start tracking - go directly to dashboard
async function startTracking() {
    // Validate all required fields
    const numPeople = parseInt(numPeopleInput.value);
    const stackValue = parseFloat(stackValueInput.value);
    const chipsPerStack = parseInt(chipsPerStackInput.value);
    const sameValue = sameValueToggle.checked;
    
    // Validate required fields
    if (!numPeople || numPeople < 1) {
        alert('Please enter a valid number of people (at least 1).');
        numPeopleInput.focus();
        return;
    }
    
    if (!stackValue || stackValue <= 0) {
        alert('Please enter a valid stack value (greater than 0).');
        stackValueInput.focus();
        return;
    }
    
    if (!chipsPerStack || chipsPerStack < 1) {
        alert('Please enter a valid number of chips per stack (at least 1).');
        chipsPerStackInput.focus();
        return;
    }
    
    // If different chip values, validate all chip values are filled
    if (!sameValue) {
        const black = parseFloat(document.getElementById('black-value').value) || 0;
        const white = parseFloat(document.getElementById('white-value').value) || 0;
        const green = parseFloat(document.getElementById('green-value').value) || 0;
        const red = parseFloat(document.getElementById('red-value').value) || 0;
        const blue = parseFloat(document.getElementById('blue-value').value) || 0;
        
        if (black === 0 && white === 0 && green === 0 && red === 0 && blue === 0) {
            alert('Please enter values for at least one chip color.');
            return;
        }
    }
    
    // Save chip configuration
    state.stackValue = stackValue;
    state.chipsPerStack = chipsPerStack;
    state.sameValue = sameValue;
    
    if (state.sameValue) {
        // Calculate $ per chip: stack value / chips per stack
        state.chipValue = state.chipsPerStack > 0 ? state.stackValue / state.chipsPerStack : 0;
    } else {
        // Get individual chip values
        state.chipValues.black = parseFloat(document.getElementById('black-value').value) || 0;
        state.chipValues.white = parseFloat(document.getElementById('white-value').value) || 0;
        state.chipValues.green = parseFloat(document.getElementById('green-value').value) || 0;
        state.chipValues.red = parseFloat(document.getElementById('red-value').value) || 0;
        state.chipValues.blue = parseFloat(document.getElementById('blue-value').value) || 0;
        
        // Get chip counts per stack
        state.chipCounts = {
            black: parseInt(document.getElementById('black-count').value) || 0,
            white: parseInt(document.getElementById('white-count').value) || 0,
            green: parseInt(document.getElementById('green-count').value) || 0,
            red: parseInt(document.getElementById('red-count').value) || 0,
            blue: parseInt(document.getElementById('blue-count').value) || 0
        };
    }
    
    // Only create new people if we don't have any yet
    if (state.people.length === 0) {
        state.people = [];
        for (let i = 0; i < numPeople; i++) {
            // Each person starts with 1 stack
            const initialMoney = state.stackValue;
            const initialChips = state.chipsPerStack;
            
            state.people.push({
                id: i,
                name: '', // Start with empty name so placeholder shows
                totalMoney: initialMoney,
                initialMoney: initialMoney,
                moneyPutIn: initialMoney, // Track money put into pot
                moneyReturned: 0, // Track money returned
                chips: initialChips
            });
            
            // Add initial transaction (use placeholder name if name is empty)
            if (initialMoney > 0) {
                const displayName = state.people[i].name || `Person ${i + 1}`;
                addTransaction(i, displayName, initialMoney, 'add', 'initial');
            }
        }
    }
    
    // Always generate a new tracker ID and name when creating from setup
    // (trackerId should be null when coming from setup section)
    if (!state.trackerId) {
        // Generate unique ID using timestamp + random number to avoid collisions
        state.trackerId = Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9);
        state.trackerName = `Table ${new Date().toLocaleDateString()}`;
        console.log('Creating new tracker with ID:', state.trackerId);
    } else {
        console.log('Updating existing tracker with ID:', state.trackerId);
    }
    
    // Save this tracker to user's trackers array
    if (window.firebaseDb && window.currentUser) {
        try {
            const userId = window.currentUser.uid;
            const docRef = window.firebaseDb.collection('users').doc(userId);
            const doc = await docRef.get();
            
            let trackers = [];
            if (doc.exists && doc.data().trackers) {
                trackers = doc.data().trackers;
            }
            
            // Check if tracker already exists, update it; otherwise add new
            const existingIndex = trackers.findIndex(t => t.id === state.trackerId);
            const isNewTracker = existingIndex < 0;
            
            // Get subscription status to determine expiration
            const userEmail = window.currentUser.email;
            let subscriptionStatus = await getSubscriptionStatus(userId, userEmail);
            
            // Calculate expiration date
            let expiresAt = null;
            if (isNewTracker) {
                const now = new Date();
                const createdAt = now.toISOString();
                
                // Check if user is PAYP (one-time payment)
                if (subscriptionStatus?.isOneTimePayment || subscriptionStatus?.subscriptionType === 'payp') {
                    // PAYP users: expire 7 days from creation
                    expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
                } else if (subscriptionStatus?.hasSubscription && subscriptionStatus?.expiresAt) {
                    // Subscription users: expire 7 days after subscription expires
                    const subExpiresAt = new Date(subscriptionStatus.expiresAt);
                    const expirationDate = new Date(subExpiresAt.getTime() + 7 * 24 * 60 * 60 * 1000);
                    expiresAt = expirationDate.toISOString();
                }
                // Free users: no expiration (they have lifetime limit instead)
            } else {
                // For existing trackers, preserve existing expiration unless subscription just expired
                const existingTracker = trackers[existingIndex];
                expiresAt = existingTracker.expiresAt || null;
                
                // If subscription expired, update expiration to 7 days from now
                if (subscriptionStatus?.expiresAt) {
                    const subExpiresAt = new Date(subscriptionStatus.expiresAt);
                    if (subExpiresAt < new Date() && !subscriptionStatus?.isOneTimePayment) {
                        // Subscription expired, set tracker to expire in 7 days
                        expiresAt = new Date(new Date().getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
                    }
                }
            }
            
            const trackerData = {
                id: state.trackerId,
                name: state.trackerName,
                state: prepareStateForFirestore(state),
                updatedAt: new Date().toISOString()
            };
            
            // Add timestamps for new trackers
            if (isNewTracker) {
                trackerData.createdAt = new Date().toISOString();
                if (expiresAt) {
                    trackerData.expiresAt = expiresAt;
                }
            } else if (expiresAt) {
                // Update expiration for existing tracker if needed
                trackerData.expiresAt = expiresAt;
                if (trackers[existingIndex].createdAt) {
                    trackerData.createdAt = trackers[existingIndex].createdAt;
                }
            } else if (trackers[existingIndex].createdAt) {
                trackerData.createdAt = trackers[existingIndex].createdAt;
            }
            
            if (existingIndex >= 0) {
                trackers[existingIndex] = trackerData;
            } else {
                trackers.push(trackerData);
            }
            
            // If this is a new tracker, increment totalTrackersCreated
            const updateData = {
                trackers: trackers,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            if (isNewTracker) {
                const currentTotal = doc.exists ? (doc.data().totalTrackersCreated || trackers.length) : 0;
                updateData.totalTrackersCreated = currentTotal + 1;
            }
            
            // Save trackers array and total count
            await docRef.set(updateData, { merge: true });
            
            console.log('Tracker saved to trackers array');
        } catch (error) {
            console.error('Error saving tracker:', error);
        }
    }
    
    // Hide setup and main screen, show tracking
    const settingsPage = document.getElementById('settings-page');
    const analyticsPage = document.getElementById('analytics-page');
    const upgradePage = document.getElementById('upgrade-page');
    
    // Hide all other pages with inline styles
    if (mainScreen) {
        mainScreen.classList.add('hidden');
        mainScreen.style.display = 'none';
    }
    if (setupSection) {
        setupSection.classList.add('hidden');
        setupSection.style.display = 'none'; // Force hide with inline style
    }
    if (settingsPage) {
        settingsPage.classList.add('hidden');
        settingsPage.style.display = 'none';
    }
    if (analyticsPage) {
        analyticsPage.classList.add('hidden');
        analyticsPage.style.display = 'none';
    }
    if (upgradePage) {
        upgradePage.classList.add('hidden');
        upgradePage.style.display = 'none';
    }
    if (trackingSection) {
        trackingSection.classList.remove('hidden');
        trackingSection.style.display = ''; // Ensure it's visible
    }
    
    // Save viewing state (viewing own tracker)
    trackerViewState.isViewingFriendTracker = false;
    trackerViewState.isOwner = true;
    saveViewingState();
    
    // Render widgets and update display
    renderPeopleWidgets();
    updateTotalPot();
    updateChipValueDisplay();
    updateTotalChips();
    renderLog();
    
    // Save current state (for backward compatibility)
    await saveState();
    
    // Set up real-time listener for own tracker
    if (state.trackerId) {
        setupTrackerRealtimeListener(state.trackerId);
    }
    
    // Reload user trackers to update "Your Tables"
    await loadUserTrackers();
}

// Show add person form
function showAddPersonForm() {
    // Hide any other open forms
    document.querySelectorAll('.widget-form-container').forEach(form => {
        form.style.display = 'none';
    });
    
    // Create a temporary form container at the top of widgets
    let addPersonContainer = document.getElementById('add-person-container');
    if (!addPersonContainer) {
        addPersonContainer = document.createElement('div');
        addPersonContainer.id = 'add-person-container';
        addPersonContainer.className = 'widget-form-container';
        peopleWidgetsDiv.insertBefore(addPersonContainer, peopleWidgetsDiv.firstChild);
    }
    
    addPersonContainer.innerHTML = `
        <div class="widget-form">
            <h4>Add New Person</h4>
            <div class="form-row">
                <label>Name:</label>
                <input type="text" id="new-person-name" placeholder="Enter name" class="form-input">
            </div>
            <div class="form-row">
                <label>Initial Money ($):</label>
                <input type="number" id="new-person-money" min="0" step="0.01" value="${state.stackValue || 0}" class="form-input">
                <small>Default: 1 stack ($${state.stackValue.toFixed(2)})</small>
            </div>
            <div class="form-actions">
                <button class="btn btn-submit" onclick="submitAddPerson()">Add Person</button>
                <button class="btn btn-cancel" onclick="hideAddPersonForm()">Cancel</button>
            </div>
        </div>
    `;
    addPersonContainer.style.display = 'block';
}

// Hide add person form
function hideAddPersonForm() {
    const addPersonContainer = document.getElementById('add-person-container');
    if (addPersonContainer) {
        addPersonContainer.style.display = 'none';
    }
}

// Submit add person
function submitAddPerson() {
    const name = document.getElementById('new-person-name').value.trim();
    let money = parseFloat(document.getElementById('new-person-money').value);
    
    if (!name) {
        alert('Please enter a name for the person.');
        return;
    }
    
    // Default to 1 stack if no money entered
    if (isNaN(money) || money === 0) {
        money = state.stackValue || 0;
    }
    
    // Get next ID
    const nextId = state.people.length > 0 ? Math.max(...state.people.map(p => p.id)) + 1 : 0;
    
    const newPerson = {
        id: nextId,
        name: name,
        totalMoney: money,
        initialMoney: money,
        moneyPutIn: money,
        moneyReturned: 0,
        chips: 0
    };
    
    // Calculate chips
    if (state.sameValue && state.chipValue > 0) {
        newPerson.chips = Math.round(money / state.chipValue);
    } else if (state.sameValue && state.chipsPerStack > 0 && state.stackValue > 0) {
        // If same value and using stack, calculate based on stack
        newPerson.chips = Math.round((money / state.stackValue) * state.chipsPerStack);
    } else {
        // For different values, chips will be 0 initially
        newPerson.chips = 0;
    }
    
    state.people.push(newPerson);
    
    // Add transaction if money > 0 (always initial for new person)
    if (money > 0) {
        const displayName = newPerson.name || `Person ${newPerson.id + 1}`;
        addTransaction(newPerson.id, displayName, money, 'add', 'initial');
    }
    
    hideAddPersonForm();
    renderPeopleWidgets();
    updateTotalPot();
    updateTotalChips();
    renderLog();
    saveState();
}

// Render people widgets
function renderPeopleWidgets() {
    peopleWidgetsDiv.innerHTML = '';
    
    state.people.forEach(person => {
        // Calculate balance: moneyReturned - moneyPutIn
        // Negative = they put in more (owe money), Positive = they made money
        const balance = (person.moneyReturned || 0) - (person.moneyPutIn || 0);
        const balanceClass = balance >= 0 ? 'balance-positive' : 'balance-negative';
        const balanceSign = balance >= 0 ? '+' : '';
        
        const widgetContainer = document.createElement('div');
        widgetContainer.className = 'widget-container';
        
        const widget = document.createElement('div');
        widget.className = 'person-widget';
        widget.id = `widget-${person.id}`;
        widget.innerHTML = `
            <div class="widget-header">
                <div class="name-input-wrapper">
                    <input type="text" class="widget-name-input" id="person-name-${person.id}" value="${person.name || ''}" 
                           oninput="searchPersonNames(${person.id}, this.value)"
                           onchange="updatePersonName(${person.id}, this.value)"
                           onblur="handlePersonNameBlur(${person.id}, this.value)"
                           placeholder="Person ${person.id + 1}">
                    <div id="person-search-dropdown-${person.id}" class="person-search-dropdown hidden"></div>
                </div>
            </div>
            <div class="widget-balance ${balanceClass}">
                <div class="balance-label">Balance</div>
                <div class="balance-amount">${balanceSign}$${Math.abs(balance).toFixed(2)}</div>
            </div>
            <div class="widget-actions">
                <button class="btn btn-add" onclick="showAddForm(${person.id})">+ Add</button>
                <button class="btn btn-remove" onclick="showSubtractForm(${person.id})">- Subtract</button>
            </div>
        `;
        
        widgetContainer.appendChild(widget);
        
        // Add form container (initially hidden)
        const formContainer = document.createElement('div');
        formContainer.className = 'widget-form-container';
        formContainer.id = `form-${person.id}`;
        formContainer.style.display = 'none';
        widgetContainer.appendChild(formContainer);
        
        // Add personal log dropdown
        const personalLogContainer = document.createElement('div');
        personalLogContainer.className = 'personal-log-container';
        personalLogContainer.id = `personal-log-${person.id}`;
        personalLogContainer.innerHTML = `
            <button class="personal-log-toggle" onclick="togglePersonalLog(${person.id})">
                <span>View Personal Log</span>
                <span class="toggle-arrow">▼</span>
            </button>
            <div class="personal-log-content" id="personal-log-content-${person.id}" style="display: none;"></div>
        `;
        widgetContainer.appendChild(personalLogContainer);
        
        peopleWidgetsDiv.appendChild(widgetContainer);
    });
    
    // Render personal logs for all people
    state.people.forEach(person => {
        renderPersonalLog(person.id);
    });
}

// Show add form
function showAddForm(personId) {
    const person = state.people.find(p => p.id === personId);
    if (!person) return;
    
    // Hide any other open forms
    document.querySelectorAll('.widget-form-container').forEach(form => {
        form.style.display = 'none';
    });
    
    const formContainer = document.getElementById(`form-${personId}`);
    if (!formContainer) return;
    
    if (state.sameValue) {
        // Same value: show stacks input (allow partial stacks)
        formContainer.innerHTML = `
            <div class="widget-form">
                <h4>Add Money for ${person.name}</h4>
                <div class="form-row">
                    <label>Number of Stacks:</label>
                    <input type="number" id="add-stacks-${personId}" min="0" step="0.1" class="form-input" placeholder="1">
                    <small>You can enter partial stacks (e.g., 0.5)</small>
                </div>
                <div class="quick-add-buttons" style="margin-top: 12px; margin-bottom: 8px;">
                    <button type="button" class="btn-quick-add" onclick="setQuickAddStacks(${personId}, 0.5)">50% (0.5)</button>
                    <button type="button" class="btn-quick-add" onclick="setQuickAddStacks(${personId}, 1)">100% (1)</button>
                    <button type="button" class="btn-quick-add" onclick="setQuickAddStacks(${personId}, 2)">200% (2)</button>
                </div>
                <div class="form-actions">
                    <button class="btn btn-submit" onclick="submitAdd(${personId})">Add</button>
                    <button class="btn btn-cancel" onclick="hideForm(${personId})">Cancel</button>
                </div>
            </div>
        `;
    } else {
        // Different values: show all chip inputs
        formContainer.innerHTML = `
            <div class="widget-form">
                <h4>Add Chips for ${person.name}</h4>
                <div class="chip-inputs-grid">
                    <div class="chip-input-row">
                        <label>Black ($${state.chipValues.black.toFixed(2)}):</label>
                        <input type="number" id="add-black-${personId}" min="0" step="1" class="form-input" placeholder="0">
                    </div>
                    <div class="chip-input-row">
                        <label>White ($${state.chipValues.white.toFixed(2)}):</label>
                        <input type="number" id="add-white-${personId}" min="0" step="1" class="form-input" placeholder="0">
                    </div>
                    <div class="chip-input-row">
                        <label>Green ($${state.chipValues.green.toFixed(2)}):</label>
                        <input type="number" id="add-green-${personId}" min="0" step="1" class="form-input" placeholder="0">
                    </div>
                    <div class="chip-input-row">
                        <label>Red ($${state.chipValues.red.toFixed(2)}):</label>
                        <input type="number" id="add-red-${personId}" min="0" step="1" class="form-input" placeholder="0">
                    </div>
                    <div class="chip-input-row">
                        <label>Blue ($${state.chipValues.blue.toFixed(2)}):</label>
                        <input type="number" id="add-blue-${personId}" min="0" step="1" class="form-input" placeholder="0">
                    </div>
                </div>
                <div class="form-actions">
                    <button class="btn btn-submit" onclick="submitAdd(${personId})">Add</button>
                    <button class="btn btn-cancel" onclick="hideForm(${personId})">Cancel</button>
                </div>
            </div>
        `;
    }
    
    formContainer.style.display = 'block';
}

// Show subtract form
function showSubtractForm(personId) {
    const person = state.people.find(p => p.id === personId);
    if (!person) return;
    
    // Hide any other open forms
    document.querySelectorAll('.widget-form-container').forEach(form => {
        form.style.display = 'none';
    });
    
    const formContainer = document.getElementById(`form-${personId}`);
    if (!formContainer) return;
    
    if (state.sameValue) {
        // Same value: show chips input (allow returning more than they have)
        formContainer.innerHTML = `
            <div class="widget-form">
                <h4>Return Chips for ${person.name}</h4>
                <div class="form-row">
                    <label>Number of Chips to Return:</label>
                    <input type="number" id="subtract-chips-${personId}" min="0" step="1" class="form-input" placeholder="20">
                    <small>You can return more chips than you have (from other players)</small>
                </div>
                <div class="form-actions">
                    <button class="btn btn-submit" onclick="submitSubtract(${personId})">Return</button>
                    <button class="btn btn-cancel" onclick="hideForm(${personId})">Cancel</button>
                </div>
            </div>
        `;
    } else {
        // Different values: show all chip inputs
        formContainer.innerHTML = `
            <div class="widget-form">
                <h4>Subtract Chips for ${person.name}</h4>
                <div class="chip-inputs-grid">
                    <div class="chip-input-row">
                        <label>Black ($${state.chipValues.black.toFixed(2)}):</label>
                        <input type="number" id="subtract-black-${personId}" min="0" step="1" class="form-input" placeholder="0">
                    </div>
                    <div class="chip-input-row">
                        <label>White ($${state.chipValues.white.toFixed(2)}):</label>
                        <input type="number" id="subtract-white-${personId}" min="0" step="1" class="form-input" placeholder="0">
                    </div>
                    <div class="chip-input-row">
                        <label>Green ($${state.chipValues.green.toFixed(2)}):</label>
                        <input type="number" id="subtract-green-${personId}" min="0" step="1" class="form-input" placeholder="0">
                    </div>
                    <div class="chip-input-row">
                        <label>Red ($${state.chipValues.red.toFixed(2)}):</label>
                        <input type="number" id="subtract-red-${personId}" min="0" step="1" class="form-input" placeholder="0">
                    </div>
                    <div class="chip-input-row">
                        <label>Blue ($${state.chipValues.blue.toFixed(2)}):</label>
                        <input type="number" id="subtract-blue-${personId}" min="0" step="1" class="form-input" placeholder="0">
                    </div>
                </div>
                <div class="form-actions">
                    <button class="btn btn-submit" onclick="submitSubtract(${personId})">Subtract</button>
                    <button class="btn btn-cancel" onclick="hideForm(${personId})">Cancel</button>
                </div>
            </div>
        `;
    }
    
    formContainer.style.display = 'block';
}

// Hide form
function hideForm(personId) {
    const formContainer = document.getElementById(`form-${personId}`);
    if (formContainer) {
        formContainer.style.display = 'none';
    }
}

// Submit add
function submitAdd(personId) {
    const person = state.people.find(p => p.id === personId);
    if (!person) return;
    
    let amount = 0;
    let chipsToAdd = 0;
    
    if (state.sameValue) {
        const numStacks = parseFloat(document.getElementById(`add-stacks-${personId}`).value) || 0;
        chipsToAdd = Math.round(numStacks * state.chipsPerStack);
        amount = numStacks * state.stackValue;
    } else {
        const black = parseInt(document.getElementById(`add-black-${personId}`).value) || 0;
        const white = parseInt(document.getElementById(`add-white-${personId}`).value) || 0;
        const green = parseInt(document.getElementById(`add-green-${personId}`).value) || 0;
        const red = parseInt(document.getElementById(`add-red-${personId}`).value) || 0;
        const blue = parseInt(document.getElementById(`add-blue-${personId}`).value) || 0;
        
        chipsToAdd = black + white + green + red + blue;
        amount = (black * state.chipValues.black) +
                 (white * state.chipValues.white) +
                 (green * state.chipValues.green) +
                 (red * state.chipValues.red) +
                 (blue * state.chipValues.blue);
    }
    
    if (amount > 0 || chipsToAdd > 0) {
        // Update chips
        person.chips = (person.chips || 0) + chipsToAdd;
        
        // Track money put in (for balance calculation)
        const previousMoneyPutIn = person.moneyPutIn || 0;
        person.moneyPutIn = previousMoneyPutIn + amount;
        
        // Determine if this is initial buy-in or re-buy
        const transactionType = previousMoneyPutIn === 0 ? 'initial' : 're-buy';
        
        // Update total money (for display purposes, though we use balance now)
        person.totalMoney = (person.totalMoney || 0) + amount;
        
        const displayName = person.name || `Person ${personId + 1}`;
        addTransaction(personId, displayName, amount, 'add', transactionType);
        hideForm(personId);
        renderPeopleWidgets();
        updateTotalPot();
        updateTotalChips();
        renderLog();
        // Update personal log if it's open
        const personalLogContent = document.getElementById(`personal-log-content-${personId}`);
        if (personalLogContent && personalLogContent.style.display !== 'none') {
            renderPersonalLog(personId);
        }
        saveState();
    } else {
        alert('Please enter a valid amount to add.');
    }
}

// Submit subtract
function submitSubtract(personId) {
    const person = state.people.find(p => p.id === personId);
    if (!person) return;
    
    let amount = 0;
    let chipsToReturn = 0;
    
    if (state.sameValue) {
        chipsToReturn = parseInt(document.getElementById(`subtract-chips-${personId}`).value) || 0;
        
        if (chipsToReturn <= 0) {
            alert('Please enter a valid number of chips to return.');
            return;
        }
        
        // Calculate amount based on chips returned
        amount = chipsToReturn * state.chipValue;
    } else {
        const black = parseInt(document.getElementById(`subtract-black-${personId}`).value) || 0;
        const white = parseInt(document.getElementById(`subtract-white-${personId}`).value) || 0;
        const green = parseInt(document.getElementById(`subtract-green-${personId}`).value) || 0;
        const red = parseInt(document.getElementById(`subtract-red-${personId}`).value) || 0;
        const blue = parseInt(document.getElementById(`subtract-blue-${personId}`).value) || 0;
        
        chipsToReturn = black + white + green + red + blue;
        amount = (black * state.chipValues.black) +
                 (white * state.chipValues.white) +
                 (green * state.chipValues.green) +
                 (red * state.chipValues.red) +
                 (blue * state.chipValues.blue);
        
        if (chipsToReturn <= 0) {
            alert('Please enter a valid number of chips to return.');
            return;
        }
    }
    
    if (chipsToReturn > 0) {
        // Update chips (can go negative if returning more than they have)
        person.chips = (person.chips || 0) - chipsToReturn;
        
        // Track money returned (for balance calculation)
        person.moneyReturned = (person.moneyReturned || 0) + amount;
        
        // Update total money (for display purposes, though we use balance now)
        person.totalMoney = (person.totalMoney || 0) - amount;
        
        const displayName = person.name || `Person ${personId + 1}`;
        addTransaction(personId, displayName, amount, 'remove');
        hideForm(personId);
        renderPeopleWidgets();
        updateTotalPot();
        updateTotalChips();
        renderLog();
        // Update personal log if it's open
        const personalLogContent = document.getElementById(`personal-log-content-${personId}`);
        if (personalLogContent && personalLogContent.style.display !== 'none') {
            renderPersonalLog(personId);
        }
        saveState();
    }
}

// Update person name
// Search for person names and show dropdown
let personSearchTimeout = {};
let personNameSelectionInProgress = {}; // Track when a dropdown selection is in progress
async function searchPersonNames(personId, searchTerm) {
    // Clear any existing timeout
    if (personSearchTimeout[personId]) {
        clearTimeout(personSearchTimeout[personId]);
    }
    
    const dropdown = document.getElementById(`person-search-dropdown-${personId}`);
    if (!dropdown) return;
    
    // Hide dropdown if search is empty
    if (!searchTerm || searchTerm.trim().length < 1) {
        dropdown.classList.add('hidden');
        return;
    }
    
    // Debounce search
    personSearchTimeout[personId] = setTimeout(async () => {
        if (!window.firebaseDb || !window.currentUser) {
            dropdown.classList.add('hidden');
            return;
        }
        
        try {
            const searchTermLower = searchTerm.trim().toLowerCase();
            const usersRef = window.firebaseDb.collection('users');
            const snapshot = await usersRef.get();
            
            const results = [];
            snapshot.forEach(doc => {
                const userData = doc.data();
                const userId = doc.id;
                
                const name = (userData.displayName || userData.name || userData.email || '').toLowerCase();
                const uniqueId = (userData.uniqueId || '').toLowerCase();
                const email = (userData.email || '').toLowerCase();
                
                if (name.includes(searchTermLower) || uniqueId.includes(searchTermLower) || email.includes(searchTermLower)) {
                    results.push({
                        id: userId,
                        name: userData.displayName || userData.name || userData.email || 'Unknown',
                        uniqueId: userData.uniqueId || '',
                        email: userData.email || ''
                    });
                }
            });
            
            // Limit to 5 results
            const limitedResults = results.slice(0, 5);
            
            if (limitedResults.length === 0) {
                dropdown.classList.add('hidden');
            } else {
                dropdown.innerHTML = limitedResults.map(user => `
                    <div class="person-search-result" onclick="selectPersonFromSearch(${personId}, '${user.name.replace(/'/g, "\\'")}', '${user.uniqueId || ''}')">
                        <div class="person-search-result-name">${user.name}</div>
                        ${user.uniqueId ? `<div class="person-search-result-id">ID: ${user.uniqueId}</div>` : ''}
                    </div>
                `).join('');
                dropdown.classList.remove('hidden');
            }
        } catch (error) {
            console.error('Error searching for persons:', error);
            dropdown.classList.add('hidden');
        }
    }, 300);
}

// Select person from search dropdown
async function selectPersonFromSearch(personId, name, uniqueId) {
    // Mark that a selection is in progress to prevent blur handler from interfering
    personNameSelectionInProgress[personId] = true;
    
    const nameInput = document.getElementById(`person-name-${personId}`);
    const dropdown = document.getElementById(`person-search-dropdown-${personId}`);
    
    if (nameInput) {
        nameInput.value = name;
        // Update state immediately
        const person = state.people.find(p => p.id === personId);
        if (person) {
            person.name = name;
            // Update transaction log entries with new name
            state.transactions.forEach(transaction => {
                if (transaction.personId === personId) {
                    transaction.personName = person.name;
                }
            });
        }
    }
    
    if (dropdown) {
        dropdown.classList.add('hidden');
    }
    
    // Call updatePersonName to ensure state is saved
    updatePersonName(personId, name);
    
    // If a user was selected (not just a name typed), add tracker to their "Your Tables"
    // Find the user by name or uniqueId and add this tracker to their trackers list
    if (window.firebaseDb && window.currentUser && state.trackerId && (name || uniqueId)) {
        try {
            // Search for the user by name or uniqueId
            const usersRef = window.firebaseDb.collection('users');
            const snapshot = await usersRef.get();
            
            let selectedUserId = null;
            snapshot.forEach(doc => {
                if (selectedUserId) return; // Already found
                
                const userData = doc.data();
                const userId = doc.id;
                const userName = (userData.displayName || userData.name || '').trim();
                const userUniqueId = (userData.uniqueId || '').trim();
                
                // Match by name or uniqueId
                if (uniqueId && userUniqueId && userUniqueId.toLowerCase() === uniqueId.toLowerCase()) {
                    selectedUserId = userId;
                } else if (name && userName && userName.toLowerCase() === name.toLowerCase()) {
                    selectedUserId = userId;
                }
            });
            
            // If we found the user and they're not the current user, add tracker to their list
            if (selectedUserId && selectedUserId !== window.currentUser.uid) {
                const selectedUserRef = window.firebaseDb.collection('users').doc(selectedUserId);
                const selectedUserDoc = await selectedUserRef.get();
                
                let selectedUserTrackers = [];
                if (selectedUserDoc.exists && selectedUserDoc.data().trackers) {
                    selectedUserTrackers = selectedUserDoc.data().trackers;
                }
                
                // Check if tracker already exists in their list
                const trackerExists = selectedUserTrackers.some(t => t.id === state.trackerId);
                
                if (!trackerExists) {
                    // Add tracker to selected user's trackers list
                    const trackerData = {
                        id: state.trackerId,
                        name: state.trackerName || `Table ${new Date().toLocaleDateString()}`,
                        state: prepareStateForFirestore(state),
                        updatedAt: new Date().toISOString()
                    };
                    
                    selectedUserTrackers.push(trackerData);
                    
                    await selectedUserRef.set({
                        trackers: selectedUserTrackers,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });
                    
                    console.log(`Added tracker to ${name}'s "Your Tables" section`);
                }
            }
        } catch (error) {
            console.error('Error adding tracker to selected user:', error);
            // Don't block the name update if this fails
        }
    }
    
    // Clear the selection flag after a short delay
    setTimeout(() => {
        personNameSelectionInProgress[personId] = false;
    }, 300);
}

// Handle blur event (hide dropdown after a delay to allow click)
function handlePersonNameBlur(personId, value) {
    setTimeout(() => {
        // Don't update if a dropdown selection is in progress
        if (personNameSelectionInProgress[personId]) {
            return;
        }
        
        const dropdown = document.getElementById(`person-search-dropdown-${personId}`);
        if (dropdown) {
            dropdown.classList.add('hidden');
        }
        
        // Only update if the input value matches what was blurred (user typed, not selected)
        const nameInput = document.getElementById(`person-name-${personId}`);
        if (nameInput && nameInput.value === value) {
            updatePersonName(personId, value);
        }
    }, 200);
}

function updatePersonName(personId, newName) {
    // Don't allow updating name if viewing friend's tracker without edit access
    if (trackerViewState.isViewingFriendTracker && !trackerViewState.hasEditAccess) {
        // Reset the input to the original name
        const person = state.people.find(p => p.id === personId);
        if (person) {
            const nameInput = document.getElementById(`person-name-${personId}`);
            if (nameInput) {
                nameInput.value = person.name || `Person ${personId + 1}`;
            }
        }
        return;
    }

    const person = state.people.find(p => p.id === personId);
    if (person) {
        person.name = newName || `Person ${personId + 1}`;
        // Update transaction log entries with old name
        state.transactions.forEach(transaction => {
            if (transaction.personId === personId) {
                transaction.personName = person.name;
            }
        });
        renderLog();
        saveState();
    }
}

// Update person money (when manually editing - treat as initial put in)
function updatePersonMoney(personId, newMoney) {
    const person = state.people.find(p => p.id === personId);
    if (person) {
        const newMoneyValue = parseFloat(newMoney) || 0;
        
        // Update money put in (treating manual edit as initial contribution)
        person.moneyPutIn = newMoneyValue;
        person.totalMoney = newMoneyValue;
        
        // Update chips if same value
        if (state.sameValue && state.chipValue > 0) {
            person.chips = Math.round(person.totalMoney / state.chipValue);
        }
        
        renderPeopleWidgets();
        updateTotalPot();
        updateTotalChips();
        renderLog();
        saveState();
    }
}

// Add transaction to log
function addTransaction(personId, personName, amount, type, transactionType = null) {
    const transaction = {
        id: Date.now(),
        personId: personId,
        personName: personName,
        amount: amount,
        type: type, // 'add' or 'remove'
        transactionType: transactionType, // 'initial' or 're-buy' (only for 'add' type)
        timestamp: new Date()
    };
    
    state.transactions.push(transaction);
}

// Update total pot
function updateTotalPot() {
    // Total pot = sum of (money put in - money returned) for all people
    const total = state.people.reduce((sum, person) => {
        const moneyPutIn = person.moneyPutIn || 0;
        const moneyReturned = person.moneyReturned || 0;
        return sum + (moneyPutIn - moneyReturned);
    }, 0);
    totalPotAmount.textContent = total.toFixed(2);
    updateChipValueDisplay();
}

// Update total chips tracker
function updateTotalChips() {
    const total = state.people.reduce((sum, person) => sum + (person.chips || 0), 0);
    totalChipsAmount.textContent = total;
    
    // Check if total chips is negative and show warning
    if (total < 0) {
        chipsWarning.textContent = 'Warning: Total chips balance is negative. Please check transactions.';
        chipsWarning.classList.remove('hidden');
    } else {
        chipsWarning.classList.add('hidden');
    }
}

// Update chip value display
function updateChipValueDisplay() {
    if (state.sameValue && state.chipValue > 0) {
        chipValueDisplay.textContent = `Each chip is worth $${state.chipValue.toFixed(2)}`;
        chipValueDisplay.style.display = 'block';
    } else {
        chipValueDisplay.style.display = 'none';
    }
}

// Toggle personal log dropdown
function togglePersonalLog(personId) {
    const content = document.getElementById(`personal-log-content-${personId}`);
    const arrow = document.querySelector(`#personal-log-${personId} .toggle-arrow`);
    
    if (content.style.display === 'none') {
        content.style.display = 'block';
        arrow.textContent = '▲';
        renderPersonalLog(personId);
    } else {
        content.style.display = 'none';
        arrow.textContent = '▼';
    }
}

// Render personal log for a specific person
function renderPersonalLog(personId) {
    const person = state.people.find(p => p.id === personId);
    if (!person) return;
    
    const logContent = document.getElementById(`personal-log-content-${personId}`);
    if (!logContent) return;
    
    // Filter transactions for this person
    const personTransactions = state.transactions.filter(t => t.personId === personId);
    
    if (personTransactions.length === 0) {
        logContent.innerHTML = '<div class="log-empty">No transactions yet</div>';
        return;
    }
    
    logContent.innerHTML = '';
    
    // Show most recent first
    const sortedTransactions = [...personTransactions].reverse();
    
    sortedTransactions.forEach(transaction => {
        const logEntry = document.createElement('div');
        // Reverse colors: add = red (putting money in), remove = green (returning money)
        const colorClass = transaction.type === 'add' ? 'log-remove' : 'log-add';
        logEntry.className = `log-entry ${colorClass}`;
        
        // Safely format date
        let dateStr = 'Unknown Date';
        let timeStr = 'Unknown Time';
        
        if (transaction.timestamp) {
            try {
                // Ensure timestamp is a Date object
                const date = transaction.timestamp instanceof Date 
                    ? transaction.timestamp 
                    : new Date(transaction.timestamp);
                
                if (!isNaN(date.getTime())) {
                    dateStr = date.toLocaleDateString();
                    timeStr = date.toLocaleTimeString();
                }
            } catch (e) {
                console.error('Error formatting date in personal log:', e, transaction);
            }
        }
        
        // Reverse signs: add = negative (putting money in), remove = positive (returning money)
        const sign = transaction.type === 'add' ? '-' : '+';
        let typeText = transaction.type === 'add' ? 'added' : 'removed';
        
        // Show transaction type for buy-ins (initial vs re-buy) in personal log
        if (transaction.type === 'add' && transaction.transactionType) {
            typeText = transaction.transactionType === 'initial' ? 'initial buy-in' : 're-buy';
        }
        
        logEntry.innerHTML = `
            <div class="log-time">${dateStr} ${timeStr}</div>
            <div class="log-details">
                <span class="log-action">${typeText}</span>
                <span class="log-amount">${sign}$${(transaction.amount || 0).toFixed(2)}</span>
            </div>
        `;
        
        logContent.appendChild(logEntry);
    });
}

// Render transaction log
function renderLog() {
    logEntriesDiv.innerHTML = '';
    
    if (state.transactions.length === 0) {
        logEntriesDiv.innerHTML = '<div class="log-empty">No transactions yet</div>';
        return;
    }
    
    // Show most recent first
    const sortedTransactions = [...state.transactions].reverse();
    
    sortedTransactions.forEach(transaction => {
        const logEntry = document.createElement('div');
        // Reverse colors: add = red (putting money in), remove = green (returning money)
        const colorClass = transaction.type === 'add' ? 'log-remove' : 'log-add';
        logEntry.className = `log-entry ${colorClass}`;
        
        // Safely format date
        let dateStr = 'Unknown Date';
        let timeStr = 'Unknown Time';
        
        if (transaction.timestamp) {
            try {
                // Ensure timestamp is a Date object
                const date = transaction.timestamp instanceof Date 
                    ? transaction.timestamp 
                    : new Date(transaction.timestamp);
                
                if (!isNaN(date.getTime())) {
                    dateStr = date.toLocaleDateString();
                    timeStr = date.toLocaleTimeString();
                }
            } catch (e) {
                console.error('Error formatting date:', e, transaction);
            }
        }
        
        // Reverse signs: add = negative (putting money in), remove = positive (returning money)
        const sign = transaction.type === 'add' ? '-' : '+';
        let typeText = transaction.type === 'add' ? 'added' : 'removed';
        
        // Show transaction type for buy-ins (initial vs re-buy)
        if (transaction.type === 'add' && transaction.transactionType) {
            typeText = transaction.transactionType === 'initial' ? 'initial buy-in' : 're-buy';
        }
        
        logEntry.innerHTML = `
            <div class="log-time">${dateStr} ${timeStr}</div>
            <div class="log-details">
                <span class="log-person">${transaction.personName || 'Unknown'}</span>
                <span class="log-action">${typeText}</span>
                <span class="log-amount">${sign}$${(transaction.amount || 0).toFixed(2)}</span>
            </div>
        `;
        
        logEntriesDiv.appendChild(logEntry);
    });
}

// Clear table (reset all data without affecting analytics)
async function clearTable() {
    // Don't allow clear if viewing friend's tracker
    if (trackerViewState.isViewingFriendTracker) {
        showAlertModal('You cannot clear a table when viewing a friend\'s tracker.');
        return;
    }
    
    if (!state.trackerId) {
        showAlertModal('No table to clear.');
        return;
    }
    
    if (confirm('Are you sure you want to clear all data from this table? This will delete the tracker and reset all people, transactions, and chips but will NOT affect analytics.')) {
        // Delete from Firestore trackers array
        if (window.firebaseDb && window.currentUser) {
            try {
                const userId = window.currentUser.uid;
                const docRef = window.firebaseDb.collection('users').doc(userId);
                const doc = await docRef.get();
                
                if (doc.exists && doc.data().trackers) {
                    const trackers = doc.data().trackers;
                    // Remove the current tracker from the array
                    const filteredTrackers = trackers.filter(t => t.id !== state.trackerId);
                    
                    await docRef.set({
                        trackers: filteredTrackers,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });
                    
                    console.log('Tracker deleted from Firestore');
                }
            } catch (error) {
                console.error('Error deleting tracker:', error);
                showAlertModal('Error deleting table. Please try again.');
                return;
            }
        }
        
        // Clear localStorage
        localStorage.removeItem('pokerTrackerState');
        
        // Reset state completely
        state = {
            people: [],
            stackValue: 0,
            chipsPerStack: 0,
            sameValue: true,
            chipValue: 0,
            chipValues: {
                black: 0,
                white: 0,
                green: 0,
                red: 0,
                blue: 0
            },
            chipCounts: {
                black: 0,
                white: 0,
                green: 0,
                red: 0,
                blue: 0
            },
            transactions: [],
            trackerId: null,
            trackerName: null
        };
        
        // Show main screen (which will load remaining trackers)
        await showMainScreen();
    }
}

// Settlement functions
// Track if settlement modal is opened from "End Game" button
let isEndGameFlow = false;

function showSettlementModal() {
    isEndGameFlow = false;
    const modal = document.getElementById('settlement-modal');
    modal.classList.remove('hidden');
    // Show "Back to Dashboard" button in normal flow
    const backToDashboardBtn = document.getElementById('back-to-dashboard-btn');
    if (backToDashboardBtn) {
        backToDashboardBtn.classList.remove('hidden');
    }
    showSettlementOptions();
}

function showSettlementModalForEndGame() {
    isEndGameFlow = true;
    const modal = document.getElementById('settlement-modal');
    modal.classList.remove('hidden');
    // Hide "Back to Dashboard" button in end game flow
    const backToDashboardBtn = document.getElementById('back-to-dashboard-btn');
    if (backToDashboardBtn) {
        backToDashboardBtn.classList.add('hidden');
    }
    showSettlementOptions();
}

function closeSettlementModal() {
    isEndGameFlow = false;
    const modal = document.getElementById('settlement-modal');
    modal.classList.add('hidden');
    // Hide end game buttons
    const endGameFromHouse = document.getElementById('end-game-from-house');
    const endGameFromPlayer = document.getElementById('end-game-from-player');
    if (endGameFromHouse) endGameFromHouse.classList.add('hidden');
    if (endGameFromPlayer) endGameFromPlayer.classList.add('hidden');
    // Show "Back to Dashboard" button
    const backToDashboardBtn = document.getElementById('back-to-dashboard-btn');
    if (backToDashboardBtn) {
        backToDashboardBtn.classList.remove('hidden');
    }
}

function showSettlementOptions() {
    document.getElementById('settlement-options').classList.remove('hidden');
    document.getElementById('house-settlement-view').classList.add('hidden');
    document.getElementById('player-settlement-view').classList.add('hidden');
    // Hide end game buttons when showing options
    const endGameFromHouse = document.getElementById('end-game-from-house');
    const endGameFromPlayer = document.getElementById('end-game-from-player');
    if (endGameFromHouse) endGameFromHouse.classList.add('hidden');
    if (endGameFromPlayer) endGameFromPlayer.classList.add('hidden');
    // Show "Back to Tracker" button only in end game flow
    const backToTrackerBtn = document.getElementById('back-to-tracker-btn');
    if (backToTrackerBtn) {
        if (isEndGameFlow) {
            backToTrackerBtn.classList.remove('hidden');
        } else {
            backToTrackerBtn.classList.add('hidden');
        }
    }
}

function showHouseSettlement() {
    document.getElementById('settlement-options').classList.add('hidden');
    document.getElementById('house-settlement-view').classList.remove('hidden');
    
    const resultsDiv = document.getElementById('house-settlement-results');
    resultsDiv.innerHTML = '';
    
    // Calculate house settlement for each player
    const totalCollected = state.people.reduce((sum, person) => sum + (person.moneyPutIn || 0), 0);
    
    const summaryDiv = document.createElement('div');
    summaryDiv.className = 'settlement-summary';
    summaryDiv.innerHTML = `<h3>Total Collected by House: $${totalCollected.toFixed(2)}</h3>`;
    resultsDiv.appendChild(summaryDiv);
    
    state.people.forEach(person => {
        const buyIn = person.moneyPutIn || 0;
        const balance = (person.moneyReturned || 0) - buyIn;
        // House pays: buyIn + balance
        // If balance is positive (profit): buyIn + profit
        // If balance is negative (loss): buyIn - loss (minimum 0)
        const housePays = Math.max(0, buyIn + balance);
        
        const personDiv = document.createElement('div');
        personDiv.className = 'settlement-person';
        personDiv.innerHTML = `
            <div class="settlement-person-name">${person.name}</div>
            <div class="settlement-details">
                <div>Buy-in: $${buyIn.toFixed(2)}</div>
                <div>Final Balance: ${balance >= 0 ? '+' : ''}$${balance.toFixed(2)}</div>
                <div class="settlement-payment ${housePays > 0 ? 'payment-positive' : 'payment-zero'}">
                    House Pays: $${housePays.toFixed(2)}
                </div>
            </div>
        `;
        resultsDiv.appendChild(personDiv);
    });
    
    // Show "End Game" button if in end game flow
    const endGameBtn = document.getElementById('end-game-from-house');
    if (endGameBtn) {
        if (isEndGameFlow) {
            endGameBtn.classList.remove('hidden');
        } else {
            endGameBtn.classList.add('hidden');
        }
    }
}

function showPlayerToPlayerSettlement() {
    document.getElementById('settlement-options').classList.add('hidden');
    document.getElementById('player-settlement-view').classList.remove('hidden');
    
    const resultsDiv = document.getElementById('player-settlement-results');
    resultsDiv.innerHTML = '';
    
    // Calculate balances
    const balances = state.people.map(person => ({
        id: person.id,
        name: person.name,
        balance: (person.moneyReturned || 0) - (person.moneyPutIn || 0)
    }));
    
    // Separate winners and losers, sorted by absolute value (biggest first)
    const winners = balances.filter(p => p.balance > 0).sort((a, b) => b.balance - a.balance);
    const losers = balances.filter(p => p.balance < 0).map(p => ({
        ...p,
        loss: Math.abs(p.balance)
    })).sort((a, b) => b.loss - a.loss);
    
    if (winners.length === 0 && losers.length === 0) {
        resultsDiv.innerHTML = '<p>All players are even. No settlement needed.</p>';
        return;
    }
    
    // Calculate total winnings and losses
    const totalWinnings = winners.reduce((sum, p) => sum + p.balance, 0);
    const totalLosses = losers.reduce((sum, p) => sum + p.loss, 0);
    
    if (Math.abs(totalWinnings - totalLosses) > 0.01) {
        resultsDiv.innerHTML = '<p class="settlement-error">Warning: Winnings and losses do not balance. Please check transactions.</p>';
    }
    
    // Show settlement instructions
    const instructionsDiv = document.createElement('div');
    instructionsDiv.className = 'settlement-instructions';
    instructionsDiv.innerHTML = '<h3>Settlement Instructions:</h3>';
    resultsDiv.appendChild(instructionsDiv);
    
    // Optimized matching: match biggest winner with biggest loser
    // Create working copies to track remaining balances
    const winnerBalances = winners.map(w => ({ ...w, remaining: w.balance }));
    const loserBalances = losers.map(l => ({ ...l, remaining: l.loss }));
    
    // Track all payments to group by payer
    const paymentsByPayer = {};
    
    // Match winners with losers, starting with biggest
    for (let winnerIdx = 0; winnerIdx < winnerBalances.length; winnerIdx++) {
        const winner = winnerBalances[winnerIdx];
        
        // Find losers who still need to pay
        for (let loserIdx = 0; loserIdx < loserBalances.length && winner.remaining > 0.01; loserIdx++) {
            const loser = loserBalances[loserIdx];
            
            if (loser.remaining > 0.01) {
                // Calculate payment amount
                const payment = Math.min(winner.remaining, loser.remaining);
                
                // Record payment
                if (!paymentsByPayer[loser.name]) {
                    paymentsByPayer[loser.name] = [];
                }
                paymentsByPayer[loser.name].push({
                    to: winner.name,
                    amount: payment
                });
                
                // Update remaining balances
                winner.remaining -= payment;
                loser.remaining -= payment;
            }
        }
    }
    
    // Display payments grouped by payer
    Object.keys(paymentsByPayer).forEach(payerName => {
        const payments = paymentsByPayer[payerName];
        const totalAmount = payments.reduce((sum, p) => sum + p.amount, 0);
        
        const paymentsDiv = document.createElement('div');
        paymentsDiv.className = 'settlement-payment-item';
        paymentsDiv.innerHTML = `
            <div class="payment-from">${payerName} pays:</div>
            <div class="payment-list">
                ${payments.map(p => `<div>$${p.amount.toFixed(2)} to ${p.to}</div>`).join('')}
            </div>
            <div class="payment-total">Total: $${totalAmount.toFixed(2)}</div>
        `;
        resultsDiv.appendChild(paymentsDiv);
    });
    
    // Show "End Game" button if in end game flow
    const endGameBtn = document.getElementById('end-game-from-player');
    if (endGameBtn) {
        if (isEndGameFlow) {
            endGameBtn.classList.remove('hidden');
        } else {
            endGameBtn.classList.add('hidden');
        }
    }
}

function backToSettlementOptions() {
    showSettlementOptions();
}

function backToTracker() {
    // Close the settlement modal and return to tracker
    closeSettlementModal();
}

function confirmEndGame() {
    // Close the settlement modal first
    closeSettlementModal();
    // Then delete the table
    deleteCurrentTable();
}

// ==================== FRIENDS SYSTEM ====================

let friendsListeners = [];
let onlineStatusListeners = [];
let isLoadingFriendsList = false; // Flag to prevent concurrent calls
let friendsListLoadTimer = null; // Debounce timer

// Toggle friends sidebar
// Toggle left sidebar menu
function toggleSidebarMenu() {
    const sidebar = document.getElementById('sidebar-menu');
    const overlay = document.getElementById('sidebar-overlay-menu');

    if (sidebar && overlay) {
        const isHidden = sidebar.classList.contains('hidden');
        if (isHidden) {
            sidebar.classList.remove('hidden');
            overlay.classList.remove('hidden');
            // Update friends badge in sidebar if needed
            updateSidebarFriendsBadge();
        } else {
            sidebar.classList.add('hidden');
            overlay.classList.add('hidden');
        }
    }
}

// Update friends badge in sidebar menu
function updateSidebarFriendsBadge() {
    const badge = document.getElementById('sidebar-friends-badge');
    const friendsBadge = document.getElementById('friends-notification-badge');
    if (badge && friendsBadge) {
        const count = friendsBadge.textContent;
        if (count && count !== '0' && !friendsBadge.classList.contains('hidden')) {
            badge.textContent = count;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }
}

// Show invite people modal
function showInvitePeopleModal() {
    // Use existing invite link functionality from friends sidebar
    toggleFriendsSidebar();
    // Scroll to invite section if needed
    setTimeout(() => {
        const inviteSection = document.querySelector('.friends-invite-section');
        if (inviteSection) {
            inviteSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, 300);
}

// Show settings page
async function showSettingsPage() {
    const mainScreen = document.getElementById('main-screen');
    const settingsPage = document.getElementById('settings-page');
    const setupSection = document.getElementById('setup-section');
    const trackingSection = document.getElementById('tracking-section');
    const analyticsPage = document.getElementById('analytics-page');
    const upgradePage = document.getElementById('upgrade-page');
    
    // Hide all other pages with inline styles for robustness
    if (mainScreen) {
        mainScreen.classList.add('hidden');
        mainScreen.style.display = 'none';
    }
    if (setupSection) {
        setupSection.classList.add('hidden');
        setupSection.style.display = 'none';
    }
    if (trackingSection) {
        trackingSection.classList.add('hidden');
        trackingSection.style.display = 'none';
    }
    if (analyticsPage) {
        analyticsPage.classList.add('hidden');
        analyticsPage.style.display = 'none';
    }
    if (upgradePage) {
        upgradePage.classList.add('hidden');
        upgradePage.style.display = 'none';
    }
    
    // Show settings page with inline style to ensure visibility
    if (settingsPage) {
        settingsPage.classList.remove('hidden');
        settingsPage.style.display = '';
        await loadSettingsData();
    }
}

// Load current user data into settings inputs
async function loadSettingsData() {
    if (!window.firebaseDb || !window.currentUser) return;
    
    try {
        const userId = window.currentUser.uid;
        const userEmail = window.currentUser.email;
        // Initialize credits if needed
        await initializeCredits(userId);
        
        const userDocRef = window.firebaseDb.collection('users').doc(userId);
        const userDoc = await userDocRef.get();
        
        const usernameInput = document.getElementById('settings-username');
        const uniqueIdInput = document.getElementById('settings-unique-id');
        const creditsDisplay = document.getElementById('settings-credits-display');
        
        // Check if user has Pro plan (unlimited credits)
        const subscriptionStatus = await getSubscriptionStatus(userId, userEmail);
        const whitelisted = await isEmailWhitelisted(userEmail);
        
        const hasProPlan = whitelisted || 
                          (subscriptionStatus?.hasSubscription && 
                           (subscriptionStatus?.subscriptionType === 'monthly' || 
                            subscriptionStatus?.subscriptionType === '6month' ||
                            subscriptionStatus?.subscriptionType === 'pro') &&
                           !subscriptionStatus?.isOneTimePayment);
        
        // Check if subscription is active (not expired)
        let isSubscriptionActive = hasProPlan;
        if (hasProPlan && subscriptionStatus?.expiresAt) {
            const expiresAt = new Date(subscriptionStatus.expiresAt);
            isSubscriptionActive = expiresAt > new Date();
        }
        
        if (userDoc.exists) {
            const userData = userDoc.data();
            
            // Load username (displayName)
            if (usernameInput) {
                usernameInput.value = userData.displayName || window.currentUser.displayName || window.currentUser.email || '';
            }
            
            // Load unique ID
            if (uniqueIdInput) {
                uniqueIdInput.value = userData.uniqueId || '';
            }
            
            // Load and display credits (or "Unlimited" for Pro plan users)
            if (creditsDisplay) {
                if (isSubscriptionActive || whitelisted) {
                    creditsDisplay.textContent = 'Unlimited';
                    creditsDisplay.style.color = '#10b981'; // Green for unlimited
                } else {
                    const credits = userData.credits !== undefined ? userData.credits : 3;
                    creditsDisplay.textContent = credits;
                    creditsDisplay.style.color = '#10b981'; // Green for regular credits
                }
            }
        } else {
            // If no user doc exists, use auth data
            if (usernameInput) {
                usernameInput.value = window.currentUser.displayName || window.currentUser.email || '';
            }
            // Show default credits or unlimited
            if (creditsDisplay) {
                if (isSubscriptionActive || whitelisted) {
                    creditsDisplay.textContent = 'Unlimited';
                    creditsDisplay.style.color = '#10b981';
                } else {
                    creditsDisplay.textContent = '3';
                    creditsDisplay.style.color = '#10b981';
                }
            }
        }
    } catch (error) {
        console.error('Error loading settings data:', error);
    }
}

// Save username (auto-save on blur)
async function saveUsername(newUsername) {
    if (!window.firebaseDb || !window.currentUser || !newUsername || newUsername.trim() === '') {
        // If empty, restore original value
        await loadSettingsData();
        return;
    }
    
    const trimmedUsername = newUsername.trim();
    const userId = window.currentUser.uid;
    
    try {
        // Update Firestore user document
        const userDocRef = window.firebaseDb.collection('users').doc(userId);
        await userDocRef.set({
            displayName: trimmedUsername,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        // Update Firebase Auth displayName
        if (window.firebaseAuth && window.currentUser) {
            await window.currentUser.updateProfile({
                displayName: trimmedUsername
            });
        }
        
        // Update header display
        const headerUserName = document.getElementById('header-user-name');
        if (headerUserName) {
            headerUserName.textContent = trimmedUsername;
        }
        
        console.log('Username saved:', trimmedUsername);
    } catch (error) {
        console.error('Error saving username:', error);
        showAlertModal('Error saving username. Please try again.');
        // Restore original value on error
        await loadSettingsData();
    }
}

// Save unique ID (auto-save on blur)
async function saveUniqueId(newUniqueId) {
    if (!window.firebaseDb || !window.currentUser) return;
    
    const trimmedUniqueId = newUniqueId ? newUniqueId.trim() : '';
    const userId = window.currentUser.uid;
    
    try {
        // If empty, don't save
        if (trimmedUniqueId === '') {
            // Restore original value
            await loadSettingsData();
            return;
        }
        
        // Update Firestore user document
        const userDocRef = window.firebaseDb.collection('users').doc(userId);
        await userDocRef.set({
            uniqueId: trimmedUniqueId,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        // Update header display
        const headerUserId = document.getElementById('header-user-id');
        if (headerUserId) {
            headerUserId.textContent = `ID: ${trimmedUniqueId}`;
        }
        
        console.log('Unique ID saved:', trimmedUniqueId);
    } catch (error) {
        console.error('Error saving unique ID:', error);
        showAlertModal('Error saving unique ID. Please try again.');
        // Restore original value on error
        await loadSettingsData();
    }
}

// Show settings modal (for backward compatibility, now shows settings page)
function showSettingsModal() {
    showSettingsPage();
}

function toggleFriendsSidebar() {
    const sidebar = document.getElementById('friends-sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const pageHeader = document.querySelector('.page-header');

    if (sidebar && overlay) {
        const isHidden = sidebar.classList.contains('hidden');
        if (isHidden) {
            sidebar.classList.remove('hidden');
            overlay.classList.remove('hidden');
            // Hide header when sidebar opens
            if (pageHeader) {
                pageHeader.classList.add('hidden');
            }
            loadFriendsList();
            loadFriendRequests();
            loadTrackerAccessRequests();
            loadTrackerJoinRequests();
        } else {
            sidebar.classList.add('hidden');
            overlay.classList.add('hidden');
            // Show header when sidebar closes
            if (pageHeader) {
                pageHeader.classList.remove('hidden');
            }
            // Clean up tracker join requests listener when sidebar is closed
            if (window.trackerJoinRequestsListener) {
                window.trackerJoinRequestsListener();
                window.trackerJoinRequestsListener = null;
            }
            // Clean up friends list listeners when sidebar is closed
            friendsListeners.forEach(unsubscribe => {
                try {
                    unsubscribe();
                } catch (e) {
                    console.error('Error unsubscribing friend listener:', e);
                }
            });
            friendsListeners = [];
            onlineStatusListeners.forEach(unsubscribe => {
                try {
                    unsubscribe();
                } catch (e) {
                    console.error('Error unsubscribing online status listener:', e);
                }
            });
            onlineStatusListeners = [];
            // Clear loading flag and timers
            isLoadingFriendsList = false;
            if (friendsListLoadTimer) {
                clearTimeout(friendsListLoadTimer);
                friendsListLoadTimer = null;
            }
        }
    }
}

// Close friends sidebar (only closes if open)
function closeFriendsSidebar() {
    const sidebar = document.getElementById('friends-sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    if (sidebar && overlay && !sidebar.classList.contains('hidden')) {
        sidebar.classList.add('hidden');
        overlay.classList.add('hidden');
    }
}

// Show friends button when authenticated (deprecated - kept for compatibility)
function showFriendsButton() {
    // Friends button is now in sidebar menu, but keep this for compatibility
    // Show/hide hamburger menu button
    showHamburgerButton();
    
    // Show notifications and new table buttons
    showNotificationsButton();
    showNewTableButton();
}

// Hide friends button when signed out (deprecated - kept for compatibility)
function hideFriendsButton() {
    // Hide hamburger menu button
    hideHamburgerButton();
    
    // Hide notifications and new table buttons
    hideNotificationsButton();
    hideNewTableButton();
}

// Show notifications button when authenticated
function showNotificationsButton() {
    const notificationsBtn = document.getElementById('notifications-btn');
    const authPage = document.getElementById('auth-page');
    
    if (notificationsBtn && window.currentUser && authPage && authPage.classList.contains('hidden')) {
        notificationsBtn.classList.remove('hidden');
        notificationsBtn.style.display = 'flex';
    } else if (notificationsBtn) {
        notificationsBtn.classList.add('hidden');
        notificationsBtn.style.display = 'none';
    }
}

// Hide notifications button when signed out
function hideNotificationsButton() {
    const notificationsBtn = document.getElementById('notifications-btn');
    if (notificationsBtn) {
        notificationsBtn.classList.add('hidden');
        notificationsBtn.style.display = 'none';
    }
}

// Show new table button when authenticated
function showNewTableButton() {
    const newTableBtn = document.getElementById('new-table-btn');
    const authPage = document.getElementById('auth-page');
    
    if (newTableBtn && window.currentUser && authPage && authPage.classList.contains('hidden')) {
        newTableBtn.classList.remove('hidden');
        newTableBtn.style.display = 'flex';
    } else if (newTableBtn) {
        newTableBtn.classList.add('hidden');
        newTableBtn.style.display = 'none';
    }
}

// Hide new table button when signed out
function hideNewTableButton() {
    const newTableBtn = document.getElementById('new-table-btn');
    if (newTableBtn) {
        newTableBtn.classList.add('hidden');
        newTableBtn.style.display = 'none';
    }
}

// Toggle notifications sidebar (shows friends sidebar for now since notifications are there)
function toggleNotificationsSidebar() {
    toggleFriendsSidebar();
}

// Show hamburger menu button when authenticated
function showHamburgerButton() {
    const hamburgerBtn = document.getElementById('hamburger-menu-btn');
    const pageHeader = document.querySelector('.page-header');
    const authPage = document.getElementById('auth-page');
    
    if (hamburgerBtn && pageHeader && window.currentUser && authPage && authPage.classList.contains('hidden')) {
        hamburgerBtn.style.display = 'flex';
        pageHeader.classList.add('authenticated');
    } else if (hamburgerBtn && pageHeader) {
        hamburgerBtn.style.display = 'none';
        pageHeader.classList.remove('authenticated');
    }
}

// Hide hamburger menu button when signed out
function hideHamburgerButton() {
    const hamburgerBtn = document.getElementById('hamburger-menu-btn');
    const pageHeader = document.querySelector('.page-header');
    if (hamburgerBtn) {
        hamburgerBtn.style.display = 'none';
    }
    if (pageHeader) {
        pageHeader.classList.remove('authenticated');
    }
    
    // Close sidebar menu if open
    const sidebar = document.getElementById('sidebar-menu');
    const overlay = document.getElementById('sidebar-overlay-menu');
    if (sidebar) sidebar.classList.add('hidden');
    if (overlay) overlay.classList.add('hidden');
}

// Search for friend by email or name
async function searchFriend() {
    if (!window.firebaseDb || !window.currentUser) {
        alert('Please sign in to search for friends');
        return;
    }
    
    const searchInput = document.getElementById('friend-search-input');
    const searchTerm = searchInput.value.trim();
    const resultsDiv = document.getElementById('friend-search-results');
    
    if (!searchTerm) {
        alert('Please enter an email or name to search');
        return;
    }
    
    // Show loading state
    resultsDiv.innerHTML = '<p style="text-align: center; color: #666; padding: 10px;">Searching...</p>';
    resultsDiv.classList.remove('hidden');
    
    try {
        const searchTermLower = searchTerm.toLowerCase();
        const usersRef = window.firebaseDb.collection('users');
        
        // Try to get user by exact email match first (more efficient)
        let snapshot;
        if (searchTerm.includes('@')) {
            // If it looks like an email, try to find exact match
            try {
                // Note: Firestore doesn't support case-insensitive queries
                // We'll need to get all and filter, or store lowercase emails
                snapshot = await usersRef.get();
            } catch (err) {
                console.error('Error querying users:', err);
                throw err;
            }
        } else {
            snapshot = await usersRef.get();
        }
        
        const results = [];
        snapshot.forEach(doc => {
            const userData = doc.data();
            const userId = doc.id;
            
            // Skip current user
            if (userId === window.currentUser.uid) return;
            
            const email = (userData.email || '').toLowerCase();
            const name = (userData.displayName || userData.name || '').toLowerCase();
            
            // Match if email, name, or unique ID contains search term
            const uniqueId = (userData.uniqueId || '').toLowerCase();
            if (email.includes(searchTermLower) || name.includes(searchTermLower) || uniqueId.includes(searchTermLower)) {
                results.push({
                    id: userId,
                    email: userData.email || '',
                    name: userData.displayName || userData.name || userData.email || 'Unknown',
                    uniqueId: userData.uniqueId || '',
                    ...userData
                });
            }
        });
        
        if (results.length === 0) {
            resultsDiv.innerHTML = '<p style="text-align: center; color: #666; padding: 10px;">No users found matching "' + searchTerm + '"</p>';
            resultsDiv.classList.remove('hidden');
            return;
        }
        
        // Display results
        resultsDiv.innerHTML = results.map(user => `
            <div class="friend-search-result">
                <div class="friend-search-result-info">
                    <div class="friend-search-result-name">${user.name}</div>
                    ${user.uniqueId ? `<div class="friend-search-result-id">ID: ${user.uniqueId}</div>` : ''}
                </div>
                <button class="btn btn-primary btn-sm" onclick="sendFriendRequest('${user.id}', '${user.name.replace(/'/g, "\\'")}')">Add Friend</button>
            </div>
        `).join('');
        
        resultsDiv.classList.remove('hidden');
    } catch (error) {
        console.error('Error searching for friend:', error);
        let errorMessage = 'Error searching for users. ';
        
        // Check for specific error types
        if (error.code === 'permission-denied') {
            errorMessage += 'Permission denied. Please check Firestore security rules allow reading users collection.';
        } else if (error.code === 'unavailable') {
            errorMessage += 'Service unavailable. Please check your internet connection.';
        } else if (error.message) {
            errorMessage += error.message;
        } else {
            errorMessage += 'Please try again.';
        }
        
        resultsDiv.innerHTML = '<p style="text-align: center; color: #dc3545; padding: 10px;">' + errorMessage + '</p>';
        resultsDiv.classList.remove('hidden');
    }
}

// Send friend request
async function sendFriendRequest(friendId, friendName) {
    if (!window.firebaseDb || !window.currentUser) return;
    
    const currentUserId = window.currentUser.uid;
    
    // Check if already friends or request already sent
    try {
        const friendRequestsRef = window.firebaseDb.collection('friendRequests');
        const existingRequest = await friendRequestsRef
            .where('from', '==', currentUserId)
            .where('to', '==', friendId)
            .where('status', '==', 'pending')
            .get();
        
        if (!existingRequest.empty) {
            alert('Friend request already sent to ' + (friendName || 'this user'));
            return;
        }
        
        // Check if reverse request exists
        const reverseRequest = await friendRequestsRef
            .where('from', '==', friendId)
            .where('to', '==', currentUserId)
            .where('status', '==', 'pending')
            .get();
        
        if (!reverseRequest.empty) {
            alert('This user has already sent you a friend request. Check your friend requests.');
            return;
        }
        
        // Check if already friends
        const friendsRef = window.firebaseDb.collection('friends');
        const friendCheck1 = await friendsRef
            .where('user1', '==', currentUserId)
            .where('user2', '==', friendId)
            .get();
        const friendCheck2 = await friendsRef
            .where('user1', '==', friendId)
            .where('user2', '==', currentUserId)
            .get();
        
        if (!friendCheck1.empty || !friendCheck2.empty) {
            alert('You are already friends with ' + (friendName || 'this user'));
            return;
        }
        
        // Create friend request
        await friendRequestsRef.add({
            from: currentUserId,
            to: friendId,
            status: 'pending',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Update notification count for the recipient
        updateFriendRequestNotification(friendId);
        
        alert('Friend request sent to ' + (friendName || 'user') + '!');
        document.getElementById('friend-search-input').value = '';
        document.getElementById('friend-search-results').classList.add('hidden');
    } catch (error) {
        console.error('Error sending friend request:', error);
        alert('Error sending friend request. Please try again.');
    }
}

// Load friend requests
async function loadFriendRequests() {
    if (!window.firebaseDb || !window.currentUser) return;
    
    const currentUserId = window.currentUser.uid;
    const requestsList = document.getElementById('friend-requests-list');
    const requestsSection = document.getElementById('friend-requests-section');
    
    try {
        const friendRequestsRef = window.firebaseDb.collection('friendRequests');
        const snapshot = await friendRequestsRef
            .where('to', '==', currentUserId)
            .where('status', '==', 'pending')
            .get();
        
        if (snapshot.empty) {
            requestsSection.classList.add('hidden');
            return;
        }
        
        requestsSection.classList.remove('hidden');
        
        const requests = [];
        for (const doc of snapshot.docs) {
            const requestData = doc.data();
            const fromUserId = requestData.from;
            
            // Get user info
            const userDoc = await window.firebaseDb.collection('users').doc(fromUserId).get();
            let requestName = 'Unknown';
            let requestEmail = '';
            
            if (userDoc.exists) {
                const userData = userDoc.data();
                requestEmail = userData.email || '';
                // Try multiple fallbacks for name
                requestName = userData.displayName || userData.name || userData.email || fromUserId.substring(0, 8) || 'Unknown';
            } else {
                // User document doesn't exist, use user ID as fallback
                requestName = fromUserId.substring(0, 8) || 'Unknown';
            }
            
            requests.push({
                id: doc.id,
                fromUserId: fromUserId,
                name: requestName,
                email: requestEmail
            });
        }
        
        // Update notification badge
        updateFriendsNotificationBadge(requests.length);
        
        if (requests.length === 0) {
            requestsSection.classList.add('hidden');
            updateFriendsNotificationBadge(0);
            return;
        }
        
        requestsSection.classList.remove('hidden');
        
        requestsList.innerHTML = requests.map(request => `
            <div class="friend-request-item">
                <div class="friend-search-result-info">
                    <div class="friend-search-result-name">${request.name}</div>
                </div>
                <div class="friend-request-actions">
                    <button class="btn-accept" onclick="acceptFriendRequest('${request.id}', '${request.fromUserId}')">Accept</button>
                    <button class="btn-decline" onclick="declineFriendRequest('${request.id}')">Decline</button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading friend requests:', error);
    }
}

// Update friends notification badge
function updateFriendsNotificationBadge(count) {
    // Update both the old friends badge (if it exists) and the new notifications badge
    const friendsBadge = document.getElementById('friends-notification-badge');
    const notificationsBadge = document.getElementById('notifications-badge');
    
    const badges = [friendsBadge, notificationsBadge].filter(Boolean);
    
    badges.forEach(badge => {
        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    });
}

// Check for all notifications (friend requests, join requests, edit requests)
async function checkFriendRequestNotifications() {
    if (!window.firebaseDb || !window.currentUser) return;
    
    try {
        const currentUserId = window.currentUser.uid;
        let totalCount = 0;
        
        // Count friend requests
        const friendRequestsRef = window.firebaseDb.collection('friendRequests');
        const friendRequestsSnapshot = await friendRequestsRef
            .where('to', '==', currentUserId)
            .where('status', '==', 'pending')
            .get();
        totalCount += friendRequestsSnapshot.size;
        
        // Count tracker join requests
        const joinRequestsRef = window.firebaseDb.collection('trackerJoinRequests');
        const joinRequestsSnapshot = await joinRequestsRef
            .where('trackerOwnerId', '==', currentUserId)
            .where('status', '==', 'pending')
            .get();
        totalCount += joinRequestsSnapshot.size;
        
        // Count edit access requests
        const editRequestsRef = window.firebaseDb.collection('trackerEditRequests');
        const editRequestsSnapshot = await editRequestsRef
            .where('trackerOwnerId', '==', currentUserId)
            .where('status', '==', 'pending')
            .get();
        totalCount += editRequestsSnapshot.size;
        
        updateFriendsNotificationBadge(totalCount);
        
        // Set up real-time listener for all notification types
        if (window.friendRequestListener) {
            window.friendRequestListener(); // Unsubscribe old listener
        }
        if (window.joinRequestListener) {
            window.joinRequestListener();
        }
        if (window.editRequestListener) {
            window.editRequestListener();
        }
        
        // Friend requests listener
        window.friendRequestListener = friendRequestsRef
            .where('to', '==', currentUserId)
            .where('status', '==', 'pending')
            .onSnapshot(async () => {
                await updateAllNotifications();
            });
        
        // Join requests listener
        window.joinRequestListener = joinRequestsRef
            .where('trackerOwnerId', '==', currentUserId)
            .where('status', '==', 'pending')
            .onSnapshot(async () => {
                await updateAllNotifications();
            });
        
        // Edit requests listener
        window.editRequestListener = editRequestsRef
            .where('trackerOwnerId', '==', currentUserId)
            .where('status', '==', 'pending')
            .onSnapshot(async () => {
                await updateAllNotifications();
            });
    } catch (error) {
        console.error('Error checking notifications:', error);
    }
}

// Update all notification counts
async function updateAllNotifications() {
    if (!window.firebaseDb || !window.currentUser) return;
    
    try {
        const currentUserId = window.currentUser.uid;
        let totalCount = 0;
        
        // Count friend requests
        const friendRequestsRef = window.firebaseDb.collection('friendRequests');
        const friendRequestsSnapshot = await friendRequestsRef
            .where('to', '==', currentUserId)
            .where('status', '==', 'pending')
            .get();
        totalCount += friendRequestsSnapshot.size;
        
        // Count tracker join requests
        const joinRequestsRef = window.firebaseDb.collection('trackerJoinRequests');
        const joinRequestsSnapshot = await joinRequestsRef
            .where('trackerOwnerId', '==', currentUserId)
            .where('status', '==', 'pending')
            .get();
        totalCount += joinRequestsSnapshot.size;
        
        // Count edit access requests
        const editRequestsRef = window.firebaseDb.collection('trackerEditRequests');
        const editRequestsSnapshot = await editRequestsRef
            .where('trackerOwnerId', '==', currentUserId)
            .where('status', '==', 'pending')
            .get();
        totalCount += editRequestsSnapshot.size;
        
        updateFriendsNotificationBadge(totalCount);
        updateSidebarFriendsBadge();
    } catch (error) {
        console.error('Error updating notifications:', error);
    }
}

// Update notification for recipient when friend request is sent
async function updateFriendRequestNotification(recipientId) {
    // The recipient's listener will automatically update when the request is created
    // This function is here for future use if needed
}

// Accept friend request
async function acceptFriendRequest(requestId, fromUserId) {
    if (!window.firebaseDb || !window.currentUser) return;
    
    const currentUserId = window.currentUser.uid;
    
    try {
        // Add to friends collection
        const friendsRef = window.firebaseDb.collection('friends');
        await friendsRef.add({
            user1: currentUserId,
            user2: fromUserId,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Update request status
        const requestRef = window.firebaseDb.collection('friendRequests').doc(requestId);
        await requestRef.update({ status: 'accepted' });
        
        // Reload friends list and update notifications (debounced)
        setTimeout(() => {
            loadFriendsList();
            loadFriendRequests();
            checkFriendRequestNotifications();
        }, 300);
    } catch (error) {
        console.error('Error accepting friend request:', error);
        alert('Error accepting friend request. Please try again.');
    }
}

// Decline friend request
async function declineFriendRequest(requestId) {
    if (!window.firebaseDb || !window.currentUser) return;
    
    try {
        const requestRef = window.firebaseDb.collection('friendRequests').doc(requestId);
        await requestRef.update({ status: 'declined' });
        
        loadFriendRequests();
        checkFriendRequestNotifications();
    } catch (error) {
        console.error('Error declining friend request:', error);
        alert('Error declining friend request. Please try again.');
    }
}

// Load friends list (with debouncing and concurrent call prevention)
async function loadFriendsList() {
    if (!window.firebaseDb || !window.currentUser) return;
    
    // Clear any pending debounce timer
    if (friendsListLoadTimer) {
        clearTimeout(friendsListLoadTimer);
        friendsListLoadTimer = null;
    }
    
    // If already loading, queue another call after current one finishes
    if (isLoadingFriendsList) {
        friendsListLoadTimer = setTimeout(() => {
            loadFriendsList();
        }, 500);
        return;
    }
    
    // Set loading flag
    isLoadingFriendsList = true;
    
    try {
        // Also check for notifications
        checkFriendRequestNotifications();
        
        const currentUserId = window.currentUser.uid;
        const onlineList = document.getElementById('online-friends-list');
        const offlineList = document.getElementById('offline-friends-list');
        
        if (!onlineList || !offlineList) {
            isLoadingFriendsList = false;
            return;
        }
        
        // Clear existing listeners
        friendsListeners.forEach(unsubscribe => {
            try {
                unsubscribe();
            } catch (e) {
                console.error('Error unsubscribing friend listener:', e);
            }
        });
        friendsListeners = [];
        onlineStatusListeners.forEach(unsubscribe => {
            try {
                unsubscribe();
            } catch (e) {
                console.error('Error unsubscribing online status listener:', e);
            }
        });
        onlineStatusListeners = [];
        
        const friendsRef = window.firebaseDb.collection('friends');
        
        // Get friends where user1 is current user
        const snapshot1 = await friendsRef.where('user1', '==', currentUserId).get();
        const snapshot2 = await friendsRef.where('user2', '==', currentUserId).get();
        
        const friendIds = new Set();
        
        snapshot1.forEach(doc => {
            const data = doc.data();
            friendIds.add(data.user2);
        });
        
        snapshot2.forEach(doc => {
            const data = doc.data();
            friendIds.add(data.user1);
        });
        
        if (friendIds.size === 0) {
            onlineList.innerHTML = '<p class="no-friends">No online friends</p>';
            offlineList.innerHTML = '<p class="no-friends">No offline friends</p>';
            isLoadingFriendsList = false;
            return;
        }
        
        // Get friend user data and online status
        const friends = [];
        for (const friendId of friendIds) {
            const userDoc = await window.firebaseDb.collection('users').doc(friendId).get();
            const onlineStatusDoc = await window.firebaseDb.collection('onlineStatus').doc(friendId).get();
            const isOnline = onlineStatusDoc.exists && onlineStatusDoc.data().isOnline === true;
            
            let friendName = 'Unknown';
            let friendEmail = '';
            
            if (userDoc.exists) {
                const userData = userDoc.data();
                friendEmail = userData.email || '';
                // Try multiple fallbacks for name - check all possible fields
                friendName = userData.displayName || 
                            userData.name || 
                            userData.email?.split('@')[0] || // Use part before @ if email exists
                            friendEmail?.split('@')[0] || 
                            friendId.substring(0, 8) || 
                            'Unknown';
                
                // Debug logging (can be removed later)
                if (friendName === 'Unknown' || friendName === friendId.substring(0, 8)) {
                    console.log('Friend name fallback used for:', friendId, 'UserData:', userData);
                }
            } else {
                // User document doesn't exist, use user ID as fallback
                friendName = friendId.substring(0, 8) || 'Unknown';
                console.log('User document not found for friend:', friendId);
            }
            
            friends.push({
                id: friendId,
                name: friendName,
                email: friendEmail,
                isOnline: isOnline
            });
        }
        
        // Separate online and offline
        const onlineFriends = friends.filter(f => f.isOnline);
        const offlineFriends = friends.filter(f => !f.isOnline);
        
        // Check if current user has active tracker
        const hasActiveTracker = state.people && state.people.length > 0;
        
        // Render online friends
        // Clear existing content first
        onlineList.innerHTML = '';
        if (onlineFriends.length === 0) {
            onlineList.innerHTML = '<p class="no-friends">No online friends</p>';
        } else {
            onlineList.innerHTML = await Promise.all(onlineFriends.map(async (friend) => {
                const hasTracker = await checkFriendHasTracker(friend.id);
                const hasAccess = await checkTrackerAccess(friend.id);
                const hasEditAccess = await checkFriendEditAccess(friend.id);
                
                // If viewing own tracker, show option to grant edit access
                const isOwnTracker = !trackerViewState.isViewingFriendTracker;
                
                return `
                    <div class="friend-item" data-friend-id="${friend.id}">
                        <div class="friend-item-info" onclick="showFriendTrackerOptions('${friend.id}', '${friend.name.replace(/'/g, "\\'")}')">
                            <div class="friend-item-avatar">${friend.name.charAt(0).toUpperCase()}</div>
                            <div class="friend-item-details">
                                <div class="friend-item-name">${friend.name}</div>
                                <div class="friend-item-status online">Online</div>
                            </div>
                        </div>
                        <div class="friend-item-actions" style="display: flex; flex-direction: column; gap: 5px; align-items: flex-end;">
                            ${hasActiveTracker && isOwnTracker && hasTracker ? `
                                ${hasEditAccess ? `
                                    <button class="btn btn-danger btn-sm" onclick="event.stopPropagation(); revokeFriendEditAccess('${friend.id}', '${friend.name.replace(/'/g, "\\'")}')" style="background: #dc3545; color: white; padding: 5px 10px; font-size: 0.85em;">Remove Edit Access</button>
                                ` : `
                                    <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); grantFriendEditAccess('${friend.id}', '${friend.name.replace(/'/g, "\\'")}')">Grant Edit Access</button>
                                `}
                            ` : ''}
                            ${hasTracker ? `
                                ${hasAccess ? `
                                    <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); viewFriendTracker('${friend.id}')">View Tracker</button>
                                ` : `
                                    <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); joinFriendTracker('${friend.id}', '${friend.name.replace(/'/g, "\\'")}')">Join Tracker</button>
                                `}
                            ` : ''}
                        </div>
                    </div>
                `;
            })).then(results => results.join(''));
        }
        
        // Render offline friends
        // Clear existing content first
        offlineList.innerHTML = '';
        if (offlineFriends.length === 0) {
            offlineList.innerHTML = '<p class="no-friends">No offline friends</p>';
        } else {
            offlineList.innerHTML = await Promise.all(offlineFriends.map(async (friend) => {
                const hasTracker = await checkFriendHasTracker(friend.id);
                const hasAccess = await checkTrackerAccess(friend.id);
                const hasEditAccess = await checkFriendEditAccess(friend.id);
                
                // If viewing own tracker, show option to grant edit access
                const isOwnTracker = !trackerViewState.isViewingFriendTracker;
                
                return `
                    <div class="friend-item" data-friend-id="${friend.id}">
                        <div class="friend-item-info" onclick="showFriendTrackerOptions('${friend.id}', '${friend.name.replace(/'/g, "\\'")}')">
                            <div class="friend-item-avatar">${friend.name.charAt(0).toUpperCase()}</div>
                            <div class="friend-item-details">
                                <div class="friend-item-name">${friend.name}</div>
                                <div class="friend-item-status offline">Offline</div>
                            </div>
                        </div>
                        <div class="friend-item-actions" style="display: flex; flex-direction: column; gap: 5px; align-items: flex-end;">
                            ${hasActiveTracker && isOwnTracker && hasTracker ? `
                                ${hasEditAccess ? `
                                    <button class="btn btn-danger btn-sm" onclick="event.stopPropagation(); revokeFriendEditAccess('${friend.id}', '${friend.name.replace(/'/g, "\\'")}')" style="background: #dc3545; color: white; padding: 5px 10px; font-size: 0.85em;">Remove Edit Access</button>
                                ` : `
                                    <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); grantFriendEditAccess('${friend.id}', '${friend.name.replace(/'/g, "\\'")}')">Grant Edit Access</button>
                                `}
                            ` : ''}
                            ${hasTracker ? `
                                ${hasAccess ? `
                                    <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); viewFriendTracker('${friend.id}')">View Tracker</button>
                                ` : `
                                    <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); joinFriendTracker('${friend.id}', '${friend.name.replace(/'/g, "\\'")}')">Join Tracker</button>
                                `}
                            ` : ''}
                        </div>
                    </div>
                `;
            })).then(results => results.join(''));
        }
        
        // Set up real-time listeners for online status
        friendIds.forEach(friendId => {
            const statusRef = window.firebaseDb.collection('onlineStatus').doc(friendId);
            const unsubscribe = statusRef.onSnapshot((doc) => {
                if (doc.exists) {
                    const isOnline = doc.data().isOnline === true;
                    updateFriendOnlineStatus(friendId, isOnline);
                }
            });
            onlineStatusListeners.push(unsubscribe);
        });
    } catch (error) {
        console.error('Error loading friends:', error);
    } finally {
        // Always clear loading flag
        isLoadingFriendsList = false;
        
        // If there's a queued call, execute it
        if (friendsListLoadTimer) {
            const timer = friendsListLoadTimer;
            friendsListLoadTimer = null;
            setTimeout(() => {
                loadFriendsList();
            }, 100);
        }
    }
}

// Debounce timer for friend status updates
let friendStatusUpdateTimer = null;

// Update friend online status in UI
function updateFriendOnlineStatus(friendId, isOnline) {
    // Debounce updates to prevent flickering
    if (friendStatusUpdateTimer) {
        clearTimeout(friendStatusUpdateTimer);
    }
    
    friendStatusUpdateTimer = setTimeout(() => {
        const onlineList = document.getElementById('online-friends-list');
        const offlineList = document.getElementById('offline-friends-list');
        
        if (!onlineList || !offlineList) return;
        
        // Find and move friend between lists
        const allItems = [...onlineList.querySelectorAll('.friend-item'), ...offlineList.querySelectorAll('.friend-item')];
        const friendItem = allItems.find(item => item.dataset.friendId === friendId);
        
        if (friendItem) {
            // Update status indicator in place
            const statusElement = friendItem.querySelector('.friend-item-status');
            if (statusElement) {
                statusElement.textContent = isOnline ? 'Online' : 'Offline';
                statusElement.className = `friend-item-status ${isOnline ? 'online' : 'offline'}`;
                
                // Move item to correct list if needed
                const currentList = friendItem.parentElement;
                const targetList = isOnline ? onlineList : offlineList;
                
                if (currentList !== targetList) {
                    friendItem.remove();
                    targetList.appendChild(friendItem);
                    
                    // Update empty state messages
                    if (onlineList.children.length === 0 || (onlineList.children.length === 1 && onlineList.children[0].tagName === 'P')) {
                        onlineList.innerHTML = '<p class="no-friends">No online friends</p>';
                    }
                    if (offlineList.children.length === 0 || (offlineList.children.length === 1 && offlineList.children[0].tagName === 'P')) {
                        offlineList.innerHTML = '<p class="no-friends">No offline friends</p>';
                    }
                    
                    // Remove "no friends" message if list now has items
                    const onlineNoFriends = onlineList.querySelector('.no-friends');
                    const offlineNoFriends = offlineList.querySelector('.no-friends');
                    if (onlineNoFriends && onlineList.querySelector('.friend-item')) {
                        onlineNoFriends.remove();
                    }
                    if (offlineNoFriends && offlineList.querySelector('.friend-item')) {
                        offlineNoFriends.remove();
                    }
                }
            }
        } else {
            // If item not found, reload the list (shouldn't happen often) - debounced
            setTimeout(() => {
                loadFriendsList();
            }, 500);
        }
        
        friendStatusUpdateTimer = null;
    }, 500); // 500ms debounce
}

// Copy invite link
function copyInviteLink() {
    const inviteLinkText = document.getElementById('invite-link-text');
    const linkText = inviteLinkText ? inviteLinkText.textContent : 'https://poker-tracking-dashboard.vercel.app/';
    
    try {
        // Modern clipboard API
        navigator.clipboard.writeText(linkText).then(() => {
            alert('Invite link copied to clipboard!');
        }).catch(() => {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = linkText;
            textArea.style.position = 'fixed';
            textArea.style.opacity = '0';
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            alert('Invite link copied to clipboard!');
        });
    } catch (err) {
        alert('Failed to copy link. Please copy manually: ' + linkText);
    }
}

// Update online status when user signs in
async function updateOnlineStatus(isOnline) {
    if (!window.firebaseDb || !window.currentUser) return;
    
    try {
        const statusRef = window.firebaseDb.collection('onlineStatus').doc(window.currentUser.uid);
        await statusRef.set({
            isOnline: isOnline,
            lastSeen: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    } catch (error) {
        console.error('Error updating online status:', error);
    }
}

// Check if friend has an active tracker
async function checkFriendHasTracker(friendId) {
    if (!window.firebaseDb) return false;
    try {
        const userDoc = await window.firebaseDb.collection('users').doc(friendId).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            // Only check trackers array (new format) - ignore old state field
            const trackers = userData.trackers || [];
            const activeTracker = trackers.find(t => t.state && t.state.people && Array.isArray(t.state.people) && t.state.people.length > 0);
            return !!activeTracker;
        }
    } catch (error) {
        console.error('Error checking friend tracker:', error);
    }
    return false;
}

// Check if user has access to friend's tracker
async function checkTrackerAccess(friendId) {
    if (!window.firebaseDb || !window.currentUser) return false;
    try {
        const currentUserId = window.currentUser.uid;
        const accessRef = window.firebaseDb.collection('trackerAccess');
        const snapshot = await accessRef
            .where('trackerOwnerId', '==', friendId)
            .where('userId', '==', currentUserId)
            .where('status', '==', 'active')
            .get();
        return !snapshot.empty;
    } catch (error) {
        console.error('Error checking tracker access:', error);
    }
    return false;
}

// Check if friend has edit access to current user's tracker
async function checkFriendEditAccess(friendId) {
    if (!window.firebaseDb || !window.currentUser) return false;
    try {
        const currentUserId = window.currentUser.uid;
        const accessRef = window.firebaseDb.collection('trackerAccess');
        const snapshot = await accessRef
            .where('trackerOwnerId', '==', currentUserId)
            .where('userId', '==', friendId)
            .where('status', '==', 'active')
            .where('hasEditAccess', '==', true)
            .get();
        return !snapshot.empty;
    } catch (error) {
        console.error('Error checking friend edit access:', error);
    }
    return false;
}

// Grant friend edit access to current user's tracker
async function grantFriendEditAccess(friendId, friendName) {
    if (!window.firebaseDb || !window.currentUser) return;
    
    const currentUserId = window.currentUser.uid;
    
    try {
        // Check if access already exists
        const accessRef = window.firebaseDb.collection('trackerAccess');
        const accessSnapshot = await accessRef
            .where('trackerOwnerId', '==', currentUserId)
            .where('userId', '==', friendId)
            .where('status', '==', 'active')
            .get();
        
        if (!accessSnapshot.empty) {
            // Update existing access
            const accessDoc = accessSnapshot.docs[0];
            await accessDoc.ref.update({
                hasEditAccess: true
            });
        } else {
            // Create new access with edit permissions
            await accessRef.add({
                trackerOwnerId: currentUserId,
                userId: friendId,
                status: 'active',
                hasEditAccess: true,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        
        // Update any pending requests
        const requestsRef = window.firebaseDb.collection('trackerEditRequests');
        const requestSnapshot = await requestsRef
            .where('trackerOwnerId', '==', currentUserId)
            .where('requesterId', '==', friendId)
            .where('status', '==', 'pending')
            .get();
        
        for (const doc of requestSnapshot.docs) {
            await doc.ref.update({ status: 'granted' });
        }
        
        alert('Edit access granted to ' + friendName + '!');
        
        // Reload friends list (debounced)
        setTimeout(() => {
            loadFriendsList();
            loadTrackerAccessRequests();
        }, 300);
    } catch (error) {
        console.error('Error granting friend edit access:', error);
        alert('Error granting access. Please try again.');
    }
}

// Revoke friend edit access to current user's tracker
async function revokeFriendEditAccess(friendId, friendName) {
    if (!window.firebaseDb || !window.currentUser) return;
    
    if (!confirm('Are you sure you want to remove edit access from ' + friendName + '? They will still be able to view your tracker in read-only mode.')) {
        return;
    }
    
    const currentUserId = window.currentUser.uid;
    
    try {
        // Find and update the access record to remove edit access
        const accessRef = window.firebaseDb.collection('trackerAccess');
        const accessSnapshot = await accessRef
            .where('trackerOwnerId', '==', currentUserId)
            .where('userId', '==', friendId)
            .where('status', '==', 'active')
            .get();
        
        if (!accessSnapshot.empty) {
            // Update existing access to remove edit permissions (set hasEditAccess to false)
            const accessDoc = accessSnapshot.docs[0];
            await accessDoc.ref.update({
                hasEditAccess: false
            });
            
            alert('Edit access removed from ' + friendName + '. They can still view your tracker in read-only mode.');
        } else {
            alert('No access record found.');
        }
        
        // Reload friends list (debounced)
        setTimeout(() => {
            loadFriendsList();
        }, 300);
    } catch (error) {
        console.error('Error revoking friend edit access:', error);
        alert('Error removing edit access. Please try again.');
    }
}

// Show friend tracker options modal
function showFriendTrackerOptions(friendId, friendName) {
    // This can be expanded to show more options
    // For now, clicking on friend info just selects them
}

// Join friend's tracker (read-only access)
async function joinFriendTracker(friendId, friendName) {
    if (!window.firebaseDb || !window.currentUser) return;
    
    const currentUserId = window.currentUser.uid;
    
    try {
        // If currently viewing own tracker, save it first
        if (!trackerViewState.isViewingFriendTracker && state.people && state.people.length > 0) {
            // Save current tracker state to Firestore
            await saveState();
            // Also store in memory for quick restoration
            trackerViewState.ownTrackerState = JSON.parse(JSON.stringify(state));
        }
        
        // Check if access already exists
        const existingAccess = await checkTrackerAccess(friendId);
        if (existingAccess) {
            await viewFriendTracker(friendId);
            return;
        }
        
        // Create read-only access
        const accessRef = window.firebaseDb.collection('trackerAccess');
        await accessRef.add({
            trackerOwnerId: friendId,
            userId: currentUserId,
            status: 'active',
            hasEditAccess: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Load friend's tracker
        await viewFriendTracker(friendId);
    } catch (error) {
        console.error('Error joining friend tracker:', error);
        alert('Error joining tracker. Please try again.');
    }
}

// View friend's tracker
async function viewFriendTracker(friendId) {
    if (!window.firebaseDb) return;
    
    try {
        // If currently viewing own tracker, save it first
        if (!trackerViewState.isViewingFriendTracker && state.people && state.people.length > 0) {
            // Save current tracker state to Firestore
            await saveState();
            // Also store in memory for quick restoration
            trackerViewState.ownTrackerState = JSON.parse(JSON.stringify(state));
        }
        
        // Check access, create read-only access if doesn't exist (for viewing)
        let hasAccess = await checkTrackerAccess(friendId);
        if (!hasAccess) {
            // Create read-only access automatically for viewing
            const accessRef = window.firebaseDb.collection('trackerAccess');
            await accessRef.add({
                trackerOwnerId: friendId,
                userId: window.currentUser.uid,
                status: 'active',
                hasEditAccess: false,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            hasAccess = true;
        }
        
        // Load friend's tracker data
        const userDoc = await window.firebaseDb.collection('users').doc(friendId).get();
        if (!userDoc.exists) {
            showAlertModal('Friend does not have an active tracker.');
            return;
        }
        
        const userData = userDoc.data();
        let friendState = null;
        
        // Check for trackers array first (new multi-tracker system)
        if (userData.trackers && userData.trackers.length > 0) {
            // Load the most recently updated tracker
            const sortedTrackers = userData.trackers.sort((a, b) => {
                const dateA = new Date(a.updatedAt || 0);
                const dateB = new Date(b.updatedAt || 0);
                return dateB - dateA;
            });
            friendState = sortedTrackers[0].state;
        } else if (userData.state) {
            // Fallback to old single-tracker system
            friendState = userData.state;
        }
        
        if (!friendState) {
            showAlertModal('Friend does not have an active tracker.');
            return;
        }
        
        // Check if user has edit access
        const accessRef = window.firebaseDb.collection('trackerAccess');
        const accessSnapshot = await accessRef
            .where('trackerOwnerId', '==', friendId)
            .where('userId', '==', window.currentUser.uid)
            .where('status', '==', 'active')
            .get();
        
        let hasEditAccess = false;
        if (!accessSnapshot.empty) {
            hasEditAccess = accessSnapshot.docs[0].data().hasEditAccess === true;
        }
        
        // Set viewing state
        trackerViewState.isViewingFriendTracker = true;
        trackerViewState.viewingTrackerOwnerId = friendId;
        trackerViewState.hasEditAccess = hasEditAccess;
        trackerViewState.isOwner = false;
        
        // Save viewing state to localStorage for page reload
        saveViewingState();
        
        // Restore friend's state
        restoreState(friendState);
        
        // Get tracker ID if available
        let trackerId = null;
        if (userData.trackers && userData.trackers.length > 0) {
            const sortedTrackers = userData.trackers.sort((a, b) => {
                const dateA = new Date(a.updatedAt || 0);
                const dateB = new Date(b.updatedAt || 0);
                return dateB - dateA;
            });
            trackerId = sortedTrackers[0].id;
            state.trackerId = trackerId;
            state.trackerName = sortedTrackers[0].name;
        }
        
        // Set up real-time listener for friend's tracker
        if (trackerId) {
            setupFriendTrackerRealtimeListener(friendId, trackerId);
        }
        
        // Hide main screen and setup, show tracking section
        const mainScreen = document.getElementById('main-screen');
        const setupSection = document.getElementById('setup-section');
        const trackingSection = document.getElementById('tracking-section');
        const settingsPage = document.getElementById('settings-page');
        const analyticsPage = document.getElementById('analytics-page');
        // Hide all other pages with inline styles
        if (mainScreen) {
            mainScreen.classList.add('hidden');
            mainScreen.style.display = 'none';
        }
        if (setupSection) {
            setupSection.classList.add('hidden');
            setupSection.style.display = 'none';
        }
        if (settingsPage) {
            settingsPage.classList.add('hidden');
            settingsPage.style.display = 'none';
        }
        if (analyticsPage) {
            analyticsPage.classList.add('hidden');
            analyticsPage.style.display = 'none';
        }
        if (trackingSection) {
            trackingSection.classList.remove('hidden');
            trackingSection.style.display = '';
        }
        
        // Update UI for read-only mode
        updateUIForViewingMode(hasEditAccess);

        // Close friends sidebar if open
        closeFriendsSidebar();

        // Show banner indicating viewing mode
        showViewingModeBanner(friendId, hasEditAccess);
    } catch (error) {
        console.error('Error viewing friend tracker:', error);
        alert('Error loading friend tracker. Please try again.');
    }
}

// Request editing access
async function requestEditingAccess(friendId, friendName) {
    if (!window.firebaseDb || !window.currentUser) return;
    
    const currentUserId = window.currentUser.uid;
    
    try {
        // Check if request already exists
        const requestsRef = window.firebaseDb.collection('trackerEditRequests');
        const existingRequest = await requestsRef
            .where('trackerOwnerId', '==', friendId)
            .where('requesterId', '==', currentUserId)
            .where('status', '==', 'pending')
            .get();
        
        if (!existingRequest.empty) {
            alert('You have already requested editing access.');
            return;
        }
        
        // Create edit access request
        await requestsRef.add({
            trackerOwnerId: friendId,
            requesterId: currentUserId,
            status: 'pending',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        alert('Edit access request sent to ' + friendName + '!');
        
        // Reload tracker access requests
        loadTrackerAccessRequests();
    } catch (error) {
        console.error('Error requesting editing access:', error);
        alert('Error sending request. Please try again.');
    }
}

// Load tracker access requests
async function loadTrackerAccessRequests() {
    if (!window.firebaseDb || !window.currentUser) return;
    
    const currentUserId = window.currentUser.uid;
    const requestsSection = document.getElementById('tracker-access-requests-section');
    const requestsList = document.getElementById('tracker-access-requests-list');
    
    try {
        // Get requests where current user is the tracker owner
        const requestsRef = window.firebaseDb.collection('trackerEditRequests');
        const snapshot = await requestsRef
            .where('trackerOwnerId', '==', currentUserId)
            .where('status', '==', 'pending')
            .get();
        
        if (snapshot.empty) {
            requestsSection.classList.add('hidden');
            return;
        }
        
        requestsSection.classList.remove('hidden');
        
        const requests = [];
        for (const doc of snapshot.docs) {
            const requestData = doc.data();
            const requesterId = requestData.requesterId;
            
            // Get requester info
            const userDoc = await window.firebaseDb.collection('users').doc(requesterId).get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                requests.push({
                    id: doc.id,
                    requesterId: requesterId,
                    name: userData.displayName || userData.name || userData.email || 'Unknown',
                    email: userData.email || ''
                });
            }
        }
        
        if (requests.length === 0) {
            requestsSection.classList.add('hidden');
            return;
        }
        
        requestsList.innerHTML = requests.map(request => `
            <div class="friend-request-item">
                <div class="friend-search-result-info">
                    <div class="friend-search-result-name">${request.name}</div>
                    <div style="font-size: 0.85em; color: #666;">wants edit access to your tracker</div>
                </div>
                <div class="friend-request-actions">
                    <button class="btn-accept" onclick="grantEditingAccess('${request.id}', '${request.requesterId}')">Grant</button>
                    <button class="btn-decline" onclick="declineEditingAccess('${request.id}')">Decline</button>
                </div>
            </div>
        `).join('');
        
        // Update notifications
        if (window.updateAllNotifications) {
            updateAllNotifications();
        }
    } catch (error) {
        console.error('Error loading tracker access requests:', error);
    }
}

// Grant editing access
async function grantEditingAccess(requestId, requesterId) {
    if (!window.firebaseDb || !window.currentUser) return;
    
    const currentUserId = window.currentUser.uid;
    
    try {
        // Update the access record to grant edit access
        const accessRef = window.firebaseDb.collection('trackerAccess');
        const accessSnapshot = await accessRef
            .where('trackerOwnerId', '==', currentUserId)
            .where('userId', '==', requesterId)
            .where('status', '==', 'active')
            .get();
        
        if (!accessSnapshot.empty) {
            // Update existing access
            const accessDoc = accessSnapshot.docs[0];
            await accessDoc.ref.update({
                hasEditAccess: true
            });
        } else {
            // Create new access with edit permissions
            await accessRef.add({
                trackerOwnerId: currentUserId,
                userId: requesterId,
                status: 'active',
                hasEditAccess: true,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        
        // Update request status
        const requestRef = window.firebaseDb.collection('trackerEditRequests').doc(requestId);
        await requestRef.update({ status: 'granted' });
        
        // Reload requests
        loadTrackerAccessRequests();
        
        // Update notifications
        if (window.updateAllNotifications) {
            await window.updateAllNotifications();
        }
        
        alert('Edit access granted!');
    } catch (error) {
        console.error('Error granting editing access:', error);
        alert('Error granting access. Please try again.');
    }
}

// Decline editing access request
async function declineEditingAccess(requestId) {
    if (!window.firebaseDb) return;
    
    try {
        const requestRef = window.firebaseDb.collection('trackerEditRequests').doc(requestId);
        await requestRef.update({ status: 'declined' });
        
        loadTrackerAccessRequests();
        
        // Update notifications
        if (window.updateAllNotifications) {
            await window.updateAllNotifications();
        }
    } catch (error) {
        console.error('Error declining editing access request:', error);
        alert('Error declining request. Please try again.');
    }
}

// Load tracker join requests (requests to join tracker as a person) - with real-time listener
function loadTrackerJoinRequests() {
    if (!window.firebaseDb || !window.currentUser) return;
    
    const currentUserId = window.currentUser.uid;
    const requestsSection = document.getElementById('tracker-join-requests-section');
    const requestsList = document.getElementById('tracker-join-requests-list');
    
    if (!requestsSection || !requestsList) return;
    
    // Clean up existing listener if any
    if (window.trackerJoinRequestsListener) {
        window.trackerJoinRequestsListener();
        window.trackerJoinRequestsListener = null;
    }
    
    try {
        // Set up real-time listener for requests where current user is the tracker owner
        const requestsRef = window.firebaseDb.collection('trackerJoinRequests');
        window.trackerJoinRequestsListener = requestsRef
            .where('trackerOwnerId', '==', currentUserId)
            .where('status', '==', 'pending')
            .onSnapshot(async (snapshot) => {
                if (snapshot.empty) {
                    requestsSection.classList.add('hidden');
                    requestsList.innerHTML = '';
                    return;
                }
                
                requestsSection.classList.remove('hidden');
                
                const requests = [];
                for (const doc of snapshot.docs) {
                    const requestData = doc.data();
                    const requesterId = requestData.requesterId;
                    
                    // Get requester info
                    try {
                        const userDoc = await window.firebaseDb.collection('users').doc(requesterId).get();
                        if (userDoc.exists) {
                            const userData = userDoc.data();
                            requests.push({
                                id: doc.id,
                                requesterId: requesterId,
                                name: userData.displayName || userData.name || userData.email || 'Unknown',
                                email: userData.email || '',
                                moneyAmount: requestData.moneyAmount || 0
                            });
                        }
                    } catch (userError) {
                        console.error('Error fetching user data for requester:', requesterId, userError);
                        // Still add request with limited info
                        requests.push({
                            id: doc.id,
                            requesterId: requesterId,
                            name: 'Unknown User',
                            email: '',
                            moneyAmount: requestData.moneyAmount || 0
                        });
                    }
                }
                
                if (requests.length === 0) {
                    requestsSection.classList.add('hidden');
                    requestsList.innerHTML = '';
                    return;
                }
                
                requestsList.innerHTML = requests.map(request => `
                    <div class="friend-request-item">
                        <div class="friend-search-result-info">
                            <div class="friend-search-result-name">${request.name}</div>
                            <div style="font-size: 0.85em; color: #666;">wants to join your tracker with $${request.moneyAmount.toFixed(2)}</div>
                        </div>
                        <div class="friend-request-actions">
                            <button class="btn-accept" onclick="approveJoinRequest('${request.id}', '${request.requesterId}', ${request.moneyAmount}, '${request.name.replace(/'/g, "\\'")}')">Approve</button>
                            <button class="btn-decline" onclick="declineJoinRequest('${request.id}')">Decline</button>
                        </div>
                    </div>
                `).join('');
                
                // Update notifications when requests change
                if (window.updateAllNotifications) {
                    updateAllNotifications();
                }
            }, (error) => {
                console.error('Error in tracker join requests listener:', error);
            });
    } catch (error) {
        console.error('Error setting up tracker join requests listener:', error);
    }
}

// Approve join request (add requester as a person to tracker)
async function approveJoinRequest(requestId, requesterId, moneyAmount, requesterName) {
    if (!window.firebaseDb || !window.currentUser) return;
    
    const currentUserId = window.currentUser.uid;
    
    try {
        // Load user document
        const userDoc = await window.firebaseDb.collection('users').doc(currentUserId).get();
        if (!userDoc.exists) {
            showAlertModal('Tracker not found.');
            return;
        }
        
        const userData = userDoc.data();
        let trackers = userData.trackers || [];
        
        // Determine which tracker to update
        // If we have a current tracker ID, use that; otherwise use the most recent tracker
        let targetTrackerId = state.trackerId;
        if (!targetTrackerId && trackers.length > 0) {
            // Sort by updatedAt and get the most recent
            const sortedTrackers = [...trackers].sort((a, b) => {
                const aTime = new Date(a.updatedAt || 0).getTime();
                const bTime = new Date(b.updatedAt || 0).getTime();
                return bTime - aTime;
            });
            targetTrackerId = sortedTrackers[0].id;
        }
        
        if (!targetTrackerId) {
            showAlertModal('No active tracker found. Please create or open a tracker first.');
            return;
        }
        
        // Find the tracker to update
        const trackerIndex = trackers.findIndex(t => t.id === targetTrackerId);
        if (trackerIndex === -1) {
            showAlertModal('Tracker not found.');
            return;
        }
        
        const tracker = trackers[trackerIndex];
        const trackerState = tracker.state;
        
        // Find the next available person ID
        const maxId = trackerState.people && trackerState.people.length > 0
            ? Math.max(...trackerState.people.map(p => p.id))
            : -1;
        const newPersonId = maxId + 1;
        
        // Calculate chips based on tracker configuration
        let chips = 0;
        if (trackerState.sameValue && trackerState.chipValue > 0) {
            chips = Math.round(moneyAmount / trackerState.chipValue);
        } else if (trackerState.sameValue && trackerState.chipsPerStack > 0 && trackerState.stackValue > 0) {
            chips = Math.round((moneyAmount / trackerState.stackValue) * trackerState.chipsPerStack);
        } else if (!trackerState.sameValue) {
            // Calculate chips for different chip values
            const chipValues = trackerState.chipValues || {};
            const chipCounts = trackerState.chipCounts || {};
            let totalChips = 0;
            let stackValue = 0;
            
            // Calculate stack value
            Object.keys(chipValues).forEach(color => {
                const value = chipValues[color] || 0;
                const count = chipCounts[color] || 0;
                stackValue += value * count;
            });
            
            if (stackValue > 0) {
                totalChips = Math.round((moneyAmount / stackValue) * Object.values(chipCounts).reduce((sum, count) => sum + (count || 0), 0));
            }
            chips = totalChips;
        }
        
        // Initialize arrays if they don't exist
        if (!trackerState.people) {
            trackerState.people = [];
        }
        if (!trackerState.transactions) {
            trackerState.transactions = [];
        }
        
        // Add new person to tracker
        const newPerson = {
            id: newPersonId,
            name: requesterName,
            moneyPutIn: moneyAmount,
            moneyReturned: 0,
            totalMoney: moneyAmount,
            chips: chips
        };
        
        trackerState.people.push(newPerson);
        
        // Add transaction for the new person (always initial for new person)
        trackerState.transactions.push({
            id: Date.now(),
            personId: newPersonId,
            personName: requesterName,
            amount: moneyAmount,
            type: 'add',
            transactionType: 'initial',
            timestamp: new Date().toISOString()
        });
        
        // Update the tracker in the array
        const stateToSave = prepareStateForFirestore(trackerState);
        trackers[trackerIndex] = {
            ...tracker,
            state: stateToSave,
            updatedAt: new Date().toISOString()
        };
        
        // Save updated trackers array
        await window.firebaseDb.collection('users').doc(currentUserId).set({
            trackers: trackers,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        // Also update state if this is the current tracker
        if (state.trackerId === targetTrackerId) {
            restoreState(trackerState);
            renderPeopleWidgets();
            updateTotalPot();
            updateTotalChips();
            renderLog();
        }
        
        // Update request status
        const requestRef = window.firebaseDb.collection('trackerJoinRequests').doc(requestId);
        await requestRef.update({ status: 'approved' });
        
        // Update notifications
        if (window.updateAllNotifications) {
            await window.updateAllNotifications();
        }
        
        showAlertModal(requesterName + ' has been added to your tracker with $' + moneyAmount.toFixed(2) + '!');
    } catch (error) {
        console.error('Error approving join request:', error);
        showAlertModal('Error approving join request. Please try again.');
    }
}

// Decline join request
async function declineJoinRequest(requestId) {
    if (!window.firebaseDb) return;
    
    try {
        const requestRef = window.firebaseDb.collection('trackerJoinRequests').doc(requestId);
        await requestRef.update({ status: 'declined' });
        
        // Update notifications
        if (window.updateAllNotifications) {
            await window.updateAllNotifications();
        }
        
        // Requests will automatically update via the real-time listener
    } catch (error) {
        console.error('Error declining join request:', error);
        alert('Error declining request. Please try again.');
    }
}

// Return to own tracker
async function returnToOwnTracker() {
    if (!window.firebaseDb || !window.currentUser) return;

    try {
        // If we have saved state, restore it (faster)
        if (trackerViewState.ownTrackerState) {
            restoreState(trackerViewState.ownTrackerState);
            trackerViewState.ownTrackerState = null;
        } else {
            // Otherwise load from Firestore
            await loadUserData(window.currentUser.uid);
        }

        // Reset viewing state
        trackerViewState.isViewingFriendTracker = false;
        trackerViewState.viewingTrackerOwnerId = null;
        trackerViewState.hasEditAccess = false;
        trackerViewState.isOwner = true;
        
        // Save viewing state (now viewing own tracker)
        saveViewingState();

        // Update UI for owner mode
        updateUIForViewingMode(true);

        // Hide viewing mode banner
        hideViewingModeBanner();
    } catch (error) {
        console.error('Error returning to own tracker:', error);
    }
}

// Update UI for viewing mode (read-only vs editable)
function updateUIForViewingMode(hasEditAccess) {
    const canEdit = trackerViewState.isOwner || hasEditAccess;
    const isViewingFriendTracker = trackerViewState.isViewingFriendTracker;
    
    // Disable/enable all action buttons
    document.querySelectorAll('.btn-add, .btn-remove, .btn-add-person, .btn-settlement').forEach(btn => {
        if (canEdit) {
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
        } else {
            btn.disabled = true;
            btn.style.opacity = '0.5';
            btn.style.cursor = 'not-allowed';
        }
    });
    
    // Disable delete table button if viewing friend's tracker (even with edit access)
    const resetBtn = document.getElementById('reset-btn');
    if (resetBtn) {
        if (isViewingFriendTracker) {
            resetBtn.disabled = true;
            resetBtn.style.opacity = '0.5';
            resetBtn.style.cursor = 'not-allowed';
        } else {
            resetBtn.disabled = false;
            resetBtn.style.opacity = '1';
            resetBtn.style.cursor = 'pointer';
        }
    }
    
    // Disable/enable name input fields in person widgets
    document.querySelectorAll('.widget-name-input').forEach(input => {
        if (canEdit) {
            input.disabled = false;
            input.style.opacity = '1';
            input.style.cursor = 'text';
            input.style.backgroundColor = 'white';
        } else {
            input.disabled = true;
            input.style.opacity = '0.7';
            input.style.cursor = 'not-allowed';
            input.style.backgroundColor = '#f8f9fa';
        }
    });
    
    // Disable/enable forms
    document.querySelectorAll('#setup-section input, #setup-section button, .widget-form input, .widget-form button').forEach(element => {
        if (canEdit) {
            element.disabled = false;
        } else {
            element.disabled = true;
        }
    });
}

// Show viewing mode banner
async function showViewingModeBanner(trackerOwnerId, hasEditAccess) {
    // Remove existing banner if any
    hideViewingModeBanner();
    
    // Get friend's name
    let friendName = 'Friend';
    try {
        const userDoc = await window.firebaseDb.collection('users').doc(trackerOwnerId).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            friendName = userData.displayName || userData.name || userData.email || 'Friend';
        }
    } catch (error) {
        console.error('Error getting friend name:', error);
    }
    
    const banner = document.createElement('div');
    banner.id = 'viewing-mode-banner';
    banner.style.cssText = `
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 15px 20px;
        text-align: center;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 20px;
        flex-wrap: wrap;
        margin-bottom: 20px;
    `;
    
    const message = hasEditAccess 
        ? `You are viewing ${friendName}'s tracker with editing access`
        : `You are viewing ${friendName}'s tracker (read-only)`;
    
    banner.innerHTML = `
        <span style="font-weight: 600;">${message}</span>
        ${!hasEditAccess ? `<button onclick="requestEditingAccess('${trackerOwnerId}', '${friendName.replace(/'/g, "\\'")}')" style="background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3); color: white; padding: 5px 15px; border-radius: 5px; cursor: pointer; font-weight: 600;">Request Edit Access</button>` : ''}
        <button onclick="returnToOwnTracker()" style="background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3); color: white; padding: 5px 15px; border-radius: 5px; cursor: pointer; font-weight: 600;">Return to My Tracker</button>
    `;
    
    // Insert banner at the beginning of the container instead of body
    const container = document.querySelector('.container');
    if (container) {
        container.insertBefore(banner, container.firstChild);
    } else {
        document.body.insertBefore(banner, document.body.firstChild);
    }
}

// Hide viewing mode banner
function hideViewingModeBanner() {
    const banner = document.getElementById('viewing-mode-banner');
    if (banner) {
        banner.remove();
    }
}

// Load user's own trackers
async function loadUserTrackers() {
    if (!window.firebaseDb || !window.currentUser) return;
    
    const yourTablesContainer = document.getElementById('your-tables-container');
    const emptyState = document.getElementById('your-tables-empty');
    if (!yourTablesContainer) return;
    
    const currentUserId = window.currentUser.uid;
    
    try {
        const docRef = window.firebaseDb.collection('users').doc(currentUserId);
        const doc = await docRef.get();
        
        if (!doc.exists || !doc.data().trackers || doc.data().trackers.length === 0) {
            yourTablesContainer.innerHTML = '';
            if (emptyState) emptyState.classList.remove('hidden');
            userTrackers = [];
            updateStats();
            return;
        }
        
        const trackers = doc.data().trackers;
        userTrackers = trackers;
        
        if (trackers.length === 0) {
            yourTablesContainer.innerHTML = '';
            if (emptyState) emptyState.classList.remove('hidden');
            updateStats();
            return;
        }
        
        // Hide empty state
        if (emptyState) emptyState.classList.add('hidden');
        
        // Render user's trackers with new card structure
        yourTablesContainer.innerHTML = trackers.map(tracker => {
            const trackerState = tracker.state || {};
            const peopleCount = trackerState.people ? trackerState.people.length : 0;
            const trackerName = tracker.name || 'Untitled Table';
            
            // Escape the tracker name to prevent XSS
            const escapedName = trackerName.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
            return `
                <div class="table-card">
                    <div class="table-image-wrapper">
                        <img src="assets/image-c90fcce1-ebd6-43e7-94b7-f3eb6415cdae.png" alt="Poker Table" class="table-image" onerror="this.style.display='none'">
                    </div>
                    <div class="table-info">
                        <div class="table-header">
                            <input type="text" class="table-name-input-main table-name" value="${escapedName}" data-tracker-id="${tracker.id}" onblur="updateTrackerNameMain('${tracker.id}', this.value)" onkeypress="if(event.key === 'Enter') { this.blur(); }">
                        </div>
                        <div class="table-meta">
                            <div class="meta-item">
                                <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                                    <circle cx="9" cy="7" r="4"/>
                                    <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
                                </svg>
                                ${peopleCount} Players
                            </div>
                        </div>
                        <div class="table-actions">
                            <button class="btn-table btn-join" onclick="loadUserTracker('${tracker.id}')">Open Table</button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        // Stats are now on analytics page, only update if on analytics page
        const analyticsPage = document.getElementById('analytics-page');
        if (analyticsPage && !analyticsPage.classList.contains('hidden')) {
            updateStats();
        }
    } catch (error) {
        console.error('Error loading user trackers:', error);
        yourTablesContainer.innerHTML = '';
        if (emptyState) {
            emptyState.classList.remove('hidden');
            emptyState.querySelector('.empty-title').textContent = 'Error loading your tables';
        }
    }
}

// Load a specific user tracker
async function loadUserTracker(trackerId) {
    if (!window.firebaseDb || !window.currentUser) return;
    
    const currentUserId = window.currentUser.uid;
    
    try {
        const docRef = window.firebaseDb.collection('users').doc(currentUserId);
        const doc = await docRef.get();
        
        if (!doc.exists || !doc.data().trackers) {
            showAlertModal('Tracker not found.');
            return;
        }
        
        const trackers = doc.data().trackers;
        const tracker = trackers.find(t => t.id === trackerId);
        
        if (!tracker) {
            showAlertModal('Tracker not found.');
            return;
        }
        
        // Restore the tracker state
        restoreState(tracker.state);
        state.trackerId = tracker.id;
        state.trackerName = tracker.name;
        
        // Update viewing state
        trackerViewState.isViewingFriendTracker = false;
        trackerViewState.isOwner = true;
        trackerViewState.viewingTrackerOwnerId = null;
        trackerViewState.hasEditAccess = false;
        
        // Save viewing state (viewing own tracker)
        saveViewingState();
        
        // Show tracking section
        const mainScreen = document.getElementById('main-screen');
        const setupSection = document.getElementById('setup-section');
        const trackingSection = document.getElementById('tracking-section');
        const settingsPage = document.getElementById('settings-page');
        const analyticsPage = document.getElementById('analytics-page');
        // Hide all other pages with inline styles for robustness
        if (mainScreen) {
            mainScreen.classList.add('hidden');
            mainScreen.style.display = 'none';
        }
        if (setupSection) {
            setupSection.classList.add('hidden');
            setupSection.style.display = 'none';
        }
        if (settingsPage) {
            settingsPage.classList.add('hidden');
            settingsPage.style.display = 'none';
        }
        if (analyticsPage) {
            analyticsPage.classList.add('hidden');
            analyticsPage.style.display = 'none';
        }
        // Show tracking section with inline style to ensure visibility
        if (trackingSection) {
            trackingSection.classList.remove('hidden');
            trackingSection.style.display = '';
        }
        
        // Render widgets and update display
        renderPeopleWidgets();
        updateTotalPot();
        updateChipValueDisplay();
        updateTotalChips();
        renderLog();
        
        // Update UI based on viewing mode
        updateUIForViewingMode(true);
    } catch (error) {
        console.error('Error loading user tracker:', error);
        showAlertModal('Error loading tracker. Please try again.');
    }
}

// Load live tables (friends' active trackers)
async function loadLiveTables() {
    if (!window.firebaseDb || !window.currentUser || !liveTablesContainer) return;
    
    const currentUserId = window.currentUser.uid;
    const emptyState = document.getElementById('live-tables-empty');
    
    try {
        // Get all friends
        const friendsRef = window.firebaseDb.collection('friends');
        const snapshot1 = await friendsRef.where('user1', '==', currentUserId).get();
        const snapshot2 = await friendsRef.where('user2', '==', currentUserId).get();
        
        const friendIds = new Set();
        snapshot1.forEach(doc => friendIds.add(doc.data().user2));
        snapshot2.forEach(doc => friendIds.add(doc.data().user1));
        
        if (friendIds.size === 0) {
            liveTablesContainer.innerHTML = '';
            if (emptyState) {
                emptyState.classList.remove('hidden');
                emptyState.querySelector('.empty-title').textContent = 'No friends yet';
                emptyState.querySelector('.empty-description').textContent = 'Add friends to see their live tables!';
            }
            updateStats();
            return;
        }
        
        // Get friends with active trackers
        const liveTables = [];
        for (const friendId of friendIds) {
            const userDoc = await window.firebaseDb.collection('users').doc(friendId).get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                
                // Only check trackers array (new format) - ignore old state field
                const trackers = userData.trackers || [];
                const activeTracker = trackers.find(t => t.state && t.state.people && Array.isArray(t.state.people) && t.state.people.length > 0);
                
                // Only add to live tables if there's actually an active tracker in the trackers array
                if (activeTracker) {
                    const friendName = userData.displayName || userData.name || userData.email || 'Unknown';
                    const hasAccess = await checkTrackerAccess(friendId);
                    const peopleCount = activeTracker.state.people ? activeTracker.state.people.length : 0;
                    
                    liveTables.push({
                        friendId: friendId,
                        friendName: friendName,
                        hasAccess: hasAccess,
                        peopleCount: peopleCount
                    });
                }
            }
        }
        
        if (liveTables.length === 0) {
            liveTablesContainer.innerHTML = '';
            if (emptyState) {
                emptyState.classList.remove('hidden');
                emptyState.querySelector('.empty-title').textContent = 'No live tables available';
                emptyState.querySelector('.empty-description').textContent = 'No friends are currently hosting active games';
            }
            updateStats();
            return;
        }
        
        // Hide empty state
        if (emptyState) emptyState.classList.add('hidden');
        
        // Render live table widgets with new card structure
        liveTablesContainer.innerHTML = liveTables.map(table => {
            // Escape the friend name to prevent XSS
            const escapedFriendName = table.friendName.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
            const tableName = `${escapedFriendName}'s Table`;
            return `
            <div class="table-card">
                <div class="table-image-wrapper">
                    <img src="assets/image-c90fcce1-ebd6-43e7-94b7-f3eb6415cdae.png" alt="Poker Table" class="table-image" onerror="this.style.display='none'">
                    <span class="table-badge">Live</span>
                </div>
                <div class="table-info">
                    <div class="table-header">
                        <div class="table-name">${tableName}</div>
                    </div>
                    <div class="table-meta">
                        <div class="meta-item">
                            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                                <circle cx="9" cy="7" r="4"/>
                                <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
                            </svg>
                            ${table.peopleCount} Players
                        </div>
                    </div>
                    <div class="table-actions">
                        <button class="btn-table btn-join" onclick="showJoinTrackerModal('${table.friendId}', '${table.friendName.replace(/'/g, "\\'")}')">Join Table</button>
                        <button class="btn-table btn-view" onclick="viewFriendTracker('${table.friendId}')">View</button>
                    </div>
                </div>
            </div>
        `;
        }).join('');
        updateStats();
    } catch (error) {
        console.error('Error loading live tables:', error);
        liveTablesContainer.innerHTML = '';
        if (emptyState) {
            emptyState.classList.remove('hidden');
            emptyState.querySelector('.empty-title').textContent = 'Error loading live tables';
        }
    }
}

// Show join tracker modal (request to join)
function showJoinTrackerModal(friendId, friendName) {
    showAmountInputModal(
        `Enter the amount of money you want to put in ${friendName}'s tracker (in dollars):`,
        async (amount) => {
            await requestJoinTracker(friendId, friendName, amount);
        },
        friendId,
        friendName
    );
}

// Request to join a friend's tracker (adds user as a person to the tracker)
async function requestJoinTracker(friendId, friendName, moneyAmount) {
    console.log('requestJoinTracker called with:', { friendId, friendName, moneyAmount });
    
    if (!window.firebaseDb) {
        console.error('Firebase DB not available');
        showAlertModal('Firebase is not ready. Please refresh the page.');
        return;
    }
    
    if (!window.currentUser) {
        console.error('Current user not available');
        showAlertModal('You must be signed in to send a join request.');
        return;
    }
    
    const currentUserId = window.currentUser.uid;
    console.log('Current user ID:', currentUserId);
    
    try {
        // Check if request already exists
        const requestsRef = window.firebaseDb.collection('trackerJoinRequests');
        const existingRequest = await requestsRef
            .where('trackerOwnerId', '==', friendId)
            .where('requesterId', '==', currentUserId)
            .where('status', '==', 'pending')
            .get();
        
        console.log('Existing requests check:', existingRequest.size);
        
        if (!existingRequest.empty) {
            showAlertModal('You have already sent a join request to this tracker.');
            return;
        }
        
        // Create join request
        console.log('Creating join request...');
        const requestDoc = await requestsRef.add({
            trackerOwnerId: friendId,
            requesterId: currentUserId,
            moneyAmount: moneyAmount,
            status: 'pending',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        console.log('Join request created with ID:', requestDoc.id);
        
        showAlertModal('Join request sent to ' + friendName + '! They will need to approve it to add you to their tracker.');
        
        // Also create read-only access so they can view
        const accessRef = window.firebaseDb.collection('trackerAccess');
        const existingAccess = await accessRef
            .where('trackerOwnerId', '==', friendId)
            .where('userId', '==', currentUserId)
            .where('status', '==', 'active')
            .get();
        
        if (existingAccess.empty) {
            console.log('Creating tracker access...');
            await accessRef.add({
                trackerOwnerId: friendId,
                userId: currentUserId,
                status: 'active',
                hasEditAccess: false,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            console.log('Tracker access created');
        } else {
            console.log('Tracker access already exists');
        }
        
        // Reload live tables
        loadLiveTables();
    } catch (error) {
        console.error('Error requesting to join tracker:', error);
        console.error('Error details:', {
            code: error.code,
            message: error.message,
            stack: error.stack
        });
        showAlertModal('Error sending join request: ' + (error.message || 'Please try again.'));
    }
}

// Custom Modal Functions (replacing browser alert/prompt)
let amountInputCallback = null;
let currentFriendId = null;
let currentFriendName = null;
let amountInputKeyHandler = null;
let alertKeyHandler = null;

// Show custom amount input modal
function showAmountInputModal(message, callback, friendId, friendName) {
    currentFriendId = friendId;
    currentFriendName = friendName;
    amountInputCallback = callback;
    
    const modal = document.getElementById('amount-input-modal');
    const messageEl = document.getElementById('amount-input-message');
    const inputEl = document.getElementById('amount-input-field');
    const quickAddButtons = document.getElementById('quick-add-buttons');
    
    messageEl.textContent = message || 'Enter the amount of money you want to put in the tracker:';
    inputEl.value = '';
    
    // Show quick-add buttons if stack value is available
    if (quickAddButtons && state.stackValue > 0) {
        quickAddButtons.style.display = 'flex';
        const btn50 = document.getElementById('quick-add-50');
        const btn100 = document.getElementById('quick-add-100');
        const btn200 = document.getElementById('quick-add-200');
        
        if (btn50) btn50.textContent = `50% ($${(state.stackValue * 0.5).toFixed(2)})`;
        if (btn100) btn100.textContent = `100% ($${state.stackValue.toFixed(2)})`;
        if (btn200) btn200.textContent = `200% ($${(state.stackValue * 2).toFixed(2)})`;
    } else if (quickAddButtons) {
        quickAddButtons.style.display = 'none';
    }
    
    modal.classList.remove('hidden');
    
    // Focus input and select all text
    setTimeout(() => {
        inputEl.focus();
        inputEl.select();
    }, 100);
    
    // Handle Enter and Escape keys
    amountInputKeyHandler = function(e) {
        if (e.key === 'Enter') {
            confirmAmountInput();
        } else if (e.key === 'Escape') {
            closeAmountInputModal();
        }
    };
    document.addEventListener('keydown', amountInputKeyHandler);
}

// Close amount input modal
function closeAmountInputModal() {
    const modal = document.getElementById('amount-input-modal');
    modal.classList.add('hidden');
    amountInputCallback = null;
    currentFriendId = null;
    currentFriendName = null;
    if (amountInputKeyHandler) {
        document.removeEventListener('keydown', amountInputKeyHandler);
        amountInputKeyHandler = null;
    }
}

// Use quick-add button (multiplier: 0.5 for 50%, 1 for 100%, 2 for 200%)
function useQuickAdd(multiplier) {
    if (state.stackValue > 0) {
        const amount = state.stackValue * multiplier;
        const inputEl = document.getElementById('amount-input-field');
        if (inputEl) {
            inputEl.value = amount.toFixed(2);
            // Auto-confirm after a short delay to allow user to see the value
            setTimeout(() => {
                confirmAmountInput();
            }, 100);
        }
    }
}

// Set quick-add stacks value in the widget form (stackMultiplier: 0.5, 1, or 2)
function setQuickAddStacks(personId, stackMultiplier) {
    const inputEl = document.getElementById(`add-stacks-${personId}`);
    if (inputEl) {
        inputEl.value = stackMultiplier;
        // Focus the input so user can see the value and optionally modify it
        inputEl.focus();
        inputEl.select();
    }
}

// Confirm amount input
function confirmAmountInput() {
    const inputEl = document.getElementById('amount-input-field');
    const amount = inputEl.value.trim();
    
    console.log('confirmAmountInput called, amount:', amount);
    
    if (amount === '') {
        showAlertModal('Please enter a valid amount greater than 0.');
        return;
    }
    
    const moneyAmount = parseFloat(amount);
    if (isNaN(moneyAmount) || moneyAmount <= 0) {
        showAlertModal('Please enter a valid amount greater than 0.');
        return;
    }
    
    console.log('Amount validated:', moneyAmount);
    console.log('Callback available:', !!amountInputCallback);
    console.log('Current friend ID:', currentFriendId);
    console.log('Current friend name:', currentFriendName);
    
    // Save callback and friend info before closing modal (which clears them)
    const callback = amountInputCallback;
    const friendId = currentFriendId;
    const friendName = currentFriendName;
    
    // Close modal (this clears the callback)
    closeAmountInputModal();
    
    // Now call the saved callback
    if (callback) {
        console.log('Calling callback with amount:', moneyAmount);
        try {
            // Call the callback - if it's async, handle it properly
            const result = callback(moneyAmount);
            if (result && typeof result.then === 'function') {
                // It's a promise, wait for it and handle errors
                result.then(() => {
                    console.log('Async callback completed successfully');
                }).catch(error => {
                    console.error('Error in async callback:', error);
                    showAlertModal('Error processing request: ' + (error.message || 'Unknown error'));
                });
            } else {
                console.log('Callback executed successfully');
            }
        } catch (error) {
            console.error('Error in callback:', error);
            showAlertModal('Error processing request: ' + (error.message || 'Unknown error'));
        }
    } else {
        console.error('No callback available!');
        showAlertModal('Error: No callback function available. Please try again.');
    }
}

// Show custom alert modal
function showAlertModal(message) {
    const modal = document.getElementById('alert-modal');
    const messageEl = document.getElementById('alert-message');
    
    messageEl.textContent = message;
    modal.classList.remove('hidden');
    
    // Handle Escape and Enter keys
    alertKeyHandler = function(e) {
        if (e.key === 'Escape' || e.key === 'Enter') {
            closeAlertModal();
        }
    };
    document.addEventListener('keydown', alertKeyHandler);
}

// Close alert modal
function closeAlertModal() {
    const modal = document.getElementById('alert-modal');
    modal.classList.add('hidden');
    if (alertKeyHandler) {
        document.removeEventListener('keydown', alertKeyHandler);
        alertKeyHandler = null;
    }
}

// Show confirmation modal for PAYP credit usage
function showConfirmModal(credits) {
    const modal = document.getElementById('confirm-modal');
    const messageEl = document.getElementById('confirm-message');
    
    if (modal && messageEl) {
        messageEl.textContent = `Are you sure you want to use 1 credit to create this table? You currently have ${credits} credit${credits !== 1 ? 's' : ''} remaining.`;
        modal.classList.remove('hidden');
        
        // Handle Escape key
        confirmKeyHandler = function(e) {
            if (e.key === 'Escape') {
                closeConfirmModal();
            }
        };
        document.addEventListener('keydown', confirmKeyHandler);
    }
}

// Close confirmation modal
function closeConfirmModal() {
    const modal = document.getElementById('confirm-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
    if (confirmKeyHandler) {
        document.removeEventListener('keydown', confirmKeyHandler);
        confirmKeyHandler = null;
    }
}

// Confirm and proceed with tracker creation (decrement credit)
async function confirmCreateTracker() {
    closeConfirmModal();
    
    // Decrement universal credits for non-Pro users only
    if (window.currentUser && window.firebaseDb) {
        try {
            const userId = window.currentUser.uid;
            const userEmail = window.currentUser.email;
            
            // Check if user has Pro plan (unlimited credits)
            const subscriptionStatus = await getSubscriptionStatus(userId, userEmail);
            const whitelisted = await isEmailWhitelisted(userEmail);
            
            const hasProPlan = whitelisted || 
                              (subscriptionStatus?.hasSubscription && 
                               (subscriptionStatus?.subscriptionType === 'monthly' || 
                                subscriptionStatus?.subscriptionType === '6month' ||
                                subscriptionStatus?.subscriptionType === 'pro') &&
                               !subscriptionStatus?.isOneTimePayment);
            
            // Check if subscription is active (not expired)
            let isSubscriptionActive = hasProPlan;
            if (hasProPlan && subscriptionStatus?.expiresAt) {
                const expiresAt = new Date(subscriptionStatus.expiresAt);
                isSubscriptionActive = expiresAt > new Date();
            }
            
            // Only decrement credits if user doesn't have unlimited (Pro plan)
            if (!isSubscriptionActive && !whitelisted) {
                await initializeCredits(userId); // Ensure credits exist
                
                const userRef = window.firebaseDb.collection('users').doc(userId);
                const userDoc = await userRef.get();
                
                if (userDoc.exists) {
                    const userData = userDoc.data();
                    const currentCredits = userData.credits !== undefined ? userData.credits : 3;
                    const newCredits = Math.max(0, currentCredits - 1);
                    
                    await userRef.set({
                        credits: newCredits
                    }, { merge: true });
                    
                    console.log(`Credit used. Remaining credits: ${newCredits}`);
                    
                    // Update credits display in settings if visible
                    const creditsDisplay = document.getElementById('settings-credits-display');
                    if (creditsDisplay) {
                        creditsDisplay.textContent = newCredits;
                    }
                }
            } else {
                console.log('Pro plan user - no credit decremented (unlimited)');
            }
        } catch (error) {
            console.error('Error decrementing credit:', error);
        }
    }
    
    // Proceed to setup section
    proceedToSetupSection();
}

let confirmKeyHandler = null;

// Make functions globally accessible
window.showAddForm = showAddForm;
window.showSubtractForm = showSubtractForm;
window.hideForm = hideForm;
window.submitAdd = submitAdd;
window.setQuickAddStacks = setQuickAddStacks;
window.submitSubtract = submitSubtract;
window.updatePersonName = updatePersonName;
window.updatePersonMoney = updatePersonMoney;
window.deleteCurrentTable = deleteCurrentTable;
window.showAddPersonForm = showAddPersonForm;
window.hideAddPersonForm = hideAddPersonForm;
window.submitAddPerson = submitAddPerson;
window.togglePersonalLog = togglePersonalLog;
window.showSettlementModal = showSettlementModal;
window.showSettlementModalForEndGame = showSettlementModalForEndGame;
window.closeSettlementModal = closeSettlementModal;
window.showHouseSettlement = showHouseSettlement;
window.showPlayerToPlayerSettlement = showPlayerToPlayerSettlement;
window.backToSettlementOptions = backToSettlementOptions;
window.backToTracker = backToTracker;
window.confirmEndGame = confirmEndGame;
window.signInWithGoogle = signInWithGoogle;
window.signOut = signOut;
window.loginWithEmail = loginWithEmail;
window.signupWithEmail = signupWithEmail;
window.showLoginForm = showLoginForm;
window.showSignupForm = showSignupForm;
window.showForgotPasswordForm = showForgotPasswordForm;
window.backToLogin = backToLogin;
window.sendPasswordReset = sendPasswordReset;
window.toggleFriendsSidebar = toggleFriendsSidebar;
window.toggleSidebarMenu = toggleSidebarMenu;
window.showInvitePeopleModal = showInvitePeopleModal;
window.showSettingsModal = showSettingsModal;
window.showSettingsPage = showSettingsPage;
window.loadSettingsData = loadSettingsData;
window.saveUsername = saveUsername;
window.saveUniqueId = saveUniqueId;
window.searchFriend = searchFriend;
window.sendFriendRequest = sendFriendRequest;
window.acceptFriendRequest = acceptFriendRequest;
window.declineFriendRequest = declineFriendRequest;
window.copyInviteLink = copyInviteLink;
window.updateOnlineStatus = updateOnlineStatus;
window.showFriendsButton = showFriendsButton;
window.hideFriendsButton = hideFriendsButton;
window.showHamburgerButton = showHamburgerButton;
window.hideHamburgerButton = hideHamburgerButton;
window.showNotificationsButton = showNotificationsButton;
window.hideNotificationsButton = hideNotificationsButton;
window.showNewTableButton = showNewTableButton;
window.hideNewTableButton = hideNewTableButton;
window.toggleNotificationsSidebar = toggleNotificationsSidebar;
window.checkFriendRequestNotifications = checkFriendRequestNotifications;
window.updateAllNotifications = updateAllNotifications;
window.loadState = loadState; // Make available for firebase-init.js
window.joinFriendTracker = joinFriendTracker;
window.getOrCreateUniqueId = getOrCreateUniqueId; // Make available for firebase-init.js
window.viewFriendTracker = viewFriendTracker;
window.requestEditingAccess = requestEditingAccess;
window.grantEditingAccess = grantEditingAccess;
window.declineEditingAccess = declineEditingAccess;
window.returnToOwnTracker = returnToOwnTracker;
window.showFriendTrackerOptions = showFriendTrackerOptions;
window.grantFriendEditAccess = grantFriendEditAccess;
window.showJoinTrackerModal = showJoinTrackerModal;
window.closeAmountInputModal = closeAmountInputModal;
window.confirmAmountInput = confirmAmountInput;
window.useQuickAdd = useQuickAdd;
window.closeAlertModal = closeAlertModal;
window.requestJoinTracker = requestJoinTracker;
window.loadLiveTables = loadLiveTables;
// Update tracker name
// Update tracker name from main page
async function updateTrackerNameMain(trackerId, newName) {
    if (!window.firebaseDb || !window.currentUser) {
        return;
    }
    
    const trimmedName = (newName || '').trim();
    if (!trimmedName) {
        // If empty, reload to restore original name
        await loadUserTrackers();
        return;
    }
    
    try {
        const userId = window.currentUser.uid;
        const docRef = window.firebaseDb.collection('users').doc(userId);
        const doc = await docRef.get();
        
        if (doc.exists && doc.data().trackers) {
            const trackers = doc.data().trackers;
            const updatedTrackers = trackers.map(tracker => {
                if (tracker.id === trackerId) {
                    return {
                        ...tracker,
                        name: trimmedName
                    };
                }
                return tracker;
            });
            
            await docRef.set({
                trackers: updatedTrackers,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            
            // Update local state if this is the current tracker
            if (state.trackerId === trackerId) {
                state.trackerName = trimmedName;
            }
            
            console.log('Tracker name updated successfully');
        }
    } catch (error) {
        console.error('Error updating tracker name:', error);
        showAlertModal('Error updating table name. Please try again.');
        // Reload to restore original name
        await loadUserTrackers();
    }
}

async function updateTrackerName(trackerId, newName) {
    if (!window.firebaseDb || !window.currentUser) {
        return;
    }
    
    if (!newName || newName.trim() === '') {
        // Reset to default if empty
        newName = `Table ${new Date().toLocaleDateString()}`;
    }
    
    try {
        const userId = window.currentUser.uid;
        const docRef = window.firebaseDb.collection('users').doc(userId);
        const doc = await docRef.get();
        
        if (!doc.exists || !doc.data().trackers) {
            return;
        }
        
        const trackers = doc.data().trackers;
        const trackerIndex = trackers.findIndex(t => t.id === trackerId);
        
        if (trackerIndex === -1) {
            return;
        }
        
        trackers[trackerIndex].name = newName.trim();
        
        await docRef.set({
            trackers: trackers,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        // Reload user trackers to update display
        await loadUserTrackers();
    } catch (error) {
        console.error('Error updating tracker name:', error);
        showAlertModal('Error updating table name. Please try again.');
        // Reload to reset the input
        await loadUserTrackers();
    }
}

// Update stats on main screen
function updateStats() {
    if (!window.currentUser) return;
    
    // Update total tables
    const totalTablesEl = document.getElementById('stat-total-tables');
    const totalTablesTextEl = document.getElementById('stat-total-tables-text');
    if (totalTablesEl && userTrackers) {
        const totalTables = userTrackers.length;
        totalTablesEl.textContent = totalTables;
        if (totalTablesTextEl) {
            totalTablesTextEl.textContent = totalTables === 0 ? 'Create your first table' : `${totalTables} table${totalTables !== 1 ? 's' : ''} created`;
        }
    }
    
    // Update active sessions (live tables)
    const activeSessionsEl = document.getElementById('stat-active-sessions');
    const activeSessionsTextEl = document.getElementById('stat-active-sessions-text');
    if (activeSessionsEl && liveTablesContainer) {
        const liveTables = liveTablesContainer.querySelectorAll('.table-card').length;
        activeSessionsEl.textContent = liveTables;
        if (activeSessionsTextEl) {
            activeSessionsTextEl.textContent = liveTables === 0 ? 'No live tables' : `${liveTables} live table${liveTables !== 1 ? 's' : ''} available`;
        }
    }
    
    // Update total winnings (from analytics)
    const totalWinningsEl = document.getElementById('stat-total-winnings');
    const totalWinningsTextEl = document.getElementById('stat-total-winnings-text');
    if (totalWinningsEl && window.firebaseDb && window.currentUser) {
        // Load analytics to calculate total winnings
        const userId = window.currentUser.uid;
        window.firebaseDb.collection('users').doc(userId).get().then(doc => {
            if (doc.exists) {
                const analytics = doc.data().analytics || [];
                const totalPNL = analytics.reduce((sum, game) => sum + (game.pnl || 0), 0);
                if (totalWinningsEl) {
                    totalWinningsEl.textContent = `$${totalPNL.toFixed(2)}`;
                    if (totalPNL > 0) {
                        totalWinningsEl.style.color = '#86efac';
                    } else if (totalPNL < 0) {
                        totalWinningsEl.style.color = '#fca5a5';
                    } else {
                        totalWinningsEl.style.color = '#f8fafc';
                    }
                }
                if (totalWinningsTextEl) {
                    totalWinningsTextEl.textContent = analytics.length === 0 ? 'Start tracking your games' : `${analytics.length} game${analytics.length !== 1 ? 's' : ''} tracked`;
                }
            }
        }).catch(err => {
            console.error('Error loading analytics for stats:', err);
        });
    }
    
    // Update win rate (from analytics)
    const winRateEl = document.getElementById('stat-win-rate');
    const winRateTextEl = document.getElementById('stat-win-rate-text');
    if (winRateEl && window.firebaseDb && window.currentUser) {
        const userId = window.currentUser.uid;
        window.firebaseDb.collection('users').doc(userId).get().then(doc => {
            if (doc.exists) {
                const analytics = doc.data().analytics || [];
                if (analytics.length > 0) {
                    const wins = analytics.filter(game => (game.pnl || 0) > 0).length;
                    const winRate = ((wins / analytics.length) * 100).toFixed(0);
                    if (winRateEl) {
                        winRateEl.textContent = `${winRate}%`;
                    }
                    if (winRateTextEl) {
                        winRateTextEl.textContent = `${wins} win${wins !== 1 ? 's' : ''} out of ${analytics.length}`;
                    }
                } else {
                    if (winRateEl) winRateEl.textContent = '-%';
                    if (winRateTextEl) winRateTextEl.textContent = 'No data yet';
                }
            }
        }).catch(err => {
            console.error('Error loading analytics for win rate:', err);
        });
    }
}

// Filter your tables (placeholder for now)
function filterYourTables(filter) {
    // Update active tab
    const tabs = document.querySelectorAll('.filter-tabs .filter-tab');
    tabs.forEach(tab => {
        if (tab.textContent.trim().toLowerCase() === filter.toLowerCase()) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });
    
    // TODO: Implement actual filtering logic
    // For now, just show all tables
    loadUserTrackers();
}

window.loadUserTrackers = loadUserTrackers;
window.updateTrackerName = updateTrackerName;
window.loadUserTracker = loadUserTracker;
window.filterYourTables = filterYourTables;
window.approveJoinRequest = approveJoinRequest;
window.declineJoinRequest = declineJoinRequest;
window.revokeFriendEditAccess = revokeFriendEditAccess;

// Analytics Functions
async function showAnalyticsPage() {
    const mainScreen = document.getElementById('main-screen');
    const analyticsPage = document.getElementById('analytics-page');
    const setupSection = document.getElementById('setup-section');
    const trackingSection = document.getElementById('tracking-section');
    const settingsPage = document.getElementById('settings-page');
    
    // Hide all other pages with inline styles for robustness
    if (mainScreen) {
        mainScreen.classList.add('hidden');
        mainScreen.style.display = 'none';
    }
    if (setupSection) {
        setupSection.classList.add('hidden');
        setupSection.style.display = 'none';
    }
    if (trackingSection) {
        trackingSection.classList.add('hidden');
        trackingSection.style.display = 'none';
    }
    if (settingsPage) {
        settingsPage.classList.add('hidden');
        settingsPage.style.display = 'none';
    }
    
    // Show analytics page with inline style to ensure visibility
    if (analyticsPage) {
        analyticsPage.classList.remove('hidden');
        analyticsPage.style.display = '';
        await loadAnalytics();
    }
}

async function loadAnalytics() {
    if (!window.firebaseDb || !window.currentUser) {
        return;
    }
    
    try {
        const userId = window.currentUser.uid;
        const userDocRef = window.firebaseDb.collection('users').doc(userId);
        const userDoc = await userDocRef.get();
        
        if (!userDoc.exists) {
            // No analytics data yet
            displayAnalytics([]);
            await loadFriendLeaderboard();
            return;
        }
        
        const userData = userDoc.data();
        const analytics = userData.analytics || [];
        
        displayAnalytics(analytics);
        
        // Update stats cards on analytics page (Total Tables, Active Sessions, etc.)
        updateStats();
        
        // Load friend leaderboard
        await loadFriendLeaderboard();
    } catch (error) {
        console.error('Error loading analytics:', error);
        showAlertModal('Error loading analytics. Please try again.');
    }
}

// Global chart instance
let pnlChartInstance = null;

function displayAnalytics(analytics) {
    // Calculate totals
    const totalPNL = analytics.reduce((sum, game) => sum + (game.pnl || 0), 0);
    const gamesPlayed = analytics.length;
    const avgPNL = gamesPlayed > 0 ? totalPNL / gamesPlayed : 0;
    
    // Update stat cards
    const totalPNLElement = document.getElementById('total-pnl');
    const gamesPlayedElement = document.getElementById('games-played');
    const avgPNLElement = document.getElementById('avg-pnl');
    
    if (totalPNLElement) {
        totalPNLElement.textContent = `${totalPNL >= 0 ? '+' : ''}$${totalPNL.toFixed(2)}`;
        totalPNLElement.className = `stat-value ${totalPNL >= 0 ? 'pnl-positive' : 'pnl-negative'}`;
    }
    if (gamesPlayedElement) {
        gamesPlayedElement.textContent = gamesPlayed.toString();
    }
    if (avgPNLElement) {
        avgPNLElement.textContent = `${avgPNL >= 0 ? '+' : ''}$${avgPNL.toFixed(2)}`;
        avgPNLElement.className = `stat-value ${avgPNL >= 0 ? 'pnl-positive' : 'pnl-negative'}`;
    }
    
    // Render PNL over time chart
    renderPNLChart(analytics);
    
    // Display history
    const historyList = document.getElementById('analytics-history-list');
    if (historyList) {
        if (analytics.length === 0) {
            historyList.innerHTML = '<p class="no-analytics">No games recorded yet. Delete a table after playing to see analytics.</p>';
        } else {
            // Sort by date (newest first)
            const sortedAnalytics = [...analytics].sort((a, b) => {
                const dateA = a.date?.toDate ? a.date.toDate() : new Date(a.date);
                const dateB = b.date?.toDate ? b.date.toDate() : new Date(b.date);
                return dateB - dateA;
            });
            
            historyList.innerHTML = sortedAnalytics.map((game, index) => {
                const gameDate = game.date?.toDate ? game.date.toDate() : new Date(game.date);
                const dateStr = gameDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                const pnl = game.pnl || 0;
                const pnlClass = pnl >= 0 ? 'pnl-positive' : 'pnl-negative';
                const pnlSign = pnl >= 0 ? '+' : '';
                
                // Use trackerId or index as identifier for deletion
                const gameIdentifier = game.trackerId || `index-${index}`;
                
                return `
                    <div class="analytics-history-item">
                        <div class="history-item-date">${dateStr}</div>
                        <div class="history-item-name">${game.trackerName || 'Unknown Table'}</div>
                        <div class="history-item-pnl ${pnlClass}">${pnlSign}$${Math.abs(pnl).toFixed(2)}</div>
                        <button class="history-item-delete" onclick="deleteAnalyticsEntry('${gameIdentifier}')" title="Delete this entry">×</button>
                    </div>
                `;
            }).join('');
        }
    }
}

// Render PNL over time chart
function renderPNLChart(analytics) {
    const chartCanvas = document.getElementById('pnl-chart');
    if (!chartCanvas || typeof Chart === 'undefined') {
        console.error('Chart.js not loaded or canvas element not found');
        return;
    }
    
    // Destroy existing chart if it exists
    if (pnlChartInstance) {
        pnlChartInstance.destroy();
        pnlChartInstance = null;
    }
    
    if (analytics.length === 0) {
        chartCanvas.parentElement.innerHTML = '<p class="no-analytics">No data available. Start playing games to see your PNL over time.</p>';
        return;
    }
    
    // Sort analytics by date (oldest first for cumulative line)
    const sortedAnalytics = [...analytics].sort((a, b) => {
        const dateA = a.date?.toDate ? a.date.toDate() : new Date(a.date);
        const dateB = b.date?.toDate ? b.date.toDate() : new Date(b.date);
        return dateA - dateB;
    });
    
    // Calculate cumulative PNL and extract labels/dates
    let cumulativePNL = 0;
    const labels = [];
    const cumulativeData = [];
    
    sortedAnalytics.forEach((game) => {
        const gameDate = game.date?.toDate ? game.date.toDate() : new Date(game.date);
        const dateStr = gameDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        labels.push(dateStr);
        
        const pnl = game.pnl || 0;
        cumulativePNL += pnl;
        cumulativeData.push(cumulativePNL);
    });
    
    const ctx = chartCanvas.getContext('2d');
    pnlChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Cumulative PNL',
                    data: cumulativeData,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    tension: 0.4,
                    fill: true,
                    borderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        color: '#e5e7eb',
                        font: {
                            size: 12
                        }
                    }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            const value = context.parsed.y;
                            return context.dataset.label + ': ' + (value >= 0 ? '+' : '') + '$' + value.toFixed(2);
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: '#9ca3af',
                        maxRotation: 45,
                        minRotation: 45
                    },
                    grid: {
                        color: 'rgba(156, 163, 175, 0.2)'
                    }
                },
                y: {
                    ticks: {
                        color: '#9ca3af',
                        callback: function(value) {
                            return (value >= 0 ? '+' : '') + '$' + value.toFixed(0);
                        }
                    },
                    grid: {
                        color: 'rgba(156, 163, 175, 0.2)'
                    }
                }
            }
        }
    });
}

// Load friend leaderboard
async function loadFriendLeaderboard() {
    const leaderboardContainer = document.getElementById('friend-leaderboard');
    if (!leaderboardContainer || !window.firebaseDb || !window.currentUser) {
        return;
    }
    
    try {
        const currentUserId = window.currentUser.uid;
        
        // Get all friends
        const friendsRef = window.firebaseDb.collection('friends');
        const snapshot1 = await friendsRef.where('user1', '==', currentUserId).get();
        const snapshot2 = await friendsRef.where('user2', '==', currentUserId).get();
        
        const friendIds = new Set();
        snapshot1.forEach(doc => friendIds.add(doc.data().user2));
        snapshot2.forEach(doc => friendIds.add(doc.data().user1));
        
        // Get current user's analytics
        const currentUserDoc = await window.firebaseDb.collection('users').doc(currentUserId).get();
        const currentUserData = currentUserDoc.exists ? currentUserDoc.data() : {};
        const currentUserAnalytics = currentUserData.analytics || [];
        const currentUserTotalPNL = currentUserAnalytics.reduce((sum, game) => sum + (game.pnl || 0), 0);
        const currentUserName = currentUserData.displayName || currentUserData.name || currentUserData.email || 'You';
        
        // Create leaderboard entries
        const leaderboard = [{
            name: currentUserName,
            userId: currentUserId,
            totalPNL: currentUserTotalPNL,
            gamesPlayed: currentUserAnalytics.length,
            isCurrentUser: true
        }];
        
        // Get friend analytics
        for (const friendId of friendIds) {
            try {
                const friendDoc = await window.firebaseDb.collection('users').doc(friendId).get();
                if (friendDoc.exists) {
                    const friendData = friendDoc.data();
                    const friendAnalytics = friendData.analytics || [];
                    const friendTotalPNL = friendAnalytics.reduce((sum, game) => sum + (game.pnl || 0), 0);
                    const friendName = friendData.displayName || friendData.name || friendData.email || 'Unknown';
                    
                    leaderboard.push({
                        name: friendName,
                        userId: friendId,
                        totalPNL: friendTotalPNL,
                        gamesPlayed: friendAnalytics.length,
                        isCurrentUser: false
                    });
                }
            } catch (error) {
                console.error(`Error loading analytics for friend ${friendId}:`, error);
            }
        }
        
        // Sort by total PNL (descending)
        leaderboard.sort((a, b) => b.totalPNL - a.totalPNL);
        
        // Limit to top 10 entries
        const topLeaderboard = leaderboard.slice(0, 10);
        
        // Render leaderboard
        if (leaderboard.length === 1 && leaderboard[0].isCurrentUser) {
            leaderboardContainer.innerHTML = '<p class="no-analytics">Add friends to see the leaderboard!</p>';
        } else if (leaderboard.length === 0) {
            leaderboardContainer.innerHTML = '<p class="no-analytics">No friends yet. Add friends to see the leaderboard!</p>';
        } else {
            leaderboardContainer.innerHTML = topLeaderboard.map((entry, index) => {
                const rank = index + 1;
                const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;
                const pnlClass = entry.totalPNL >= 0 ? 'pnl-positive' : 'pnl-negative';
                const pnlSign = entry.totalPNL >= 0 ? '+' : '';
                const currentUserClass = entry.isCurrentUser ? 'leaderboard-entry-current' : '';
                
                return `
                    <div class="leaderboard-entry ${currentUserClass}">
                        <div class="leaderboard-rank">${medal}</div>
                        <div class="leaderboard-name">${entry.name}${entry.isCurrentUser ? ' (You)' : ''}</div>
                        <div class="leaderboard-stats">
                            <span class="leaderboard-pnl ${pnlClass}">${pnlSign}$${Math.abs(entry.totalPNL).toFixed(2)}</span>
                        </div>
                    </div>
                `;
            }).join('');
        }
    } catch (error) {
        console.error('Error loading friend leaderboard:', error);
        leaderboardContainer.innerHTML = '<p class="no-analytics">Error loading leaderboard. Please try again.</p>';
    }
}

// Delete analytics entry
async function deleteAnalyticsEntry(gameIdentifier) {
    if (!window.firebaseDb || !window.currentUser) {
        showAlertModal('Please sign in to delete analytics entries.');
        return;
    }
    
    try {
        const userId = window.currentUser.uid;
        const userDocRef = window.firebaseDb.collection('users').doc(userId);
        const userDoc = await userDocRef.get();
        
        if (!userDoc.exists) {
            showAlertModal('Analytics data not found.');
            return;
        }
        
        const userData = userDoc.data();
        const analytics = userData.analytics || [];
        
        // Filter out the entry to delete
        // If gameIdentifier starts with 'index-', use index-based deletion (for older entries without trackerId)
        let updatedAnalytics;
        if (gameIdentifier.startsWith('index-')) {
            const index = parseInt(gameIdentifier.replace('index-', ''));
            // Need to use sorted analytics to match the index (same as displayAnalytics uses)
            const sortedAnalytics = [...analytics].sort((a, b) => {
                const dateA = a.date?.toDate ? a.date.toDate() : new Date(a.date);
                const dateB = b.date?.toDate ? b.date.toDate() : new Date(b.date);
                return dateB - dateA;
            });
            const entryToDelete = sortedAnalytics[index];
            // Find and remove from original array by matching all fields
            updatedAnalytics = analytics.filter((game) => {
                const gameDate = game.date?.toDate ? game.date.toDate() : new Date(game.date);
                const entryDate = entryToDelete.date?.toDate ? entryToDelete.date.toDate() : new Date(entryToDelete.date);
                return !(game.trackerId === entryToDelete.trackerId && 
                        game.trackerName === entryToDelete.trackerName &&
                        game.pnl === entryToDelete.pnl &&
                        gameDate.getTime() === entryDate.getTime());
            });
        } else {
            // Delete by trackerId
            updatedAnalytics = analytics.filter(game => game.trackerId !== gameIdentifier);
        }
        
        // Update user document
        await userDocRef.set({
            analytics: updatedAnalytics,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        // Reload analytics to update display
        await loadAnalytics();
    } catch (error) {
        console.error('Error deleting analytics entry:', error);
        showAlertModal('Error deleting analytics entry. Please try again.');
    }
}

window.showAnalyticsPage = showAnalyticsPage;

// ==================== UPGRADE PAGE ====================

async function showUpgradePage() {
    const mainScreen = document.getElementById('main-screen');
    const upgradePage = document.getElementById('upgrade-page');
    const setupSection = document.getElementById('setup-section');
    const trackingSection = document.getElementById('tracking-section');
    const settingsPage = document.getElementById('settings-page');
    const analyticsPage = document.getElementById('analytics-page');
    
    // Hide all other pages with inline styles for robustness
    if (mainScreen) {
        mainScreen.classList.add('hidden');
        mainScreen.style.display = 'none';
    }
    if (setupSection) {
        setupSection.classList.add('hidden');
        setupSection.style.display = 'none';
    }
    if (trackingSection) {
        trackingSection.classList.add('hidden');
        trackingSection.style.display = 'none';
    }
    if (settingsPage) {
        settingsPage.classList.add('hidden');
        settingsPage.style.display = 'none';
    }
    if (analyticsPage) {
        analyticsPage.classList.add('hidden');
        analyticsPage.style.display = 'none';
    }
    
    // Show upgrade page with inline style to ensure visibility
    if (upgradePage) {
        upgradePage.classList.remove('hidden');
        upgradePage.style.display = '';
    }
}

function handlePayAsYouPlay() {
    // Redirect to Whop PAYP checkout
    window.open('https://whop.com/checkout/plan_AYljP0LPlsikE', '_blank');
}

function handleMonthlySubscription() {
    // Redirect to Whop monthly subscription checkout
    window.open('https://whop.com/checkout/plan_N6mSBFXV8ozrH', '_blank');
}

function handleSixMonthSubscription() {
    // Redirect to Whop 6-month subscription checkout
    window.open('https://whop.com/checkout/plan_8MBIgfX4XvYFw', '_blank');
}

window.showUpgradePage = showUpgradePage;
window.handlePayAsYouPlay = handlePayAsYouPlay;
window.handleMonthlySubscription = handleMonthlySubscription;
window.handleSixMonthSubscription = handleSixMonthSubscription;
window.checkWhopSubscriptionStatus = checkWhopSubscriptionStatus;
window.refreshSubscriptionStatus = refreshSubscriptionStatus;
window.canCreateTracker = canCreateTracker;
window.updatePlanDisplay = updatePlanDisplay;
window.loadPlanDisplay = loadPlanDisplay;
window.deleteAnalyticsEntry = deleteAnalyticsEntry;
window.cleanupExpiredTrackers = cleanupExpiredTrackers;
window.markTrackersForExpiration = markTrackersForExpiration;
window.closeConfirmModal = closeConfirmModal;
window.confirmCreateTracker = confirmCreateTracker;
window.clearTable = clearTable;
window.selectPersonFromSearch = selectPersonFromSearch;
window.updateTrackerNameMain = updateTrackerNameMain;

// Install Instructions Modal Functions
function showInstallInstructions() {
    const modal = document.getElementById('install-instructions-modal');
    if (modal) {
        modal.classList.remove('hidden');
    }
}

function closeInstallInstructions() {
    const modal = document.getElementById('install-instructions-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

window.showInstallInstructions = showInstallInstructions;
window.closeInstallInstructions = closeInstallInstructions;

// Initialize on page load
// Firebase auth state change will handle showing auth page or authenticated content
// If Firebase doesn't load, show auth page after timeout
setTimeout(() => {
    if (!window.firebaseReady) {
        // Firebase failed to load, show auth page
        const authPage = document.getElementById('auth-page');
        const setupSection = document.getElementById('setup-section');
        if (authPage) authPage.classList.remove('hidden');
        if (setupSection) setupSection.classList.add('hidden');
    }
}, 1000);
