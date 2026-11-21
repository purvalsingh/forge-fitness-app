package app.forge.fitness.screens

import kotlinx.coroutines.launch
import androidx.compose.material3.Checkbox
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import app.forge.fitness.ui.Text
import androidx.compose.ui.graphics.Color
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
import app.forge.fitness.logic.Calc
import app.forge.fitness.ui.*
import kotlin.math.roundToInt

fun nameOf(exId: String): String =
    exId.removePrefix("ex-")
        .split("-")
        .joinToString(" ") { word ->
            word.replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() }
        }

@Composable
fun WorkoutScreen(s: Store, nav: NavController) {
    val state by s.state.collectAsStateWithLifecycle()
    val date by s.date.collectAsStateWithLifecycle()

    val plan = state.plans.firstOrNull { it.active == true } ?: state.plans.firstOrNull()

    if (plan == null) {
        Screen(title = "Train") {
            Empty(
                title = "No workout plan",
                body = "Create a plan, or train freestyle and pick exercises as you go.",
                action = {
                    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        FButton(text = "Open plan builder", modifier = Modifier.fillMaxWidth()) {
                            nav.navigate("more/plan")
                        }
                        FButton(text = "Freestyle session", variant = Variant.Quiet, modifier = Modifier.fillMaxWidth()) {
                            nav.navigate("workout/session/freestyle")
                        }
                    }
                }
            )
        }
        return
    }

    var dayId by remember(plan.id) { mutableStateOf(plan.days.firstOrNull()?.id ?: "") }
    val day = plan.days.firstOrNull { it.id == dayId } ?: plan.days.firstOrNull() ?: return

    val session = state.sessions.firstOrNull { it.date == date && it.day_id == day.id }
    val doneSets = session?.let { Calc.sessionSets(it) } ?: 0
    val totalSets = day.exercises.sumOf { it.sets }
    val recent = remember(state.sessions) {
        state.sessions.filter { it.finished_at != null }.sortedByDescending { it.date }.take(5)
    }

    var reviewOpen by remember { mutableStateOf(false) }
    TrainingReviewSheet(s, reviewOpen) { reviewOpen = false }
    Screen(
        title = "Train",
        sub = "Today's training",
        right = {
            IconButton(onClick = { nav.navigate("more/plan") }) {
                Icon(Icons.Filled.Settings, contentDescription = "Plan builder", tint = F.text)
            }
        }
    ) {
        // A grid, not a sideways scroll: every shortcut stays visible, none cut off at the screen edge.
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Chip("Review training", false, Modifier.weight(1f)) { reviewOpen = true }
                Chip("Freestyle", false, Modifier.weight(1f)) { nav.navigate("workout/session/freestyle") }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Chip("History", false, Modifier.weight(1f)) { nav.navigate("history") }
                Chip("Exercises", false, Modifier.weight(1f)) { nav.navigate("exercises") }
                Chip("Plans", false, Modifier.weight(1f)) { nav.navigate("more/plan") }
            }
        }

        Card(paper = true) {
            Eyebrow(plan.name, color = F.paperDim)
            Spacer(Modifier.height(4.dp))
            Title(day.name, 24)
            if (day.focus.isNotBlank()) {
                Text(day.focus.replace('_', ' ').replaceFirstChar { it.uppercase() }, color = F.paperDim, fontSize = 12.sp)
            }
            Spacer(Modifier.height(12.dp))
            Tabs(
                value = dayId.ifEmpty { plan.days.first().id },
                options = plan.days.mapIndexed { idx, d -> d.id to "Day ${idx + 1}" },
                onChange = { dayId = it }
            )
            Spacer(Modifier.height(12.dp))
            Row(
                Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Box(Modifier.weight(1f)) {
                    ProgressBar(
                        value = if (totalSets > 0) doneSets.toFloat() / totalSets else 0f,
                        color = F.accent
                    )
                }
                Text("$doneSets/$totalSets", color = F.paperDim, fontFamily = Mono, fontSize = 12.sp)
            }
            Spacer(Modifier.height(12.dp))
            FButton(
                text = if (session?.finished_at != null) "View workout" else if (session != null) "Continue workout" else "Start workout",
                modifier = Modifier.fillMaxWidth()
            ) {
                nav.navigate("workout/session/${day.id}")
            }
        }

        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            day.exercises.forEachIndexed { i, ex ->
                val se = session?.exercises?.firstOrNull { it.workout_exercise_id == ex.id }
                val isDone = se?.sets?.isNotEmpty() == true && se.sets.all { it.done }

                Card(onClick = { nav.navigate("workout/session/${day.id}") }) {
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Box(
                            Modifier
                                .size(24.dp)
                                .clip(RoundedCornerShape(6.dp))
                                .background(if (isDone) F.lime else Color.Transparent)
                                .border(1.dp, if (isDone) F.lime else F.line, RoundedCornerShape(6.dp)),
                            contentAlignment = Alignment.Center
                        ) {
                            if (isDone) {
                                Icon(Icons.Filled.Check, contentDescription = "Done", tint = Color.Black, modifier = Modifier.size(14.dp))
                            }
                        }

                        Column(Modifier.weight(1f)) {
                            Text(
                                ex.name ?: nameOf(ex.exercise_id),
                                color = F.text,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Bold
                            )
                            Spacer(Modifier.height(2.dp))
                            Text(
                                "${ex.sets} × ${ex.reps}${if (ex.target.isNotBlank()) " · ${ex.target}" else ""}",
                                color = F.mute,
                                fontSize = 12.sp
                            )
                        }

                        Eyebrow("${i + 1}")
                    }
                }
            }
        }

        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Stat(
                label = "Sessions",
                value = "${state.sessions.count { it.finished_at != null }}",
                modifier = Modifier.weight(1f)
            )
            Stat(
                label = "Last volume",
                value = recent.firstOrNull()?.let { "${fmt(Calc.sessionVolume(it))} kg" } ?: "—",
                modifier = Modifier.weight(1f)
            )
            Stat(
                label = "Plan days",
                value = "${plan.days.size}",
                modifier = Modifier.weight(1f)
            )
        }

        if (recent.isNotEmpty()) {
            Card {
                Eyebrow("Recent sessions")
                Spacer(Modifier.height(8.dp))
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    recent.forEach { r ->
                        Row(
                            Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text("${r.date} · ${r.day_name}", color = F.text, fontSize = 12.sp, modifier = Modifier.weight(1f))
                            Text(
                                "${Calc.sessionSets(r)} sets · ${fmt(Calc.sessionVolume(r))} kg",
                                color = F.mute,
                                fontFamily = Mono,
                                fontSize = 12.sp
                            )
                        }
                    }
                }
            }
        }
    }
}


