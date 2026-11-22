package app.forge.fitness.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import app.forge.fitness.ui.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import app.forge.fitness.data.Store
import app.forge.fitness.logic.Calc
import app.forge.fitness.ui.*
import java.time.LocalDate
import java.time.format.TextStyle
import java.util.Locale

@Composable
fun AdherenceScreen(s: Store, nav: NavController) {
    val st by s.state.collectAsStateWithLifecycle()
    val today = remember { Calc.today() }

    var yearMonth by remember {
        val d = app.forge.fitness.logic.Calc.safeDate(today)
        mutableStateOf(Pair(d.year, d.monthValue - 1)) // month 0-indexed for monthGrid
    }

    val (year, month0) = yearMonth

    val monthLabel = remember(year, month0) {
        val d = LocalDate.of(year, month0 + 1, 1)
        val mName = d.month.getDisplayName(TextStyle.FULL, Locale.getDefault())
        "$mName $year"
    }

    fun shiftMonth(delta: Int) {
        var y = year
        var m = month0 + delta
        while (m < 0) {
            m += 12
            y -= 1
        }
        while (m >= 12) {
            m -= 12
            y += 1
        }
        yearMonth = Pair(y, m)
    }

    val cells = remember(year, month0) { Calc.monthGrid(year, month0) }
    val monthDates = remember(cells, today) { cells.filterNotNull().filter { it <= today } }
    var repairTick by remember { mutableIntStateOf(0) }
    val sv = remember(st, today, repairTick) { app.forge.fitness.logic.Streak.view(st, today, s.streakRepairs()) }
    val late = remember(st, today) { app.forge.fitness.logic.Streak.lateDays(app.forge.fitness.logic.Streak.input(st, today, emptySet())) }
    // Days the user actually logged something (food, a workout, steps), not every calendar day.
    val logged = remember(st) { (st.foodLogs.map { it.date } + st.sessions.map { it.date } + st.steps.filter { it.steps > 0 }.map { it.date }).toSet() }
    val stats = remember(monthDates, st, sv) { app.forge.fitness.logic.Streak.monthStats(monthDates, logged, sv.result.days, today) { Calc.adherenceFor(st, it).score } }
    val avgScore = stats.avg
    val perfectDays = stats.perfect
    var info by remember { mutableStateOf(false) }

    Screen(
        title = "Monthly adherence",
        sub = "Consistency",
        back = { nav.popBackStack() }
    ) {
        // Streak: one line plus one small line; the rules live behind (i).
        Card {
            val r = sv.result
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text("${r.current} day${if (r.current == 1) "" else "s"} 🔥", color = F.text, fontSize = 17.sp, fontWeight = FontWeight.Bold)
                Text("  · ${r.freezesLeft} freeze${if (r.freezesLeft == 1) "" else "s"} left", color = F.mute, fontSize = 13.sp, modifier = Modifier.weight(1f))
                Box(Modifier.size(36.dp).clip(CircleShape).background(F.high).clickable { info = !info }, contentAlignment = Alignment.Center) {
                    Text("i", color = F.text, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                }
            }
            Text("Best ${r.best} day${if (r.best == 1) "" else "s"}", color = F.mute, fontSize = 12.sp)
            if (info) {
                Spacer(Modifier.height(8.dp))
                Body("A day counts when you log food, finish a workout or hit your steps. Planned rest days never break it (they keep it, but only days you show up add to it). Missing a day uses a freeze (2 a month, automatic). If a streak of 3+ days breaks with no freeze left, you can repair it once a month within 2 days by logging 3 meals plus a workout or your step goal.", F.mute, 12)
            }
            sv.repairOffer?.let { offer ->
                Spacer(Modifier.height(10.dp))
                if (sv.repairEarned) FButton("Repair your ${offer.previous}-day streak", Modifier.fillMaxWidth()) { s.addStreakRepair(offer.days, today); repairTick++ }
                else Body("Streak broke. Finish today's 3 meals + workout or steps to repair it.", F.text, 13)
            }
        }

        // Calendar Card (Paper)
        Card(paper = true) {
            // Month navigation
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(onClick = { shiftMonth(-1) }) {
                    Icon(Icons.Filled.ChevronLeft, contentDescription = "Previous month", tint = F.text)
                }

                Title(monthLabel, 19)

                IconButton(onClick = { shiftMonth(1) }) {
                    Icon(Icons.Filled.ChevronRight, contentDescription = "Next month", tint = F.text)
                }
            }

            Spacer(Modifier.height(12.dp))

            // Weekday labels
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                listOf("S", "M", "T", "W", "T", "F", "S").forEach { dayLabel ->
                    Box(Modifier.weight(1f), contentAlignment = Alignment.Center) {
                        Eyebrow(dayLabel)
                    }
                }
            }

            Spacer(Modifier.height(8.dp))

            // Month Grid
            val rows = cells.chunked(7)
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                rows.forEach { week ->
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        week.forEach { dateStr ->
                            Box(
                                modifier = Modifier
                                    .weight(1f)
                                    .padding(vertical = 2.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                if (dateStr != null) {
                                    val isFuture = dateStr > today
                                    val adh = if (isFuture) null else Calc.adherenceFor(st, dateStr)
                                    val kind = sv.result.days[dateStr]
                                    val covered = kind == app.forge.fitness.logic.Streak.Kind.Rest || kind == app.forge.fitness.logic.Streak.Kind.Frozen || kind == app.forge.fitness.logic.Streak.Kind.Repaired
                                    val isLate = dateStr in late && kind != app.forge.fitness.logic.Streak.Kind.Shown
                                    val dayNum = dateStr.takeLast(2).toIntOrNull()?.toString() ?: ""

                                    Column(
                                        horizontalAlignment = Alignment.CenterHorizontally,
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(8.dp))
                                            .then(
                                                if (!isFuture) Modifier.clickable { nav.navigate("day/$dateStr") }
                                                else Modifier
                                            )
                                            .padding(2.dp)
                                    ) {
                                        // Fill circle with day number (Rule 6 compliant: circle FILL indicates score, text is day number)
                                        Box(if (isLate) Modifier.alpha(0.35f) else Modifier) {
                                            FillCircle(
                                                value = if (isFuture || covered) 0f else (adh?.score?.toFloat() ?: 0f),
                                                size = 30.dp,
                                                label = dayNum
                                            )
                                            val mark = when (kind) { app.forge.fitness.logic.Streak.Kind.Rest -> "R"; app.forge.fitness.logic.Streak.Kind.Frozen, app.forge.fitness.logic.Streak.Kind.Repaired -> "❄"; else -> null }
                                            if (mark != null) Text(mark, fontSize = 9.sp, fontWeight = FontWeight.Bold, color = F.paperDim, modifier = Modifier.align(Alignment.TopEnd))
                                        }

                                        Spacer(Modifier.height(3.dp))
                                        // 3 activity dots
                                        Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                                            Dot(on = adh?.diet == "complete")
                                            Dot(on = adh?.workout == "complete")
                                            Dot(on = adh?.steps == "complete")
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            Spacer(Modifier.height(16.dp))
            // Legend
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    Dot(on = true)
                    Text("Diet", fontSize = 12.sp, color = F.paperDim)
                }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    Dot(on = true)
                    Text("Workout", fontSize = 12.sp, color = F.paperDim)
                }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    Dot(on = true)
                    Text("Steps", fontSize = 12.sp, color = F.paperDim)
                }
            }
            Spacer(Modifier.height(4.dp))
            Text("Fill = day completion · R rest day · ❄ freeze · Empty = missed", fontSize = 12.sp, color = F.paperDim)
            if (late.any { it in monthDates }) Text("Faded = logged over a week late, not counted", fontSize = 12.sp, color = F.paperDim)
        }

        // Summary Stats
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Stat(label = "Month average", value = "${(avgScore * 100).toInt()}%", modifier = Modifier.weight(1f))
            Stat(label = "Perfect days", value = "$perfectDays", modifier = Modifier.weight(1f))
            Stat(label = "Days logged", value = "${stats.loggedDays}", modifier = Modifier.weight(1f))
        }
    }
}

@Composable
private fun Dot(on: Boolean) {
    Box(
        Modifier
            .size(4.dp)
            .clip(CircleShape)
            .background(if (on) F.accent else F.raised)
    )
}
