package app.forge.fitness.screens

import app.forge.fitness.ui.Text

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material3.*
import app.forge.fitness.ui.Card
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import app.forge.fitness.data.Store
import app.forge.fitness.data.Tables
import app.forge.fitness.logic.Calc
import app.forge.fitness.logic.Exercises
import app.forge.fitness.logic.Importers
import app.forge.fitness.logic.Training
import app.forge.fitness.ui.*
import java.time.LocalDate
import kotlin.math.roundToInt

/**
 * Training history: year heatmap, muscle map (balance / recency), session list, back-filling a
 * workout you did without the phone, and importing Strong / Hevy exports.
 */
@Composable
fun HistoryScreen(s: Store, nav: NavController) {
    val context = LocalContext.current
    val state by s.state.collectAsStateWithLifecycle()
    val today by s.date.collectAsStateWithLifecycle()

    var lib by remember { mutableStateOf<List<Exercises.LibExercise>>(emptyList()) }
    var range by remember { mutableStateOf("7") }
    var backfill by remember { mutableStateOf(false) }
    var msg by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        lib = try {
            Exercises.loadExercises(context)
        } catch (_: Exception) {
            emptyList()
        }
    }

    val byId = remember(lib) { lib.associateBy { it.id } }
    val customById = remember(state.customExercises) { state.customExercises.associateBy { it.id } }

    val rawMuscleSets = remember(state.sessions, today, range, byId, customById, lib) {
        val days = range.toIntOrNull() ?: 7
        Training.muscleSets(
            sessions = state.sessions,
            today = today,
            days = days,
            muscleOf = { e ->
                val primary = byId[e.exercise_id]?.muscle
                    ?: customById[e.exercise_id]?.muscle
                    ?: (if (lib.isNotEmpty()) Exercises.matchExercise(lib, e.name)?.muscle else null)
                val secondaries = byId[e.exercise_id]?.secondary
                    ?: customById[e.exercise_id]?.secondary
                    ?: emptyList()
                primary to secondaries
            }
        )
    }
    val regions = remember(rawMuscleSets) { regionSets(rawMuscleSets) }
    val missing = remember(regions) { untrained(regions) }
    val sex = state.profile?.sex ?: "male"
    val minutes = remember(state.sessions) { Training.minutesByDate(state.sessions) }
    val done = remember(state.sessions) {
        state.sessions.filter { it.finished_at != null }.sortedByDescending { it.date }
    }

    val importLauncher = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        val text = try {
            context.contentResolver.openInputStream(uri)?.bufferedReader()?.use { it.readText() }
        } catch (_: Exception) {
            null
        }
        if (text.isNullOrBlank()) {
            msg = "Could not read that file."
            return@rememberLauncherForActivityResult
        }
        val r = Importers.importWorkouts(text)
        if (r == null || r.sessions.isEmpty()) {
            msg = "That file isn't a workout export from the Strong or Hevy apps. In those apps use Settings → Export data → CSV."
            return@rememberLauncherForActivityResult
        }
        for (sess in r.sessions) {
            s.save(Tables.sessions, sess)
        }
        msg = "Imported ${r.sessions.size} workouts from ${if (r.format == "hevy") "Hevy" else "Strong"}."
    }

    Screen(
        title = "History",
        sub = "Training",
        back = { nav.popBackStack() }
    ) {
        Card {
            Eyebrow("Last 12 months")
            Spacer(Modifier.height(8.dp))
            Heatmap(minutes = minutes, today = today)
        }

        Card {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Eyebrow("Muscle balance · sets")
                Tabs(
                    value = range,
                    options = listOf("7" to "7d", "30" to "30d", "365" to "1y"),
                    onChange = { range = it }
                )
            }
            Spacer(Modifier.height(12.dp))
            BodyMap(
                sets = regions,
                sex = sex,
                onSexChange = { sx ->
                    state.profile?.let { s.save(Tables.profiles, it.copy(sex = sx)) }
                }
            )
            Spacer(Modifier.height(8.dp))
            Text(
                text = if (missing.isNotEmpty()) {
                    "Not trained in this window: ${missing.joinToString(", ")}."
                } else {
                    "Every major muscle got work in this window."
                },
                color = if (missing.isNotEmpty()) F.dim else F.lime,
                fontSize = 12.sp
            )
        }

        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            FButton(
                text = "Add past workout",
                variant = Variant.Quiet,
                modifier = Modifier.weight(1f)
            ) {
                backfill = true
            }
            FButton(
                text = "Import workouts",
                variant = Variant.Quiet,
                modifier = Modifier.weight(1f)
            ) {
                importLauncher.launch("*/*")
            }
        }

        Body(
            text = "Switching from Strong or Hevy? Export your workouts as a CSV file and pick it here — every set comes across.",
            color = F.mute,
            size = 11
        )

        msg?.let {
            Notice(it)
        }

        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Eyebrow("Sessions")
            if (done.isEmpty()) {
                Body("No finished workouts yet.", F.mute, 13)
            }
            done.take(60).forEach { sess ->
                val workingSetsCount = sess.exercises.sumOf { Training.workingSets(it.sets).size }
                val vol = Calc.sessionVolume(sess)
                val hasPR = sess.exercises.any { e -> e.sets.any { it.pr == true } }

                Card(onClick = {
                    s.setDate(sess.date)
                    // Imported or old-plan sessions have no live plan day to open: show that day's record instead.
                    val live = state.plans.any { p: app.forge.fitness.data.WorkoutPlan -> p.id == sess.plan_id && p.days.any { it.id == sess.day_id } }
                    nav.navigate(if (live && sess.finished_at == null) "workout/session/${sess.day_id}" else "day/${sess.date}")
                }) {
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(sess.day_name, color = F.text, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                        Text(sess.date, color = F.text, fontFamily = Mono, fontSize = 12.sp)
                    }
                    Spacer(Modifier.height(2.dp))
                    Text(
                        "$workingSetsCount sets · ${fmt(vol)} kg${if (sess.backfilled == true) " · added later" else ""}${if (hasPR) " · ★ PR" else ""}",
                        color = F.mute,
                        fontFamily = Mono,
                        fontSize = 12.sp
                    )
                }
            }
        }

        BackfillSheet(
            open = backfill,
            onClose = { backfill = false },
            onGo = { pickedDate, dayId ->
                s.setDate(pickedDate)
                backfill = false
                nav.navigate("workout/session/$dayId")
            },
            maxDate = Calc.addDays(today, -1),
            s = s
        )
    }
}

