/**
 * Dishes of every Indian state and union territory, composed from USDA component foods.
 * Same contract as indian-regional.mjs: macros are the sum of the parts, scaled to a plated
 * serving. `label` is how people actually order/eat it ("1 piece", "1 katori") — the app logs
 * in that unit by default, never "100 g of vada pav".
 *
 * Oil amounts are the oil that ends up in the food (absorbed/tempering), not the frying pan's
 * contents. Portions follow common restaurant/home servings (katori ≈ 150 g, plate ≈ 250–350 g).
 */
import { C as base } from './indian-regional.mjs'

const C = {
  ...base,
  urad: g => ({ match: '^Mungo beans, mature seeds, cooked, boiled, without salt', g }),
  toor: g => ({ match: '^Pigeon peas \\(red gram\\), mature seeds, cooked, boiled, without salt', g }),
  stickyRice: g => ({ match: '^Rice, white, glutinous, unenriched, cooked', g }),
  goat: g => ({ match: '^Game meat, goat, cooked, roasted', g }),
  duck: g => ({ match: '^Duck, domesticated, meat only, cooked, roasted', g }),
  buckwheat: g => ({ match: '^Buckwheat flour, whole-groat', g }),
  amaranthGrain: g => ({ match: '^Amaranth grain, cooked', g }),
  walnut: g => ({ match: '^Nuts, walnuts, english', g }),
  apricot: g => ({ match: '^Apricots, dried, sulfured, uncooked', g }),
  soybean: g => ({ match: '^Soybeans, mature cooked, boiled, without salt', g }),
  barley: g => ({ match: '^Barley, pearled, cooked', g }),
  pomfret: g => ({ match: '^Fish, pompano, florida, cooked, dry heat', g }),
  sardine: g => ({ match: '^Fish, sardine, Atlantic, canned in oil, drained solids with bone', g }),
  squid: g => ({ match: '^Mollusks, squid, mixed species, raw', g }),
  radish: g => ({ match: '^Radishes, raw', g }),
  beet: g => ({ match: '^Beets, cooked, boiled, drained', g }),
  condensed: g => ({ match: '^Milk, canned, condensed, sweetened', g }),
  riceNoodle: g => ({ match: '^Rice noodles, cooked', g }),
  oats: g => ({ match: '^Oats', g }),
  pakChoi: g => ({ match: '^Cabbage, chinese \\(pak-choi\\), cooked, boiled, drained, without salt', g }),
  cassava: g => ({ match: '^Cassava, raw', g }),
  plantain: g => ({ match: '^Plantains, green, boiled', g }),
  plantainFried: g => ({ match: '^Plantains, green, fried', g }),
  sesameOil: g => ({ match: '^Oil, sesame, salad or cooking', g }),
  groundnutOil: g => ({ match: '^Oil, peanut, salad or cooking', g }),
  pineapple: g => ({ match: '^Pineapple, raw, all varieties', g }),
  kale: g => ({ match: '^Kale, cooked, boiled, drained, without salt', g }),
  chickenLiver: g => ({ match: '^Chicken, liver, all classes, cooked, simmered', g }),
  crab2: g => ({ match: '^Crustaceans, crab, dungeness, cooked, moist heat', g }),
}

const gravy = (onion, tomato, oil) => [C.onion(onion), C.tomato(tomato), C.oil(oil)]
const tadka = oil => C.oil(oil)
/** d(name, plated grams, components, state, label) */
const d = (name, serving_g, components, state, label = '1 serving') =>
  ({ name, cuisine: state, state, serving_g, label, components })

const S = {}
const add = (state, rows) => { S[state] = rows.map(r => ({ ...r, cuisine: state, state })) }

// ---------------------------------------------------------------- STATES (28)

add('Andhra Pradesh', [
  d('Pesarattu Upma', 220, [C.mung(90), C.semolina(35), C.oil(12), C.onion(20)], '', '1 dosa + upma'),
  d('Gutti Vankaya Kura', 200, [C.eggplant(130), C.peanut(20), C.sesame(8), C.oil(18), C.onion(25)], '', '1 katori'),
  d('Andhra Chicken Curry', 200, [C.chickenThigh(120), ...gravy(40, 30, 16)], '', '1 katori'),
  d('Tomato Pappu', 180, [C.toor(120), C.tomato(50), tadka(8)], '', '1 katori'),
  d('Punugulu (6 pieces)', 110, [C.riceFlour(35), C.urad(30), C.oil(18), C.onion(15)], '', '6 pieces'),
  d('Pulihora (Andhra)', 220, [C.rice(170), C.tamarind(12), C.peanut(15), C.sesameOil(12)], '', '1 plate'),
  d('Ulavacharu', 180, [C.lentil(110), C.tamarind(10), tadka(8)], '', '1 katori'),
  d('Bobbatlu', 90, [C.maida(30), C.chana(30), C.jaggery(30), C.ghee(10)], '', '1 piece'),
  d('Pootharekulu (2 pieces)', 50, [C.riceFlour(10), C.sugar(20), C.ghee(12), C.cashew(6)], '', '2 pieces'),
  d('Royyala Iguru (Prawn Fry)', 150, [C.prawn(110), C.onion(30), C.oil(14)], '', '1 katori'),
  d('Kodi Vepudu (Chicken Fry)', 150, [C.chickenThigh(120), C.onion(20), C.oil(16)], '', '1 katori'),
  d('Gongura Mutton', 200, [C.mutton(110), C.amaranth(40), ...gravy(30, 10, 16)], '', '1 katori'),
  d('Dibba Rotti', 150, [C.urad(50), C.semolina(50), C.oil(12)], '', '1 piece'),
  d('Majjiga Pulusu', 200, [C.buttermilk(150), C.besan(10), C.gourd(40), tadka(6)], '', '1 katori'),
  d('Bellam Garelu (2 pieces)', 90, [C.urad(40), C.jaggery(25), C.oil(14)], '', '2 pieces'),
  d('Andhra Kodi Pulao', 300, [C.basmati(180), C.chickenThigh(90), C.ghee(12), C.onion(30)], '', '1 plate'),
  d('Nellore Chepala Pulusu', 200, [C.fish(110), C.tamarind(12), ...gravy(35, 30, 14)], '', '1 katori'),
])

add('Arunachal Pradesh', [
  d('Thukpa (Arunachal, Veg)', 350, [C.noodles(150), C.cabbage(40), C.carrot(30), C.oil(6)], '', '1 bowl'),
  d('Pika Pila (Bamboo Shoot Pickle)', 30, [C.bambooShoot(20), C.oil(6)], '', '1 tbsp'),
  d('Apong (Rice Beer)', 250, [C.stickyRice(40)], '', '1 glass'),
  d('Lukter (Dry Meat Chutney)', 40, [C.beef(30), C.oil(3)], '', '2 tbsp'),
  d('Pehak (Fermented Soybean Chutney)', 40, [C.soybean(30)], '', '2 tbsp'),
  d('Khura (Buckwheat Pancake)', 90, [C.buckwheat(50), C.egg(20), C.oil(5)], '', '1 piece'),
  d('Chura Sabji', 150, [C.cottage(60), C.capsicum(40), C.onion(20), C.oil(6)], '', '1 katori'),
  d('Pork with Bamboo Shoot', 200, [C.pork(110), C.bambooShoot(60), C.oil(6)], '', '1 katori'),
  d('Zan (Millet Porridge)', 250, [C.ragi(180), C.cabbage(30)], '', '1 bowl'),
  d('Dung Po (Rice & Meat Parcel)', 250, [C.stickyRice(160), C.pork(60)], '', '1 parcel'),
])

