## Workout Tracker

This app saves workout history locally when signed out and can sync history between devices with Firebase when signed in with Google.

## Rep ranges and progression

- Exercises default to an 8-14 rep progression range. Select 10-20 for any exercise in Add Exercise, Current Session, or Recommendations.
- Ranges are remembered per exercise name and sync with the signed-in account. Changing a range updates future suggestions, not current workout numbers or historical sets, reps, and weights.
- Below the upper limit, recommendations add one rep at the same weight. At or above it, they add the exercise's existing weight increment and estimate a rep reduction of 0.6 reps per percentage point of added weight, rounded up and limited to the selected range. This is an editable estimate, not a prediction of lifting capacity.
- Deloads retain 90% weight (rounded down to an available increment unless that cuts more than 25%), half the sets rounded up, and 75% of completed reps rounded to a whole rep. Reps are capped at the selected range's maximum before reducing them. This usually means 6-11 reps for 8-14 training or 8-15 reps for 10-20 training; lower actual reps remain lower. Deloads remain excluded from progression by default.
- Existing history without range settings remains valid and uses the new default for future recommendations. Export includes history and range preferences; Import accepts both the new backup format and older history-only arrays.

Run `npm test` to check recommendation math and `npm run build` to verify the production build.

## Firebase setup

1. Create a Firebase project.
2. In Firebase Authentication, enable Google as a sign-in provider.
3. In Authentication settings, add your Vercel domain to Authorized domains.
4. In Firestore Database, create a database.
5. Add the rules from `firestore.rules` in the Firebase console so each signed-in user can only read and write their own workout history.
6. In Project settings, create a Web app. The Firebase config values are already saved in `src/firebase.js`.

When a user signs in for the first time, any workout history already saved in that browser is uploaded to their account. After that, signed-in history syncs through Firestore and signed-out history remains local to the device.
