package app.forge.fitness.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import app.forge.fitness.ui.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import app.forge.fitness.data.Goal
import app.forge.fitness.data.Store
import app.forge.fitness.data.Tables
import app.forge.fitness.data.nowIso
import app.forge.fitness.data.uid
import app.forge.fitness.ui.*
import kotlin.math.abs

private data class GoalModeOption(val value: String, val title: String, val body: String)
private val MODES = listOf(
    GoalModeOption("cut", "Cut", "Lose body fat"),
    GoalModeOption("maintain", "Maintain", "Hold current weight"),
    GoalModeOption("bulk", "Bulk", "Build size"),
)

private data class ActivityLevelOption(val value: String, val label: String)
private val LEVELS = listOf(
    ActivityLevelOption("sedentary", "Sedentary"),
    ActivityLevelOption("light", "Light"),
    ActivityLevelOption("moderate", "Moderate"),
    ActivityLevelOption("high", "High"),
    ActivityLevelOption("athlete", "Athlete"),
)

@Composable
fun GoalsScreen(s: Store, nav: NavController) {
    val st by s.state.collectAsStateWithLifecycle()
    val initialGoal = remember(st.goal) {
        st.goal ?: Goal(
            id = uid(),
            mode = "maintain",
            current_weight_kg = 75.0,
            target_weight_kg = 75.0,
            activity_level = "moderate",
            avg_daily_steps = 8000,
            training_days_per_week = 5,
            training_minutes = 60,
            rate_kg_per_week = 0.4,
            updated_at = nowIso(),
        )
    }

    var g by remember(initialGoal) { mutableStateOf(initialGoal) }
    var saved by remember { mutableStateOf(false) }

    fun set(block: (Goal) -> Goal) {
        g = block(g)
        saved = false
    }

    val start = st.goal?.current_weight_kg ?: g.current_weight_kg
    val latest = st.weights.maxByOrNull { it.date }?.weight_kg ?: g.current_weight_kg
    val span = g.target_weight_kg - start
    val progress = if (abs(span) < 0.05) 1.0 else ((latest - start) / span).coerceIn(0.0, 1.0)

    val invalid = g.current_weight_kg < 25.0 || g.current_weight_kg > 400.0 ||
            g.target_weight_kg < 25.0 || g.target_weight_kg > 400.0 ||
            (g.mode == "cut" && g.target_weight_kg > g.current_weight_kg) ||
            (g.mode == "bulk" && g.target_weight_kg < g.current_weight_kg)

    Screen("Goals", sub = "Cut · Maintain · Bulk", back = { nav.popBackStack() }) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            MODES.forEach { m ->
                val sel = g.mode == m.value
                val shape = RoundedCornerShape(22.dp)
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .clip(shape)
                        .background(if (sel) F.raised else F.surface)
                        .border(1.dp, if (sel) F.accent else F.line, shape)
                        .clickable { set { it.copy(mode = m.value) } }
                        .padding(12.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Title(m.title, size = 18)
                    Spacer(Modifier.height(4.dp))
                    Body(m.body, color = F.mute, size = 10)
                }
            }
        }

        Card(paper = true) {
            Eyebrow("Progress to target")
            Spacer(Modifier.height(4.dp))
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Bottom
            ) {
                Figure("$latest kg", size = 26)
                Text("target ${g.target_weight_kg} kg", color = F.paperDim, fontSize = 12.sp)
            }
            Spacer(Modifier.height(8.dp))
            ProgressBar(value = progress.toFloat(), color = F.accent, height = 8.dp)
            Spacer(Modifier.height(4.dp))
            Text(
                "${(progress * 100).toInt()}% · started at $start kg",
                color = F.paperDim,
                fontSize = 12.sp
            )
        }

        Card {
            Eyebrow("Body")
            Spacer(Modifier.height(8.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Box(Modifier.weight(1f)) {
                    Field(label = "Current weight (kg)") {
                        NumberInput(
                            value = g.current_weight_kg,
                            onCommit = { v -> if (v != null) set { it.copy(current_weight_kg = v) } },
                            placeholder = "75.0"
                        )
                    }
                }
                Box(Modifier.weight(1f)) {
                    Field(label = "Target weight (kg)") {
                        NumberInput(
                            value = g.target_weight_kg,
                            onCommit = { v -> if (v != null) set { it.copy(target_weight_kg = v) } },
                            placeholder = "75.0"
                        )
                    }
                }
            }

            st.profile?.let { prof ->
                Spacer(Modifier.height(12.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Box(Modifier.weight(1f)) {
                        Field(label = "Height (cm)") {
                            NumberInput(
                                value = prof.height_cm,
                                onCommit = { v ->
                                    if (v != null) s.save(Tables.profiles, prof.copy(height_cm = v))
                                },
                                placeholder = "175"
                            )
                        }
                    }
                    Box(Modifier.weight(1f)) {
                        Field(label = "Age") {
                            NumberInput(
                                value = prof.age.toDouble(),
                                onCommit = { v ->
                                    if (v != null) s.save(Tables.profiles, prof.copy(age = v.toInt().coerceIn(13, 90)))
                                },
                                placeholder = "25"
                            )
                        }
                    }
                    Box(Modifier.weight(1f)) {
                        Field(label = "Sex") {
                            Row(Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
                                Chip(
                                    text = "M",
                                    selected = prof.sex == "male",
                                    modifier = Modifier.weight(1f)
                                ) {
                                    s.save(Tables.profiles, prof.copy(sex = "male"))
                                }
                                Spacer(Modifier.width(4.dp))
                                Chip(
                                    text = "F",
                                    selected = prof.sex == "female",
                                    modifier = Modifier.weight(1f)
                                ) {
                                    s.save(Tables.profiles, prof.copy(sex = "female"))
                                }
                            }
                        }
                    }
                }
            }
        }

        Card {
            Eyebrow("Activity")
            Spacer(Modifier.height(8.dp))
            Field(label = "Activity level") {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        LEVELS.take(3).forEach { l ->
                            Chip(
                                text = l.label,
                                selected = g.activity_level == l.value,
                                modifier = Modifier.weight(1f)
                            ) {
                                set { it.copy(activity_level = l.value) }
                            }
                        }
                    }
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        LEVELS.drop(3).forEach { l ->
                            Chip(
                                text = l.label,
                                selected = g.activity_level == l.value,
                                modifier = Modifier.weight(1f)
                            ) {
                                set { it.copy(activity_level = l.value) }
                            }
                        }
                    }
                }
            }

            Spacer(Modifier.height(12.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Box(Modifier.weight(1f)) {
                    Field(label = "Avg daily steps") {
                        NumberInput(
                            value = g.avg_daily_steps.toDouble(),
                            onCommit = { v -> if (v != null) set { it.copy(avg_daily_steps = v.toInt()) } },
                            placeholder = "8000"
                        )
                    }
                }
                Box(Modifier.weight(1f)) {
                    Field(label = "Training days / week") {
                        NumberInput(
                            value = g.training_days_per_week.toDouble(),
                            onCommit = { v -> if (v != null) set { it.copy(training_days_per_week = v.toInt().coerceIn(0, 7)) } },
                            placeholder = "5"
                        )
                    }
                }
            }

            Spacer(Modifier.height(8.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Box(Modifier.weight(1f)) {
                    Field(label = "Session length (min)") {
                        NumberInput(
                            value = g.training_minutes.toDouble(),
                            onCommit = { v -> if (v != null) set { it.copy(training_minutes = v.toInt()) } },
                            placeholder = "60"
                        )
                    }
                }
                Box(Modifier.weight(1f)) {
                    Field(
                        label = "Rate (kg / week)",
                        hint = if (g.mode == "maintain") "Ignored while maintaining." else null
                    ) {
                        NumberInput(
                            value = g.rate_kg_per_week,
                            onCommit = { v -> if (v != null) set { it.copy(rate_kg_per_week = v) } },
                            placeholder = "0.4"
                        )
                    }
                }
            }
        }

        if (invalid) {
            Notice("Check weights: target does not match your goal or is out of range.", Tone.Warn)
        }
        if (saved) {
            Notice("Goal saved.", Tone.Info)
        }

        FButton(
            text = "Save goal",
            modifier = Modifier.fillMaxWidth(),
            enabled = !invalid,
            onClick = {
                s.save(Tables.goals, g.copy(updated_at = nowIso()))
                saved = true
            }
        )

        FButton(
            text = "Calculate nutrition target →",
            modifier = Modifier.fillMaxWidth(),
            variant = Variant.Quiet,
            onClick = { nav.navigate("more/target") }
        )

        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Stat(
                label = "Steps goal",
                value = fmt(st.settings.step_goal.toDouble()),
                modifier = Modifier.weight(1f)
            )
            Stat(
                label = "Training",
                value = "${g.training_days_per_week}×/wk",
                modifier = Modifier.weight(1f)
            )
            Stat(
                label = "Calories",
                value = st.target?.let { fmt(it.calories) } ?: "—",
                modifier = Modifier.weight(1f)
            )
        }
    }
}
