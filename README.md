# Arcle

Daily anime guessing game: five hidden anime, one guess each, scored by how close you get. One static page, no server.

## Files

| File | What it is |
|---|---|
| `data.js` | The anime list (one row per anime) |
| `engine.js` | Hidden-anime picks, clues, daily generator, closeness scoring |
| `app.js` | Screens, timer, autocomplete, saving |
| `template.html` | Page layout and styles |
| `build.py` | Joins the four files above into `index.html` |
| `validate.js` | Checks that upcoming puzzles follow all the rules |
| `index.html` | The built game. This is what GitHub Pages serves. |

## Making a change

1. Edit `data.js`, `engine.js`, `app.js` or `template.html`.
2. Build: `python3 build.py`
3. Check: `node validate.js 365` (must end with "All 365 days pass every rule")
4. Test locally: open `index.html?date=2026-11-05` in a browser.
5. Commit and push. GitHub Pages updates in about a minute.

## Rules for data.js

- Never reorder or delete rows. An anime's id is its row number, and saved games store ids.
- Add new anime only at the bottom of the list.
- Any change to `data.js` or `engine.js` changes which prompts every day gets, including past days.
