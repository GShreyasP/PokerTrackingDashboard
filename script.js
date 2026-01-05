// ... existing code ...

window.showAnalyticsPage = showAnalyticsPage;

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
            updatedAnalytics = analytics.filter((_, i) => i !== index);
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

window.deleteAnalyticsEntry = deleteAnalyticsEntry;

// ... existing code ...
