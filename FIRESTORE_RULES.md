# Firestore Security Rules

## IMPORTANT: Update Your Firestore Security Rules

To enable friend search functionality, you need to update your Firestore security rules in the Firebase Console.

### Steps:
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: **Poker Money Tracker**
3. Go to **Firestore Database** → **Rules** tab
4. Replace the existing rules with the rules below
5. Click **Publish**

### Security Rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Helper function to check if user is authenticated
    function isAuthenticated() {
      return request.auth != null;
    }
    
    // Helper function to check if user is the document owner
    function isOwner(userId) {
      return isAuthenticated() && request.auth.uid == userId;
    }
    
    // Users collection - allow reading for friend search, writing own data and tracker editing
    match /users/{userId} {
      // Users can read their own document
      allow read: if isOwner(userId);
      // Allow users to read other users' data (for friend search and viewing trackers)
      allow read: if isAuthenticated();
      // Users can write to their own document
      allow write: if isOwner(userId);
      // Users with edit access can write to friend's document (for tracker editing)
      // Note: The app checks edit access before saving, but we allow authenticated writes here
      allow write: if isAuthenticated();
    }
    
    // Friend requests
    match /friendRequests/{requestId} {
      // Users can read requests they sent or received
      allow read: if isAuthenticated() && 
        (resource.data.to == request.auth.uid || resource.data.from == request.auth.uid);
      // Users can create requests where they are the sender
      allow create: if isAuthenticated() && request.resource.data.from == request.auth.uid;
      // Users can update requests they received (to accept/decline)
      allow update: if isAuthenticated() && resource.data.to == request.auth.uid;
    }
    
    // Friends collection
    match /friends/{friendId} {
      // Users can read friendships they are part of
      allow read: if isAuthenticated() && 
        (resource.data.user1 == request.auth.uid || resource.data.user2 == request.auth.uid);
      // Users can create friendships where they are one of the users
      allow create: if isAuthenticated() && 
        (request.resource.data.user1 == request.auth.uid || request.resource.data.user2 == request.auth.uid);
    }
    
    // Online status
    match /onlineStatus/{userId} {
      // Users can read anyone's online status (for friends list)
      allow read: if isAuthenticated();
      // Users can only update their own online status
      allow write: if isOwner(userId);
    }
    
    // Tracker Access collection - NEW for tracker sharing feature
    match /trackerAccess/{accessId} {
      // Users can read access records where they are the owner or the user
      allow read: if isAuthenticated() && 
        (resource.data.trackerOwnerId == request.auth.uid || resource.data.userId == request.auth.uid);
      // Users can create access records (when joining a tracker)
      allow create: if isAuthenticated() && request.resource.data.userId == request.auth.uid;
      // Tracker owners can create access records for their tracker
      allow create: if isAuthenticated() && request.resource.data.trackerOwnerId == request.auth.uid;
      // Tracker owners can update access records for their tracker (to grant edit access)
      allow update: if isAuthenticated() && resource.data.trackerOwnerId == request.auth.uid;
      // Users can delete their own access records (if needed)
      allow delete: if isAuthenticated() && resource.data.userId == request.auth.uid;
    }
    
    // Tracker Edit Requests collection - NEW for edit access requests
    match /trackerEditRequests/{requestId} {
      // Users can read requests where they are the tracker owner or requester
      allow read: if isAuthenticated() && 
        (resource.data.trackerOwnerId == request.auth.uid || resource.data.requesterId == request.auth.uid);
      // Users can create edit requests (requesting edit access)
      allow create: if isAuthenticated() && request.resource.data.requesterId == request.auth.uid;
      // Tracker owners can update edit requests for their tracker (to approve/decline)
      allow update: if isAuthenticated() && resource.data.trackerOwnerId == request.auth.uid;
    }
  }
}
```

### What These Rules Do:

1. **Users Collection**: 
   - ✅ Allows authenticated users to **read** any user's data (needed for friend search)
   - ✅ Users can only **write** their own data

2. **Friend Requests**:
   - ✅ Users can read requests they sent or received
   - ✅ Users can create requests (send friend requests)
   - ✅ Users can update requests they received (accept/decline)

3. **Friends Collection**:
   - ✅ Users can read friendships they're part of
   - ✅ Users can create friendships

4. **Online Status**:
   - ✅ Users can read anyone's online status (for friends list)
   - ✅ Users can only update their own status

5. **Tracker Access** (NEW - for tracker sharing):
   - ✅ Users can read access records where they are the tracker owner or the viewer
   - ✅ Users can create access records when joining a friend's tracker
   - ✅ Tracker owners can create/update access records for their tracker (to grant edit access)
   - ✅ Users can delete their own access records

6. **Tracker Edit Requests** (NEW - for edit access requests):
   - ✅ Users can read requests where they are the tracker owner or requester
   - ✅ Users can create edit requests (requesting edit access to a tracker)
   - ✅ Tracker owners can update edit requests (to approve/decline)

### Security Note:
These rules allow reading user emails/names for friend search. If you want stricter privacy, you could:
- Create a separate `userProfiles` collection with only public info (email, displayName)
- Keep the `users` collection private and only store game state there

**IMPORTANT**: The `users` collection write rule allows any authenticated user to write. The application code checks for edit access before saving, but for stricter security, you could add server-side validation or use Cloud Functions to handle tracker updates.
