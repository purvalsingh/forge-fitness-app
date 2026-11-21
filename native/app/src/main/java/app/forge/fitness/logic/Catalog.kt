package app.forge.fitness.logic

import android.content.Context
import app.forge.fitness.data.Food
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.util.concurrent.atomic.AtomicReference

/**
 * The bundled food catalog: ~13k foods from USDA FoodData Central (SR Legacy ingredients +
 * FNDDS dishes, both public domain) plus Indian dishes composed from those components.
 *
 * Loaded lazily from assets/food-catalog.json on first use, off the main thread.
 * Ported from src/lib/catalog.ts.
 */
object Catalog {

    /**
     * A food entry from the bundled catalog. Flat data class (not a subclass of [Food]) because
     * Kotlin data classes are final and cannot be extended with `override val`.
     */
    @Serializable
    data class CatalogFood(
        val id: String,
        val name: String,
        val brand: String? = null,
        val unit: String = "100g",
        val base: Double = 100.0,
        val calories: Double,
        val protein_g: Double,
        val carbs_g: Double,
        val fat_g: Double,
        val fiber_g: Double? = null,
        val sugar_g: Double? = null,
        val sodium_mg: Double? = null,
        val custom: Boolean? = null,
        val category: String? = null,
        val serving_g: Double? = null,
        val serving_label: String? = null,
        val state: String? = null,
        val cuisine: String? = null,
        /** Source dataset identifier: "sr" | "fndds" | "composed" | "off" | "indb". */
        val src: String = "sr",
    )

    @Serializable
    private data class CatalogFile(val foods: List<CatalogFood>)

    private val cache = AtomicReference<List<CatalogFood>?>(null)

    /** True once the catalog has been loaded into memory. */
    fun catalogLoaded(): Boolean = cache.get() != null

    /**
     * Load the catalog from assets, returning the in-memory list.
     * Safe to call from any coroutine; the actual I/O runs on [Dispatchers.IO].
     * Subsequent calls return the cached list immediately.
     *
     * @throws Exception when the asset cannot be read.
     */
    suspend fun loadCatalog(context: Context): List<CatalogFood> {
        cache.get()?.let { return it }
        return withContext(Dispatchers.IO) {
            // Double-checked locking under IO dispatcher.
            cache.get()?.let { return@withContext it }
            val text = context.assets.open("food-catalog.json").bufferedReader().readText()
            val file = catalogJson.decodeFromString<CatalogFile>(text)
            val foods = file.foods.map { f -> f.copy(unit = "100g", base = 100.0) }
            cache.set(foods)
            foods
        }
    }

    // ─── Normalisation helpers ─────────────────────────────────────────────────

    private fun normalise(s: String) = s.lowercase().replace(Regex("[^a-z0-9 ]+"), " ").replace(Regex("\\s+"), " ").trim()
    private fun squash(s: String) = s.lowercase().replace(Regex("[^a-z0-9]+"), "")

    // ─── Indian / street-food alias table ────────────────────────────────────

