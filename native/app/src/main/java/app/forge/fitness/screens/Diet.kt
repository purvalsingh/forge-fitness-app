package app.forge.fitness.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import app.forge.fitness.ui.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import app.forge.fitness.data.Store
import app.forge.fitness.data.Tables
import app.forge.fitness.logic.Calc
import app.forge.fitness.ui.*
import kotlinx.coroutines.launch
import kotlin.math.max

@Composable
fun DietScreen(s: Store, nav: NavController) {
    val st by s.state.collectAsStateWithLifecycle()
    val date by s.date.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()

    var addMealId by remember { mutableStateOf<String?>(null) }
    var editing by remember { mutableStateOf<app.forge.fitness.data.FoodLog?>(null) }
    var undo by remember { mutableStateOf<app.forge.fitness.data.FoodLog?>(null) }
    LaunchedEffect(undo) { if (undo != null) { kotlinx.coroutines.delay(6000); undo = null } }
    val remove = { l: app.forge.fitness.data.FoodLog -> scope.launch { s.del(Tables.foodLogs, l.id) }; undo = l; editing = null }

    val logs = remember(st.foodLogs, date) { st.foodLogs.filter { it.date == date } }
    val totals = remember(logs) { Calc.sumTotals(logs) }
    val byMeal = remember(logs) { Calc.totalsByMeal(logs) }
    val t = st.target
    // No saved target: fill against maintenance estimated from the profile (or 2,000) and say so.
    val goalKcal = t?.calories ?: st.profile?.let { p -> st.goal?.let { g ->
        Calc.tdee(p.sex, g.current_weight_kg, p.height_cm, p.age, g.activity_level, g.avg_daily_steps).toDouble() } } ?: 2000.0
    val remaining = max(0.0, goalKcal - totals.calories)

    Screen(
        title = "Diet",
        sub = app.forge.fitness.logic.Calc.safeDate(date).format(java.time.format.DateTimeFormatter.ofPattern("EEE, d MMM")),
        back = { nav.popBackStack() }
    ) {
        // Target Card (Paper)
        Card(paper = true) {
            Eyebrow("Calories")
            Spacer(Modifier.height(4.dp))
            Row(verticalAlignment = Alignment.Bottom) {
                Text(
                    text = "${Math.round(totals.calories)}",
                    fontSize = 38.sp,
                    fontWeight = FontWeight.Bold,
                    color = F.paperInk,
                    letterSpacing = (-0.5).sp
                )
                Spacer(Modifier.width(6.dp))
                Text(
                    text = "/ ${"%,d".format(Math.round(goalKcal))}${if (t == null) " est." else ""}",
                    fontFamily = Mono,
                    fontSize = 14.sp,
                    color = F.paperDim,
                    modifier = Modifier.padding(bottom = 4.dp)
                )
            }
            Spacer(Modifier.height(4.dp))
            Text(
                text = if (t != null) "Remaining: ${Math.round(remaining)} kcal" else "About ${Math.round(remaining)} kcal left.\nSet a target for an exact goal.",
                lineHeight = 18.sp,
                fontFamily = Mono,
                fontSize = 12.sp,
                color = F.paperDim
            )
            Spacer(Modifier.height(6.dp))
            JellyBar((totals.calories / goalKcal).toFloat(), 12.dp)
            val kSum = totals.protein_g * 4 + totals.carbs_g * 4 + totals.fat_g * 9

            Spacer(Modifier.height(14.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                listOf(
                    Triple("Protein", totals.protein_g, Triple(t?.protein_g, F.protein, 4.0)),
                    Triple("Carbs", totals.carbs_g, Triple(t?.carbs_g, F.carbs, 4.0)),
                    Triple("Fat", totals.fat_g, Triple(t?.fat_g, F.fat, 9.0))
                ).forEach { (label, value, extra) ->
                    val (target, color, kcalPerG) = extra
                    // With a target the bar fills toward it; without one it shows this macro's share of today's calories.
                    val frac = if (target != null && target > 0) (value / target).toFloat() else if (kSum > 0) (value * kcalPerG / kSum).toFloat() else 0f
                    Column(Modifier.weight(1f)) {
                        Eyebrow(label)
                        Spacer(Modifier.height(2.dp))
                        Text("${Math.round(value)}${target?.let { " / ${Math.round(it)}" } ?: ""} g", fontFamily = Mono, fontSize = 13.sp, color = F.paperDim)
                        Spacer(Modifier.height(6.dp))
                        ProgressBar(value = frac, color = color, height = 4.dp)
                    }
                }
            }
        }

        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            ActionTile(Icons.Filled.PhotoCamera, "Scan food", "Photo or barcode", Modifier.weight(1f)) { nav.navigate("diet/camera") }
            ActionTile(Icons.Filled.AutoAwesome, "Quick meals", "Saved plates", Modifier.weight(1f)) { nav.navigate("more/recipes") }
        }

        // Meal sections
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            st.mealTypes.forEach { m ->
                val mLogs = logs.filter { it.meal_type_id == m.id }
                val mt = byMeal[m.id]

                Card {
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.Top
                    ) {
                        Column {
                            Title(m.name, 18)
                            if (m.time.isNotBlank()) {
                                Text(m.time, fontFamily = Mono, fontSize = 12.sp, color = F.mute)
                            }
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            Figure("${Math.round(mt?.calories ?: 0.0)}", 17)
                            Eyebrow("KCAL", F.mute)
                        }
                    }

                    undo?.takeIf { it.meal_type_id == m.id }?.let { u ->
                        Spacer(Modifier.height(8.dp))
                        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(F.high).padding(horizontal = 12.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically) {
                            Text("Deleted ${u.name}", color = F.text, fontSize = 13.sp, modifier = Modifier.weight(1f), maxLines = 1)
                            Text("Undo", color = F.accent, fontSize = 13.sp, fontWeight = FontWeight.Bold,
                                modifier = Modifier.clickable { s.save(Tables.foodLogs, u); undo = null }.padding(8.dp))
                        }
                    }

                    if (mLogs.isNotEmpty()) {
                        Spacer(Modifier.height(10.dp))
                        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            mLogs.forEachIndexed { idx, l ->
                                Row(
                                    Modifier
                                        .fillMaxWidth()
                                        .padding(vertical = 4.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Column(Modifier.weight(1f).clickable { editing = l }) {
                                        Text(l.name, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = F.text)
                                        val sub = buildString {
                                            append("${Calc.round1(l.qty)} ${l.unit} · P${Calc.round1(l.protein_g)} C${Calc.round1(l.carbs_g)} F${Calc.round1(l.fat_g)}")
                                            if (l.source.startsWith("ai")) append(" · AI")
                                        }
                                        Text(sub, fontFamily = Mono, fontSize = 12.sp, color = F.mute)
                                    }

                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                                    ) {
                                        Text("${Math.round(l.calories)}", fontFamily = Mono, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = F.text)
                                        IconButton(
                                            onClick = { remove(l) },
                                            modifier = Modifier.size(24.dp)
                                        ) {
                                            Icon(Icons.Filled.Delete, contentDescription = "Delete ${l.name}", tint = F.mute, modifier = Modifier.size(16.dp))
                                        }
                                    }
                                }
                                if (idx < mLogs.size - 1) {
                                    Divider()
                                }
                            }
                        }

                        if (mt != null) {
                            Spacer(Modifier.height(8.dp))
                            Text(
                                text = "P ${Calc.round1(mt.protein_g)}g · C ${Calc.round1(mt.carbs_g)}g · F ${Calc.round1(mt.fat_g)}g",
                                fontFamily = Mono,
                                fontSize = 12.sp,
                                color = F.dim
                            )
                        }
                    }

                    Spacer(Modifier.height(10.dp))
                    FButton(
                        text = "+ Add food",
                        modifier = Modifier.fillMaxWidth(),
                        variant = Variant.Quiet,
                        onClick = { addMealId = m.id }
                    )
                }
            }
        }

        // Summary Stats
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Stat(label = "Entries", value = "${logs.size}", modifier = Modifier.weight(1f))
            val loggedMealCount = st.mealTypes.count { byMeal[it.id] != null }
            Stat(label = "Meals logged", value = "$loggedMealCount/${st.mealTypes.size}", modifier = Modifier.weight(1f))
        }

        editing?.let { l -> EditFoodSheet(l, onClose = { editing = null }, onSave = { s.save(Tables.foodLogs, it); editing = null }, onDelete = { remove(l) }) }

        if (addMealId != null) {
            AddFoodSheet(
                open = true,
                onClose = { addMealId = null },
                date = date,
                mealTypeId = addMealId ?: st.mealTypes.firstOrNull()?.id ?: "",
                s = s,
                nav = nav
            )
        }
    }
}

