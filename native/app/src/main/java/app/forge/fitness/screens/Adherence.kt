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
        val d = LocalDate.parse(today)
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
    val scores = remember(monthDates, st) { monthDates.map { Calc.adherenceFor(st, it).score } }
    val avgScore = remember(scores) { if (scores.isNotEmpty()) scores.sum() / scores.size else 0.0 }
    val perfectDays = remember(scores) { scores.count { it >= 0.999 } }

    Screen(
        title = "Monthly adherence",
        sub = "Consistency",
        back = { nav.popBackStack() }
    ) {
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
                                        FillCircle(
                                            value = if (isFuture) 0f else (adh?.score?.toFloat() ?: 0f),
                                            size = 30.dp,
                                            label = dayNum
                                        )

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
            Text("Circle fill = day completion", fontSize = 12.sp, color = F.paperDim)
        }

        // Summary Stats
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Stat(label = "Month average", value = "${(avgScore * 100).toInt()}%", modifier = Modifier.weight(1f))
            Stat(label = "Perfect days", value = "$perfectDays", modifier = Modifier.weight(1f))
            Stat(label = "Days logged", value = "${monthDates.size}", modifier = Modifier.weight(1f))
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