    private val ALIASES: Map<String, String> = mapOf(
        "vadapav" to "vada pav", "wadapav" to "vada pav", "vadapao" to "vada pav",
        "pavbhaji" to "pav bhaji", "paobhaji" to "pav bhaji",
        "golgappa" to "pani puri", "golgappe" to "pani puri", "puchka" to "pani puri",
        "phuchka" to "pani puri", "panipuri" to "pani puri", "gupchup" to "pani puri",
        "dahibhalla" to "dahi vada", "dahibhalle" to "dahi vada", "dahivada" to "dahi vada",
        "kandapoha" to "poha", "batatapoha" to "poha", "usal" to "matki usal",
        "macherjhol" to "macher jhol", "mistidoi" to "mishti doi", "meencurry" to "kerala fish curry",
        "chholebhature" to "chole bhature", "cholebhature" to "chole bhature",
        "aloopratha" to "aloo paratha", "parantha" to "paratha", "prantha" to "paratha",
        "poori" to "puri", "bhatura" to "bhature", "kadhai" to "kadai",
        "maggie" to "maggi", "biriyani" to "biryani", "biriani" to "biryani",
        // ingredients
        "chhole" to "chickpea", "chole" to "chickpea", "rajmah" to "rajma",
        "dahi" to "yogurt", "curd" to "yogurt", "chaas" to "buttermilk",
        "roti" to "chapati", "chapathi" to "chapati", "atta" to "wheat flour",
        "brinjal" to "eggplant", "baingan" to "eggplant", "ladyfinger" to "okra", "bhindi" to "okra",
        "capsicum" to "pepper", "shimlamirch" to "pepper", "lauki" to "gourd", "doodhi" to "gourd",
        "karela" to "bitter gourd", "arbi" to "taro", "kaddu" to "pumpkin", "shakarkandi" to "sweet potato",
        "maida" to "wheat flour, white", "suji" to "semolina", "rava" to "semolina", "sooji" to "semolina",
        "jeera" to "cumin", "haldi" to "turmeric", "dhania" to "coriander", "methi" to "fenugreek",
        "sarson" to "mustard greens", "palak" to "spinach", "gobi" to "cauliflower", "matar" to "peas",
        "chawal" to "rice", "doodh" to "milk", "anda" to "egg", "murgh" to "chicken", "gosht" to "mutton",
        "machli" to "fish", "jhinga" to "shrimp", "kaju" to "cashew", "badam" to "almond",
        "moongphali" to "peanut", "til" to "sesame", "nariyal" to "coconut", "imli" to "tamarind",
        "gud" to "jaggery", "chini" to "sugar", "namak" to "salt", "chai" to "tea",
    )

    // ─── Search ───────────────────────────────────────────────────────────────

    /**
     * Rank foods by how early and how completely the query matches.
     * Scoring: exact name > prefix > word-boundary > substring > squash-substring.
     * Dishes (composed / indb) outrank raw ingredients on equal score.
     *
     * @param foods  The loaded catalog list.
     * @param query  User's search string.
     * @param limit  Maximum results to return (default 60).
     */
    private val COOKED = Regex("fried|coated|baked|roasted|broiled|stewed|breaded|canned|dried|sweetened", RegexOption.IGNORE_CASE)
    private val OFFAL = Regex("giblet|liver|heart|gizzard|kidney|capon|stewing|feet|neck|skin only|separable fat|mechanically", RegexOption.IGNORE_CASE)
    private val RAW = Regex("\\braw\\b", RegexOption.IGNORE_CASE)

    fun searchFoods(foods: List<CatalogFood>, query: String, limit: Int = 60): List<CatalogFood> {
        val raw = normalise(query)
        if (raw.isEmpty()) return foods.filter { it.src != "sr" }.take(limit)

        val aliased = ALIASES[squash(raw)]
        val q = if (aliased != null) normalise(aliased) else raw
        val qSquashed = squash(q)
        val terms = q.split(" ")

        data class Hit(val food: CatalogFood, val score: Int)
        val out = mutableListOf<Hit>()

        for (f in foods) {
            val name = normalise(f.name)
            var score = when {
                name == q                                                   -> 1000
                name.startsWith(q)                                          -> 800 - name.length
                name.contains(" $q")                                        -> 600 - name.length
                name.contains(q)                                            -> 400 - name.length
                terms.size > 1 && terms.all { name.contains(it) }          -> 300 - name.length
                qSquashed.length >= 4 && squash(f.name).contains(qSquashed) -> 250 - name.length
                else                                                        -> 0
            }
            if (score == 0) continue
            // "Banana, raw" / "Eggs, whole" / "Chicken, breast, raw": the plain ingredient itself beats "banana cake".
            val plain = (f.src == "sr" || f.src == "fndds") && Regex("^${Regex.escape(q)}s?,").containsMatchIn(f.name.lowercase())
            val cooked = COOKED.containsMatchIn(f.name)
            score = if (plain) 960 + (if (RAW.containsMatchIn(f.name) && !cooked) 20 else 0) - (if (OFFAL.containsMatchIn(f.name)) 80 else 0) - (if (cooked) 30 else 0) - minOf(name.length, 60) / 10
                    else score + when (f.src) { "composed" -> 120; "indb" -> 100; "fndds" -> 60; "off" -> 30; else -> 0 }
            out.add(Hit(f, score))
            if (out.size > 4000) break
        }

        return out.sortedByDescending { it.score }.take(limit).map { it.food }
    }