add('Assam', [
  d('Masor Tenga (Sour Fish Curry)', 220, [C.catfish(110), C.tomato(60), C.mustardOil(10)], '', '1 katori'),
  d('Khar', 180, [C.pumpkin(60), C.lentil(80), C.mustardOil(6)], '', '1 katori'),
  d('Duck Curry with Ash Gourd', 220, [C.duck(110), C.gourd(60), C.mustardOil(12), C.onion(25)], '', '1 katori'),
  d('Pitha (Til Pitha, 2 pieces)', 80, [C.stickyRice(50), C.sesame(10), C.jaggery(15)], '', '2 pieces'),
  d('Joha Rice (plain)', 180, [C.rice(180)], '', '1 plate'),
  d('Xaak Bhaji', 120, [C.mustardGreens(100), C.mustardOil(6)], '', '1 katori'),
  d('Pork with Bamboo Shoot (Assamese)', 200, [C.pork(110), C.bambooShoot(60), C.mustardOil(8)], '', '1 katori'),
  d('Masor Petika', 120, [C.fish(90), C.onion(20), C.mustardOil(8)], '', '1 katori'),
  d('Ou Tenga Dal', 180, [C.lentil(130), C.mustardOil(6)], '', '1 katori'),
  d('Jolpan (Chira-Doi-Gur)', 200, [C.puffedRice(40), C.yogurt(100), C.jaggery(20)], '', '1 bowl'),
  d('Narikol Laru (2 pieces)', 50, [C.coconut(30), C.sugar(15)], '', '2 pieces'),
  d('Paro Mangxo (Pigeon Curry)', 200, [C.chickenThigh(110), ...gravy(35, 20, 12)], '', '1 katori'),
])

add('Bihar', [
  d('Sattu Sharbat', 300, [C.besan(30), C.lemon(10), C.sugar(8)], '', '1 glass'),
  d('Champaran Mutton (Ahuna)', 200, [C.mutton(120), C.mustardOil(14), C.onion(40)], '', '1 katori'),
  d('Dal Pitha (4 pieces)', 200, [C.riceFlour(70), C.chana(50), C.oil(6)], '', '4 pieces'),
  d('Chana Ghugni (Bihari)', 180, [C.chana(120), C.onion(25), C.mustardOil(10)], '', '1 katori'),
  d('Khaja (2 pieces)', 60, [C.maida(25), C.sugar(15), C.oil(12)], '', '2 pieces'),
  d('Malpua (Bihari, 2 pieces)', 110, [C.maida(35), C.milk(40), C.sugar(25), C.ghee(12)], '', '2 pieces'),
  d('Dal Puri (2 pieces)', 110, [C.atta(50), C.chana(25), C.oil(16)], '', '2 pieces'),
  d('Kadhi Bari', 230, [C.yogurt(120), C.besan(30), C.oil(14)], '', '1 katori'),
  d('Aloo Bhujia (Bihari sabzi)', 150, [C.potato(120), C.mustardOil(10)], '', '1 katori'),
  d('Chura Dahi', 220, [C.puffedRice(50), C.yogurt(150), C.sugar(10)], '', '1 bowl'),
  d('Baingan Chokha', 120, [C.eggplant(100), C.onion(10), C.mustardOil(6)], '', '1 katori'),
  d('Tilkut (2 pieces)', 40, [C.sesame(22), C.jaggery(16)], '', '2 pieces'),
  d('Makhana Kheer', 200, [C.milk(170), C.sugar(15), C.almond(5)], '', '1 katori'),
  d('Parwal Mithai (2 pieces)', 80, [C.gourd(30), C.milkPowder(15), C.sugar(25)], '', '2 pieces'),
])

add('Chhattisgarh', [
  d('Chila (Chhattisgarhi rice pancake)', 120, [C.riceFlour(55), C.onion(15), C.oil(6)], '', '2 pieces'),
  d('Fara (Steamed Rice Dumplings)', 180, [C.rice(150), C.oil(6)], '', '1 plate'),
  d('Aamat', 220, [C.toor(60), C.bambooShoot(40), C.pumpkin(50), C.eggplant(40)], '', '1 katori'),
  d('Bafauri (6 pieces)', 120, [C.besan(55), C.onion(20), C.oil(4)], '', '6 pieces'),
  d('Muthia (Chhattisgarhi rice)', 150, [C.riceFlour(60), C.oil(6)], '', '1 plate'),
  d('Dubki Kadhi', 220, [C.yogurt(110), C.urad(40), C.oil(10)], '', '1 katori'),
  d('Bore Baasi', 350, [C.rice(250), C.yogurt(60), C.onion(20)], '', '1 bowl'),
  d('Tilgur Laddoo (2 pieces)', 40, [C.sesame(22), C.jaggery(16)], '', '2 pieces'),
  d('Dehrori (2 pieces)', 90, [C.riceFlour(30), C.yogurt(10), C.sugar(25), C.ghee(12)], '', '2 pieces'),
  d('Red Ant Chutney (Chaprah)', 30, [C.tomato(15), C.oil(2)], '', '1 tbsp'),
])

add('Goa', [
  d('Ros Omelette', 250, [C.egg(100), C.chickenThigh(50), C.coconutMilk(50), C.oil(8), C.bread(40)], '', '1 plate with pao'),
  d('Chicken Cafreal', 180, [C.chickenThigh(140), C.oil(12), C.cilantro(15)], '', '1 serving'),
  d('Goan Pork Sausage Pulao', 280, [C.rice(180), C.pork(60), C.oil(8)], '', '1 plate'),
  d('Kismur (Dry Fish Salad)', 60, [C.fish(25), C.coconut(15), C.onion(15)], '', '1 katori'),
  d('Goan Poi (1 piece)', 70, [C.wholeBread(70)], '', '1 piece'),
  d('Rava Fried Kingfish', 120, [C.mackerel(90), C.semolina(12), C.oil(12)], '', '1 slice'),
  d('Bangda Fry (Mackerel)', 130, [C.mackerel(110), C.oil(10)], '', '1 fish'),
  d('Goan Prawn Rissoles (2 pieces)', 100, [C.maida(30), C.prawn(35), C.milk(20), C.oil(14)], '', '2 pieces'),
  d('Sannas (2 pieces)', 100, [C.riceFlour(45), C.coconut(15), C.sugar(5)], '', '2 pieces'),
  d('Tonak (Goan Chickpea Curry)', 200, [C.chana(110), C.coconut(25), C.oil(10), C.onion(25)], '', '1 katori'),
  d('Goan Chorizo Pao', 150, [C.bread(70), C.pork(55), C.onion(20)], '', '1 pao'),
  d('Dodol (1 piece)', 50, [C.riceFlour(10), C.coconutMilk(20), C.jaggery(22)], '', '1 piece'),
  d('Goan Mushroom Xacuti', 200, [C.mushroom(120), C.coconut(30), C.oil(12), C.onion(25)], '', '1 katori'),
  d('Patoleo (2 pieces)', 100, [C.riceFlour(35), C.coconut(25), C.jaggery(22)], '', '2 pieces'),
  d('Ambot Tik (Fish)', 200, [C.fish(110), C.tamarind(10), ...gravy(30, 20, 12)], '', '1 katori'),
])

add('Gujarat', [
  d('Khichu', 150, [C.riceFlour(45), C.oil(8)], '', '1 plate'),
  d('Locho', 150, [C.besan(45), C.chana(20), C.oil(12)], '', '1 plate'),
  d('Sev Khamani', 150, [C.chana(60), C.besan(25), C.oil(12), C.sugar(8)], '', '1 plate'),
  d('Gujarati Dal', 180, [C.toor(120), C.jaggery(10), C.tomato(20), C.ghee(6)], '', '1 katori'),
  d('Bajra No Rotlo', 80, [C.bajra(60), C.ghee(5)], '', '1 rotla'),
  d('Methi Thepla (2 pieces)', 90, [C.atta(55), C.yogurt(10), C.oil(10)], '', '2 pieces'),
  d('Ringan No Olo', 180, [C.eggplant(140), C.onion(20), C.oil(12)], '', '1 katori'),
  d('Basundi (Gujarati)', 150, [C.milk(130), C.sugar(18), C.almond(4)], '', '1 katori'),
  d('Doodhpak', 180, [C.milk(150), C.rice(20), C.sugar(18)], '', '1 katori'),
  d('Surti Ghari (1 piece)', 70, [C.maida(18), C.milkPowder(12), C.ghee(18), C.sugar(15)], '', '1 piece'),
  d('Kutchi Dabeli (Kutch style)', 130, [C.bread(50), C.potato(50), C.peanut(10), C.oil(8)], '', '1 piece'),
  d('Nylon Khaman', 150, [C.besan(55), C.sugar(12), C.oil(10)], '', '1 plate'),
  d('Handvo (slice)', 120, [C.rice(40), C.lentil(35), C.gourd(20), C.oil(10)], '', '1 slice'),
  d('Sukhdi (2 pieces)', 60, [C.atta(25), C.ghee(14), C.jaggery(20)], '', '2 pieces'),
])

