package app.forge.fitness.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import app.forge.fitness.ui.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.drawText
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import app.forge.fitness.data.*
import app.forge.fitness.logic.Calc
import app.forge.fitness.ui.*
import kotlin.math.max
import kotlin.math.min

private val RANGES = mapOf(
    "7D" to 7,
    "30D" to 30,
    "3M" to 90,
    "6M" to 180,
    "1Y" to 365
)

private fun avg(xs: List<Double?>): Double? {
    val v = xs.filterNotNull()
    return if (v.isNotEmpty()) v.sum() / v.size else null
}

@Composable
fun ProgressScreen(s: Store, nav: NavController) {
    val st by s.state.collectAsStateWithLifecycle()
    val today by s.date.collectAsStateWithLifecycle()
    var rangeKey by remember { mutableStateOf("30D") }
    var weightSheetOpen by remember { mutableStateOf(false) }

    val daysCount = RANGES[rangeKey] ?: 30
    val dates = remember(daysCount, today) { Calc.daysBack(daysCount, today) }

    val series = remember(dates, st.foodLogs, st.sessions, st.steps, st.weights, st.target, st.settings) {
        dates.map { d ->
            val logs = st.foodLogs.filter { it.date == d }
            val t = Calc.sumTotals(logs)
            val sess = st.sessions.find { it.date == d && it.finished_at != null }
            val adh = Calc.adherenceFor(st, d)
            DailyMetric(
                date = d.takeLast(5),
                calories = if (t.calories > 0) t.calories else null,
                protein = if (t.protein_g > 0) t.protein_g else null,
                steps = st.steps.find { it.date == d }?.steps?.toDouble(),
                weight = st.weights.find { it.date == d }?.weight_kg,
                volume = if (sess != null) Calc.sessionVolume(sess) else null,
                adherence = adh.score * 100.0,
                diet = if (adh.diet == "complete") 100.0 else if (adh.diet == "partial") 50.0 else 0.0,
                workout = if (adh.workout == "complete") 100.0 else if (adh.workout == "partial") 50.0 else 0.0,
            )
        }
    }

    val weightPoints = remember(st.weights, dates) {
        Calc.trend(st.weights.filter { it.date in dates }.sortedBy { it.date })
    }

    val allDates = remember(st) { Calc.activeDates(st) }
    val curStreak = remember(allDates, today, st) {
        Calc.streak(allDates, today) { d -> Calc.adherenceFor(st, d).score >= 0.6 }
    }
    val best = remember(allDates, st) {
        Calc.bestStreak(allDates) { d -> Calc.adherenceFor(st, d).score >= 0.6 }
    }
    val perfect = remember(allDates, st) {
        Calc.bestStreak(allDates) { d -> Calc.adherenceFor(st, d).score >= 0.999 }
    }
    val dietStreak = remember(allDates, today, st) {
        Calc.streak(allDates, today) { d -> Calc.adherenceFor(st, d).diet == "complete" }
    }
    val workoutStreak = remember(allDates, today, st) {
        Calc.streak(allDates, today) { d -> Calc.adherenceFor(st, d).workout != "incomplete" }
    }

    val trained = series.count { it.volume != null }
    val avgCal = avg(series.map { it.calories })
    val avgProtein = avg(series.map { it.protein })
    val avgSteps = avg(series.map { it.steps })
    val latestWeight = st.weights.maxByOrNull { it.date }

    Screen(
        title = "Progress",
        sub = "Analytics",
        right = {
            FButton("Log weight", variant = Variant.Ghost) { weightSheetOpen = true }
        }
    ) {
        Tabs(
            value = rangeKey,
            options = RANGES.keys.map { it to it },
            onChange = { rangeKey = it }
        )

        Card(paper = true) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Column(Modifier.weight(1f).clip(RoundedCornerShape(12.dp)).background(F.raised).padding(10.dp)) {
                    Eyebrow("Weight")
                    Spacer(Modifier.height(2.dp))
                    Figure(latestWeight?.let { "${it.weight_kg} kg" } ?: "—", size = 20)
                    st.goal?.let {
                        Spacer(Modifier.height(2.dp))
                        Body("Target ${it.target_weight_kg} kg", color = F.paperDim, size = 10)
                    }
                }
                Column(Modifier.weight(1f).clip(RoundedCornerShape(12.dp)).background(F.raised).padding(10.dp)) {
                    Eyebrow("Avg calories")
                    Spacer(Modifier.height(2.dp))
                    Figure(avgCal?.let { fmt(it) } ?: "—", size = 20)
                    Spacer(Modifier.height(2.dp))
                    Body("kcal / day", color = F.paperDim, size = 10)
                }
            }
            Spacer(Modifier.height(8.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Column(Modifier.weight(1f).clip(RoundedCornerShape(12.dp)).background(F.raised).padding(10.dp)) {
                    Eyebrow("Avg protein")
                    Spacer(Modifier.height(2.dp))
                    Figure(avgProtein?.let { "${fmt(it)} g" } ?: "—", size = 20)
                    Spacer(Modifier.height(2.dp))
                    Body("per day", color = F.paperDim, size = 10)
                }
                Column(Modifier.weight(1f).clip(RoundedCornerShape(12.dp)).background(F.raised).padding(10.dp)) {
                    Eyebrow("Avg steps")
                    Spacer(Modifier.height(2.dp))
                    Figure(avgSteps?.let { fmt(it) } ?: "—", size = 20)
                    Spacer(Modifier.height(2.dp))
                    Body("per day", color = F.paperDim, size = 10)
                }
            }
        }

        Card {
            Eyebrow("Streaks")
            Spacer(Modifier.height(8.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceAround) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Figure("$curStreak", size = 22)
                    Eyebrow("Current")
                }
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Figure("$best", size = 22)
                    Eyebrow("Best")
                }
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Figure("$perfect", size = 22)
                    Eyebrow("Perfect")
                }
            }
            Spacer(Modifier.height(10.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Column(
                    Modifier.weight(1f).clip(RoundedCornerShape(12.dp)).background(F.raised).padding(8.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Figure("$dietStreak", size = 17)
                    Eyebrow("Diet streak")
                }
                Column(
                    Modifier.weight(1f).clip(RoundedCornerShape(12.dp)).background(F.raised).padding(8.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Figure("$workoutStreak", size = 17)
                    Eyebrow("Workout streak")
                }
            }
        }

        val fullDates = dates
        val trendByDate = remember(weightPoints) { weightPoints.associate { it.date to it.trend } }
        val rawW = series.map { it.weight }
        val loggedW = rawW.count { it != null }
        ChartCard("Bodyweight", latestWeight?.let { "${it.weight_kg} kg" }, st.goal?.let { "target ${it.target_weight_kg} kg" }) {
            LineChart(fullDates.map { trendByDate[it] }, fullDates, F.accent, "kg", goal = st.goal?.target_weight_kg, zeroBased = false, dots = rawW,
                empty = Triple("No weigh-ins yet", "Weigh in a few times a week and the smoothed trend shows up here.", "Log weight" to { weightSheetOpen = true }))
            if (loggedW == 1) Body("One weigh-in so far. The trend line starts at the second.", F.mute, 11)
        }

        val calGoal = st.target?.calories ?: st.profile?.let { p -> st.goal?.let { g ->
            Calc.tdee(p.sex, g.current_weight_kg, p.height_cm, p.age, g.activity_level, g.avg_daily_steps).toDouble() } }
        val calDays = series.count { it.calories != null }
        ChartCard("Calories", avgCal?.let { "${fmt(it)} kcal" }, "avg · $calDays day${if (calDays == 1) "" else "s"} logged") {
            LineChart(series.map { it.calories }, fullDates, F.accent, "kcal", goal = calGoal,
                empty = Triple("Nothing logged in this range", "Log a meal and your daily calories chart here.", "Log food" to { nav.navigate("diet") }))
        }

        ChartCard("Protein", avgProtein?.let { "${fmt(it)} g" }, "avg per logged day") {
            LineChart(series.map { it.protein }, fullDates, F.protein, "g", goal = st.target?.protein_g,
                empty = Triple("No protein logged yet", "Every meal you log adds to this line.", null))
        }

        ChartCard("Steps", avgSteps?.let { fmt(it) }, "avg · goal ${fmt(st.settings.step_goal.toDouble())}") {
            BarChart(series.map { it.steps }, fullDates, F.carbs, "steps", goal = st.settings.step_goal.toDouble(),
                empty = Triple("No steps yet", "Keep your phone in your pocket, or log steps from the Today tile.", null))
        }

        val adhAvg = avg(series.map { it.adherence.takeIf { a -> a > 0 } })
        ChartCard("Adherence", adhAvg?.let { "${fmt(it)}%" }, "avg on active days") {
            BarChart(series.map { it.adherence.takeIf { a -> a > 0 } }, fullDates, F.accent, "%", max = 100.0, goal = 60.0,
                empty = Triple("No active days yet", "Log food, steps or a workout and each day gets a score.", null))
        }

        val totalVol = series.sumOf { it.volume ?: 0.0 }
        ChartCard("Training volume", if (trained > 0) "${fmt(totalVol)} kg" else null, "$trained session${if (trained == 1) "" else "s"}") {
            BarChart(series.map { it.volume }, fullDates, F.accent2, "kg",
                empty = Triple("No finished workouts in this range", "Finish a session and its total kg lifted shows here.", "Start a workout" to { nav.navigate("workout") }))
        }

        FButton("Monthly adherence calendar", Modifier.fillMaxWidth(), Variant.Quiet) {
            nav.navigate("adherence")
        }
    }

    WeightSheet(
        open = weightSheetOpen,
        onClose = { weightSheetOpen = false },
        date = today,
        s = s
    )
}