@Composable
private fun Heatmap(minutes: Map<String, Int>, today: String) {
    val weeks = 53
    val cells = remember(minutes, today) {
        val todayDate = try { LocalDate.parse(today) } catch (_: Exception) { LocalDate.now() }
        val dayOfWeek = todayDate.dayOfWeek.value % 7 // 0 for Sunday
        val startDate = todayDate.minusDays(((weeks * 7 - 1) + dayOfWeek).toLong())

        val list = mutableListOf<Pair<String, Int>>()
        for (i in 0 until (weeks * 7)) {
            val d = startDate.plusDays(i.toLong()).toString()
            val m = if (d > today) -1 else (minutes[d] ?: 0)
            list.add(d to m)
        }
        list
    }

    val raisedColor = F.raised
    val accentColor = F.accent

    val cellSize = 10.dp
    val spacing = 3.dp
    val totalW = (weeks * 13).dp
    val totalH = (7 * 13).dp

    Box(
        Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
    ) {
        Canvas(Modifier.size(width = totalW, height = totalH)) {
            val cellPx = cellSize.toPx()
            val spacePx = spacing.toPx()
            val stepPx = cellPx + spacePx

            cells.forEachIndexed { idx, (iso, m) ->
                val col = idx / 7
                val row = idx % 7
                val x = col * stepPx
                val y = row * stepPx

                val color = when {
                    m < 0 -> Color.Transparent
                    m == 0 -> raisedColor
                    m < 30 -> accentColor.copy(alpha = 0.35f)
                    m < 60 -> accentColor.copy(alpha = 0.65f)
                    else -> accentColor
                }

                if (color != Color.Transparent) {
                    drawRoundRect(
                        color = color,
                        topLeft = Offset(x, y),
                        size = Size(cellPx, cellPx),
                        cornerRadius = CornerRadius(3.dp.toPx(), 3.dp.toPx())
                    )
                }
            }
        }
    }
}