add('Haryana', [
  d('Bajra Khichdi', 250, [C.bajra(130), C.mung(60), C.ghee(10)], '', '1 bowl'),
  d('Kachri Ki Sabzi', 150, [C.gourd(110), C.oil(10), C.onion(15)], '', '1 katori'),
  d('Hara Dhania Cholia', 180, [C.chana(110), C.cilantro(20), C.oil(12)], '', '1 katori'),
  d('Methi Gajar', 150, [C.carrot(110), C.spinach(20), C.oil(10)], '', '1 katori'),
  d('Besan Masala Roti', 90, [C.besan(35), C.atta(30), C.ghee(8)], '', '1 roti'),
  d('Singri Ki Sabzi', 150, [C.beans(110), C.oil(10), C.onion(15)], '', '1 katori'),
  d('Mithe Chawal', 200, [C.rice(140), C.sugar(25), C.ghee(10), C.raisin(5)], '', '1 katori'),
  d('Alsi Ki Pinni (1 piece)', 40, [C.atta(10), C.sesame(10), C.ghee(8), C.jaggery(12)], '', '1 piece'),
  d('Lassi (Haryana, tall glass)', 400, [C.yogurt(250), C.milk(100), C.sugar(25)], '', '1 tall glass'),
  d('Rabri', 120, [C.milk(200), C.sugar(15)], '', '1 katori'),
  d('Kadhi (Haryanvi)', 220, [C.buttermilk(170), C.besan(25), C.ghee(8)], '', '1 katori'),
])

add('Himachal Pradesh', [
  d('Siddu (1 piece)', 150, [C.atta(70), C.walnut(10), C.sesame(5), C.ghee(10)], '', '1 piece with ghee'),
  d('Chha Gosht', 200, [C.mutton(110), C.yogurt(50), C.besan(8), C.oil(12)], '', '1 katori'),
  d('Madra (Chickpea in Yogurt)', 200, [C.chana(100), C.yogurt(60), C.ghee(12)], '', '1 katori'),
  d('Tudkiya Bhath', 280, [C.rice(170), C.lentil(50), C.potato(30), C.oil(10)], '', '1 plate'),
  d('Babru (2 pieces)', 120, [C.maida(50), C.urad(25), C.oil(16)], '', '2 pieces'),
  d('Mittha (Sweet Rice)', 200, [C.rice(140), C.sugar(25), C.ghee(10), C.raisin(8)], '', '1 katori'),
  d('Aktori (buckwheat cake)', 110, [C.buckwheat(60), C.spinach(20), C.oil(10)], '', '1 piece'),
  d('Kullu Trout (grilled)', 150, [C.fish(130), C.oil(8)], '', '1 fillet'),
  d('Patrodu (4 pieces)', 120, [C.taroLeaf(50), C.besan(40), C.oil(10)], '', '4 pieces'),
  d('Sepu Vadi', 200, [C.urad(60), C.spinach(70), C.yogurt(30), C.oil(14)], '', '1 katori'),
  d('Kaale Chane Ka Khatta', 180, [C.chana(110), C.tamarind(10), C.oil(8)], '', '1 katori'),
])

add('Jharkhand', [
  d('Dhuska (2 pieces)', 120, [C.riceFlour(45), C.lentil(25), C.oil(16)], '', '2 pieces'),
  d('Rugra (Mushroom) Curry', 180, [C.mushroom(120), C.onion(25), C.mustardOil(10)], '', '1 katori'),
  d('Chilka Roti (2 pieces)', 110, [C.riceFlour(45), C.lentil(20), C.oil(4)], '', '2 pieces'),
  d('Handia (Rice Beer)', 250, [C.rice(50)], '', '1 glass'),
  d('Bamboo Shoot Sabzi (Jharkhand)', 150, [C.bambooShoot(120), C.mustardOil(8)], '', '1 katori'),
  d('Mutton Curry (Jharkhand)', 200, [C.goat(110), C.onion(40), C.mustardOil(14)], '', '1 katori'),
  d('Thekua (Jharkhand, 2 pieces)', 60, [C.atta(30), C.jaggery(15), C.ghee(10)], '', '2 pieces'),
  d('Pittha (steamed rice dumplings, 3 pieces)', 150, [C.riceFlour(55), C.chana(30)], '', '3 pieces'),
  d('Kurthi Dal (Horse Gram)', 180, [C.lentil(130), C.mustardOil(6)], '', '1 katori'),
  d('Marua Roti', 70, [C.ragi(55), C.ghee(4)], '', '1 roti'),
])

add('Karnataka', [
  d('Bisi Bele Bath (Karnataka, hotel)', 300, [C.rice(140), C.toor(70), C.carrot(20), C.beans(20), C.ghee(12)], '', '1 plate'),
  d('Mangalore Buns (2 pieces)', 120, [C.maida(45), C.banana(30), C.sugar(10), C.oil(16)], '', '2 pieces'),
  d('Kori Rotti', 300, [C.chickenThigh(100), C.coconutMilk(60), C.riceFlour(30), C.oil(12)], '', '1 plate'),
  d('Kane Rava Fry (Ladyfish)', 120, [C.fish(95), C.semolina(10), C.oil(10)], '', '1 serving'),
  d('Chow Chow Bath', 250, [C.semolina(60), C.sugar(25), C.ghee(18), C.onion(15)], '', '1 plate'),
  d('Mysore Bonda (3 pieces)', 110, [C.maida(40), C.yogurt(30), C.oil(16)], '', '3 pieces'),
  d('Ragi Dosa', 110, [C.ragi(60), C.urad(20), C.oil(8)], '', '1 dosa'),
  d('Kundapur Chicken Ghee Roast', 180, [C.chickenThigh(130), C.ghee(18), C.onion(15)], '', '1 serving'),
  d('Benne Dosa (Davangere)', 130, [C.riceFlour(55), C.urad(15), C.butter(15)], '', '1 dosa'),
  d('Pandi Curry (Coorg Pork)', 200, [C.pork(130), C.onion(30), C.oil(8)], '', '1 katori'),
  d('Akki Rotti (Coorg)', 100, [C.riceFlour(60), C.oil(6)], '', '1 roti'),
  d('Mysore Rasam', 200, [C.toor(40), C.tomato(60), C.coconut(10), C.ghee(5)], '', '1 katori'),
  d('Huli (Karnataka Sambar)', 200, [C.toor(90), C.gourd(50), C.tamarind(8), C.oil(6)], '', '1 katori'),
  d('Dharwad Peda (2 pieces)', 50, [C.milkPowder(25), C.sugar(20)], '', '2 pieces'),
  d('Chiroti (1 piece)', 50, [C.maida(22), C.ghee(12), C.sugar(10)], '', '1 piece'),
  d('Nuchinunde (4 pieces)', 120, [C.toor(70), C.chana(20), C.oil(6)], '', '4 pieces'),
])

