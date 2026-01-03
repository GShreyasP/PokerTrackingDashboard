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

// DOM Elements
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
    
    // Convert timestamp strings back to Date objects
    if (state.transactions) {
        state.transactions.forEach(t => {
            t.timestamp = new Date(t.timestamp);
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
        setupSection.classList.add('hidden');
        trackingSection.classList.remove('hidden');
        renderPeopleWidgets();
        updateTotalPot();
        updateChipValueDisplay();
        updateTotalChips();
        renderLog();
    } else {
        // No data, show setup section
        setupSection.classList.remove('hidden');
        trackingSection.classList.add('hidden');
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
            // If no local data either, show setup section
            if (!hasLocalData) {
                showSetupSection();
            }
        }
    } catch (error) {
        console.error('Error loading user data:', error);
        // Fall back to localStorage
        const hasLocalData = loadState();
        if (!hasLocalData) {
            showSetupSection();
        }
    }
}

// Show setup section
function showSetupSection() {
    const setupSection = document.getElementById('setup-section');
    const trackingSection = document.getElementById('tracking-section');
    if (setupSection) setupSection.classList.remove('hidden');
    if (trackingSection) trackingSection.classList.add('hidden');
}

// Save state to Firestore (if signed in) or localStorage (fallback)
async function saveState() {
    // If user is signed in, save to Firestore
    if (window.currentUser && window.firebaseDb && window.firebaseReady) {
        try {
            const userId = window.currentUser.uid;
            const docRef = window.firebaseDb.collection('users').doc(userId);
            await docRef.set({
                state: state,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (error) {
            console.error('Error saving to Firestore:', error);
            // Fall back to localStorage
            try {
                localStorage.setItem('pokerTrackerState', JSON.stringify(state));
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
        
        const timeStr = transaction.timestamp.toLocaleTimeString();
        const dateStr = transaction.timestamp.toLocaleDateString();
        // Reverse signs: add = negative (putting money in), remove = positive (returning money)
        const sign = transaction.type === 'add' ? '-' : '+';
        const typeText = transaction.type === 'add' ? 'added' : 'removed';
        
        logEntry.innerHTML = `
            <div class="log-time">${dateStr} ${timeStr}</div>
            <div class="log-details">
                <span class="log-action">${typeText}</span>
                <span class="log-amount">${sign}$${transaction.amount.toFixed(2)}</span>
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
        
        const timeStr = transaction.timestamp.toLocaleTimeString();
        const dateStr = transaction.timestamp.toLocaleDateString();
        // Reverse signs: add = negative (putting money in), remove = positive (returning money)
        const sign = transaction.type === 'add' ? '-' : '+';
        const typeText = transaction.type === 'add' ? 'added' : 'removed';
        
        logEntry.innerHTML = `
            <div class="log-time">${dateStr} ${timeStr}</div>
            <div class="log-details">
                <span class="log-person">${transaction.personName}</span>
                <span class="log-action">${typeText}</span>
                <span class="log-amount">${sign}$${transaction.amount.toFixed(2)}</span>
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
        } else {
            sidebar.classList.add('hidden');
            overlay.classList.add('hidden');
        }
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
            if (userDoc.exists) {
                const userData = userDoc.data();
                requests.push({
                    id: doc.id,
                    fromUserId: fromUserId,
                    name: userData.displayName || userData.email || 'Unknown',
                    email: userData.email || ''
                });
            }
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
                    <div class="friend-search-result-email">${request.email}</div>
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
            if (userDoc.exists) {
                const userData = userDoc.data();
                const onlineStatusDoc = await window.firebaseDb.collection('onlineStatus').doc(friendId).get();
                const isOnline = onlineStatusDoc.exists && onlineStatusDoc.data().isOnline === true;
                
                friends.push({
                    id: friendId,
                    name: userData.displayName || userData.email || 'Unknown',
                    email: userData.email || '',
                    isOnline: isOnline
                });
            }
        }
        
        // Separate online and offline
        const onlineFriends = friends.filter(f => f.isOnline);
        const offlineFriends = friends.filter(f => !f.isOnline);
        
        // Render online friends
        if (onlineFriends.length === 0) {
            onlineList.innerHTML = '<p class="no-friends">No online friends</p>';
        } else {
            onlineList.innerHTML = onlineFriends.map(friend => `
                <div class="friend-item">
                    <div class="friend-item-info">
                        <div class="friend-item-avatar">${friend.name.charAt(0).toUpperCase()}</div>
                        <div class="friend-item-details">
                            <div class="friend-item-name">${friend.name}</div>
                            <div class="friend-item-status online">Online</div>
                        </div>
                    </div>
                </div>
            `).join('');
        }
        
        // Render offline friends
        if (offlineFriends.length === 0) {
            offlineList.innerHTML = '<p class="no-friends">No offline friends</p>';
        } else {
            offlineList.innerHTML = offlineFriends.map(friend => `
                <div class="friend-item">
                    <div class="friend-item-info">
                        <div class="friend-item-avatar">${friend.name.charAt(0).toUpperCase()}</div>
                        <div class="friend-item-details">
                            <div class="friend-item-name">${friend.name}</div>
                            <div class="friend-item-status offline">Offline</div>
                        </div>
                    </div>
                </div>
            `).join('');
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

// Update friend online status in UI
function updateFriendOnlineStatus(friendId, isOnline) {
    const onlineList = document.getElementById('online-friends-list');
    const offlineList = document.getElementById('offline-friends-list');
    
    // Find and move friend between lists
    const allItems = [...onlineList.querySelectorAll('.friend-item'), ...offlineList.querySelectorAll('.friend-item')];
    allItems.forEach(item => {
        if (item.dataset.friendId === friendId) {
            item.remove();
        }
    });
    
    // Re-render friends list
    loadFriendsList();
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
