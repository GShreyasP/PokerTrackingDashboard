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
    transactions: []
};

// Tracker viewing state
let trackerViewState = {
    isViewingFriendTracker: false,
    viewingTrackerOwnerId: null,
    hasEditAccess: false,
    isOwner: true,
    ownTrackerState: null // Store user's own tracker state when switching to friend's tracker
};

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

// Initialize
sameValueToggle.addEventListener('change', toggleChipValueMode);
setupBtn.addEventListener('click', startTracking);

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

// Load user data from Firestore
async function loadUserData(userId) {
    if (!window.firebaseDb || !window.firebaseReady) {
        // Firebase not ready, use localStorage
        loadState();
        return;
    }
    
    try {
        const docRef = window.firebaseDb.collection('users').doc(userId);
        const doc = await docRef.get();
        
        if (doc.exists && doc.data().state) {
            const data = doc.data();
            restoreState(data.state);
        } else {
            // No data in Firestore, try localStorage
            const hasLocalData = loadState();
            // If no local data either, show main screen
            if (!hasLocalData) {
                showMainScreen();
            }
        }
    } catch (error) {
        console.error('Error loading user data:', error);
        // Fall back to localStorage
        const hasLocalData = loadState();
        if (!hasLocalData) {
            showMainScreen();
        }
    }
}

// Show main screen
function showMainScreen() {
    const mainScreen = document.getElementById('main-screen');
    const setupSection = document.getElementById('setup-section');
    const trackingSection = document.getElementById('tracking-section');
    if (mainScreen) {
        mainScreen.classList.remove('hidden');
        // Load live tables
        if (window.firebaseDb && window.currentUser) {
            loadLiveTables();
        }
    }
    if (setupSection) setupSection.classList.add('hidden');
    if (trackingSection) trackingSection.classList.add('hidden');
}