add('Kerala', [
  d('Kerala Parotta with Beef Curry', 350, [C.maida(100), C.oil(18), C.beef(100), C.coconut(15), C.onion(30)], '', '2 parotta + curry'),
  d('Puttu Kadala', 300, [C.riceFlour(90), C.coconut(25), C.chana(90), C.oil(8)], '', '1 plate'),
  d('Karimeen Pollichathu', 180, [C.fish(130), C.oil(12), C.onion(25), C.coconutMilk(15)], '', '1 fish'),
  d('Kerala Sadya (full)', 700, [C.rice(250), C.toor(40), C.coconut(40), C.pumpkin(60), C.beans(40), C.yogurt(60), C.banana(40), C.coconutOil(25), C.jaggery(25)], '', '1 leaf'),
  d('Unniyappam (4 pieces)', 100, [C.riceFlour(40), C.banana(20), C.jaggery(25), C.ghee(10)], '', '4 pieces'),
  d('Ela Ada (2 pieces)', 120, [C.riceFlour(45), C.coconut(25), C.jaggery(25)], '', '2 pieces'),
  d('Kerala Egg Roast', 180, [C.eggBoiled(100), C.onion(60), C.coconutOil(12)], '', '2 eggs'),
  d('Pal Payasam (Kerala)', 180, [C.milk(150), C.rice(20), C.sugar(22)], '', '1 katori'),
  d('Pazhampori (Kerala tea shop)', 90, [C.banana(60), C.maida(20), C.oil(12)], '', '1 piece'),
  d('Kappa Biryani', 350, [C.cassava(170), C.beef(90), C.onion(40), C.coconutOil(14)], '', '1 plate'),
  d('Pathiri (2 pieces)', 80, [C.riceFlour(55), C.coconut(10)], '', '2 pieces'),
  d('Chicken Stew (Kerala)', 250, [C.chickenThigh(100), C.potato(50), C.coconutMilk(80), C.coconutOil(6)], '', '1 katori'),
  d('Meen Moilee', 220, [C.fish(110), C.coconutMilk(80), C.coconutOil(8)], '', '1 katori'),
  d('Kerala Mussel Fry (Kallummakkaya)', 120, [C.prawn(90), C.coconutOil(12)], '', '1 serving'),
  d('Achappam (4 pieces)', 60, [C.riceFlour(25), C.egg(8), C.sugar(8), C.oil(15)], '', '4 pieces'),
  d('Kozhukatta (3 pieces)', 150, [C.riceFlour(60), C.coconut(35), C.jaggery(25)], '', '3 pieces'),
])

add('Madhya Pradesh', [
  d('Indori Poha Jalebi', 250, [C.rice(110), C.potato(30), C.peanut(12), C.oil(10), C.sugar(30), C.maida(25), C.ghee(8)], '', '1 plate poha + 2 jalebi'),
  d('Bhutte Ka Kees', 200, [C.corn(150), C.milk(40), C.ghee(10)], '', '1 katori'),
  d('Dal Bafla', 350, [C.atta(120), C.ghee(30), C.toor(120)], '', '2 bafla + dal'),
  d('Sabudana Khichdi (Indori)', 250, [C.sago(70), C.potato(50), C.peanut(25), C.ghee(12)], '', '1 plate'),
  d('Bhopali Gosht Korma', 200, [C.mutton(110), C.yogurt(40), C.oil(16), C.onion(35)], '', '1 katori'),
  d('Mawa Bati (1 piece)', 70, [C.milkPowder(25), C.maida(10), C.sugar(25), C.ghee(8)], '', '1 piece'),
  d('Khopra Pattice (2 pieces)', 130, [C.potato(80), C.coconut(20), C.oil(14)], '', '2 pieces'),
  d('Garadu (Fried Yam Chaat)', 150, [C.yam(120), C.oil(14)], '', '1 plate'),
  d('Shikanji (Indori)', 250, [C.milk(200), C.sugar(25), C.almond(5)], '', '1 glass'),
  d('Chakki Ki Shaak', 200, [C.atta(60), C.yogurt(80), C.oil(12)], '', '1 katori'),
  d('Mawa Jalebi (Jabalpur, 2 pieces)', 80, [C.milkPowder(20), C.maida(15), C.sugar(30), C.ghee(10)], '', '2 pieces'),
])

add('Maharashtra', [
  d('Kolhapuri Misal (with 2 pav)', 350, [C.mothBean(120), C.potato(30), C.oil(16), C.onion(20), C.bread(80)], '', '1 plate'),
  d('Tambda Rassa (Kolhapuri mutton)', 250, [C.mutton(80), C.oil(16), C.onion(35), C.coconut(12)], '', '1 katori'),
  d('Pandhra Rassa', 250, [C.mutton(60), C.coconutMilk(70), C.oil(8)], '', '1 katori'),
  d('Sheera', 150, [C.semolina(40), C.sugar(25), C.ghee(18), C.milk(40)], '', '1 katori'),
  d('Bombil Fry (Bombay Duck)', 120, [C.fish(95), C.semolina(12), C.oil(12)], '', '2 pieces'),
  d('Surmai Fry (Kingfish)', 120, [C.mackerel(95), C.semolina(10), C.oil(10)], '', '1 slice'),
  d('Kombdi Vade', 350, [C.chickenThigh(100), C.riceFlour(60), C.urad(15), C.oil(24), C.onion(30)], '', '1 plate'),
  d('Varan Bhaat', 300, [C.rice(180), C.toor(100), C.ghee(8)], '', '1 plate'),
  d('Alu Vadi (4 pieces)', 100, [C.taroLeaf(35), C.besan(35), C.oil(14), C.jaggery(6)], '', '4 pieces'),
  d('Sabudana Thalipeeth', 120, [C.sago(55), C.potato(30), C.peanut(10), C.oil(8)], '', '1 piece'),
  d('Anda Bhurji Pav (street)', 250, [C.egg(110), C.bread(80), C.butter(10), C.onion(30)], '', '1 plate'),
  d('Ukadiche Modak (2 pieces)', 110, [C.riceFlour(40), C.coconut(35), C.jaggery(25), C.ghee(5)], '', '2 pieces'),
  d('Shrikhand Puri (2 puri)', 200, [C.yogurt(80), C.sugar(25), C.atta(40), C.oil(16)], '', '1 plate'),
  d('Kothimbir Vadi (street, 4 pieces)', 120, [C.besan(45), C.cilantro(30), C.oil(18)], '', '4 pieces'),
  d('Pohe (Maharashtrian, 1 plate)', 180, [C.rice(100), C.potato(30), C.onion(25), C.peanut(10), C.oil(10)], '', '1 plate'),
])

add('Manipur', [
  d('Eromba', 180, [C.potato(70), C.beans(40), C.fish(15), C.bambooShoot(30)], '', '1 katori'),
  d('Singju', 150, [C.cabbage(80), C.besan(15), C.lotusRoot(30), C.oil(4)], '', '1 plate'),
  d('Chak-Hao Kheer (Black Rice Kheer)', 180, [C.stickyRice(40), C.milk(130), C.sugar(15)], '', '1 katori'),
  d('Kangshoi', 250, [C.cabbage(60), C.peas(40), C.potato(40), C.fish(15)], '', '1 bowl'),
  d('Nga Thongba (Fish Curry)', 220, [C.catfish(110), C.potato(40), C.mustardOil(10), C.onion(20)], '', '1 katori'),
  d('Paaknam', 150, [C.besan(60), C.fish(20), C.onion(20), C.oil(6)], '', '1 piece'),
  d('Morok Metpa', 30, [C.onion(15), C.oil(2)], '', '1 tbsp'),
  d('Chamthong', 300, [C.cabbage(70), C.peas(40), C.carrot(40), C.onion(20)], '', '1 bowl'),
  d('Bora (Manipuri fritters, 4 pieces)', 110, [C.besan(40), C.onion(30), C.oil(16)], '', '4 pieces'),
  d('Black Rice (Chak-Hao, cooked)', 180, [C.stickyRice(180)], '', '1 plate'),
])