/**
 * "Review my training": sends recent sets (weight × reps @ RPE) to the AI, shows trends and next-session targets,
 * and lets the user accept targets, which pre-fill their next sessions once (Store.saveAiTargets).
 */
@Composable
private fun TrainingReviewSheet(s: Store, open: Boolean, onClose: () -> Unit) {
    val st by s.state.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    var days by remember { mutableStateOf(28) }
    var busy by remember { mutableStateOf(false) }
    var err by remember { mutableStateOf<String?>(null) }
    var review by remember { mutableStateOf<app.forge.fitness.logic.Ai.TrainingReview?>(null) }
    var picked by remember { mutableStateOf(setOf<String>()) }
    var saved by remember { mutableStateOf(false) }

    Sheet(open, "Review my training", onClose) {
        Body("FORGE looks at the weights, reps and RPE you logged and suggests what to lift next. You can always type a different weight in the session.", size = 13)
        Tabs(days, listOf(7 to "1 week", 28 to "4 weeks", 90 to "3 months")) { days = it; review = null }
        val since = app.forge.fitness.logic.Calc.addDays(app.forge.fitness.logic.Calc.today(), -days)
        val recent = st.sessions.filter { it.date >= since && it.finished_at != null }.sortedBy { it.date }
        // Each session in performed order with rest times, so the AI can tell fatigue drift from real strength change.
        val history = recent.mapNotNull { app.forge.fitness.logic.Training.sessionLog(it) }
        if (history.isEmpty()) { Notice("No finished workouts in this period yet. Log a few sessions (with RPE) and come back."); return@Sheet }
        Body("${recent.size} workouts, with set order and rest times", size = 12)
        err?.let { Notice(it, Tone.Error) }
        if (st.localMode) Notice("The AI review needs an account and your Gemini keys. Your next-session weights are still suggested automatically from RPE.")
        val r = review
        if (r == null) {
            if (busy) Spinner("Reviewing your training") else FButton("Review ${if (days == 7) "this week" else if (days == 28) "the last 4 weeks" else "the last 3 months"}",
                Modifier.fillMaxWidth(), enabled = !st.localMode) {
                busy = true; err = null
                scope.launch {
                    try {
                        val best = recent.flatMap { it.exercises }.groupBy { it.name.lowercase() }
                            .mapValues { (_, es) -> es.flatMap { it.sets }.filter { it.warmup != true }.maxOfOrNull { it.weight_kg ?: 0.0 } ?: 0.0 }
                        val g = st.goal; val p = st.profile
                        val profile = kotlinx.serialization.json.buildJsonObject {
                            p?.let { put("age", kotlinx.serialization.json.JsonPrimitive(it.age)); put("sex", kotlinx.serialization.json.JsonPrimitive(it.sex)) }
                            g?.let { put("goal", kotlinx.serialization.json.JsonPrimitive(it.mode)); put("days_per_week", kotlinx.serialization.json.JsonPrimitive(it.training_days_per_week)) }
                        }
                        val res = app.forge.fitness.logic.Ai.trainingReview(s.api, if (days == 7) "last week" else if (days == 28) "last 4 weeks" else "last 3 months",
                            history.takeLast(40).joinToString("\n\n"), profile, best, (st.settings.coach ?: app.forge.fitness.data.CoachPrefs()).max_jump_pct)
                        review = res; picked = res.targets.map { it.name }.toSet(); saved = false
                    } catch (e: Exception) { err = e.message ?: "The review didn't come through. Try again." } finally { busy = false }
                }
            }
        } else {
            Card { Eyebrow("What FORGE sees"); Spacer(Modifier.height(6.dp)); Body(r.summary, color = F.text, size = 14)
                r.changes.forEach { c -> Spacer(Modifier.height(6.dp)); Body("• $c", size = 13) } }
            if (r.targets.isNotEmpty()) {
                Eyebrow("Next session targets")
                r.targets.forEach { t ->
                    val on = t.name in picked
                    Card(onClick = { picked = if (on) picked - t.name else picked + t.name }) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Checkbox(on, { picked = if (on) picked - t.name else picked + t.name })
                            Column(Modifier.weight(1f)) {
                                Text("${t.name}  ·  ${if (t.weightKg % 1.0 == 0.0) t.weightKg.toInt() else t.weightKg} kg × ${t.reps}", color = F.text, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                                Body(t.reason, size = 12)
                            }
                        }
                    }
                }
                if (saved) Notice("Saved. Your next session pre-fills these weights (with warm-ups). Type a lower weight any time if a set feels too heavy.")
                else FButton("Use ${picked.size} for my next sessions", Modifier.fillMaxWidth(), enabled = picked.isNotEmpty()) {
                    s.saveAiTargets(r.targets.filter { it.name in picked }.map { Store.AiTarget(it.name, it.weightKg, it.reps, it.reason) }); saved = true
                }
            }
            FButton("Review again", Modifier.fillMaxWidth(), Variant.Ghost) { review = null }
        }
    }
}
