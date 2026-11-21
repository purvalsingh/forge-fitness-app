package app.forge.fitness.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import app.forge.fitness.ui.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.text.font.FontWeight
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import app.forge.fitness.data.NutritionTarget
import app.forge.fitness.data.Store
import app.forge.fitness.data.Tables
import app.forge.fitness.data.nowIso
import app.forge.fitness.data.uid
import app.forge.fitness.logic.Ai
import app.forge.fitness.logic.Calc
import app.forge.fitness.ui.*
import kotlinx.coroutines.launch
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlin.math.abs

@Composable
fun TargetCalcScreen(s: Store, nav: NavController) {
    val st by s.state.collectAsStateWithLifecycle()
    // Missing goal/profile no longer blocks the page: work from defaults and say so.
    val usingDefaults = st.goal == null || st.profile == null
    val g = st.goal ?: app.forge.fitness.data.Goal(id = "goal")
    val p = st.profile ?: app.forge.fitness.data.Profile(id = "me")
    val scope = rememberCoroutineScope()

    val base = remember(g, p) {
        Calc.calcTargets(
            Calc.TargetInput(
                sex = p.sex,
                age = p.age,
                heightCm = p.height_cm,
                weightKg = g.current_weight_kg,
                targetWeightKg = g.target_weight_kg,
                activity = g.activity_level,
                avgSteps = g.avg_daily_steps,
                mode = g.mode,
                rateKgPerWeek = g.rate_kg_per_week,
            )
        )
    }

    val adaptive = remember(st.foodLogs, st.weights) {
        val byDay = mutableMapOf<String, Double>()
        for (l in st.foodLogs) {
            byDay[l.date] = (byDay[l.date] ?: 0.0) + l.calories
        }
        Calc.adaptiveTdee(st.weights, byDay)
    }

    var draft by remember { mutableStateOf<NutritionTarget?>(null) }
    var aiText by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var err by remember { mutableStateOf<String?>(null) }
    var saved by remember { mutableStateOf(false) }

    val current = draft ?: NutritionTarget(
        id = st.target?.id ?: uid(),
        calories = base.calories.toDouble(),
        protein_g = base.protein_g.toDouble(),
        carbs_g = base.carbs_g.toDouble(),
        fat_g = base.fat_g.toDouble(),
        source = "calculated",
    )

    fun updateCurrent(block: (NutritionTarget) -> NutritionTarget) {
        draft = block(current).copy(source = "manual")
        saved = false
    }

    val macroKcal = current.protein_g * 4 + current.carbs_g * 4 + current.fat_g * 9
    val valid = Calc.isValidTarget(current.calories, current.protein_g, current.carbs_g, current.fat_g)

    Screen("Nutrition target", sub = "Calculator", back = { nav.popBackStack() }) {
        if (usingDefaults) Card {
            Text("Using standard body details", fontSize = 15.sp, color = F.text, fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold)
            Spacer(Modifier.height(4.dp))
            Body("${fmt(g.current_weight_kg)} kg, ${fmt(p.height_cm)} cm, age ${p.age}, ${g.activity_level} activity. Add yours in Goals for numbers that fit you.", F.mute, 12)
            Spacer(Modifier.height(10.dp))
            FButton("Add my details", Modifier.fillMaxWidth()) { nav.navigate("more/goals") }
        }

        // The target at a glance: calories plus the macro split it implies.
        Card(paper = true) {
            Eyebrow("Daily target")
            Row(verticalAlignment = Alignment.Bottom) {
                Text(fmt(current.calories), fontSize = 38.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold, color = F.paperInk)
                Text(" kcal", fontSize = 14.sp, color = F.paperDim, modifier = Modifier.padding(bottom = 6.dp))
            }
            // Today against this target: jelly calorie bar plus a liquid bar per macro, each filling to its real share.
            val day = remember(st.foodLogs) { Calc.sumTotals(st.foodLogs.filter { it.date == Calc.today() }) }
            Spacer(Modifier.height(10.dp))
            JellyBar((day.calories / current.calories.coerceAtLeast(1.0)).toFloat(), 14.dp)
            Spacer(Modifier.height(4.dp))
            Text("Today ${fmt(day.calories)} of ${fmt(current.calories)} kcal", fontSize = 12.sp, color = F.paperDim)
            Spacer(Modifier.height(12.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                listOf(Triple("Protein", current.protein_g to day.protein_g, F.protein to 4.0), Triple("Carbs", current.carbs_g to day.carbs_g, F.carbs to 4.0), Triple("Fat", current.fat_g to day.fat_g, F.fat to 9.0)).forEach { (label, gd, cm) ->
                    val (grams, eaten) = gd
                    Column(Modifier.weight(1f)) {
                        Text(label, fontSize = 12.sp, color = cm.first, fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold)
                        Text("${fmt(grams)} g", fontSize = 18.sp, color = F.paperInk, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold)
                        Text("${if (macroKcal > 0) Math.round(grams * cm.second / macroKcal * 100) else 0}% of kcal", fontSize = 12.sp, color = F.paperDim)
                        Spacer(Modifier.height(6.dp))
                        ProgressBar((eaten / grams.coerceAtLeast(1.0)).toFloat(), cm.first, 6.dp)
                        Text("${fmt(eaten)} g today", fontSize = 11.sp, color = F.paperDim, modifier = Modifier.padding(top = 3.dp))
                    }
                }
            }
        }

        Card {
            Eyebrow("How it's worked out")
            Spacer(Modifier.height(8.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Column(
                    Modifier.weight(1f).clip(RoundedCornerShape(12.dp)).background(F.raised).padding(10.dp)
                ) {
                    Eyebrow("Maintenance")
                    Spacer(Modifier.height(2.dp))
                    Figure("${fmt(base.maintenance.toDouble())} kcal", size = 18)
                }
                Column(
                    Modifier.weight(1f).clip(RoundedCornerShape(12.dp)).background(F.raised).padding(10.dp)
                ) {
                    Eyebrow("Rate")
                    Spacer(Modifier.height(2.dp))
                    Figure("${fmt(base.rate_kg_per_week, 2)} kg/wk", size = 18)
                }
            }
            Spacer(Modifier.height(8.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Column(
                    Modifier.weight(1f).clip(RoundedCornerShape(12.dp)).background(F.raised).padding(10.dp)
                ) {
                    Eyebrow("Goal")
                    Spacer(Modifier.height(2.dp))
                    Figure(g.mode.replaceFirstChar { it.uppercase() }, size = 18)
                }
                Column(
                    Modifier.weight(1f).clip(RoundedCornerShape(12.dp)).background(F.raised).padding(10.dp)
                ) {
                    Eyebrow("Timeframe")
                    Spacer(Modifier.height(2.dp))
                    Figure(if (base.weeks_to_target != null) "${base.weeks_to_target} weeks" else "—", size = 18)
                }
            }
            if (base.warnings.isNotEmpty()) {
                Spacer(Modifier.height(10.dp))
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    base.warnings.forEach { w -> Notice(w, Tone.Warn) }
                }
            }
        }

        Card {
            Eyebrow("Adaptive maintenance")
            Spacer(Modifier.height(4.dp))
            if (adaptive != null) {
                Figure("${fmt(adaptive.tdee.toDouble())} kcal", size = 24)
                Spacer(Modifier.height(4.dp))
                Body(
                    "From your last ${adaptive.loggedDays} logged days and a ${if (adaptive.trendDeltaKg > 0) "+" else ""}${adaptive.trendDeltaKg} kg weight-trend change. Formula says ${fmt(base.maintenance.toDouble())}. Missed logs make this read low.",
                    color = F.mute,
                    size = 12
                )
                val offset = base.calories - base.maintenance
                Spacer(Modifier.height(8.dp))
                FButton(
                    text = "Apply to target (${if (offset >= 0) "+" else ""}$offset kcal goal offset)",
                    modifier = Modifier.fillMaxWidth(),
                    variant = Variant.Ghost,
                    onClick = {
                        val newCals = (adaptive.tdee + offset).toDouble()
                        updateCurrent { it.copy(calories = newCals) }
                    }
                )
            } else {
                Body(
                    "Log food on 14 of the last 21 days and weigh in at least twice, a week apart, and FORGE will learn your real maintenance from your data.",
                    color = F.mute,
                    size = 12
                )
            }
        }

        Card {
            Eyebrow("Your target")
            Spacer(Modifier.height(4.dp))
            Body("Tap a number to change it.", F.mute, 12)
            Spacer(Modifier.height(8.dp))
            listOf(
                Triple("Calories", "kcal", current.calories) to { v: Double -> updateCurrent { it.copy(calories = v) } },
                Triple("Protein", "g", current.protein_g) to { v: Double -> updateCurrent { it.copy(protein_g = v) } },
                Triple("Carbs", "g", current.carbs_g) to { v: Double -> updateCurrent { it.copy(carbs_g = v) } },
                Triple("Fat", "g", current.fat_g) to { v: Double -> updateCurrent { it.copy(fat_g = v) } },
            ).forEachIndexed { i, (row, set) ->
                if (i > 0) RowDivider()
                Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(row.first, Modifier.weight(1f), color = F.text, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                    Box(Modifier.width(120.dp)) { NumberInput(row.third, onCommit = { v -> if (v != null) set(v) }) }
                    Text(row.second, Modifier.width(40.dp).padding(start = 10.dp), color = F.mute, fontSize = 13.sp)
                }
            }
            Spacer(Modifier.height(6.dp))
            Body(
                "Macros add up to ${fmt(macroKcal)} kcal" +
                        if (abs(macroKcal - current.calories) > current.calories * 0.05) " — that differs from the calorie target." else ".",
                color = F.mute,
                size = 12
            )
            if (!valid) {
                Spacer(Modifier.height(6.dp))
                Notice("These values are outside a sane range and cannot be saved.", Tone.Error)
            }
            if (draft != null) {
                Spacer(Modifier.height(8.dp))
                FButton("Reset to calculated", Modifier.fillMaxWidth(), Variant.Ghost) {
                    draft = null
                    saved = false
                }
            }
        }

        Card {
            Eyebrow("AI personalisation")
            Spacer(Modifier.height(4.dp))
            Body(
                "FORGE calculates these numbers. The AI explains them and may suggest small changes. This is an estimate, not medical advice.",
                color = F.mute,
                size = 12
            )
            val aiAvailable = s.api.configured && !st.localMode
            if (!aiAvailable) {
                Spacer(Modifier.height(8.dp))
                Notice("AI is not set up. The target above still works.", Tone.Warn)
            }
            err?.let {
                Spacer(Modifier.height(8.dp))
                Notice(it, Tone.Error)
            }
            Spacer(Modifier.height(8.dp))
            if (busy) {
                Spinner("Asking AI")
            } else {
                FButton(
                    text = "Explain & personalise",
                    modifier = Modifier.fillMaxWidth(),
                    variant = Variant.Quiet,
                    enabled = aiAvailable,
                    onClick = {
                        busy = true
                        err = null
                        scope.launch {
                            try {
                                val inputPayload = buildJsonObject {
                                    put("profile", buildJsonObject {
                                        put("sex", p.sex)
                                        put("age", p.age)
                                        put("height_cm", p.height_cm)
                                    })
                                    put("goal", buildJsonObject {
                                        put("mode", g.mode)
                                        put("current_weight_kg", g.current_weight_kg)
                                        put("target_weight_kg", g.target_weight_kg)
                                        put("activity_level", g.activity_level)
                                        put("avg_daily_steps", g.avg_daily_steps)
                                        put("rate_kg_per_week", g.rate_kg_per_week)
                                    })
                                    put("calculated", buildJsonObject {
                                        put("maintenance", base.maintenance)
                                        put("calories", base.calories)
                                        put("protein_g", base.protein_g)
                                        put("carbs_g", base.carbs_g)
                                        put("fat_g", base.fat_g)
                                    })
                                }
                                val adv = Ai.targetAdvice(s.api, inputPayload)
                                aiText = adv.summary
                                adv.adjustments?.let { adj ->
                                    val merged = current.copy(
                                        calories = adj.calories?.toDouble() ?: current.calories,
                                        protein_g = adj.proteinG?.toDouble() ?: current.protein_g,
                                        carbs_g = adj.carbsG?.toDouble() ?: current.carbs_g,
                                        fat_g = adj.fatG?.toDouble() ?: current.fat_g,
                                        source = "ai",
                                    )
                                    if (Calc.isValidTarget(merged.calories, merged.protein_g, merged.carbs_g, merged.fat_g)) {
                                        draft = merged
                                    }
                                }
                            } catch (e: Exception) {
                                err = e.message ?: "AI is unavailable right now."
                            } finally {
                                busy = false
                            }
                        }
                    }
                )
            }
            aiText?.let { t ->
                Spacer(Modifier.height(10.dp))
                Column(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp))
                        .background(F.raised)
                        .border(1.dp, F.line, RoundedCornerShape(14.dp))
                        .padding(12.dp)
                ) {
                    Eyebrow("AI-generated estimate")
                    Spacer(Modifier.height(4.dp))
                    Body(t, color = F.text, size = 13)
                    Spacer(Modifier.height(6.dp))
                    Body("Review and adjust before accepting.", color = F.mute, size = 11)
                }
            }
        }

        if (saved) {
            Notice("Target saved. Today's screen now uses it.", Tone.Info)
        }

        FButton(
            text = "Accept target",
            modifier = Modifier.fillMaxWidth(),
            enabled = valid,
            onClick = {
                val row = current.copy(
                    id = st.target?.id ?: uid(),
                    note = aiText,
                    updated_at = nowIso()
                )
                s.save(Tables.targets, row)
                saved = true
            }
        )

        FButton(
            text = "Back to today",
            modifier = Modifier.fillMaxWidth(),
            variant = Variant.Ghost,
            onClick = { nav.navigate("today") }
        )
    }
}