add('Meghalaya', [
  d('Jadoh', 300, [C.rice(200), C.pork(70), C.onion(20), C.oil(6)], '', '1 plate'),
  d('Doh Khlieh', 150, [C.pork(110), C.onion(30)], '', '1 katori'),
  d('Nakham Bitchi', 250, [C.fish(40), C.gourd(60)], '', '1 bowl'),
  d('Tungrymbai', 100, [C.soybean(80), C.oil(6)], '', '1 katori'),
  d('Pumaloi', 180, [C.rice(180)], '', '1 plate'),
  d('Dohneiiong (Pork in Black Sesame)', 200, [C.pork(120), C.sesame(15), C.onion(25), C.oil(4)], '', '1 katori'),
  d('Pukhlein (2 pieces)', 80, [C.riceFlour(40), C.jaggery(15), C.oil(12)], '', '2 pieces'),
  d('Minil Songa (Sticky Rice in Bamboo)', 180, [C.stickyRice(180)], '', '1 serving'),
])

add('Mizoram', [
  d('Bai (Mizo Veg Stew)', 250, [C.spinach(60), C.bambooShoot(50), C.eggplant(40), C.pork(20)], '', '1 bowl'),
  d('Vawksa Rep (Smoked Pork)', 120, [C.pork(100)], '', '1 serving'),
  d('Sawhchiar', 300, [C.rice(180), C.chickenThigh(60)], '', '1 bowl'),
  d('Chhum Han (Steamed Veg)', 200, [C.cabbage(70), C.beans(50), C.carrot(50)], '', '1 plate'),
  d('Koat Pitha (4 pieces)', 100, [C.riceFlour(40), C.banana(30), C.jaggery(10), C.oil(14)], '', '4 pieces'),
  d('Mizo Fish Curry (Sa-Um style)', 200, [C.fish(110), C.onion(20), C.oil(4)], '', '1 katori'),
  d('Panch Phoron Tarkari (Mizo)', 150, [C.pumpkin(60), C.potato(40), C.eggplant(40), C.oil(8)], '', '1 katori'),
])

add('Nagaland', [
  d('Smoked Pork with Bamboo Shoot', 200, [C.pork(120), C.bambooShoot(60)], '', '1 katori'),
  d('Axone Pork', 200, [C.pork(110), C.soybean(30), C.tomato(20)], '', '1 katori'),
  d('Galho (Naga Khichdi)', 300, [C.rice(170), C.pork(40), C.spinach(40), C.bambooShoot(20)], '', '1 bowl'),
  d('Zutho (Rice Beer)', 250, [C.rice(50)], '', '1 glass'),
  d('Naga Chicken with Bamboo', 200, [C.chickenThigh(120), C.bambooShoot(50)], '', '1 katori'),
  d('Hinkejvu', 250, [C.taro(70), C.cabbage(60), C.beans(40)], '', '1 bowl'),
  d('Anishi (Taro Leaf with Pork)', 200, [C.taroLeaf(60), C.pork(90)], '', '1 katori'),
  d('Naga Beef Fry (dry)', 120, [C.beef(100), C.oil(6)], '', '1 serving'),
])

add('Odisha', [
  d('Pakhala Bhata (with sides)', 450, [C.rice(250), C.yogurt(60), C.potato(60), C.fish(30), C.mustardOil(6)], '', '1 bowl + sides'),
  d('Dalma', 250, [C.toor(110), C.pumpkin(40), C.eggplant(30), C.carrot(20), C.ghee(6)], '', '1 katori'),
  d('Chhena Poda (1 slice)', 100, [C.cottage(60), C.sugar(25), C.semolina(6), C.ghee(4)], '', '1 slice'),
  d('Rasabali (2 pieces)', 150, [C.cottage(45), C.milk(80), C.sugar(25), C.ghee(8)], '', '2 pieces'),
  d('Machha Besara', 200, [C.fish(110), C.mustardOil(12), C.onion(15)], '', '1 katori'),
  d('Santula', 200, [C.pumpkin(60), C.potato(50), C.eggplant(40), C.milk(20), C.oil(4)], '', '1 katori'),
  d('Dahi Bara Aloo Dum', 250, [C.urad(50), C.yogurt(80), C.potato(60), C.oil(16)], '', '1 plate'),
  d('Chakuli Pitha (2 pieces)', 120, [C.riceFlour(45), C.urad(20), C.oil(6)], '', '2 pieces'),
  d('Kanika (Sweet Pulao)', 220, [C.rice(150), C.sugar(20), C.ghee(14), C.cashew(8), C.raisin(8)], '', '1 plate'),
  d('Chhena Jhili (2 pieces)', 80, [C.cottage(40), C.sugar(25), C.ghee(8)], '', '2 pieces'),
  d('Mudhi Mansa', 350, [C.puffedRice(40), C.goat(100), C.onion(30), C.mustardOil(14)], '', '1 plate'),
  d('Khaja (Puri, 3 pieces)', 60, [C.maida(25), C.sugar(15), C.oil(12)], '', '3 pieces'),
  d('Arisa Pitha (2 pieces)', 80, [C.riceFlour(35), C.jaggery(20), C.oil(12)], '', '2 pieces'),
])

add('Punjab', [
  d('Amritsari Chole Kulcha', 350, [C.chana(150), C.maida(90), C.butter(15), C.oil(10), C.onion(20)], '', '1 plate (2 kulcha)'),
  d('Paneer Tikka (Punjabi dhaba, 6 pieces)', 200, [C.paneer(140), C.yogurt(30), C.capsicum(20), C.oil(8)], '', '6 pieces'),
  d('Punjabi Kadhi Pakora', 250, [C.yogurt(130), C.besan(40), C.onion(20), C.oil(16)], '', '1 katori'),
  d('Pinni (1 piece)', 50, [C.atta(20), C.ghee(12), C.sugar(12), C.almond(5)], '', '1 piece'),
  d('Patiala Lassi', 450, [C.yogurt(300), C.sugar(30), C.cream(20)], '', '1 tall glass'),
  d('Tandoori Aloo', 150, [C.potato(120), C.yogurt(20), C.oil(8)], '', '1 plate'),
  d('Rajma Chawal (Punjabi)', 400, [C.rajma(160), C.rice(180), C.oil(12), C.onion(30), C.tomato(30)], '', '1 plate'),
  d('Paneer Bhurji (Punjabi)', 150, [C.paneer(100), C.onion(25), C.tomato(25), C.butter(8)], '', '1 katori'),
  d('Butter Chicken (dhaba, with 2 roti)', 400, [C.chicken(130), C.butter(20), C.cream(25), C.tomato(60), C.atta(80)], '', '1 plate'),
  d('Dal Makhani (dhaba, with 2 naan)', 400, [C.urad(120), C.rajma(20), C.butter(15), C.cream(20), C.maida(100)], '', '1 plate'),
  d('Aloo Kulcha', 130, [C.maida(70), C.potato(40), C.butter(8)], '', '1 kulcha'),
  d('Meethe Chawal (Punjabi)', 200, [C.rice(140), C.sugar(25), C.ghee(10)], '', '1 katori'),
])

add('Rajasthan', [
  d('Ker Sangri', 120, [C.beans(80), C.oil(14)], '', '1 katori'),
  d('Bajre Ki Roti with Ghee', 90, [C.bajra(65), C.ghee(8)], '', '1 roti'),
  d('Mirchi Bada (Jodhpuri)', 130, [C.capsicum(40), C.potato(50), C.besan(25), C.oil(16)], '', '1 piece'),
  d('Pyaaz Kachori (Jodhpur)', 110, [C.maida(45), C.onion(30), C.oil(20)], '', '1 piece'),
  d('Rajasthani Kadhi', 220, [C.buttermilk(170), C.besan(25), C.ghee(8)], '', '1 katori'),
  d('Mohan Maas', 200, [C.mutton(110), C.milk(60), C.cream(15), C.ghee(10)], '', '1 katori'),
  d('Safed Maas', 200, [C.mutton(110), C.yogurt(40), C.cashew(15), C.ghee(12)], '', '1 katori'),
  d('Mawa Kachori (1 piece)', 90, [C.maida(30), C.milkPowder(20), C.sugar(22), C.ghee(12)], '', '1 piece'),
  d('Bajre Ki Raab', 250, [C.bajra(40), C.buttermilk(180)], '', '1 glass'),
  d('Churma Laddoo (1 piece)', 60, [C.atta(25), C.ghee(14), C.sugar(15)], '', '1 piece'),
  d('Rabdi Malpua (Pushkar, 2 pieces)', 150, [C.maida(40), C.milk(70), C.sugar(30), C.ghee(12)], '', '2 pieces'),
  d('Kalmi Vada (2 pieces)', 90, [C.chana(55), C.oil(14)], '', '2 pieces'),
  d('Dal Baati (1 baati + dal)', 300, [C.atta(90), C.ghee(25), C.toor(100)], '', '1 baati + dal'),
  d('Ghevar (1 piece)', 120, [C.maida(40), C.ghee(30), C.sugar(35)], '', '1 piece'),
])

