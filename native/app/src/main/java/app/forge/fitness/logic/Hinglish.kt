package app.forge.fitness.logic

/**
 * Fast, offline meal logger (same rules as the web app's src/lib/hinglish.ts): "2 roti, 1 katori dal, thoda ghee,
 * chai" → catalog items with real Indian portions, instantly and without AI. Understands digits, fractions,
 * English/Hindi/Marathi number words, vague amounts (thoda, zyada), sizes (chhota, bada) and units (katori,
 * plate, glass, chamach…). Phrases it can't match come back in [Result.unmatched] so only those go to the AI.
 */
class Hinglish(private val p: Portions) {
    data class Phrase(val qty: Double, val unit: String?, val size: String?, val food: String, val vague: Boolean, val text: String)
    /** [partial]: phrases matched only after dropping words ("restaurant styled pav bhaji"): fine offline, but the AI should read the whole meal. */
    data class Result(val items: List<Catalog.Grounded>, val unmatched: List<String>, val tooLarge: List<String> = emptyList(), val partial: List<String> = emptyList())

    private val split = Regex(",|;|\\+|&|\\n|\\band\\b|\\baur\\b|\\bani\\b|\\bplus\\b|\\bthen\\b|\\bphir\\b|\\bke saath\\b|\\bsaath\\b|\\bwith\\b", RegexOption.IGNORE_CASE)
    private val notCooked = Regex("\\b(raw|dry|dried|uncooked|powder|flour)\\b", RegexOption.IGNORE_CASE)
    private val notPiece = Regex("katori|bowl|plate|glass|cup|tbsp|tsp|scoop|serving|ml\\b|\\bg\\b", RegexOption.IGNORE_CASE)

    private fun numeric(w: String): Double? {
        Regex("^(\\d+)/(\\d+)$").find(w)?.let { m -> val d = m.groupValues[2].toDouble(); return if (d != 0.0) m.groupValues[1].toDouble() / d else null }
        return if (Regex("^\\d+(\\.\\d+)?$").matches(w)) w.toDouble() else null
    }

    fun parsePhrase(raw: String): Phrase? {
        val text = raw.trim()
        val words = text.lowercase().replace(Regex("(\\d)([a-z])"), "$1 $2").replace(Regex("[^\\p{L}\\p{N}./ ]+"), " ")
            .split(Regex("\\s+")).filter { it.isNotBlank() }
        var qty: Double? = null; var unit: String? = null; var size: String? = null; var vague = false
        var weak = false // qty came from "a"/"an": a real number later ("a total of 3") replaces it
        val food = mutableListOf<String>()
        for (w in words) {
            val n = numeric(w) ?: p.numbers[w]
            val article = w == "a" || w == "an"
            if (n != null && !article && (qty == null || weak)) { qty = n; weak = false; vague = false; continue }
            if (article) { if (qty == null) { qty = 1.0; weak = true }; continue }
            if (p.vague[w] != null && (qty == null || weak)) { qty = p.vague[w]; weak = false; vague = true; continue }
            if (p.sizes[w] != null && size == null) { size = p.sizes[w]; continue }
            val u = p.unitOf(w)
            if (u != null && unit == null) { unit = u; continue }
            if (w in p.filler) continue
            food += p.plurals[w] ?: w
        }
        if (food.isEmpty()) return null
        return Phrase(qty ?: 1.0, unit, size, food.joinToString(" "), vague, text)
    }

    fun splitMeal(text: String): List<Phrase> = text.split(split).mapNotNull { parsePhrase(it) }

    /** The match plus how many leading words had to be dropped ("restaurant styled pav bhaji" → 2). */
    private fun lookup(catalog: List<Catalog.CatalogFood>, byId: Map<String, Catalog.CatalogFood>, food: String): Pair<Catalog.CatalogFood, Int>? {
        p.canonical[food]?.let { id -> byId[id]?.let { return it to 0 } }
        val words = food.split(" ")
        for (i in words.indices) {
            val q = words.drop(i).joinToString(" ")
            if (i > 0 && q.length < 4) break
            p.canonical[q]?.let { id -> byId[id]?.let { return it to i } }
            val hits = Catalog.searchScored(catalog, q, 5)
            val best = hits.firstOrNull { (f, s) -> s >= 600 && f.src != "off" && !notCooked.containsMatchIn(f.name) } ?: hits.firstOrNull { it.second >= 900 }
            if (best != null) return best.first to i
        }
        return null
    }

