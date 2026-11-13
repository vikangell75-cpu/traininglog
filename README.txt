TRAINING LOG v2 — GitHub Pages / Telegram Mini App

What changed:
- No fixed SESSION A/B/C picker.
- Workout Library: create, edit, delete reusable workouts.
- Exercise Library: create, edit, search exercises once and reuse them everywhere.
- Any saved workout can be loaded on any date.
- A day is an independent snapshot: editing today's plan does not change the saved workout.
- Exercises can be added to the current day freely, even without a saved workout.
- Current day can be saved back to Workout Library as a new reusable workout.
- Actual sets / weight / reps / RPE / pain / notes are logged per day.
- Progress follows the exercise ID across all workouts.
- Existing v1 A/B/C plans are migrated automatically when possible.

DEPLOY UPDATE TO GITHUB PAGES
1. Open your existing training-log repository.
2. Replace index.html, app.js and styles.css with the files from this folder.
   Keep .nojekyll in the repository root.
3. Commit the changes to main.
4. GitHub Pages will update the same github.io URL automatically.
5. BotFather does NOT need a new URL if the repository / Pages URL stayed the same.

Important: open the Mini App in Telegram for Telegram CloudStorage sync.
