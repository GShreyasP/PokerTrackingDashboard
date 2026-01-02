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
        
        // Listen for auth state changes
        window.firebaseAuth.onAuthStateChanged((user) => {
            if (user) {
                // User is signed in
                window.currentUser = user;
                showAuthenticatedView(user);
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
                window.currentUser = null;
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
    const headerUserInfo = document.getElementById('header-user-info');
    
    if (authPage) authPage.classList.remove('hidden');
    if (setupSection) setupSection.classList.add('hidden');
    if (trackingSection) trackingSection.classList.add('hidden');
    if (headerUserInfo) headerUserInfo.classList.add('hidden');
}

// Show authenticated view (setup or tracking)
function showAuthenticatedView(user) {
    const authPage = document.getElementById('auth-page');
    const userInfo = document.getElementById('user-info');
    const userName = document.getElementById('user-name');
    const headerUserInfo = document.getElementById('header-user-info');
    const headerUserName = document.getElementById('header-user-name');
    
    if (authPage) authPage.classList.add('hidden');
    
    // Update user info in tracking section (if exists)
    if (userInfo && userName) {
        userName.textContent = user.displayName || user.email;
    }
    
    // Update user info in header (always visible)
    if (headerUserInfo && headerUserName) {
        headerUserName.textContent = user.displayName || user.email;
        headerUserInfo.classList.remove('hidden');
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

// Initialize when page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFirebase);
} else {
    initFirebase();
}