private data class DailyMetric(
    val date: String,
    val calories: Double?,
    val protein: Double?,
    val steps: Double?,
    val weight: Double?,
    val volume: Double?,
    val adherence: Double,
    val diet: Double,
    val workout: Double,
)

private fun shortDate(d: String) = runCatching { java.time.LocalDate.parse(d).format(java.time.format.DateTimeFormatter.ofPattern("d MMM")) }.getOrDefault(d)
private fun compact(v: Double): String = when { v >= 10_000 -> "${(v / 1000).toInt()}k"; v >= 1000 -> "%.1fk".format(v / 1000).replace(".0k", "k"); v >= 100 || v == Math.floor(v) -> "${v.toInt()}"; else -> "%.1f".format(v) }

/** Card with the chart's title on the left and its headline number on the right. */
@Composable
private fun ChartCard(title: String, value: String?, sub: String?, content: @Composable ColumnScope.() -> Unit) {
    Card {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Top) {
            Title(title, size = 17)
            Column(horizontalAlignment = Alignment.End) {
                if (value != null) Text(value, fontSize = 18.sp, fontWeight = FontWeight.Bold, color = F.text)
                if (sub != null) Text(sub, fontSize = 12.sp, color = F.mute)
            }
        }
        Spacer(Modifier.height(12.dp))
        content()
    }
}

