// Initialize Firebase
async function initFirebase() {
    try {
        // Load Firebase config from API
        const response = await fetch('/api/firebase-config');
        if (!response.ok) {
            throw new Error('Failed to load Firebase config');
        }
        const config = await response.json();
        
        // Check if all required config values are present
        if (!config.apiKey || !config.authDomain || !config.projectId) {
            throw new Error('Incomplete Firebase configuration');
        }
        
        // Initialize Firebase
        firebase.initializeApp(config);
        window.firebaseAuth = firebase.auth();
        window.firebaseDb = firebase.firestore();
        window.firebaseReady = true;
        
        // Dispatch event when Firebase is ready
        window.dispatchEvent(new Event('firebase-ready'));
        
        // Ensure friends button is hidden on initial load
        const friendsBtn = document.getElementById('friends-btn');
        if (friendsBtn) {
            friendsBtn.classList.add('hidden');
            friendsBtn.style.display = 'none'; // Force hide with inline style
        }
        
        // Listen for auth state changes
        window.firebaseAuth.onAuthStateChanged(async (user) => {
            if (user) {
                // User is signed in
                window.currentUser = user;
                await showAuthenticatedView(user);
                
                // Update online status
                if (window.updateOnlineStatus) {
                    await window.updateOnlineStatus(true);
                }
                
                // Save user profile to Firestore
                const userRef = window.firebaseDb.collection('users').doc(user.uid);
                const userDoc = await userRef.get();
                const userData = userDoc.exists ? userDoc.data() : {};
                
                // Ensure unique ID exists
                let uniqueId = userData.uniqueId;
                if (!uniqueId && window.getOrCreateUniqueId) {
                    uniqueId = await window.getOrCreateUniqueId(user.uid);
                }
                
                await userRef.set({
                    email: user.email,
                    displayName: user.displayName || user.email,
                    uniqueId: uniqueId,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
                
                // Show friends button only after authenticated view is shown and auth page is hidden
                // Use setTimeout to ensure auth page is hidden first
                setTimeout(() => {
                    if (window.showFriendsButton) {
                        window.showFriendsButton();
                    }
                }, 100);
                
                // Check for friend request notifications
                if (window.checkFriendRequestNotifications) {
                    setTimeout(() => {
                        window.checkFriendRequestNotifications();
                    }, 500);
                }
                
                if (typeof loadUserData === 'function') {
                    loadUserData(user.uid);
                } else {
                    // Wait for script.js to load
                    setTimeout(() => {
                        if (window.loadUserData) {
                            window.loadUserData(user.uid);
                        } else {
                            loadState();
                        }
                    }, 100);
                }
            } else {
                // User is signed out
                // Update online status
                if (window.updateOnlineStatus && window.currentUser) {
                    await window.updateOnlineStatus(false);
                }
                
                window.currentUser = null;
                
                // Hide friends button
                if (window.hideFriendsButton) {
                    window.hideFriendsButton();
                }
                
                showAuthPage();
            }
        });
    } catch (error) {
        console.error('Firebase initialization error:', error);
        window.firebaseReady = false;
        // Fall back to localStorage
        if (typeof loadState === 'function') {
            loadState();
        } else if (window.loadState) {
            window.loadState();
        }
    }
}

// Show authentication page
function showAuthPage() {
    const authPage = document.getElementById('auth-page');
    const setupSection = document.getElementById('setup-section');
    const trackingSection = document.getElementById('tracking-section');
    const mainScreen = document.getElementById('main-screen');
    const headerUserInfo = document.getElementById('header-user-info');
    const friendsBtn = document.getElementById('friends-btn');
    const backToHomeBtn = document.getElementById('back-to-main-btn');
    
    if (authPage) authPage.classList.remove('hidden');
    if (setupSection) setupSection.classList.add('hidden');
    if (trackingSection) trackingSection.classList.add('hidden');
    if (mainScreen) mainScreen.classList.add('hidden');
    if (headerUserInfo) headerUserInfo.classList.add('hidden');
    
    // Force hide friends button with both class and inline style
    if (friendsBtn) {
        friendsBtn.classList.add('hidden');
        friendsBtn.style.display = 'none';
    }
    
    if (backToHomeBtn) backToHomeBtn.classList.add('hidden');
}

// Show authenticated view (setup or tracking)
async function showAuthenticatedView(user) {
    const authPage = document.getElementById('auth-page');
    const friendsBtn = document.getElementById('friends-btn');
    const userInfo = document.getElementById('user-info');
    const userName = document.getElementById('user-name');
    const headerUserInfo = document.getElementById('header-user-info');
    const headerUserName = document.getElementById('header-user-name');
    
    if (authPage) authPage.classList.add('hidden');
    
    // Ensure friends button is hidden until explicitly shown after auth page is hidden
    if (friendsBtn) {
        friendsBtn.classList.add('hidden');
        friendsBtn.style.display = 'none'; // Force hide with inline style
    }
    
    // Update user info in tracking section (if exists)
    if (userInfo && userName) {
        userName.textContent = user.displayName || user.email;
    }
    
    // Update user info in header (always visible)
    if (headerUserInfo && headerUserName) {
        headerUserName.textContent = user.displayName || user.email;
        headerUserInfo.classList.remove('hidden');
        
        // Get and display unique ID (with delay to ensure script.js is loaded)
        if (window.getOrCreateUniqueId && window.firebaseDb) {
            try {
                const uniqueId = await window.getOrCreateUniqueId(user.uid);
                const headerUserId = document.getElementById('header-user-id');
                if (headerUserId && uniqueId) {
                    headerUserId.textContent = `ID: ${uniqueId}`;
                }
            } catch (error) {
                console.error('Error getting unique ID:', error);
                // Don't block the UI if unique ID fails
            }
        } else {
            // If getOrCreateUniqueId not available yet, try again after a short delay
            setTimeout(async () => {
                if (window.getOrCreateUniqueId && window.firebaseDb) {
                    try {
                        const uniqueId = await window.getOrCreateUniqueId(user.uid);
                        const headerUserId = document.getElementById('header-user-id');
                        if (headerUserId && uniqueId) {
                            headerUserId.textContent = `ID: ${uniqueId}`;
                        }
                    } catch (error) {
                        console.error('Error getting unique ID (retry):', error);
                    }
                }
            }, 500);
        }
    }
    
    // Show install button if PWA is installable (after user is authenticated)
    if (window.showInstallButton) {
        setTimeout(() => {
            window.showInstallButton();
        }, 1000);
    }
    
    // Setup section and tracking section visibility will be handled by loadUserData
    // But show setup section as default if loadUserData hasn't run yet
    setTimeout(() => {
        const setupSection = document.getElementById('setup-section');
        const trackingSection = document.getElementById('tracking-section');
        // If neither is visible, show setup section
        if (setupSection && trackingSection) {
            if (setupSection.classList.contains('hidden') && trackingSection.classList.contains('hidden')) {
                setupSection.classList.remove('hidden');
            }
        }
    }, 500);
}

// Ensure Friends button is hidden on initial page load (before Firebase initializes)
function ensureInitialState() {
    const friendsBtn = document.getElementById('friends-btn');
    if (friendsBtn) {
        friendsBtn.classList.add('hidden');
        friendsBtn.style.display = 'none'; // Force hide with inline style
    }
    // Also show auth page by default
    const authPage = document.getElementById('auth-page');
    if (authPage) {
        authPage.classList.remove('hidden');
    }
}

// Initialize when page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        ensureInitialState();
        initFirebase();
    });
} else {
    ensureInitialState();
    initFirebase();
}