// Show setup section
function showSetupSection() {
    const mainScreen = document.getElementById('main-screen');
    const setupSection = document.getElementById('setup-section');
    const trackingSection = document.getElementById('tracking-section');
    if (mainScreen) mainScreen.classList.add('hidden');
    if (setupSection) setupSection.classList.remove('hidden');
    if (trackingSection) trackingSection.classList.add('hidden');
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
            await docRef.set({
                state: stateToSave,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
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
            transactions: []
        };
        // Clear localStorage
        localStorage.removeItem('pokerTrackerState');
        
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

// Reset all data
async function resetData() {
    // Don't allow reset if viewing friend's tracker
    if (trackerViewState.isViewingFriendTracker) {
        alert('You cannot reset data when viewing a friend\'s tracker.');
        return;
    }
    
    if (confirm('Are you sure you want to reset all data? This cannot be undone.')) {
        // Clear localStorage
        localStorage.removeItem('pokerTrackerState');
        
        // Delete from Firestore if user is signed in
        if (window.currentUser && window.firebaseDb && window.firebaseReady) {
            try {
                const userId = window.currentUser.uid;
                const docRef = window.firebaseDb.collection('users').doc(userId);
                await docRef.delete();
            } catch (error) {
                console.error('Error deleting from Firestore:', error);
            }
        }
        
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
            transactions: []
        };
        
        // Show setup section and hide tracking section
        setupSection.classList.remove('hidden');
        trackingSection.classList.add('hidden');
        
        // Reset form inputs
        numPeopleInput.value = 4;
        stackValueInput.value = '';
        chipsPerStackInput.value = '';
        sameValueToggle.checked = true;
        toggleChipValueMode();
    }
}

// Toggle between same/different chip values
function toggleChipValueMode() {
    const sameValue = sameValueToggle.checked;
    state.sameValue = sameValue;
    differentChipsSection.classList.toggle('hidden', sameValue);
}

// Start tracking - go directly to dashboard
function startTracking() {
    // Validate all required fields
    const numPeople = parseInt(numPeopleInput.value);
    const stackValue = parseFloat(stackValueInput.value);
    const chipsPerStack = parseInt(chipsPerStackInput.value);
    const sameValue = sameValueToggle.checked;
    
    // Check if checkbox is checked
    if (!sameValue) {
        alert('Please check "All chips are worth the same" or configure individual chip values.');
        return;
    }
    
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
                addTransaction(i, displayName, initialMoney, 'add');
            }
        }
    }
    
    // Hide setup, show tracking
    setupSection.classList.add('hidden');
    trackingSection.classList.remove('hidden');
    
    // Render widgets and update display
    renderPeopleWidgets();
    updateTotalPot();
    updateChipValueDisplay();
    updateTotalChips();
    renderLog();
    saveState();
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
    
    // Add transaction if money > 0
    if (money > 0) {
        const displayName = newPerson.name || `Person ${newPerson.id + 1}`;
        addTransaction(newPerson.id, displayName, money, 'add');
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
                <input type="text" class="widget-name-input" value="${person.name || ''}" 
                       onchange="updatePersonName(${person.id}, this.value)"
                       onblur="updatePersonName(${person.id}, this.value)"
                       placeholder="Person ${person.id + 1}">
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
        person.moneyPutIn = (person.moneyPutIn || 0) + amount;
        
        // Update total money (for display purposes, though we use balance now)
        person.totalMoney = (person.totalMoney || 0) + amount;
        
        const displayName = person.name || `Person ${personId + 1}`;
        addTransaction(personId, displayName, amount, 'add');
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
function updatePersonName(personId, newName) {
    // Don't allow updating name if viewing friend's tracker without edit access
    if (trackerViewState.isViewingFriendTracker && !trackerViewState.hasEditAccess) {
        // Reset the input to the original name
        const person = state.people.find(p => p.id === personId);
        if (person) {
            const nameInput = document.querySelector(`.widget-name-input[onchange*="${personId}"]`);
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
function addTransaction(personId, personName, amount, type) {
    const transaction = {
        id: Date.now(),
        personId: personId,
        personName: personName,
        amount: amount,
        type: type, // 'add' or 'remove'
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
        const typeText = transaction.type === 'add' ? 'added' : 'removed';
        
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
        const typeText = transaction.type === 'add' ? 'added' : 'removed';
        
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

// Settlement functions
function showSettlementModal() {
    const modal = document.getElementById('settlement-modal');
    modal.classList.remove('hidden');
    showSettlementOptions();
}

function closeSettlementModal() {
    const modal = document.getElementById('settlement-modal');
    modal.classList.add('hidden');
}

function showSettlementOptions() {
    document.getElementById('settlement-options').classList.remove('hidden');
    document.getElementById('house-settlement-view').classList.add('hidden');
    document.getElementById('player-settlement-view').classList.add('hidden');
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
}

function backToSettlementOptions() {
    showSettlementOptions();
}

// ==================== FRIENDS SYSTEM ====================

let friendsListeners = [];
let onlineStatusListeners = [];

// Toggle friends sidebar
function toggleFriendsSidebar() {
    const sidebar = document.getElementById('friends-sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    if (sidebar && overlay) {
        const isHidden = sidebar.classList.contains('hidden');
        if (isHidden) {
            sidebar.classList.remove('hidden');
            overlay.classList.remove('hidden');
            loadFriendsList();
            loadFriendRequests();
            loadTrackerAccessRequests();
            loadTrackerJoinRequests();
        } else {
            sidebar.classList.add('hidden');
            overlay.classList.add('hidden');
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

// Show friends button when authenticated
function showFriendsButton() {
    const friendsBtn = document.getElementById('friends-btn');
    if (friendsBtn) {
        friendsBtn.classList.remove('hidden');
    }
}

// Hide friends button when signed out
function hideFriendsButton() {
    const friendsBtn = document.getElementById('friends-btn');
    if (friendsBtn) {
        friendsBtn.classList.add('hidden');
    }
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
            
            // Match if email or name contains search term
            if (email.includes(searchTermLower) || name.includes(searchTermLower)) {
                results.push({
                    id: userId,
                    email: userData.email || '',
                    name: userData.displayName || userData.name || userData.email || 'Unknown',
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
    const badge = document.getElementById('friends-notification-badge');
    if (!badge) return;
    
    if (count > 0) {
        badge.textContent = count > 99 ? '99+' : count;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

// Check for friend request notifications
async function checkFriendRequestNotifications() {
    if (!window.firebaseDb || !window.currentUser) return;
    
    try {
        const currentUserId = window.currentUser.uid;
        const friendRequestsRef = window.firebaseDb.collection('friendRequests');
        const snapshot = await friendRequestsRef
            .where('to', '==', currentUserId)
            .where('status', '==', 'pending')
            .get();
        
        updateFriendsNotificationBadge(snapshot.size);
        
        // Set up real-time listener for notifications
        if (window.friendRequestListener) {
            window.friendRequestListener(); // Unsubscribe old listener
        }
        
        window.friendRequestListener = friendRequestsRef
            .where('to', '==', currentUserId)
            .where('status', '==', 'pending')
            .onSnapshot((snapshot) => {
                updateFriendsNotificationBadge(snapshot.size);
            });
    } catch (error) {
        console.error('Error checking friend request notifications:', error);
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
        
        // Reload friends list and update notifications
        loadFriendsList();
        loadFriendRequests();
        checkFriendRequestNotifications();
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

// Load friends list
async function loadFriendsList() {
    if (!window.firebaseDb || !window.currentUser) return;
    
    // Also check for notifications
    checkFriendRequestNotifications();
    
    const currentUserId = window.currentUser.uid;
    const onlineList = document.getElementById('online-friends-list');
    const offlineList = document.getElementById('offline-friends-list');
    
    // Clear existing listeners
    friendsListeners.forEach(unsubscribe => unsubscribe());
    friendsListeners = [];
    onlineStatusListeners.forEach(unsubscribe => unsubscribe());
    onlineStatusListeners = [];
    
    try {
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
            // If item not found, reload the list (shouldn't happen often)
            loadFriendsList();
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
            return userData.state && userData.state.people && userData.state.people.length > 0;
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
        
        // Reload friends list
        loadFriendsList();
        loadTrackerAccessRequests();
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
        
        // Reload friends list
        loadFriendsList();
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
        if (!userDoc.exists || !userDoc.data().state) {
            alert('Friend does not have an active tracker.');
            return;
        }
        
        const friendState = userDoc.data().state;
        
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
        
        // Restore friend's state
        restoreState(friendState);
        
        // Hide main screen and setup, show tracking section
        if (mainScreen) mainScreen.classList.add('hidden');
        if (setupSection) setupSection.classList.add('hidden');
        if (trackingSection) trackingSection.classList.remove('hidden');
        
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
    } catch (error) {
        console.error('Error declining editing access request:', error);
        alert('Error declining request. Please try again.');
    }
}

// Load tracker join requests (requests to join tracker as a person)
async function loadTrackerJoinRequests() {
    if (!window.firebaseDb || !window.currentUser) return;
    
    const currentUserId = window.currentUser.uid;
    const requestsSection = document.getElementById('tracker-join-requests-section');
    const requestsList = document.getElementById('tracker-join-requests-list');
    
    if (!requestsSection || !requestsList) return;
    
    try {
        // Get requests where current user is the tracker owner
        const requestsRef = window.firebaseDb.collection('trackerJoinRequests');
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
                    email: userData.email || '',
                    moneyAmount: requestData.moneyAmount || 0
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
                    <div style="font-size: 0.85em; color: #666;">wants to join your tracker with $${request.moneyAmount.toFixed(2)}</div>
                </div>
                <div class="friend-request-actions">
                    <button class="btn-accept" onclick="approveJoinRequest('${request.id}', '${request.requesterId}', ${request.moneyAmount}, '${request.name.replace(/'/g, "\\'")}')">Approve</button>
                    <button class="btn-decline" onclick="declineJoinRequest('${request.id}')">Decline</button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading tracker join requests:', error);
    }
}

// Approve join request (add requester as a person to tracker)
async function approveJoinRequest(requestId, requesterId, moneyAmount, requesterName) {
    if (!window.firebaseDb || !window.currentUser) return;
    
    const currentUserId = window.currentUser.uid;
    
    try {
        // Load current tracker state
        const userDoc = await window.firebaseDb.collection('users').doc(currentUserId).get();
        if (!userDoc.exists || !userDoc.data().state) {
            alert('Tracker not found.');
            return;
        }
        
        const trackerState = userDoc.data().state;
        
        // Find the next available person ID
        const maxId = trackerState.people.length > 0 
            ? Math.max(...trackerState.people.map(p => p.id))
            : -1;
        const newPersonId = maxId + 1;
        
        // Calculate chips based on tracker configuration
        let chips = 0;
        if (trackerState.sameValue && trackerState.chipValue > 0) {
            chips = Math.round(moneyAmount / trackerState.chipValue);
        } else if (trackerState.sameValue && trackerState.chipsPerStack > 0 && trackerState.stackValue > 0) {
            chips = Math.round((moneyAmount / trackerState.stackValue) * trackerState.chipsPerStack);
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
        
        // Add transaction for the new person
        if (trackerState.transactions === undefined) {
            trackerState.transactions = [];
        }
        
        trackerState.transactions.push({
            id: Date.now(),
            personId: newPersonId,
            personName: requesterName,
            amount: moneyAmount,
            type: 'add',
            timestamp: new Date().toISOString()
        });
        
        // Save updated state
        const stateToSave = prepareStateForFirestore(trackerState);
        await window.firebaseDb.collection('users').doc(currentUserId).set({
            state: stateToSave,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        // Update request status
        const requestRef = window.firebaseDb.collection('trackerJoinRequests').doc(requestId);
        await requestRef.update({ status: 'approved' });
        
        // Reload current state if viewing own tracker
        if (!trackerViewState.isViewingFriendTracker) {
            await loadUserData(currentUserId);
        }
        
        // Reload requests
        loadTrackerJoinRequests();
        
        alert(requesterName + ' has been added to your tracker with $' + moneyAmount.toFixed(2) + '!');
    } catch (error) {
        console.error('Error approving join request:', error);
        alert('Error approving join request. Please try again.');
    }
}

// Decline join request
async function declineJoinRequest(requestId) {
    if (!window.firebaseDb) return;
    
    try {
        const requestRef = window.firebaseDb.collection('trackerJoinRequests').doc(requestId);
        await requestRef.update({ status: 'declined' });
        
        loadTrackerJoinRequests();
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
    
    // Disable reset button if viewing friend's tracker (even with edit access)
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

// Load live tables (friends' active trackers)
async function loadLiveTables() {
    if (!window.firebaseDb || !window.currentUser || !liveTablesContainer) return;
    
    const currentUserId = window.currentUser.uid;
    
    try {
        // Get all friends
        const friendsRef = window.firebaseDb.collection('friends');
        const snapshot1 = await friendsRef.where('user1', '==', currentUserId).get();
        const snapshot2 = await friendsRef.where('user2', '==', currentUserId).get();
        
        const friendIds = new Set();
        snapshot1.forEach(doc => friendIds.add(doc.data().user2));
        snapshot2.forEach(doc => friendIds.add(doc.data().user1));
        
        if (friendIds.size === 0) {
            liveTablesContainer.innerHTML = '<p class="no-live-tables">No friends yet. Add friends to see their live tables!</p>';
            return;
        }
        
        // Get friends with active trackers
        const liveTables = [];
        for (const friendId of friendIds) {
            const hasTracker = await checkFriendHasTracker(friendId);
            if (hasTracker) {
                const userDoc = await window.firebaseDb.collection('users').doc(friendId).get();
                if (userDoc.exists) {
                    const userData = userDoc.data();
                    const friendName = userData.displayName || userData.name || userData.email || 'Unknown';
                    const hasAccess = await checkTrackerAccess(friendId);
                    
                    liveTables.push({
                        friendId: friendId,
                        friendName: friendName,
                        hasAccess: hasAccess
                    });
                }
            }
        }
        
        if (liveTables.length === 0) {
            liveTablesContainer.innerHTML = '<p class="no-live-tables">No live tables available</p>';
            return;
        }
        
        // Render live table widgets
        liveTablesContainer.innerHTML = liveTables.map(table => `
            <div class="live-table-widget">
                <img src="assets/image-c90fcce1-ebd6-43e7-94b7-f3eb6415cdae.png" alt="Poker Table" class="live-table-image" onerror="this.style.display='none'">
                <div class="live-table-info">
                    <h3>${table.friendName}'s Table</h3>
                    <div class="live-table-actions">
                        <button class="btn btn-primary" onclick="showJoinTrackerModal('${table.friendId}', '${table.friendName.replace(/'/g, "\\'")}')">Join Table</button>
                        <button class="btn btn-secondary" onclick="viewFriendTracker('${table.friendId}')">View Table</button>
                    </div>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading live tables:', error);
        liveTablesContainer.innerHTML = '<p class="no-live-tables">Error loading live tables</p>';
    }
}

// Show join tracker modal (request to join)
function showJoinTrackerModal(friendId, friendName) {
    showAmountInputModal(
        `Enter the amount of money you want to put in ${friendName}'s tracker:`,
        (amount) => {
            requestJoinTracker(friendId, friendName, amount);
        },
        friendId,
        friendName
    );
}

// Request to join a friend's tracker (adds user as a person to the tracker)
async function requestJoinTracker(friendId, friendName, moneyAmount) {
    if (!window.firebaseDb || !window.currentUser) return;
    
    const currentUserId = window.currentUser.uid;
    
    try {
        // Check if request already exists
        const requestsRef = window.firebaseDb.collection('trackerJoinRequests');
        const existingRequest = await requestsRef
            .where('trackerOwnerId', '==', friendId)
            .where('requesterId', '==', currentUserId)
            .where('status', '==', 'pending')
            .get();
        
        if (!existingRequest.empty) {
            showAlertModal('You have already sent a join request to this tracker.');
            return;
        }
        
        // Create join request
        await requestsRef.add({
            trackerOwnerId: friendId,
            requesterId: currentUserId,
            moneyAmount: moneyAmount,
            status: 'pending',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        showAlertModal('Join request sent to ' + friendName + '! They will need to approve it to add you to their tracker.');
        
        // Also create read-only access so they can view
        const accessRef = window.firebaseDb.collection('trackerAccess');
        const existingAccess = await accessRef
            .where('trackerOwnerId', '==', friendId)
            .where('userId', '==', currentUserId)
            .where('status', '==', 'active')
            .get();
        
        if (existingAccess.empty) {
            await accessRef.add({
                trackerOwnerId: friendId,
                userId: currentUserId,
                status: 'active',
                hasEditAccess: false,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        
        // Reload live tables
        loadLiveTables();
    } catch (error) {
        console.error('Error requesting to join tracker:', error);
        showAlertModal('Error sending join request. Please try again.');
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
    
    messageEl.textContent = message || 'Enter the amount of money you want to put in the tracker:';
    inputEl.value = '';
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

// Confirm amount input
function confirmAmountInput() {
    const inputEl = document.getElementById('amount-input-field');
    const amount = inputEl.value.trim();
    
    if (amount === '') {
        showAlertModal('Please enter a valid amount greater than 0.');
        return;
    }
    
    const moneyAmount = parseFloat(amount);
    if (isNaN(moneyAmount) || moneyAmount <= 0) {
        showAlertModal('Please enter a valid amount greater than 0.');
        return;
    }
    
    closeAmountInputModal();
    
    if (amountInputCallback) {
        amountInputCallback(moneyAmount);
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

// Make functions globally accessible
window.showAddForm = showAddForm;
window.showSubtractForm = showSubtractForm;
window.hideForm = hideForm;
window.submitAdd = submitAdd;
window.submitSubtract = submitSubtract;
window.updatePersonName = updatePersonName;
window.updatePersonMoney = updatePersonMoney;
window.resetData = resetData;
window.showAddPersonForm = showAddPersonForm;
window.hideAddPersonForm = hideAddPersonForm;
window.submitAddPerson = submitAddPerson;
window.togglePersonalLog = togglePersonalLog;
window.showSettlementModal = showSettlementModal;
window.closeSettlementModal = closeSettlementModal;
window.showHouseSettlement = showHouseSettlement;
window.showPlayerToPlayerSettlement = showPlayerToPlayerSettlement;
window.backToSettlementOptions = backToSettlementOptions;
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
window.searchFriend = searchFriend;
window.sendFriendRequest = sendFriendRequest;
window.acceptFriendRequest = acceptFriendRequest;
window.declineFriendRequest = declineFriendRequest;
window.copyInviteLink = copyInviteLink;
window.updateOnlineStatus = updateOnlineStatus;
window.showFriendsButton = showFriendsButton;
window.hideFriendsButton = hideFriendsButton;
window.checkFriendRequestNotifications = checkFriendRequestNotifications;
window.loadState = loadState; // Make available for firebase-init.js
window.joinFriendTracker = joinFriendTracker;
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
window.closeAlertModal = closeAlertModal;
window.requestJoinTracker = requestJoinTracker;
window.loadLiveTables = loadLiveTables;
window.approveJoinRequest = approveJoinRequest;
window.declineJoinRequest = declineJoinRequest;
window.revokeFriendEditAccess = revokeFriendEditAccess;

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
