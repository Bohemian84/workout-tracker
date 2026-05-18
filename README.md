## Workout Tracker

This app saves workout history locally when signed out and can sync history between devices with Firebase when signed in with Google.

## Firebase setup

1. Create a Firebase project.
2. In Firebase Authentication, enable Google as a sign-in provider.
3. In Authentication settings, add your Vercel domain to Authorized domains.
4. In Firestore Database, create a database.
5. Add the rules from `firestore.rules` in the Firebase console so each signed-in user can only read and write their own workout history.
6. In Project settings, create a Web app. The Firebase config values are already saved in `src/firebase.js`.

When a user signs in for the first time, any workout history already saved in that browser is uploaded to their account. After that, signed-in history syncs through Firestore and signed-out history remains local to the device.