@Composable
private fun EmptyChart(e: Triple<String, String, Pair<String, () -> Unit>?>) {
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(F.raised).padding(vertical = 22.dp, horizontal = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(e.first, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = F.text)
        Text(e.second, fontSize = 12.sp, color = F.mute, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        e.third?.let { (label, go) -> Spacer(Modifier.height(4.dp)); FButton(label, variant = Variant.Quiet, onClick = go) }
    }
}

/** Reveal animation shared by the charts: 0 to 1 whenever the data changes. */
@Composable
private fun rememberReveal(key: Any): Float {
    val a = remember { androidx.compose.animation.core.Animatable(0f) }
    LaunchedEffect(key) { a.snapTo(0f); a.animateTo(1f, androidx.compose.animation.core.tween(900, easing = androidx.compose.animation.core.FastOutSlowInEasing)) }
    return a.value
}

/**
 * Smooth line through the days that have data (unlogged days are skipped, never drawn as zero), soft gradient area,
 * dashed goal line, y labels on the gridlines and first/middle/last dates underneath.
 */
@Composable
private fun LineChart(values: List<Double?>, dates: List<String>, color: Color, unit: String, goal: Double? = null,
                      zeroBased: Boolean = true, dots: List<Double?>? = null,
                      empty: Triple<String, String, Pair<String, () -> Unit>?>) {
    val pts = values.withIndex().filter { it.value != null }.map { it.index to it.value!! }
    val dotPts = (dots ?: values).withIndex().filter { it.value != null }.map { it.index to it.value!! }
    if (pts.isEmpty() && dotPts.isEmpty()) { EmptyChart(empty); return }
    val all = (pts + dotPts).map { it.second } + listOfNotNull(goal)
    val hi = all.max(); val lo = if (zeroBased) 0.0 else all.min()
    val top = if (zeroBased) hi * 1.15 else hi + (hi - lo).coerceAtLeast(1.0) * .25
    val bottom = if (zeroBased) 0.0 else lo - (hi - lo).coerceAtLeast(1.0) * .25
    val reveal = rememberReveal(values)
    val tm = androidx.compose.ui.text.rememberTextMeasurer()
    val labelStyle = androidx.compose.ui.text.TextStyle(fontSize = 11.sp, color = F.mute)
    val grid = F.line; val goalColor = F.text.copy(alpha = .45f); val ring = if (F.dark) Color(0xFF0E1A2B) else Color.White
    val tipBg = F.text; val tipFg = if (F.dark) Color(0xFF0E1A2B) else Color.White
    // Tap or drag across the chart to read a day's exact value; the nearest day with data is picked.
    val shown = (dots ?: values).withIndex().associate { it.index to (it.value ?: values.getOrNull(it.index)) }.filterValues { it != null }.mapValues { it.value!! }
    var sel by remember(values) { mutableStateOf<Int?>(null) }
    val density = androidx.compose.ui.platform.LocalDensity.current.density
    fun pick(px: Float, width: Float) {
        val inset = 8 * density; val n = values.size.coerceAtLeast(2)
        val raw = ((px - inset) / (width - 2 * inset) * (n - 1)).toInt().coerceIn(0, n - 1)
        sel = shown.keys.minByOrNull { kotlin.math.abs(it - raw) }
    }
    Canvas(Modifier.fillMaxWidth().height(170.dp).chartTouch(::pick)) {
        val w = size.width; val h = size.height - 18.dp.toPx(); val n = values.size.coerceAtLeast(2)
        val inset = 8.dp.toPx()
        fun x(i: Int) = inset + i.toFloat() / (n - 1) * (w - 2 * inset)
        fun y(v: Double) = (h - ((v - bottom) / (top - bottom)).toFloat() * h).coerceIn(0f, h)
        for (k in 0..2) {
            val v = bottom + (top - bottom) * k / 2.0; val yy = y(v)
            drawLine(grid, Offset(0f, yy), Offset(w, yy), 1f, pathEffect = androidx.compose.ui.graphics.PathEffect.dashPathEffect(floatArrayOf(6f, 6f)))
            if (k > 0) drawText(tm, compact(v), Offset(0f, yy + 2f), labelStyle)
        }
        goal?.let {
            val gy = y(it)
            drawLine(goalColor, Offset(0f, gy), Offset(w, gy), 1.5f, pathEffect = androidx.compose.ui.graphics.PathEffect.dashPathEffect(floatArrayOf(10f, 8f)))
            val t = tm.measure("Goal ${compact(it)}", labelStyle)
            drawText(t, topLeft = Offset(w - t.size.width, gy - t.size.height - 2f))
        }
        clipRect(right = inset + (w - inset) * reveal + inset) {
            if (pts.size >= 2) {
                val line = Path(); val area = Path()
                pts.forEachIndexed { k, (i, v) ->
                    val px = x(i); val py = y(v)
                    if (k == 0) { line.moveTo(px, py); area.moveTo(px, h); area.lineTo(px, py) }
                    else { val (pi, pv) = pts[k - 1]; val mx = (x(pi) + px) / 2
                        line.cubicTo(mx, y(pv), mx, py, px, py); area.cubicTo(mx, y(pv), mx, py, px, py) }
                }
                area.lineTo(x(pts.last().first), h); area.close()
                drawPath(area, androidx.compose.ui.graphics.Brush.verticalGradient(listOf(color.copy(alpha = .30f), color.copy(alpha = 0f)), endY = h))
                drawPath(line, color, style = Stroke(2.5.dp.toPx(), cap = androidx.compose.ui.graphics.StrokeCap.Round))
            }
            dotPts.forEach { (i, v) -> drawCircle(color.copy(alpha = if (dots != null) .55f else .9f), 2.5.dp.toPx(), Offset(x(i), y(v))) }
            (pts.lastOrNull() ?: dotPts.last()).let { (i, v) ->
                drawCircle(ring, 6.dp.toPx(), Offset(x(i), y(v))); drawCircle(color, 4.dp.toPx(), Offset(x(i), y(v)))
            }
        }
        listOf(0, dates.size / 2, dates.size - 1).distinct().forEach { i ->
            val t = tm.measure(shortDate(dates[i]), labelStyle)
            val px = (x(i) - t.size.width / 2f).coerceIn(0f, w - t.size.width)
            drawText(t, topLeft = Offset(px, size.height - t.size.height))
        }
        sel?.let { i -> shown[i]?.let { v ->
            drawCircle(ring, 6.dp.toPx(), Offset(x(i), y(v))); drawCircle(color, 4.dp.toPx(), Offset(x(i), y(v)))
            tip(tm, "${exact(v)} $unit · ${shortDate(dates[i])}", x(i), y(v), h, tipBg, tipFg, grid)
        } }
    }
    PeakCaption(shown, dates, unit)
}

/**
 * Rounded bars per day (per week beyond two months), faint stubs on days without data so gaps read as gaps,
 * the latest bar in the theme gradient, and an optional dashed goal line.
 */
@Composable
private fun BarChart(values: List<Double?>, dates: List<String>, color: Color, unit: String, max: Double? = null, goal: Double? = null,
                     empty: Triple<String, String, Pair<String, () -> Unit>?>) {
    if (values.none { it != null }) { EmptyChart(empty); return }
    val bucket = if (values.size > 60) 7 else 1
    val vals = values.chunked(bucket).map { c -> c.filterNotNull().takeIf { it.isNotEmpty() }?.average() }
    val labels = dates.chunked(bucket).map { it.first() }
    val peak = max ?: ((listOfNotNull(goal) + vals.filterNotNull()).max() * 1.15)
    val reveal = rememberReveal(values)
    val tm = androidx.compose.ui.text.rememberTextMeasurer()
    val labelStyle = androidx.compose.ui.text.TextStyle(fontSize = 11.sp, color = F.mute)
    val stub = F.line; val goalColor = F.text.copy(alpha = .45f); val brush = F.accentBrush
    val lastIdx = vals.indexOfLast { it != null }
    val tipBg = F.text; val tipFg = if (F.dark) Color(0xFF0E1A2B) else Color.White
    var sel by remember(values) { mutableStateOf<Int?>(null) }
    fun pick(px: Float, width: Float) {
        val raw = (px / (width / vals.size)).toInt().coerceIn(0, vals.size - 1)
        sel = vals.indices.filter { vals[it] != null }.minByOrNull { kotlin.math.abs(it - raw) }
    }
    Canvas(Modifier.fillMaxWidth().height(160.dp).chartTouch(::pick)) {
        val w = size.width; val h = size.height - 18.dp.toPx(); val n = vals.size
        val slot = w / n; val bw = (slot * .62f).coerceIn(2f, 26.dp.toPx()); val r = androidx.compose.ui.geometry.CornerRadius(bw / 2)
        vals.forEachIndexed { i, v ->
            val cx = i * slot + slot / 2
            if (v == null) drawRoundRect(stub, Offset(cx - bw / 2, h - 4.dp.toPx()), Size(bw, 4.dp.toPx()), r)
            else {
                val bh = ((v / peak).toFloat().coerceIn(0f, 1f) * h * reveal).coerceAtLeast(4.dp.toPx())
                if (i == lastIdx) drawRoundRect(brush, Offset(cx - bw / 2, h - bh), Size(bw, bh), r)
                else drawRoundRect(androidx.compose.ui.graphics.Brush.verticalGradient(listOf(color, color.copy(alpha = .45f)), startY = h - bh, endY = h),
                    Offset(cx - bw / 2, h - bh), Size(bw, bh), r)
            }
        }
        goal?.let {
            val gy = h - (it / peak).toFloat().coerceIn(0f, 1f) * h
            drawLine(goalColor, Offset(0f, gy), Offset(w, gy), 1.5f, pathEffect = androidx.compose.ui.graphics.PathEffect.dashPathEffect(floatArrayOf(10f, 8f)))
            val t = tm.measure("Goal ${compact(it)}", labelStyle)
            drawText(t, topLeft = Offset(w - t.size.width, gy - t.size.height - 2f))
        }
        listOf(0, n / 2, n - 1).distinct().forEach { i ->
            val t = tm.measure(shortDate(labels[i]), labelStyle)
            val px = (i * slot + slot / 2 - t.size.width / 2f).coerceIn(0f, w - t.size.width)
            drawText(t, topLeft = Offset(px, size.height - t.size.height))
        }
        sel?.let { i -> vals[i]?.let { v ->
            val bh = ((v / peak).toFloat().coerceIn(0f, 1f) * h).coerceAtLeast(4.dp.toPx())
            val day = (if (bucket > 1) "week of " else "") + shortDate(labels[i])
            tip(tm, "${exact(v)} $unit · $day", i * slot + slot / 2, h - bh, h, tipBg, tipFg, stub)
        } }
    }
    PeakCaption(vals.withIndex().filter { it.value != null }.associate { it.index to it.value!! }, labels, unit, weekly = bucket > 1)
}

/** Tap = show that point; drag = scrub along the chart. A second tap on empty space keeps the last pick. */
private fun Modifier.chartTouch(pick: (Float, Float) -> Unit) = this
    .pointerInput(Unit) { detectTapGestures { pick(it.x, size.width.toFloat()) } }
    .pointerInput(Unit) { detectHorizontalDragGestures { ch, _ -> pick(ch.position.x, size.width.toFloat()) } }

private fun exact(v: Double): String = if (v >= 100 || v == Math.floor(v)) "%,d".format(Math.round(v)) else "%.1f".format(v)

/** Value bubble above the picked point, with a guide line down to the axis. */
private fun androidx.compose.ui.graphics.drawscope.DrawScope.tip(tm: androidx.compose.ui.text.TextMeasurer, text: String,
        x: Float, y: Float, h: Float, bg: Color, fg: Color, guide: Color) {
    drawLine(guide, Offset(x, 0f), Offset(x, h), 1.dp.toPx())
    val t = tm.measure(text, androidx.compose.ui.text.TextStyle(fontSize = 13.sp, color = fg, fontWeight = FontWeight.SemiBold))
    val padX = 10.dp.toPx(); val padY = 6.dp.toPx()
    val bw = t.size.width + 2 * padX; val bh = t.size.height + 2 * padY
    val left = (x - bw / 2).coerceIn(0f, size.width - bw)
    val above = y - bh - 10.dp.toPx()
    val top = if (above >= 0f) above else (y + 10.dp.toPx()).coerceAtMost(h - bh)
    drawRoundRect(bg, Offset(left, top), Size(bw, bh), androidx.compose.ui.geometry.CornerRadius(10.dp.toPx()))
    drawText(t, topLeft = Offset(left + padX, top + padY))
}

/** "Highest: 2,340 kcal on 12 Nov", so the peak is readable without tapping. */
@Composable private fun PeakCaption(points: Map<Int, Double>, dates: List<String>, unit: String, weekly: Boolean = false) {
    val best = points.maxByOrNull { it.value } ?: return
    Spacer(Modifier.height(8.dp))
    Body("Highest: ${exact(best.value)} $unit on ${if (weekly) "the week of " else ""}${shortDate(dates[best.key])}. Tap the chart to see any day.", F.mute, 12)
}

@Composable
fun WeightSheet(open: Boolean, onClose: () -> Unit, date: String, s: Store) {
    val st by s.state.collectAsStateWithLifecycle()
    var d by remember(date) { mutableStateOf(date) }
    val existing = remember(d, st.weights) { st.weights.find { it.date == d } }
    var v by remember(existing, st.goal) {
        mutableStateOf(existing?.weight_kg?.toString() ?: st.goal?.current_weight_kg?.toString() ?: "75.0")
    }

    Sheet(open = open, title = "Log bodyweight", onClose = onClose) {
        Field("Date") {
            Input(value = d, onChange = { d = it }, placeholder = "YYYY-MM-DD")
        }
        Spacer(Modifier.height(8.dp))
        Field("Weight (kg)") {
            NumberInput(
                value = v.toDoubleOrNull(),
                onCommit = { num -> if (num != null) v = num.toString() },
                placeholder = "75.0"
            )
        }
        Spacer(Modifier.height(8.dp))
        FButton("Save weight", Modifier.fillMaxWidth()) {
            val num = v.toDoubleOrNull()
            if (num != null && num in 25.0..400.0) {
                val row = WeightLog(
                    id = existing?.id ?: uid(),
                    date = d,
                    weight_kg = Calc.round1(num)
                )
                s.save(Tables.weights, row)
                st.goal?.let { curGoal ->
                    s.save(Tables.goals, curGoal.copy(current_weight_kg = Calc.round1(num), updated_at = nowIso()))
                }
                onClose()
            }
        }
        existing?.let { row ->
            Spacer(Modifier.height(4.dp))
            FButton("Delete entry", Modifier.fillMaxWidth(), Variant.Danger) {
                s.del(Tables.weights, row.id)
                onClose()
            }
        }
        if (st.weights.isNotEmpty()) {
            Spacer(Modifier.height(12.dp))
            Eyebrow("History")
            Spacer(Modifier.height(4.dp))
            Column(
                Modifier.fillMaxWidth().heightIn(max = 200.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(F.raised)
                    .padding(8.dp)
            ) {
                st.weights.sortedByDescending { it.date }.take(20).forEach { w ->
                    Row(
                        Modifier.fillMaxWidth().padding(vertical = 4.dp),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(w.date, style = monoStyle)
                        Text("${w.weight_kg} kg", color = F.text, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                    }
                }
            }
        }
    }
}
