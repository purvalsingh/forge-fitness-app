package app.forge.fitness.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import app.forge.fitness.ui.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
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
import java.time.Instant
import java.time.LocalDate
import java.time.format.TextStyle
import java.util.Locale
import kotlin.math.max

private fun formatDayTitle(dateStr: String): String {
    return runCatching {
        val d = LocalDate.parse(dateStr)
        val dow = d.dayOfWeek.getDisplayName(TextStyle.FULL, Locale.getDefault())
        val month = d.month.getDisplayName(TextStyle.FULL, Locale.getDefault())
        "$dow, $month ${d.dayOfMonth}"
    }.getOrDefault(dateStr)
}

private fun duration(start: String, end: String?): String {
    if (end.isNullOrBlank()) return "—"
    return runCatching {
        val s = Instant.parse(start).toEpochMilli()
        val e = Instant.parse(end).toEpochMilli()
        val mins = max(0, ((e - s) / 60000).toInt())
        "$mins min"
    }.getOrDefault("—")
}

@Composable
fun DayDetailScreen(s: Store, nav: NavController, date: String) {
    val st by s.state.collectAsStateWithLifecycle()
    val adh = remember(st, date) { Calc.adherenceFor(st, date) }
    val logs = remember(st.foodLogs, date) { st.foodLogs.filter { it.date == date } }
    val totals = remember(logs) { Calc.sumTotals(logs) }
    val byMeal = remember(logs) { Calc.totalsByMeal(logs) }
    val session = remember(st.sessions, date) { st.sessions.find { it.date == date } }
    val steps = remember(st.steps, date) { st.steps.find { it.date == date }?.steps }
    val weight = remember(st.weights, date) { st.weights.find { it.date == date }?.weight_kg }
    val insight = remember(st.insights, date) { st.insights.find { it.created_at.take(10) == date } }

    val niceTitle = remember(date) { formatDayTitle(date) }

    Screen(
        title = niceTitle,
        sub = "Day detail",
        back = { nav.popBackStack() }
    ) {
        // Completion Card (Paper)
        Card(paper = true) {
            Column(
                Modifier.fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                // Rule 6: Completion shown as circle FILL (FillCircle), never percentage number inside circle
                FillCircle(value = adh.score.toFloat(), size = 56.dp)
                Spacer(Modifier.height(8.dp))
                Eyebrow("COMPLETION ${(adh.score * 100).toInt()}%", color = F.paperDim)

                Spacer(Modifier.height(14.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf(
                        "diet" to adh.diet,
                        "workout" to adh.workout,
                        "steps" to adh.steps
                    ).forEach { (label, status) ->
                        val statusColor = when (status) {
                            "complete" -> F.lime
                            "partial" -> F.carbs
                            else -> F.paperDim
                        }
                        val statusText = if (status == "na") "Not counted" else status.replaceFirstChar { it.uppercase() }

                        Column(
                            modifier = Modifier
                                .weight(1f)
                                .clip(RoundedCornerShape(12.dp))
                                .background(F.raised)
                                .padding(vertical = 10.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Eyebrow(label)
                            Spacer(Modifier.height(4.dp))
                            Text(
                                text = statusText,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                                color = statusColor
                            )
                        }
                    }
                }
            }
        }

        // Diet Card
        Card {
            Eyebrow("Diet")
            Spacer(Modifier.height(4.dp))
            Figure("${Math.round(totals.calories)} kcal", size = 22)
            Spacer(Modifier.height(2.dp))
            val macroSummary = buildString {
                append("P ${Calc.round1(totals.protein_g)}g · C ${Calc.round1(totals.carbs_g)}g · F ${Calc.round1(totals.fat_g)}g")
                if (st.target != null) append(" · target ${Math.round(st.target!!.calories)} kcal")
            }
            Text(macroSummary, fontFamily = Mono, fontSize = 12.sp, color = F.mute)

            Spacer(Modifier.height(10.dp))
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                st.mealTypes.forEachIndexed { idx, m ->
                    val mtCal = byMeal[m.id]?.calories ?: 0.0
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(m.name, fontSize = 12.sp, color = F.text)
                        Text("${Math.round(mtCal)} kcal", fontFamily = Mono, fontSize = 12.sp, color = F.mute)
                    }
                    if (idx < st.mealTypes.size - 1) {
                        Divider()
                    }
                }
            }
            if (logs.isEmpty()) {
                Spacer(Modifier.height(4.dp))
                Text("Nothing logged.", fontSize = 12.sp, color = F.mute)
            }
        }

        // Workout Card
        Card {
            Eyebrow("Workout")
            Spacer(Modifier.height(4.dp))
            if (session != null) {
                Text(session.day_name, fontSize = 16.sp, fontWeight = FontWeight.Bold, color = F.text)
                Spacer(Modifier.height(8.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Stat(label = "Sets", value = "${Calc.sessionSets(session)}", modifier = Modifier.weight(1f))
                    Stat(label = "Volume", value = "${Math.round(Calc.sessionVolume(session))} kg", modifier = Modifier.weight(1f))
                    Stat(label = "Duration", value = duration(session.started_at, session.finished_at), modifier = Modifier.weight(1f))
                }
            } else {
                Text(
                    text = if (adh.workout == "na") "Rest day." else "No session logged.",
                    fontSize = 12.sp,
                    color = F.mute
                )
            }
        }

        // Steps & Weight Stats
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Stat(
                label = "Steps",
                value = steps?.let { "%,d".format(it) } ?: "—",
                sub = "Goal %,d".format(st.settings.step_goal),
                modifier = Modifier.weight(1f)
            )
            Stat(
                label = "Weight",
                value = weight?.let { "$it kg" } ?: "—",
                modifier = Modifier.weight(1f)
            )
        }

        // AI Insight
        if (insight != null) {
            Card {
                Eyebrow("AI insight")
                Spacer(Modifier.height(4.dp))
                Body(insight.text, color = F.text, size = 13)
            }
        } else {
            Empty(title = "No AI insight for this day")
        }
    }
}
