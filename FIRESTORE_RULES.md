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
    // Users collection - allow reading for friend search, writing only own data
    match /users/{userId} {
      // Allow users to read other users' basic info (for friend search)
      allow read: if request.auth != null;
      // Allow users to write only their own data
      allow write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Friend requests
    match /friendRequests/{requestId} {
      // Users can read requests they sent or received
      allow read: if request.auth != null && 
        (resource.data.to == request.auth.uid || resource.data.from == request.auth.uid);
      // Users can create requests where they are the sender
      allow create: if request.auth != null && request.auth.uid == request.resource.data.from;
      // Users can update requests they received (to accept/decline)
      allow update: if request.auth != null && request.auth.uid == resource.data.to;
    }
    
    // Friends collection
    match /friends/{friendId} {
      // Users can read friendships they are part of
      allow read: if request.auth != null && 
        (resource.data.user1 == request.auth.uid || resource.data.user2 == request.auth.uid);
      // Users can create friendships where they are one of the users
      allow create: if request.auth != null && 
        (request.resource.data.user1 == request.auth.uid || request.resource.data.user2 == request.auth.uid);
    }
    
    // Online status
    match /onlineStatus/{userId} {
      // Users can read anyone's online status (for friends list)
      allow read: if request.auth != null;
      // Users can only update their own online status
      allow write: if request.auth != null && request.auth.uid == userId;
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

### Security Note:
These rules allow reading user emails/names for friend search. If you want stricter privacy, you could:
- Create a separate `userProfiles` collection with only public info (email, displayName)
- Keep the `users` collection private and only store game state there
