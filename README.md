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

## Optional warm-up sets

- Each exercise in Current Session has an optional warm-up plan, independent of its working sets. The easy set is calculated automatically at 35% of the working weight currently shown in the session, rounded up to the selected equipment weight step. For example, a 135 lb working weight and a 5 lb step produce a 50 lb easy set. It never exceeds the working weight, even for very light loads or large steps. This is an editable starting estimate, not a measured 20RM.
- Generate Warm-ups starts with 10 reps at that easy weight. Intermediate sets default to 6 reps: one set at working weights up to and including 50 lb, two above 50 through 200 lb, and three above 200 through 400 lb. Each further 200 lb band adds one intermediate set. The count is editable, up to 18 intermediate sets (20 warm-up sets total).
- The first intermediate target is halfway between the easy and working weights; additional intermediate targets are evenly spaced from that midpoint toward, but below, the working weight. Intermediate targets round down to the selected equipment weight step, without going below the easy weight. Small weight gaps can produce repeated loads; all generated weights and reps remain editable.
- The final potentiation set is generated at exactly the working weight for 2 reps, without rounding or a percentage selector. Older saved easy-weight and 110% settings do not affect newly generated plans; existing logged rows remain unchanged. Every generated set remains editable to record actual weights and reps.
- Check off individual warm-up sets as completed. Editing a set clears its completion checkmark. Saving an exercise or full session preserves the checkmarks without marking unperformed warm-ups as completed. History separates completed and uncompleted warm-ups from the working-set summary.
- Working-weight or plan-setting changes never overwrite existing warm-up entries. Regenerate Warm-ups explicitly replaces the plan after confirmation; it does not change working sets. Turning warm-ups off retains the draft entries until the exercise/session is saved.
- Warm-ups persist with draft recovery, exercise saving/editing, Firebase history sync, and export/import. They are stored separately and never count toward normal or deload progression. Existing history remains unchanged, and older backups are still accepted.

Run `npm test` to check warm-ups, per-set recording, ordering, scrolling, and recommendation math, and `npm run build` to verify the production build.

## Firebase setup

1. Create a Firebase project.
2. In Firebase Authentication, enable Google as a sign-in provider.
3. In Authentication settings, add your Vercel domain to Authorized domains.
4. In Firestore Database, create a database.
5. Add the rules from `firestore.rules` in the Firebase console so each signed-in user can only read and write their own workout history.
6. In Project settings, create a Web app. The Firebase config values are already saved in `src/firebase.js`.

When a user signs in for the first time, any workout history already saved in that browser is uploaded to their account. After that, signed-in history syncs through Firestore and signed-out history remains local to the device.
