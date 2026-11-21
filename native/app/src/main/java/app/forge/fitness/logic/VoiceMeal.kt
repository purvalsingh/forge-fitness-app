package app.forge.fitness.logic

/**
 * Turns a spoken meal ("do roti, ek katori dal and a vada pav") into catalog items without AI, for demo mode
 * or when AI is unavailable. Splits on commas / "and" / "aur", reads a leading quantity (digits, English or
 * Hindi number words), and matches each part to the bundled Indian food catalog at one real serving.
 * ponytail: plain keyword match; the AI path (parse_food_text) handles anything fancier.
 */
object VoiceMeal {
    private val NUM = mapOf(
        "a" to 1.0, "an" to 1.0, "one" to 1.0, "two" to 2.0, "three" to 3.0, "four" to 4.0, "five" to 5.0, "six" to 6.0,
        "half" to 0.5, "ek" to 1.0, "do" to 2.0, "teen" to 3.0, "char" to 4.0, "chaar" to 4.0, "paanch" to 5.0, "aadha" to 0.5,
    )
    private val FILLER = setOf("katori", "katoris", "bowl", "bowls", "plate", "plates", "glass", "glasses", "cup", "cups",
        "piece", "pieces", "of", "some", "had", "ate", "i", "and", "with", "serving", "servings")

    /** Split the sentence into (quantity, food words) parts. */
    fun split(text: String): List<Pair<Double, String>> =
        text.lowercase().split(Regex(",|\\band\\b|\\baur\\b|\\bplus\\b|\\bthen\\b|\\.")).mapNotNull { part ->
            val words = part.trim().split(Regex("\\s+")).filter { it.isNotBlank() }
            if (words.isEmpty()) return@mapNotNull null
            val first = words.first()
            val qty = first.toDoubleOrNull() ?: NUM[first]
            val rest = (if (qty != null) words.drop(1) else words).filter { it !in FILLER }
            if (rest.isEmpty()) null else (qty ?: 1.0) to rest.joinToString(" ")
        }

    fun localParse(catalog: List<Catalog.CatalogFood>, text: String): List<Catalog.Grounded> = split(text).mapNotNull { (qty, name) ->
        val best = Catalog.searchFoods(catalog, name, 1).firstOrNull() ?: return@mapNotNull null
        val grams = (Catalog.servingGrams(best) ?: 100.0) * qty
        val k = grams / 100.0
        Catalog.Grounded(
            name = best.name, qty = qty, unit = "serving", grams = grams,
            servingLabel = best.serving_label?.let { if (qty == 1.0) it else "${if (qty % 1.0 == 0.0) qty.toInt() else qty} × $it" },
            calories = Math.round(best.calories * k).toDouble(), proteinG = Math.round(best.protein_g * k * 10) / 10.0,
            carbsG = Math.round(best.carbs_g * k * 10) / 10.0, fatG = Math.round(best.fat_g * k * 10) / 10.0,
            confidence = 0.6, matched = best.id to best.name,
        )
    }
}
