# Task: rewrite FORGE app text in plain English and translate it to Hindi and Marathi

FORGE is a fitness and Indian-nutrition app (workouts, food logging, steps, water, AI coach). Its users are
young Indians, many not native English speakers. The owner says the current text is cramped and wordy:
"Include only what is important while keeping it simple and sounding clear and proper English".

## Input
Files `in_00.json` … `in_NN.json` in this folder. Each is a JSON array of English strings exactly as they
appear in the app (button labels, headings, hints, error messages, empty states, landing-page copy).

## Output
For EVERY input file `in_XX.json` write `out_XX.json`: a JSON array with one object per input string, same order, same count:
`{"en": "<input string, copied byte-for-byte>", "new_en": "...", "hi": "...", "mr": "..."}`

Write each out file as soon as its batch is done (do not hold everything until the end). Valid JSON, UTF-8, no comments.

## new_en rules (the rewritten English)
- Plain, correct, friendly English. Short sentences. Sentence case (not ALL CAPS, not Title Case For Every Word) except proper nouns and acronyms.
- Keep every fact the original states (numbers, limits, warnings, privacy promises). Cut filler, hedging, repetition and jargon. Never add claims.
- Never longer than the original. If the original is already clear and short, return it unchanged.
- Keep exactly as-is: food and dish names, exercise names, brand/product names (FORGE, Gemini, Google, Strong, Hevy, Supabase, Android), Indian state names, units (kg, kcal, g, ml, km), acronyms (AI, RPE, RIR, BMR, TDEE, PR, CSV), symbols and punctuation wrappers like "+ ", " →", "·", "…", "—", and any text that looks like code, a CSS value, a file name or a URL.
- Keep it usable in the same spot: a button label stays a short button label, a heading stays a heading.

## hi / mr rules (translations of new_en)
- Natural everyday Hindi (Devanagari) and Marathi (Devanagari), the way a good Indian fitness app speaks. Not literary or Sanskritised.
- Keep in English (Latin script): food/dish names, exercise names, brand names, units, acronyms, gym words people say in English (set, reps, rest timer, warm-up, deload, protein, carbs, fat, calories may be written in Devanagari if that reads naturally: प्रोटीन, कैलोरी).
- Keep the same symbols, numbers and punctuation wrappers. Translate code-like strings as an exact copy.
- Keep it as short as the English.

## Quality bar
Every out file must have the same number of entries as its in file and `en` must equal the input exactly.
When finished, run a quick check (e.g. a short python script) that verifies counts and exact `en` matches for every file, fix any mismatch, and print the result.
