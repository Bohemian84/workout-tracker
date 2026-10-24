## Workout Tracker

This app saves workout history locally when signed out and can sync history between devices with Firebase when signed in with Google.

## Workout order

- Use All Recommendations adds exercises in the order of the most recent workout in History, including a deload workout. Recommendations not present in that workout follow afterward in their existing alphabetical order.
- Exercises already in Current Session stay in place and are not duplicated. Drag to adjust the order as needed; saving the full session remembers that order for next time.
- Ordering does not change recommendation targets or which workouts are used for progression.

## Rep ranges and progression

- Current Session records reps separately for each set, with one weight for the exercise. Add Exercise and recommendations prefill each set; the individual counts remain editable until the session is saved. Zero reps are allowed, but blank, negative, or fractional counts cannot be saved.
- Save Exercise, Edit, draft recovery, history, Firebase sync, and export/import retain every set's reps. Existing history is not rewritten; older records without per-set counts keep their original uniform-rep summary.
- Normal recommendations keep the completed number of sets and each set's reps, adding one rep only to the lowest-rep set. Ties are resolved in set order: 14 / 12 / 10 becomes 14 / 12 / 11, and 14 / 12 / 12 becomes 14 / 13 / 12. Even sets below the selected range increase by only one rep, rather than jumping straight to the range minimum. Older uniform-rep records are treated as equal sets for recommendations without rewriting history.
- Exercises default to an 8-14 rep progression range. Select 10-20 for any exercise in Add Exercise, Current Session, or Recommendations.
- Ranges are remembered per exercise name and sync with the signed-in account. Changing a range updates future suggestions, not current workout numbers or historical sets, reps, and weights.
- Weight only increases once every set reaches the range's upper limit. The exercise's existing weight increment is added, and all sets receive a new rep target using the existing estimate of 0.6 fewer reps per percentage point of added weight, rounded up and limited to the selected range. This is an editable estimate, not a prediction of lifting capacity.
- Deloads retain 90% weight (rounded down to an available increment unless that cuts more than 25%), half the sets rounded up, and 75% of the lowest completed set's reps rounded to a whole rep. Reps are capped at the selected range's maximum before reducing them. This usually means 6-11 reps for 8-14 training or 8-15 reps for 10-20 training; lower actual reps remain lower. Deloads remain excluded from progression by default.
- Existing history without range settings remains valid and uses the new default for future recommendations. Export includes history and range preferences; Import accepts both the new backup format and older history-only arrays.

Run `npm test` to check per-set recording, ordering, scrolling, and recommendation math, and `npm run build` to verify the production build.

## Firebase setup

1. Create a Firebase project.
2. In Firebase Authentication, enable Google as a sign-in provider.
3. In Authentication settings, add your Vercel domain to Authorized domains.
4. In Firestore Database, create a database.
5. Add the rules from `firestore.rules` in the Firebase console so each signed-in user can only read and write their own workout history.
6. In Project settings, create a Web app. The Firebase config values are already saved in `src/firebase.js`.

When a user signs in for the first time, any workout history already saved in that browser is uploaded to their account. After that, signed-in history syncs through Firestore and signed-out history remains local to the device.