add('Sikkim', [
  d('Phagshapa', 200, [C.pork(110), C.radish(60)], '', '1 katori'),
  d('Gundruk Soup', 250, [C.mustardGreens(60), C.tomato(30), C.soybean(20)], '', '1 bowl'),
  d('Sel Roti (1 piece)', 70, [C.riceFlour(35), C.sugar(8), C.oil(12)], '', '1 piece'),
  d('Sha Phaley (1 piece)', 110, [C.maida(50), C.beef(35), C.oil(12)], '', '1 piece'),
  d('Chhurpi Soup', 250, [C.cottage(40), C.spinach(40)], '', '1 bowl'),
  d('Thenthuk', 350, [C.maida(70), C.chickenThigh(50), C.cabbage(40)], '', '1 bowl'),
  d('Kinema Curry', 150, [C.soybean(100), C.onion(20), C.oil(8)], '', '1 katori'),
  d('Sinki Soup', 250, [C.radish(60), C.tomato(20)], '', '1 bowl'),
])

add('Tamil Nadu', [
  d('Chettinad Mutton Curry', 200, [C.goat(110), C.coconut(20), C.sesameOil(14), C.onion(35)], '', '1 katori'),
  d('Kari Dosai', 180, [C.riceFlour(50), C.urad(15), C.egg(40), C.muttonGround(40), C.oil(8)], '', '1 dosa'),
  d('Kuzhi Paniyaram (6 pieces)', 150, [C.riceFlour(50), C.urad(20), C.onion(15), C.oil(10)], '', '6 pieces'),
  d('Kothu Parotta (Chicken)', 350, [C.maida(110), C.chickenThigh(70), C.egg(40), C.oil(20)], '', '1 plate'),
  d('Mutton Biryani (Dindigul)', 350, [C.rice(200), C.goat(90), C.ghee(12), C.oil(10), C.onion(30)], '', '1 plate'),
  d('Pongal (Hotel, with ghee)', 250, [C.rice(150), C.mung(50), C.ghee(18), C.cashew(5)], '', '1 plate'),
  d('Poondu Kuzhambu', 200, [C.tamarind(15), C.sesameOil(14), C.onion(25), C.toor(20)], '', '1 katori'),
  d('Mor Kuzhambu', 200, [C.buttermilk(150), C.coconut(15), C.gourd(40), C.oil(6)], '', '1 katori'),
  d('Kara Kuzhambu', 200, [C.eggplant(80), C.tamarind(12), C.sesameOil(14), C.onion(25)], '', '1 katori'),
  d('Paruppu Usili', 150, [C.beans(80), C.toor(40), C.oil(12)], '', '1 katori'),
  d('Kaara Sev', 50, [C.besan(30), C.oil(16)], '', '1 handful'),
  d('Adhirasam (1 piece)', 50, [C.riceFlour(20), C.jaggery(18), C.oil(8)], '', '1 piece'),
  d('Paal Kozhukattai (6 pieces)', 200, [C.riceFlour(45), C.milk(100), C.jaggery(20)], '', '1 katori'),
  d('Jigarthanda', 300, [C.milk(200), C.sugar(30), C.cream(20)], '', '1 glass'),
  d('Nethili Fry (Anchovy)', 100, [C.sardine(75), C.oil(10)], '', '1 plate'),
  d('Chicken Chettinad Pepper Fry', 150, [C.chickenThigh(120), C.onion(20), C.oil(12)], '', '1 serving'),
  d('Sakkarai Pongal (Temple style)', 180, [C.rice(100), C.mung(20), C.jaggery(40), C.ghee(15)], '', '1 katori'),
])

add('Telangana', [
  d('Hyderabadi Mutton Biryani (restaurant)', 400, [C.basmati(220), C.mutton(110), C.ghee(18), C.oil(10), C.yogurt(20), C.onion(30)], '', '1 plate'),
  d('Sarva Pindi', 150, [C.riceFlour(70), C.chana(15), C.peanut(15), C.oil(12)], '', '1 piece'),
  d('Sakinalu (4 pieces)', 60, [C.riceFlour(35), C.sesame(5), C.oil(12)], '', '4 pieces'),
  d('Pachi Pulusu', 200, [C.tamarind(12), C.onion(30)], '', '1 katori'),
  d('Talawa Gosht', 220, [C.mutton(100), C.chana(40), C.oil(16), C.onion(30)], '', '1 katori'),
  d('Qubani Ka Meetha', 120, [C.apricot(60), C.sugar(25), C.cream(15)], '', '1 katori'),
  d('Irani Chai with Osmania Biscuit (2)', 170, [C.milk(100), C.sugar(15), C.tea(50), C.maida(15), C.butter(6)], '', '1 cup + 2 biscuits'),
  d('Pathar Ka Gosht', 150, [C.mutton(120), C.oil(8)], '', '1 serving'),
  d('Hyderabadi Marag', 250, [C.mutton(80), C.yogurt(40), C.cashew(10), C.ghee(10)], '', '1 bowl'),
  d('Khubani Double Ka Meetha', 120, [C.bread(40), C.milk(40), C.sugar(25), C.ghee(12)], '', '1 katori'),
  d('Jonna Rotte (Jowar Roti)', 70, [C.jowar(55)], '', '1 roti'),
  d('Kodi Kura (Telangana Chicken)', 200, [C.chickenThigh(120), ...gravy(40, 25, 16)], '', '1 katori'),
  d('Malidalu (2 pieces)', 100, [C.atta(40), C.jaggery(25), C.ghee(12)], '', '1 katori'),
])

add('Tripura', [
  d('Mui Borok (Berma fish chutney)', 60, [C.fish(20), C.onion(15), C.bambooShoot(15)], '', '2 tbsp'),
  d('Chakhwi', 250, [C.bambooShoot(60), C.gourd(60), C.pork(40)], '', '1 bowl'),
  d('Mosdeng Serma', 60, [C.tomato(40), C.fish(10)], '', '2 tbsp'),
  d('Wahan Mosdeng (Pork Salad)', 150, [C.pork(110), C.onion(25)], '', '1 plate'),
  d('Gudok', 250, [C.bambooShoot(50), C.beans(40), C.fish(30), C.potato(40)], '', '1 bowl'),
  d('Awan Bangwi (Sticky Rice Cake)', 150, [C.stickyRice(120), C.ghee(6), C.raisin(8)], '', '1 piece'),
  d('Berma Bwtwi (Fish Stew)', 250, [C.fish(60), C.bambooShoot(30), C.gourd(50)], '', '1 bowl'),
])

