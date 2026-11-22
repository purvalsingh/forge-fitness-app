/**
 * Gym staples the source dataset lacks (FORGE's own text). Appended by build-exercises.mjs; run on its own to merge
 * into the current public/exercises.json and the Android asset copy:  node scripts/exercise-staples.mjs
 */
import fs from 'node:fs'

const S = (id, name, muscle, secondary, body_part, equipment, steps, steps_hi, extra = {}) => ({
  id: 'f-' + id, name, muscle, secondary, body_part, equipment, kind: 'weight_reps',
  ...(equipment === 'barbell' ? { bar_kg: 20 } : equipment === 'smith machine' ? { bar_kg: 15 } : {}), ...extra, steps, steps_hi,
})

export const STAPLES = [
  S('barbell-hip-thrust', 'Barbell Hip Thrust', 'glutes', ['hamstrings', 'adductors'], 'upper legs', 'barbell', [
    'Sit on the floor with your upper back against a bench and a padded barbell over your hips.',
    'Plant your feet flat, shoulder-width apart, shins vertical at the top.',
    'Drive through your heels and squeeze your glutes to lift the bar until your hips are level with your knees and shoulders.',
    'Keep your chin tucked and ribs down; do not arch your lower back.',
    'Pause one second at the top, then lower under control.',
  ], [
    'बेंच से ऊपरी पीठ टिकाकर फर्श पर बैठें, गद्देदार बारबेल कूल्हों पर रखें।',
    'पैर कंधे की चौड़ाई पर ज़मीन पर रखें; ऊपर पहुँचने पर पिंडलियाँ सीधी खड़ी हों।',
    'एड़ियों से ज़ोर लगाकर और ग्लूट्स को कसकर बार उठाएँ, जब तक कूल्हे घुटनों और कंधों की सीध में न आ जाएँ।',
    'ठुड्डी अंदर और पसलियाँ नीचे रखें; कमर को न मोड़ें।',
    'ऊपर एक सेकंड रुकें, फिर धीरे से नीचे लाएँ।',
  ]),
  S('dumbbell-hip-thrust', 'Dumbbell Hip Thrust', 'glutes', ['hamstrings'], 'upper legs', 'dumbbell', [
    'Sit with your upper back against a bench and hold one dumbbell on your hips.',
    'Feet flat, shoulder-width apart.',
    'Drive through your heels to lift your hips until your body is straight from knees to shoulders.',
    'Squeeze your glutes at the top, then lower slowly.',
  ], [
    'बेंच से ऊपरी पीठ टिकाकर बैठें और एक डम्बल कूल्हों पर पकड़ें।',
    'पैर ज़मीन पर, कंधे की चौड़ाई पर।',
    'एड़ियों से ज़ोर लगाकर कूल्हे उठाएँ, जब तक घुटनों से कंधों तक शरीर सीधा न हो जाए।',
    'ऊपर ग्लूट्स कसें, फिर धीरे से नीचे लाएँ।',
  ]),
  S('machine-hip-thrust', 'Machine Hip Thrust', 'glutes', ['hamstrings'], 'upper legs', 'machine', [
    'Set the pad across your hips and your upper back on the back rest.',
    'Place your feet flat on the platform, shoulder-width apart.',
    'Push through your heels to raise your hips to full extension, squeezing your glutes.',
    'Lower under control without letting the weight stack touch.',
  ], [
    'पैड को कूल्हों पर और ऊपरी पीठ को बैक रेस्ट पर सेट करें।',
    'पैर प्लेटफ़ॉर्म पर कंधे की चौड़ाई पर रखें।',
    'एड़ियों से धक्का देकर कूल्हों को पूरा ऊपर उठाएँ और ग्लूट्स कसें।',
    'वज़न को बिना टकराए धीरे से नीचे लाएँ।',
  ]),
  S('smith-hip-thrust', 'Smith Machine Hip Thrust', 'glutes', ['hamstrings'], 'upper legs', 'smith machine', [
    'Set a bench beside the Smith machine and sit with your upper back on it, bar padded over your hips.',
    'Feet flat, shoulder-width apart; unhook the bar.',
    'Drive your hips up until level with knees and shoulders, squeezing your glutes.',
    'Lower slowly and re-rack after the set.',
  ], [
    'स्मिथ मशीन के पास बेंच रखें, ऊपरी पीठ उस पर टिकाएँ और गद्देदार बार कूल्हों पर रखें।',
    'पैर ज़मीन पर कंधे की चौड़ाई पर; बार को अनहुक करें।',
    'कूल्हों को घुटनों और कंधों की सीध तक उठाएँ, ग्लूट्स कसें।',
    'धीरे से नीचे लाएँ और सेट के बाद बार को वापस हुक करें।',
  ]),
  S('single-leg-hip-thrust', 'Single-Leg Hip Thrust', 'glutes', ['hamstrings'], 'upper legs', 'bodyweight', [
    'Sit with your upper back against a bench, one foot flat on the floor and the other leg lifted.',
    'Drive through the planted heel to raise your hips level, keeping your pelvis square.',
    'Squeeze at the top, lower slowly, then switch legs.',
  ], [
    'बेंच से ऊपरी पीठ टिकाकर बैठें, एक पैर ज़मीन पर और दूसरा ऊपर उठा हुआ।',
    'ज़मीन वाले पैर की एड़ी से ज़ोर लगाकर कूल्हे सीध में उठाएँ, श्रोणि सीधी रखें।',
    'ऊपर कसें, धीरे से नीचे लाएँ, फिर पैर बदलें।',
  ], { kind: 'bodyweight_reps', per_side: true }),
  S('bulgarian-split-squat', 'Dumbbell Bulgarian Split Squat', 'quads', ['glutes', 'adductors'], 'upper legs', 'dumbbell', [
    'Hold dumbbells at your sides and rest the top of your back foot on a bench behind you.',
    'Lower straight down until your front thigh is about parallel, front knee tracking over your toes.',
    'Drive through your front foot to stand back up. Finish all reps, then switch legs.',
  ], [
    'दोनों हाथों में डम्बल पकड़ें और पिछले पैर का ऊपरी हिस्सा पीछे रखी बेंच पर टिकाएँ।',
    'सीधे नीचे जाएँ जब तक आगे वाली जांघ लगभग समानांतर न हो; आगे का घुटना पंजों की दिशा में रहे।',
    'आगे वाले पैर से ज़ोर लगाकर खड़े हों। सारे रेप पूरे करके पैर बदलें।',
  ], { per_side: true }),
  S('seated-cable-row', 'Seated Cable Row', 'upper back', ['lats', 'biceps', 'rear delts'], 'back', 'cable', [
    'Sit at the row station with feet on the platform and knees slightly bent; grab the handle.',
    'Sit tall, then pull the handle to your lower ribs, driving your elbows back and squeezing your shoulder blades.',
    'Return slowly until your arms are straight without rounding your back.',
  ], [
    'रो स्टेशन पर बैठें, पैर प्लेटफ़ॉर्म पर और घुटने हल्के मुड़े; हैंडल पकड़ें।',
    'सीधे बैठें, फिर कोहनियाँ पीछे ले जाते हुए हैंडल को निचली पसलियों तक खींचें और कंधे की हड्डियाँ दबाएँ।',
    'पीठ गोल किए बिना धीरे से हाथ सीधे होने तक वापस जाएँ।',
  ]),
  S('cable-face-pull', 'Cable Face Pull', 'delts', ['upper back', 'traps'], 'shoulders', 'cable', [
    'Set a rope at upper-chest height and grab it with thumbs facing back.',
    'Pull the rope toward your face, splitting the ends and driving your elbows high and back.',
    'Pause with your hands beside your ears, then return slowly.',
  ], [
    'रस्सी को ऊपरी छाती की ऊँचाई पर लगाएँ और अंगूठे पीछे की ओर रखते हुए पकड़ें।',
    'रस्सी को चेहरे की ओर खींचें, सिरों को अलग करते हुए कोहनियाँ ऊँची और पीछे ले जाएँ।',
    'हाथ कानों के पास रोकें, फिर धीरे से वापस जाएँ।',
  ]),
  S('pec-deck', 'Pec Deck Fly', 'pectorals', ['delts'], 'chest', 'machine', [
    'Adjust the seat so the handles are at chest height; sit with your back flat on the pad.',
    'With a slight bend in your elbows, bring the handles together in front of your chest.',
    'Squeeze your chest, then open slowly until you feel a stretch.',
  ], [
    'सीट ऐसे सेट करें कि हैंडल छाती की ऊँचाई पर हों; पीठ पैड से सटाकर बैठें।',
    'कोहनियाँ हल्की मुड़ी रखते हुए हैंडलों को छाती के सामने मिलाएँ।',
    'छाती कसें, फिर खिंचाव महसूस होने तक धीरे से खोलें।',
  ]),
  S('incline-dumbbell-press', 'Incline Dumbbell Press', 'pectorals', ['delts', 'triceps'], 'chest', 'dumbbell', [
    'Set a bench to 30–45 degrees and sit back with a dumbbell in each hand at shoulder level.',
    'Press the dumbbells up over your upper chest until your arms are nearly straight.',
    'Lower slowly to the sides of your chest, elbows about 45 degrees from your body.',
  ], [
    'बेंच को 30–45 डिग्री पर रखें और कंधे की ऊँचाई पर दोनों हाथों में डम्बल लेकर पीछे टिकें।',
    'डम्बलों को ऊपरी छाती के ऊपर तब तक दबाएँ जब तक हाथ लगभग सीधे न हो जाएँ।',
    'धीरे से छाती के किनारों तक लाएँ, कोहनियाँ शरीर से लगभग 45 डिग्री पर।',
  ]),
]

/** Adds or replaces the staples by id. */
export function withStaples(exercises) {
  const ids = new Set(STAPLES.map(x => x.id))
  return [...exercises.filter(x => !ids.has(x.id)), ...STAPLES]
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const rel of ['../public/exercises.json', '../native/app/src/main/assets/exercises.json']) {
    const p = new URL(rel, import.meta.url)
    const d = JSON.parse(fs.readFileSync(p, 'utf8'))
    d.exercises = withStaples(d.exercises)
    fs.writeFileSync(p, JSON.stringify(d))
    console.error(`${rel}: ${d.exercises.length} exercises`)
  }
}