@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
private fun BackfillSheet(
    open: Boolean,
    onClose: () -> Unit,
    onGo: (date: String, dayId: String) -> Unit,
    maxDate: String,
    s: Store
) {
    val state by s.state.collectAsStateWithLifecycle()
    val plan = remember(state.plans) { state.plans.firstOrNull { it.active == true } ?: state.plans.firstOrNull() }
    var date by remember { mutableStateOf(maxDate) }
    var dayId by remember { mutableStateOf("freestyle") }

    val dayOptions = remember(plan) {
        listOf("freestyle" to "Freestyle (pick exercises)") + (plan?.days?.map { it.id to it.name } ?: emptyList())
    }

    Sheet(open = open, title = "Log a past workout", onClose = onClose) {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            // A calendar, not free text: a typo like "2026-12026-11-16" once saved and crashed History and Progress.
            var picking by remember { mutableStateOf(false) }
            Field(label = "Date") {
                FButton(app.forge.fitness.logic.Calc.safeDate(date).format(java.time.format.DateTimeFormatter.ofPattern("EEE, d MMM yyyy")),
                    Modifier.fillMaxWidth(), Variant.Quiet) { picking = true }
            }
            if (picking) {
                val maxMillis = app.forge.fitness.logic.Calc.safeDate(maxDate).atStartOfDay(java.time.ZoneOffset.UTC).toInstant().toEpochMilli()
                val pickerState = androidx.compose.material3.rememberDatePickerState(
                    initialSelectedDateMillis = app.forge.fitness.logic.Calc.safeDate(date).atStartOfDay(java.time.ZoneOffset.UTC).toInstant().toEpochMilli(),
                    selectableDates = object : androidx.compose.material3.SelectableDates {
                        override fun isSelectableDate(utcTimeMillis: Long) = utcTimeMillis <= maxMillis
                    })
                androidx.compose.material3.DatePickerDialog(
                    onDismissRequest = { picking = false },
                    confirmButton = {
                        androidx.compose.material3.TextButton(onClick = {
                            pickerState.selectedDateMillis?.let { date = java.time.Instant.ofEpochMilli(it).atZone(java.time.ZoneOffset.UTC).toLocalDate().toString() }
                            picking = false
                        }) { Text("OK", color = F.accent) }
                    },
                    dismissButton = { androidx.compose.material3.TextButton(onClick = { picking = false }) { Text("Cancel", color = F.mute) } },
                ) { androidx.compose.material3.DatePicker(state = pickerState) }
            }

            Field(label = "Workout") {
                var expanded by remember { mutableStateOf(false) }
                val currentLabel = dayOptions.firstOrNull { it.first == dayId }?.second ?: "Freestyle"
                Box(Modifier.fillMaxWidth()) {
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .heightIn(min = 48.dp)
                            .clip(RoundedCornerShape(14.dp))
                            .background(F.surface)
                            .border(1.dp, F.line, RoundedCornerShape(14.dp))
                            .clickable { expanded = true }
                            .padding(horizontal = 14.dp, vertical = 12.dp),
                        contentAlignment = Alignment.CenterStart
                    ) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                            Text(currentLabel, color = F.text, fontSize = 14.sp)
                            Icon(Icons.Filled.ArrowDropDown, contentDescription = "Select", tint = F.mute)
                        }
                    }
                    DropdownMenu(
                        expanded = expanded,
                        onDismissRequest = { expanded = false },
                        modifier = Modifier.background(F.surface).border(1.dp, F.line)
                    ) {
                        dayOptions.forEach { (id, name) ->
                            DropdownMenuItem(
                                text = { Text(name, color = F.text) },
                                onClick = { dayId = id; expanded = false }
                            )
                        }
                    }
                }
            }

            Notice("Workouts added later never claim PRs against sessions that came after them.")

            FButton(
                text = "Open workout",
                enabled = app.forge.fitness.logic.Calc.isIsoDate(date) && date <= maxDate,
                modifier = Modifier.fillMaxWidth()
            ) {
                onGo(date, dayId)
            }
        }
    }
}