add('Uttar Pradesh', [
  d('Lucknowi Galouti Kebab (4 pieces)', 150, [C.muttonGround(110), C.ghee(12), C.besan(8)], '', '4 pieces'),
  d('Tunday Kebab with Paratha', 300, [C.muttonGround(120), C.maida(90), C.ghee(18)], '', '1 plate'),
  d('Lucknowi Mutton Biryani', 350, [C.basmati(210), C.mutton(90), C.ghee(16), C.yogurt(15)], '', '1 plate'),
  d('Bedmi Poori Aloo (Agra)', 300, [C.atta(60), C.urad(25), C.oil(24), C.potato(100)], '', '2 puri + sabzi'),
  d('Petha (Agra, 1 piece)', 50, [C.pumpkin(20), C.sugar(30)], '', '1 piece'),
  d('Banarasi Kachori Sabzi', 250, [C.atta(55), C.urad(20), C.oil(22), C.potato(80)], '', '2 kachori + sabzi'),
  d('Tamatar Chaat (Banaras)', 200, [C.tomato(100), C.potato(40), C.ghee(10), C.sugar(8)], '', '1 plate'),
  d('Malaiyo (Banaras)', 150, [C.milk(120), C.sugar(15), C.almond(4)], '', '1 kulhad'),
  d('Kakori Kebab (4 pieces)', 150, [C.muttonGround(110), C.ghee(12)], '', '4 pieces'),
  d('Shahi Tukda', 120, [C.bread(40), C.milk(60), C.sugar(25), C.ghee(15)], '', '1 piece'),
  d('Nimona', 200, [C.peas(110), C.potato(40), C.oil(12)], '', '1 katori'),
  d('Aloo Tikki Chaat (UP)', 250, [C.potato(120), C.chana(40), C.yogurt(40), C.oil(14), C.chutney(20)], '', '1 plate'),
  d('Dahi Jalebi (Mathura)', 200, [C.yogurt(100), C.maida(30), C.sugar(35), C.oil(10)], '', '1 plate'),
  d('Lucknowi Sheermal', 100, [C.maida(55), C.milk(20), C.ghee(10), C.sugar(8)], '', '1 piece'),
  d('Khasta with Aloo (Kanpur)', 250, [C.maida(55), C.urad(15), C.oil(22), C.potato(80)], '', '2 khasta + aloo'),
])

add('Uttarakhand', [
  d('Kafuli', 200, [C.spinach(120), C.riceFlour(15), C.ghee(8)], '', '1 katori'),
  d('Bhatt Ki Churkani', 200, [C.soybean(90), C.riceFlour(10), C.oil(10)], '', '1 katori'),
  d('Aloo Ke Gutke', 150, [C.potato(120), C.mustardOil(12)], '', '1 katori'),
  d('Mandua Ki Roti', 70, [C.ragi(55), C.ghee(4)], '', '1 roti'),
  d('Chainsoo', 200, [C.urad(110), C.oil(10), C.onion(15)], '', '1 katori'),
  d('Phaanu', 200, [C.lentil(110), C.spinach(30), C.oil(8)], '', '1 katori'),
  d('Bal Mithai (4 pieces)', 60, [C.milkPowder(25), C.sugar(30)], '', '4 pieces'),
  d('Singori (2 pieces)', 60, [C.milkPowder(25), C.sugar(20)], '', '2 pieces'),
  d('Jhangora Ki Kheer', 180, [C.bajra(30), C.milk(130), C.sugar(15)], '', '1 katori'),
  d('Arsa (2 pieces)', 60, [C.riceFlour(25), C.jaggery(18), C.oil(10)], '', '2 pieces'),
  d('Kumaoni Raita', 150, [C.yogurt(110), C.gourd(30), C.mustardOil(2)], '', '1 katori'),
  d('Gahat (Horse Gram) Dal', 200, [C.lentil(130), C.ghee(6)], '', '1 katori'),
])

add('West Bengal', [
  d('Kolkata Chicken Biryani (with aloo & egg)', 450, [C.basmati(230), C.chickenThigh(100), C.potato(70), C.eggBoiled(50), C.ghee(16)], '', '1 plate'),
  d('Kolkata Mutton Biryani', 450, [C.basmati(230), C.mutton(100), C.potato(70), C.eggBoiled(50), C.ghee(16)], '', '1 plate'),
  d('Kathi Roll (Egg Chicken, Kolkata)', 220, [C.maida(70), C.egg(50), C.chickenThigh(60), C.oil(14), C.onion(20)], '', '1 roll'),
  d('Phuchka (6 pieces)', 120, [C.semolina(20), C.oil(10), C.potato(50), C.chana(15), C.tamarind(8)], '', '6 pieces'),
  d('Mughlai Paratha', 220, [C.maida(80), C.egg(60), C.muttonGround(30), C.oil(20)], '', '1 piece'),
  d('Chingri Bhapa', 180, [C.prawn(120), C.mustardOil(12), C.coconut(15)], '', '1 katori'),
  d('Bhapa Ilish', 150, [C.mackerel(110), C.mustardOil(12)], '', '1 piece'),
  d('Doi Maach', 200, [C.catfish(110), C.yogurt(50), C.mustardOil(12)], '', '1 katori'),
  d('Mochar Ghonto', 150, [C.banana(60), C.potato(40), C.coconut(15), C.ghee(8)], '', '1 katori'),
  d('Echorer Dalna (Jackfruit Curry)', 200, [C.jackfruit(120), C.potato(40), C.mustardOil(12)], '', '1 katori'),
  d('Kosha Mangsho with Luchi (4)', 350, [C.goat(120), C.onion(40), C.mustardOil(16), C.maida(60), C.oil(20)], '', '1 plate'),
  d('Ghugni (Kolkata street)', 200, [C.splitPeas(120), C.onion(25), C.mustardOil(10)], '', '1 plate'),
  d('Nolen Gurer Sandesh (2 pieces)', 60, [C.cottage(40), C.jaggery(18)], '', '2 pieces'),
  d('Pantua (2 pieces)', 100, [C.cottage(40), C.maida(8), C.sugar(30), C.ghee(12)], '', '2 pieces'),
  d('Telebhaja (Beguni, 4 pieces)', 120, [C.eggplant(70), C.besan(30), C.mustardOil(16)], '', '4 pieces'),
  d('Kolkata Egg Chowmein', 300, [C.noodles(180), C.egg(50), C.cabbage(30), C.oil(14)], '', '1 plate'),
  d('Posto Bora (4 pieces)', 80, [C.sesame(30), C.mustardOil(12), C.riceFlour(5)], '', '4 pieces'),
  d('Kochuri with Alur Dom', 250, [C.maida(50), C.urad(15), C.oil(20), C.potato(90)], '', '2 kochuri + dom'),
])

// ------------------------------------------------------- UNION TERRITORIES (8)

add('Andaman and Nicobar Islands', [
  d('Andaman Fish Curry (Coconut)', 220, [C.fish(110), C.coconutMilk(60), C.coconutOil(8), C.onion(20)], '', '1 katori'),
  d('Grilled Lobster (Andaman)', 200, [C.prawn(170), C.butter(12)], '', '1 lobster'),
  d('Coconut Prawn Curry (Havelock)', 220, [C.prawn(110), C.coconutMilk(70), C.oil(8), C.onion(20)], '', '1 katori'),
  d('Crab Curry (Andaman)', 250, [C.crab2(120), C.coconut(20), C.oil(10), C.onion(25)], '', '1 katori'),
  d('Tandoori Fish (Andaman)', 180, [C.fish(150), C.yogurt(20), C.oil(6)], '', '1 serving'),
  d('Nicobari Pandanus & Coconut (Kewra fruit dish)', 150, [C.coconut(40), C.banana(60)], '', '1 serving'),
  d('Macher Jhol (Andaman Bengali)', 220, [C.fish(110), C.potato(40), C.mustardOil(12)], '', '1 katori'),
])

add('Chandigarh', [
  d('Chole Bhature (Sector 17 style)', 350, [C.chana(150), C.maida(90), C.oil(28), C.yogurt(15)], '', '1 plate (2 bhature)'),
  d('Tawa Chicken', 200, [C.chickenThigh(140), C.onion(25), C.butter(12)], '', '1 serving'),
  d('Paneer Tikka Masala (Chandigarh)', 220, [C.paneer(120), C.cream(20), C.tomato(50), C.butter(12)], '', '1 katori'),
  d('Stuffed Paratha with White Butter', 200, [C.atta(90), C.potato(60), C.butter(20)], '', '1 paratha'),
  d('Chicken Tikka Roll (Chandigarh)', 220, [C.maida(70), C.chicken(90), C.onion(20), C.mayo(15), C.oil(8)], '', '1 roll'),
  d('Kulfi Falooda (Chandigarh)', 200, [C.milk(120), C.sugar(25), C.cornflour(15), C.cream(15)], '', '1 plate'),
])

