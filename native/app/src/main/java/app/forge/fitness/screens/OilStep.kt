package app.forge.fitness.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Checkbox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.forge.fitness.data.FoodLog
import app.forge.fitness.data.Store
import app.forge.fitness.data.Tables
import app.forge.fitness.data.uid
import app.forge.fitness.logic.Portions
import app.forge.fitness.ui.*

/** A food in the meal being logged, as the oil question sees it. */
data class OilFood(val name: String, val fatPer100: Double? = null)

/**
 * The once-per-meal oil/ghee question for home-cooked food (dal, sabzi, curry, paratha, tadka, fried), same rules as
 * the web app. Per serving: None / A little / Normal / A lot, oil or ghee; restaurant food starts at "A lot".
 * Saved as its own visible log line ("Ghee, 2 tsp, 90 kcal"), never folded into the dish.
 */
class OilStep(private val p: Portions, private val s: Store, foods: List<OilFood>) {
    // Lean home-cooked dishes only; one serving per dish (2 katori of dal is one dish, not two oil servings).
    val cooked = foods.filter { p.asksOil(it.name, it.fatPer100) && !s.flag("oil_skip:${it.name.lowercase()}") }
    val servings = maxOf(1, cooked.size)
    val ask = cooked.isNotEmpty() && foods.none { p.isFat(it.name) }
    var level by mutableStateOf<String?>(if (cooked.any { p.isRestaurant(it.name) }) p.restaurantDefault else p.homeDefault)
    var ghee by mutableStateOf(false)
    var noAsk by mutableStateOf(false)
    val line get() = if (ask) level?.let { p.oilLine(it, ghee, servings) } else null
    val levels get() = p.oilLevels

    suspend fun save(date: String, mealTypeId: String) {
        line?.let { l ->
            s.save(Tables.foodLogs, FoodLog(id = uid(), date = date, meal_type_id = mealTypeId, name = l.name, qty = l.grams, unit = "g",
                source = "manual", serving_label = l.label, calories = l.calories, protein_g = 0.0, carbs_g = 0.0, fat_g = l.grams))
        }
        if (noAsk) cooked.forEach { s.setFlag("oil_skip:${it.name.lowercase()}") }
    }
}

@Composable
fun rememberOilStep(s: Store, foods: List<OilFood>): OilStep {
    val ctx = LocalContext.current
    return remember(foods) { OilStep(Portions.get(ctx), s, foods) }
}

@Composable
fun OilQuestion(o: OilStep) {
    if (!o.ask) return
    Card {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Oil or ghee on top of the recipe?", color = F.text, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
            Body("${if (o.servings > 1) "${o.servings} home-cooked dishes. " else ""}Tadka, ghee on roti: how much was added to each?", F.mute, 12)
            o.levels.chunked(2).forEach { pair ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    pair.forEach { l -> Chip(l.label, o.level == l.id, Modifier.weight(1f)) { o.level = l.id } }
                }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Chip("Oil", !o.ghee, Modifier.weight(1f)) { o.ghee = false }
                Chip("Ghee", o.ghee, Modifier.weight(1f)) { o.ghee = true }
            }
            o.line?.let { l ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("${l.name}, ${l.label}", fontFamily = Mono, fontSize = 12.sp, color = F.text)
                    Text("${l.calories.toInt()} kcal", fontFamily = Mono, fontSize = 12.sp, color = F.text, fontWeight = FontWeight.Bold)
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(o.noAsk, { o.noAsk = it })
                Text(if (o.cooked.size == 1) "Don't ask again for this food" else "Don't ask again for these foods", color = F.text, fontSize = 13.sp)
            }
        }
    }
}