    // ─── Region browse ────────────────────────────────────────────────────────

    /** All 28 states and 8 union territories, in listing order. */
    val REGIONS: List<String> = listOf(
        "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana",
        "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur",
        "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana",
        "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
        "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi",
        "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry",
    )

    /** All foods tagged to a specific Indian region, sorted by name. */
    fun byRegion(foods: List<CatalogFood>, region: String): List<CatalogFood> =
        foods.filter { it.state == region }.sortedBy { it.name }

    // ─── Serving helpers ──────────────────────────────────────────────────────

    /** Grams in one natural serving, or null when the food is only known per 100 g/ml. */
    fun servingGrams(f: CatalogFood): Double? =
        if ((f.serving_g ?: 0.0) > 0) f.serving_g else null

    // ─── Grounding ────────────────────────────────────────────────────────────

    /**
     * An AI food estimate together with optional catalog-match metadata.
     * When [matched] is set, macros came from the database entry, not the model.
     */
    data class Grounded(
        val name: String,
        val qty: Double,
        val unit: String,
        val grams: Double?,
        val servingLabel: String?,
        val calories: Double,
        val proteinG: Double,
        val carbsG: Double,
        val fatG: Double,
        val confidence: Double?,
        /** (id, name) of the catalog entry that replaced the AI macros — null when not grounded. */
        val matched: Pair<String, String>? = null,
    )

    /**
     * Replace an AI estimate's macros with the database entry for the same dish when there is a
     * confident name match — the database is computed from ingredients; the model's numbers are a guess.
     * The AI's portion (grams) is kept, because that is the part only the photo/description knows.
     */
    fun groundItem(catalog: List<CatalogFood>, item: Grounded): Grounded {
        val hits = searchFoods(catalog, item.name, 3)
        val best = hits.firstOrNull() ?: return item
        val score = nameScore(item.name, best)
        if (score < 600) return item
        if (best.src !in listOf("composed", "indb", "fndds")) return item

        val sg = servingGrams(best)
        val grams = when {
            (item.grams ?: 0.0) > 0 -> item.grams!!
            sg != null               -> sg * item.qty.coerceAtLeast(1.0)
            else                     -> return item
        }
        val k = grams / 100.0
        val kcal = best.calories * k
        // A wildly different number means the name matched a different preparation — keep the AI's.
        if (item.calories > 0 && (kcal / item.calories > 2.5 || item.calories / kcal > 2.5)) return item
        return item.copy(
            grams = grams.toLong().toDouble(),
            calories = kcal.roundTo0(),
            proteinG = (best.protein_g * k).roundTo1(),
            carbsG = (best.carbs_g * k).roundTo1(),
            fatG = (best.fat_g * k).roundTo1(),
            matched = best.id to best.name,
        )
    }

    /**
     * Strip catalog-only columns (src, score) before writing via PostgREST.
     * Returns a plain [Food] row suitable for the `foods` table.
     */
    fun toFoodRow(f: CatalogFood): Food = Food(
        id = f.id, name = f.name, brand = f.brand, unit = f.unit, base = f.base,
        calories = f.calories, protein_g = f.protein_g, carbs_g = f.carbs_g, fat_g = f.fat_g,
        fiber_g = f.fiber_g, sugar_g = f.sugar_g, sodium_mg = f.sodium_mg,
        custom = f.custom, category = f.category, serving_g = f.serving_g,
        serving_label = f.serving_label, state = f.state, cuisine = f.cuisine,
    )

    // ─── Private ──────────────────────────────────────────────────────────────

    private val catalogJson = Json { ignoreUnknownKeys = true }

    /** Score a single food against a query name without full re-search. */
    private fun nameScore(query: String, food: CatalogFood): Int {
        val aliased = ALIASES[squash(normalise(query))]
        val q = if (aliased != null) normalise(aliased) else normalise(query)
        val name = normalise(food.name)
        return when {
            name == q            -> 1000
            name.startsWith(q)  -> 800 - name.length
            name.contains(" $q") -> 600 - name.length
            else                 -> 0
        }
    }

    private fun Double.roundTo0() = kotlin.math.round(this).toDouble()
    private fun Double.roundTo1() = kotlin.math.round(this * 10) / 10.0
}