/** Change the amount of a logged food; nutrition scales with it. */
@Composable
private fun EditFoodSheet(log: app.forge.fitness.data.FoodLog, onClose: () -> Unit, onSave: (app.forge.fitness.data.FoodLog) -> Unit, onDelete: () -> Unit) {
    var qty by remember(log.id) { mutableStateOf(Calc.round1(log.qty).toString().removeSuffix(".0")) }
    val n = qty.toDoubleOrNull()
    val ok = n != null && n > 0 && n <= 2500
    val k = if (ok && log.qty > 0) n!! / log.qty else 1.0
    val kcal = Math.round(log.calories * k).toDouble()
    Sheet(true, log.name, onClose) {
        Field("Amount (${log.unit})", if (ok) "${kcal.toInt()} kcal · P${Calc.round1(log.protein_g * k)} C${Calc.round1(log.carbs_g * k)} F${Calc.round1(log.fat_g * k)}" else "Enter an amount above 0.") {
            Input(qty, { qty = it }, number = true)
        }
        Spacer(Modifier.height(16.dp))
        FButton("Save", Modifier.fillMaxWidth(), enabled = ok) {
            onSave(log.copy(qty = n!!, calories = kcal, protein_g = Calc.round1(log.protein_g * k), carbs_g = Calc.round1(log.carbs_g * k),
                fat_g = Calc.round1(log.fat_g * k), serving_label = if (k == 1.0) log.serving_label else null))
        }
        Spacer(Modifier.height(8.dp))
        FButton("Delete", Modifier.fillMaxWidth(), Variant.Danger) { onDelete() }
    }
}