add('Dadra and Nagar Haveli and Daman and Diu', [
  d('Daman Fish Curry', 220, [C.fish(110), C.coconut(25), C.oil(12), C.onion(25)], '', '1 katori'),
  d('Papri Muthia (Daman)', 200, [C.beans(80), C.besan(35), C.oil(16)], '', '1 katori'),
  d('Prawn Balchão (Diu)', 150, [C.prawn(100), C.oil(14), C.onion(20)], '', '1 katori'),
  d('Ubadiyu', 250, [C.beans(80), C.potato(60), C.yam(40), C.oil(14)], '', '1 plate'),
  d('Dhokla (Silvassa tribal rice)', 150, [C.riceFlour(55), C.urad(15), C.oil(6)], '', '1 plate'),
  d('Bhujia (Diu Fish Fritters, 4 pieces)', 120, [C.fish(60), C.besan(25), C.oil(14)], '', '4 pieces'),
  d('Nagli Roti (Ragi, Silvassa)', 70, [C.ragi(55)], '', '1 roti'),
])

add('Delhi', [
  d('Chole Bhature (Old Delhi)', 350, [C.chana(150), C.maida(90), C.oil(30)], '', '1 plate (2 bhature)'),
  d('Paranthe Wali Gali Paratha', 150, [C.atta(70), C.potato(40), C.ghee(18)], '', '1 paratha'),
  d('Butter Chicken (Old Delhi)', 250, [C.chicken(120), C.butter(20), C.cream(25), C.tomato(60)], '', '1 katori'),
  d('Nihari (Jama Masjid)', 250, [C.beef(120), C.ghee(18), C.atta(10)], '', '1 katori'),
  d('Daulat Ki Chaat', 120, [C.cream(60), C.milk(40), C.sugar(15)], '', '1 plate'),
  d('Ram Ladoo (plate)', 150, [C.mung(60), C.oil(18), C.radish(30)], '', '1 plate'),
  d('Chole Kulche (street)', 300, [C.chana(130), C.maida(80), C.butter(10), C.onion(20)], '', '1 plate'),
  d('Aloo Chaat (Delhi)', 180, [C.potato(140), C.oil(12), C.chutney(15)], '', '1 plate'),
  d('Moth Kachori', 200, [C.maida(50), C.mothBean(60), C.oil(22)], '', '1 plate'),
  d('Kulle Chaat (4 pieces)', 150, [C.tomato(60), C.potato(40), C.chana(30)], '', '4 pieces'),
  d('Mutton Korma (Karim\'s)', 250, [C.mutton(120), C.yogurt(30), C.ghee(20), C.onion(40)], '', '1 katori'),
  d('Chicken Seekh Kebab Roll (Delhi)', 220, [C.maida(70), C.chicken(90), C.onion(20), C.oil(10)], '', '1 roll'),
  d('Jalebi (Chandni Chowk, 4 pieces)', 100, [C.maida(30), C.sugar(40), C.ghee(18)], '', '4 pieces'),
])

add('Jammu and Kashmir', [
  d('Kashmiri Wazwan Rista (4 balls)', 250, [C.muttonGround(140), C.oil(18)], '', '4 balls'),
  d('Gushtaba (2 balls)', 280, [C.muttonGround(130), C.yogurt(80), C.ghee(15)], '', '2 balls'),
  d('Tabak Maaz (2 ribs)', 120, [C.mutton(90), C.ghee(12)], '', '2 ribs'),
  d('Nadru Yakhni', 200, [C.lotusRoot(100), C.yogurt(80), C.oil(10)], '', '1 katori'),
  d('Kashmiri Pulao', 250, [C.basmati(170), C.cashew(10), C.raisin(10), C.ghee(12)], '', '1 plate'),
  d('Rajma (Jammu, with rice)', 400, [C.rajma(160), C.rice(180), C.ghee(10), C.onion(25)], '', '1 plate'),
  d('Kalari Cheese (Jammu)', 80, [C.mozzarella(70), C.oil(4)], '', '1 piece'),
  d('Kashmiri Kahwa', 200, [C.tea(180), C.sugar(8), C.almond(6)], '', '1 cup'),
  d('Noon Chai (Sheer Chai)', 200, [C.tea(100), C.milk(80), C.butter(3)], '', '1 cup'),
  d('Girda (Kashmiri bread)', 100, [C.maida(65), C.sesame(3)], '', '1 piece'),
  d('Methi Maaz', 200, [C.chickenLiver(60), C.mutton(60), C.oil(12)], '', '1 katori'),
  d('Kashmiri Haak with Rice', 300, [C.kale(120), C.rice(160), C.mustardOil(8)], '', '1 plate'),
  d('Phirni (Kashmiri)', 150, [C.milk(120), C.rice(15), C.sugar(18)], '', '1 katori'),
])

add('Ladakh', [
  d('Skyu', 350, [C.atta(80), C.potato(50), C.carrot(30), C.milk(60)], '', '1 bowl'),
  d('Chutagi', 350, [C.maida(80), C.carrot(30), C.potato(40)], '', '1 bowl'),
  d('Thukpa (Ladakhi, Mutton)', 400, [C.noodles(150), C.goat(60), C.carrot(30), C.oil(6)], '', '1 bowl'),
  d('Khambir (1 bread)', 120, [C.atta(90)], '', '1 bread'),
  d('Butter Tea (Gur Gur Chai)', 200, [C.tea(150), C.butter(10), C.milk(30)], '', '1 cup'),
  d('Tsampa (Roasted Barley)', 60, [C.barley(150), C.butter(5)], '', '1 bowl'),
  d('Apricot Jam Khambir', 150, [C.atta(90), C.apricot(30)], '', '1 bread + jam'),
  d('Mokthuk', 350, [C.maida(60), C.muttonGround(40), C.cabbage(40)], '', '1 bowl'),
])

add('Lakshadweep', [
  d('Mas Podichathu (Tuna Fry)', 120, [C.mackerel(100), C.coconutOil(10), C.onion(15)], '', '1 serving'),
  d('Octopus Fry (Lakshadweep)', 150, [C.squid(130), C.coconutOil(12)], '', '1 serving'),
  d('Kilanji (with coconut-banana)', 150, [C.riceFlour(50), C.coconut(30), C.banana(40)], '', '2 pieces'),
  d('Mus Kavab (Tuna Kebab)', 150, [C.mackerel(110), C.coconut(15), C.oil(10)], '', '4 pieces'),
  d('Lakshadweep Fish Curry', 220, [C.mackerel(110), C.coconutMilk(70), C.coconutOil(8)], '', '1 katori'),
  d('Kavaratti Biryani', 350, [C.rice(200), C.mackerel(80), C.ghee(12), C.onion(30)], '', '1 plate'),
])

add('Puducherry', [
  d('Pondicherry Fish Curry (Meen Kuzhambu)', 220, [C.fish(110), C.tamarind(12), C.coconut(15), C.oil(12)], '', '1 katori'),
  d('Crab Masala (Pondy)', 220, [C.crab2(120), C.oil(14), C.onion(30), C.tomato(30)], '', '1 katori'),
  d('Kadugu Yera (Prawn Mustard Fry)', 150, [C.prawn(110), C.oil(12)], '', '1 serving'),
  d('Assad (Creole Chicken)', 200, [C.chickenThigh(120), C.coconutMilk(50), C.oil(10)], '', '1 katori'),
  d('Pondy Croissant (butter)', 60, [C.maida(28), C.butter(18), C.sugar(4)], '', '1 piece'),
  d('Bouillabaisse (Pondy)', 300, [C.fish(90), C.prawn(40), C.tomato(60), C.oil(10)], '', '1 bowl'),
  d('Pondy Ratatouille', 200, [C.eggplant(60), C.capsicum(40), C.tomato(50), C.oil(12)], '', '1 katori'),
])

export const dishes = Object.values(S).flat()
export const states = Object.keys(S)
export default dishes