    /** One countable piece from the dish's own serving: "1 piece" 140 g → 140; "2 idli" 300 g → 150 each. */
    private fun pieceGrams(f: Catalog.CatalogFood): Double? {
        val g = Catalog.servingGrams(f) ?: return null
        val label = f.serving_label ?: ""
        if (notPiece.containsMatchIn(label)) return null
        val n = Regex("^(\\d+(?:\\.\\d+)?)\\s").find(label)?.groupValues?.get(1)?.toDoubleOrNull() ?: 1.0
        return g / if (n > 0) n else 1.0
    }

    fun phraseGrams(ph: Phrase, f: Catalog.CatalogFood?): Double? {
        val name = "${ph.food} ${f?.name ?: ""}"
        if (ph.unit == "g" || ph.unit == "ml") return ph.qty
        if (ph.vague && ph.unit == null && p.isFat(name)) return ph.qty * 2 * (p.unitGrams(name, "tsp") ?: 5.0)
        val one = p.unitGrams(name, ph.unit ?: p.defaultUnit(name), ph.size, f?.let { pieceGrams(it) }) ?: return null
        return one * ph.qty
    }

    private fun r1(d: Double) = Math.round(d * 10) / 10.0
    private fun num(d: Double) = if (d % 1.0 == 0.0) d.toInt().toString() else r1(d).toString()

    private fun label(ph: Phrase, name: String): String {
        val u = ph.unit ?: p.defaultUnit(name)
        if (ph.vague && ph.unit == null && p.isFat(name)) return "${num(ph.qty * 2)} tsp"
        val n = if (ph.vague) (if (ph.qty < 1) "a little" else "extra") else num(ph.qty)
        if (u == null || u == "piece") return if (ph.vague) n else "$n ${ph.size?.let { "$it " } ?: ""}${if (ph.qty == 1.0) "piece" else "pieces"}"
        return "$n $u${if (ph.qty != 1.0 && u !in setOf("g", "ml", "tsp", "tbsp")) "s" else ""}"
    }

    fun parse(catalog: List<Catalog.CatalogFood>, text: String): Result {
        val byId = catalog.associateBy { it.id }
        val items = mutableListOf<Catalog.Grounded>()
        val unmatched = mutableListOf<String>()
        val tooLarge = mutableListOf<String>()
        val partial = mutableListOf<String>()
        for (raw in text.split(split)) {
            val ph = parsePhrase(raw) ?: continue
            // A product whose name starts with a number ("5 Star", "7 Up") is one item, not 5 × "star".
            val whole = if (Regex("^\\s*\\d").containsMatchIn(raw)) Catalog.searchScored(catalog, raw.trim(), 1).firstOrNull() else null
            if (whole != null && whole.second >= 800 && whole.first.name.lowercase().startsWith(raw.trim().lowercase())) {
                val w = whole.first
                val g = phraseGrams(Phrase(1.0, null, null, raw.trim(), false, raw), w) ?: 100.0
                items += Catalog.Grounded(name = w.name, qty = 1.0, unit = "serving", grams = Math.round(g).toDouble(), servingLabel = w.serving_label ?: "1 serving",
                    calories = Math.round(w.calories * g / 100).toDouble(), proteinG = r1(w.protein_g * g / 100), carbsG = r1(w.carbs_g * g / 100),
                    fatG = r1(w.fat_g * g / 100), confidence = null, matched = w.id to w.name)
                continue
            }
            val hit = lookup(catalog, byId, ph.food)
            val f = hit?.first
            val grams = if (f != null) phraseGrams(ph, f) else null
            // Absurd amounts ("99999 roti") are never logged silently: they go to the guarded AI path, which explains.
            // Absurd amounts are never logged silently. Gram/ml amounts are the grams themselves ("200 ml").
            val absurd = grams != null && (grams > 2500 || (ph.unit != "g" && ph.unit != "ml" && ph.qty > 50))
            if (f != null && absurd) tooLarge += ph.text
            if (f == null || grams == null || grams <= 0 || absurd) { unmatched += ph.text; continue }
            if (hit!!.second > 0) partial += ph.text
            val k = grams / 100.0
            val name = "${ph.food} ${f.name}"
            items += Catalog.Grounded(
                name = f.name, qty = r1(ph.qty), unit = ph.unit ?: p.defaultUnit(name) ?: "serving", grams = Math.round(grams).toDouble(),
                servingLabel = label(ph, name), calories = Math.round(f.calories * k).toDouble(),
                proteinG = r1(f.protein_g * k), carbsG = r1(f.carbs_g * k), fatG = r1(f.fat_g * k),
                confidence = null, matched = f.id to f.name,
            )
        }
        return Result(items, unmatched, tooLarge, partial)
    }
}
