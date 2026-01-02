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
                updateAuthUI(user);
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
                updateAuthUI(null);
                // Fall back to localStorage if not signed in
                if (typeof loadState === 'function') {
                    loadState();
                } else if (window.loadState) {
                    window.loadState();
                }
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

// Update auth UI
function updateAuthUI(user) {
    const userInfo = document.getElementById('user-info');
    const userName = document.getElementById('user-name');
    const signInBtn = document.getElementById('sign-in-btn');
    
    if (user && userInfo && userName && signInBtn) {
        userName.textContent = user.displayName || user.email;
        userInfo.classList.remove('hidden');
        signInBtn.classList.add('hidden');
    } else if (userInfo && signInBtn) {
        userInfo.classList.add('hidden');
        signInBtn.classList.remove('hidden');
    }
}

// Initialize when page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFirebase);
} else {
    initFirebase();
}
