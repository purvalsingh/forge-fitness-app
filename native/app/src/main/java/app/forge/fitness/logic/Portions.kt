package app.forge.fitness.logic

import android.content.Context
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * Indian serving sizes per food, from the same portions.json the web app uses (src/lib/portions.json, copied to
 * assets by `npm run apk`). A katori of dal is not a katori of sabzi: units resolve through the food first.
 */
class Portions(json: String) {
    private val root = Json.parseToJsonElement(json).jsonObject
    private fun obj(k: String) = root[k]!!.jsonObject
    private fun nums(k: String) = obj(k).mapValues { it.value.jsonPrimitive.doubleOrNull ?: 0.0 }
    private fun strs(k: String) = obj(k).mapValues { it.value.jsonPrimitive.content }

    val numbers = nums("numbers")
    val vague = nums("vague")
    val sizes = strs("sizes")
    val canonical = strs("canonical")
    val plurals = strs("plurals")
    val filler = root["filler"]!!.jsonArray.map { it.jsonPrimitive.content }.toSet()
    private val defaults = nums("default_grams")
    private val unitOf: Map<String, String> = obj("units").flatMap { (unit, words) -> words.jsonArray.map { it.jsonPrimitive.content to unit } }.toMap()

    private class Rule(val re: Regex, val o: JsonObject) {
        fun grams(unit: String) = o[unit]?.jsonPrimitive?.doubleOrNull
        fun flag(k: String) = o[k]?.jsonPrimitive?.contentOrNull == "true"
        val defaultUnit = o["default_unit"]?.jsonPrimitive?.contentOrNull
        fun size(s: String) = o["sizes"]?.jsonObject?.get(s)?.jsonPrimitive?.doubleOrNull
    }
    private val rules = root["foods"]!!.jsonArray.map { val o = it.jsonObject; Rule(Regex(o["match"]!!.jsonPrimitive.content, RegexOption.IGNORE_CASE), o) }
    private fun rulesFor(name: String) = rules.filter { it.re.containsMatchIn(name) }

    private val oil = obj("oil")
    data class Level(val id: String, val label: String, val tsp: Double)
    val oilLevels = oil["levels"]!!.jsonArray.map { val o = it.jsonObject; Level(o["id"]!!.jsonPrimitive.content, o["label"]!!.jsonPrimitive.content, o["tsp"]!!.jsonPrimitive.doubleOrNull ?: 0.0) }
    val restaurantDefault = oil["restaurant_default"]!!.jsonPrimitive.content
    val homeDefault = oil["home_default"]!!.jsonPrimitive.content
    private val gramsPerTsp = oil["grams_per_tsp"]!!.jsonPrimitive.doubleOrNull ?: 5.0
    private val kcalPerG = oil["kcal_per_g"]!!.jsonPrimitive.doubleOrNull ?: 9.0

    fun unitOf(word: String) = unitOf[word.lowercase()]
    fun defaultUnit(name: String) = rulesFor(name).firstOrNull { it.defaultUnit != null }?.defaultUnit
    fun isFat(name: String) = rulesFor(name).any { it.flag("fat") }
    /** Cooked at home with oil or ghee you can't see: dal, sabzi, curry, paratha, tadka. Fried dishes already count their oil. */
    fun isHomeCooked(name: String) = rulesFor(name).let { rs -> rs.any { it.flag("home_cooked") } && rs.none { it.flag("already_fried") } }
    /**
     * Should the oil question cover this dish? Only lean home-cooked dishes: one whose recipe already carries its fat
     * (over 8 g fat per 100 g, or tadka / makhani / butter / masala / fry in the name) would be counted twice.
     */
    fun asksOil(name: String, fatPer100: Double? = null): Boolean =
        isHomeCooked(name) && !(fatPer100 != null && fatPer100 > 8) &&
            !Regex("\\b(tadka|tarka|makhani|butter|masala|fry|fried|korma|kadai|malai)\\b", RegexOption.IGNORE_CASE).containsMatchIn(name)

    /** Restaurant and street food: the oil question starts at "A lot". */
    fun isRestaurant(name: String) = rulesFor(name).any { it.flag("restaurant") }

    /** Grams in ONE unit of this food; [catalogPiece] is the dish's own piece weight, which beats the table. */
    fun unitGrams(name: String, unit: String?, size: String? = null, catalogPiece: Double? = null): Double? {
        if (unit == "g" || unit == "ml") return 1.0
        val u = unit ?: defaultUnit(name) ?: "serving"
        if (u == "piece" || u == "serving") {
            size?.let { s -> rulesFor(name).firstNotNullOfOrNull { it.size(s) }?.let { return it } }
            return catalogPiece ?: rulesFor(name).firstNotNullOfOrNull { it.grams("piece") }
        }
        return rulesFor(name).firstNotNullOfOrNull { it.grams(u) } ?: defaults[u]
    }

    data class OilLine(val name: String, val grams: Double, val label: String, val calories: Double)

    /** The separate, visible oil/ghee line: level per serving × servings. "Ghee, 2 tsp, 90 kcal". */
    fun oilLine(level: String, ghee: Boolean, servings: Int): OilLine? {
        val tsp = (oilLevels.firstOrNull { it.id == level }?.tsp ?: 0.0) * maxOf(1, servings)
        if (tsp <= 0) return null
        val g = tsp * gramsPerTsp
        val label = if (tsp % 3.0 == 0.0) "${fmt(tsp / 3)} tbsp" else "${fmt(tsp)} tsp"
        return OilLine(if (ghee) "Ghee" else "Cooking oil", g, label, Math.round(g * kcalPerG).toDouble())
    }
    private fun fmt(d: Double) = if (d % 1.0 == 0.0) d.toInt().toString() else d.toString()

    companion object {
        @Volatile private var cached: Portions? = null
        fun get(ctx: Context): Portions = cached ?: synchronized(this) {
            cached ?: Portions(ctx.assets.open("portions.json").bufferedReader().readText()).also { cached = it }
        }
    }
}
