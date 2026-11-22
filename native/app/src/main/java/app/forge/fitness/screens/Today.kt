package app.forge.fitness.screens

import app.forge.fitness.ui.Text

import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import app.forge.fitness.ui.Card
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import app.forge.fitness.data.*
import app.forge.fitness.logic.Calc
import app.forge.fitness.ui.*
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.TextStyle
import java.util.Locale
import kotlin.math.abs

fun niceDate(dateStr: String): String {
    return runCatching {
        val d = app.forge.fitness.logic.Calc.safeDate(dateStr)
        val dow = d.dayOfWeek.getDisplayName(TextStyle.SHORT, Locale.getDefault())
        val month = d.month.getDisplayName(TextStyle.SHORT, Locale.getDefault())
        "$dow, ${d.dayOfMonth} $month"
    }.getOrDefault(dateStr)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TodayScreen(s: Store, nav: NavController) {
    val st by s.state.collectAsStateWithLifecycle()
    val date by s.date.collectAsStateWithLifecycle()
    val today = remember { Calc.today() }
    val isToday = date == today
    val scope = rememberCoroutineScope()

    var stepSheet by remember { mutableStateOf(false) }
    var waterSheet by remember { mutableStateOf(false) }
    var addForMealId by remember { mutableStateOf<String?>(null) }
    var showDatePicker by remember { mutableStateOf(false) }

    val logs = remember(st.foodLogs, date) { st.foodLogs.filter { it.date == date } }
    val totals = remember(logs) { Calc.sumTotals(logs) }
    val byMeal = remember(logs) { Calc.totalsByMeal(logs) }
    val session = remember(st.sessions, date) { st.sessions.find { it.date == date } }
    val picks by s.dayPicks.collectAsStateWithLifecycle()
    val adh = remember(st, date, picks) { Calc.adherenceFor(st, date) }
    val steps = remember(st.steps, date) { st.steps.find { it.date == date }?.steps }
    val water = remember(st.water, date) { st.water.filter { it.date == date }.sumOf { it.ml } }
    val waterGoal = st.settings.water_goal_ml ?: 2500
    val plan = remember(st.plans) { st.plans.find { it.active == true } ?: st.plans.firstOrNull() }
    val dow = remember(date) { Calc.dow(date) }
    val pickedId = picks[date]
    val isRest = remember(st.settings.rest_days, dow, pickedId) { Calc.isRestDay(date, st.settings) }
    var swapOpen by remember { mutableStateOf(false) }
    val todayDay = remember(plan, session, st.sessions, isRest, pickedId) {
        if (plan == null || isRest) null
        else if (session != null) plan.days.find { it.id == session.day_id }
        else if (pickedId != null && plan.days.any { it.id == pickedId }) plan.days.first { it.id == pickedId }
        else {
            val done = st.sessions.filter { it.finished_at != null && it.plan_id == plan.id }.sortedBy { it.date }
            val lastIdx = if (done.isNotEmpty()) plan.days.indexOfFirst { it.id == done.last().day_id } else -1
            if (plan.days.isNotEmpty()) plan.days[(lastIdx + 1) % plan.days.size] else null
        }
    }

    // Plan-aware, forgiving streak (logic/Streak.kt): always measured to the real today, not the day being viewed.
    val streakView = remember(st, today) { app.forge.fitness.logic.Streak.view(st, today, s.streakRepairs()) }
    val curStreak = streakView.result.current

    val t = st.target
    val pct = if (t != null && t.calories > 0) (totals.calories / t.calories).toFloat() else 0f
    val remaining = if (t != null) (t.calories - totals.calories).toInt() else 0

    Column(
        Modifier
            .fillMaxSize()

            .statusBarsPadding()
    ) {
        // Top Header
        Row(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Column(Modifier.weight(1f)) {
                Eyebrow(niceDate(date))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        // Older days: short "Mon 16" so the title never wraps beside the date switcher.
                        text = if (isToday) "Today" else if (date == Calc.addDays(today, -1)) "Yesterday" else niceDate(date).substringBefore(",") + " " + app.forge.fitness.logic.Calc.safeDate(date).dayOfMonth,
                        fontSize = if (date == Calc.addDays(today, -1)) 24.sp else 28.sp, maxLines = 1, softWrap = false,
                        fontWeight = FontWeight.Bold,
                        color = F.text
                    )
                    Text(".", fontSize = 28.sp, fontWeight = FontWeight.Bold, color = F.accent)
                }
            }

            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                // Date switcher controls
                Row(
                    modifier = Modifier
                        .clip(RoundedCornerShape(999.dp))
                        .background(F.surface)
                        .border(1.dp, F.line, RoundedCornerShape(999.dp))
                        .padding(horizontal = 4.dp, vertical = 2.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(
                        onClick = { s.setDate(Calc.addDays(date, -1)) },
                        modifier = Modifier.size(44.dp)
                    ) {
                        Icon(Icons.Filled.ChevronLeft, contentDescription = "Previous day", tint = F.text)
                    }

                    Box(
                        Modifier
                            .clickable { showDatePicker = true }
                            .padding(horizontal = 6.dp)
                    ) {
                        Text(
                            text = if (isToday) "Today" else date.substring(5),
                            fontFamily = Mono,
                            fontSize = 12.sp,
                            color = F.text
                        )
                    }

                    IconButton(
                        onClick = { s.setDate(Calc.addDays(date, 1)) },
                        enabled = !isToday,
                        modifier = Modifier.size(44.dp)
                    ) {
                        Icon(
                            Icons.Filled.ChevronRight,
                            contentDescription = "Next day",
                            tint = if (isToday) F.mute.copy(alpha = 0.3f) else F.text
                        )
                    }
                }

                // Profile Avatar button -> /more
                Box(
                    modifier = Modifier
                        .size(44.dp)
                        .clip(CircleShape)
                        .background(F.raised)
                        .border(2.dp, F.accent, CircleShape)
                        .clickable { nav.navigate("more") { popUpTo("today") { saveState = true }; launchSingleTop = true; restoreState = true } },
                    contentAlignment = Alignment.Center
                ) {
                    val initial = (st.profile?.display_name?.ifBlank { "A" } ?: "A").take(1).uppercase()
                    Text(initial, fontWeight = FontWeight.Bold, color = F.text, fontSize = 16.sp)
                }
            }
        }

        // Scrollable content
        Column(
            Modifier
                .fillMaxWidth()
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Not Today banner
            if (!isToday) {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(16.dp))
                        .background(F.accent.copy(alpha = 0.12f))
                        .border(1.dp, F.accent.copy(alpha = 0.3f), RoundedCornerShape(16.dp))
                        .clickable { s.setDate(today) }
                        .padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = "Logging for ${niceDate(date)} — food, workouts and steps go to this day.",
                        fontSize = 13.sp,
                        color = F.accent,
                        modifier = Modifier.weight(1f)
                    )
                    Text("Back to today →", fontWeight = FontWeight.Bold, fontSize = 13.sp, color = F.accent)
                }
            }

            // Brand-new user: three clear first steps instead of a wall of zeros (audit). Gone after the first log.
            val newUser = st.foodLogs.isEmpty() && st.sessions.isEmpty() && st.weights.isEmpty()
            // The first-steps card stays until all three are done, not just the first log.
            val setup = listOf(
                Triple(st.target != null, "Set your goal", "more/goals"),
                Triple(st.foodLogs.isNotEmpty(), "Log your first meal", "diet"),
                Triple(st.sessions.any { it.finished_at != null }, "Do your first workout", "workout"),
            )
            if (setup.any { !it.first } && isToday) Card {
                Eyebrow("Get started")
                Spacer(Modifier.height(4.dp))
                Body("Three steps and FORGE starts working for you.", F.mute, 13)
                Spacer(Modifier.height(12.dp))
                setup.forEachIndexed { i, (done, label, route) ->
                    if (i > 0) RowDivider()
                    Row(Modifier.fillMaxWidth().clickable { nav.navigate(route) }.padding(vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(28.dp).clip(RoundedCornerShape(99.dp)).background(if (done) F.lime else F.raised), contentAlignment = Alignment.Center) {
                            Text(if (done) "✓" else "${i + 1}", color = if (done) Color.Black else F.text, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                        }
                        Spacer(Modifier.width(12.dp))
                        Text(label, Modifier.weight(1f), color = F.text, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                        Text("→", color = F.accent, fontSize = 16.sp)
                    }
                }
            }

            // Energy hero Card
            Card(paper = true) {
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.Top
                ) {
                    Column(Modifier.weight(1f)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            Icon(Icons.Filled.LocalFireDepartment, contentDescription = null, tint = F.accent, modifier = Modifier.size(16.dp))
                            Eyebrow("Calories today", color = F.accent)
                        }
                        Spacer(Modifier.height(8.dp))
                        Row(verticalAlignment = Alignment.Bottom) {
                            Text(
                                text = "${Math.round(totals.calories)}",
                                fontSize = 42.sp,
                                fontWeight = FontWeight.Bold,
                                color = F.paperInk,
                                letterSpacing = (-1).sp
                            )
                            Spacer(Modifier.width(6.dp))
                            Text(
                                text = "/ ${t?.let { Math.round(it.calories) } ?: "—"} kcal",
                                fontFamily = Mono,
                                fontSize = 13.sp,
                                color = F.paperDim,
                                modifier = Modifier.padding(bottom = 6.dp)
                            )
                        }

                        if (t != null) {
                            Spacer(Modifier.height(8.dp))
                            val isLeft = remaining >= 0
                            val tagText = if (isLeft) "${remaining} kcal left" else "${abs(remaining)} kcal over"
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(999.dp))
                                    .background(if (isLeft) F.raised else F.danger.copy(alpha = 0.15f))
                                    .border(1.dp, if (isLeft) F.line else F.danger.copy(alpha = 0.4f), RoundedCornerShape(999.dp))
                                    .padding(horizontal = 10.dp, vertical = 4.dp)
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                    Box(Modifier.size(6.dp).clip(CircleShape).background(if (isLeft) F.accent else F.danger))
                                    Text(tagText, fontFamily = Mono, fontSize = 12.sp, color = if (isLeft) F.paperInk else F.danger)
                                }
                            }
                        } else {
                            Spacer(Modifier.height(8.dp))
                            Text(
                                text = "Set your target →",
                                fontSize = 13.sp,
                                color = F.accent,
                                fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.clickable { nav.navigate("more/target") }
                            )
                        }
                    }

                    // Calorie hero arc ring (only with a target: "0% eaten" next to 728 kcal read as a bug)
                    if (t != null) CalorieArc(pct = pct)
                }

                Spacer(Modifier.height(16.dp))
                if (!newUser) Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    MacroBar(label = "Protein", share = macroShare(totals.protein_g * 4, totals), value = totals.protein_g, target = t?.protein_g, color = F.protein, modifier = Modifier.weight(1f))
                    MacroBar(label = "Carbs", share = macroShare(totals.carbs_g * 4, totals), value = totals.carbs_g, target = t?.carbs_g, color = F.carbs, modifier = Modifier.weight(1f))
                    MacroBar(label = "Fat", share = macroShare(totals.fat_g * 9, totals), value = totals.fat_g, target = t?.fat_g, color = F.fat, modifier = Modifier.weight(1f))
                }
            }

            // Stat tiles (Steps, Water, Streak): hidden until there is something to show.
            if (!newUser) Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                // Steps
                StatTile(
                    icon = Icons.Filled.DirectionsWalk,
                    value = steps?.let { "%,d".format(it) } ?: "—",
                    unit = null,
                    label = "Steps",
                    sub = "Goal ${st.settings.step_goal / 1000}k",
                    done = steps != null && steps >= st.settings.step_goal,
                    accent = false,
                    onClick = { stepSheet = true },
                    fill = steps?.let { (it.toFloat() / st.settings.step_goal).coerceIn(0f, 1f) } ?: 0f,
                    modifier = Modifier.weight(1f)
                )

                // Water
                val waterL = Calc.round1(water / 1000.0)
                val goalL = Calc.round1(waterGoal / 1000.0)
                StatTile(
                    icon = Icons.Filled.WaterDrop,
                    value = "$waterL",
                    unit = "L",
                    label = "Water",
                    sub = "Goal $goalL L",
                    done = water >= waterGoal,
                    accent = false,
                    onClick = { waterSheet = true },
                    fill = (water.toFloat() / waterGoal).coerceIn(0f, 1f),
                    modifier = Modifier.weight(1f)
                )

                // Streak
                StatTile(
                    icon = Icons.Filled.Bolt,
                    value = "$curStreak",
                    unit = if (curStreak == 1) "day" else "days",
                    label = "Streak",
                    sub = if (streakView.repairOffer != null) "Repair available" else "${streakView.result.freezesLeft} freeze${if (streakView.result.freezesLeft == 1) "" else "s"} left",
                    done = false,
                    accent = true,
                    onClick = { nav.navigate("adherence") },
                    fill = adh.score.toFloat().coerceIn(0f, 1f),
                    modifier = Modifier.weight(1f)
                )
            }

            // Workout card
            Card {
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(999.dp))
                        .background(F.accent.copy(alpha = 0.1f))
                        .border(1.dp, F.accent.copy(alpha = 0.35f), RoundedCornerShape(999.dp))
                        .padding(horizontal = 10.dp, vertical = 4.dp)
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Icon(Icons.Filled.FitnessCenter, contentDescription = null, tint = F.accent, modifier = Modifier.size(14.dp))
                        Text(if (isToday) "Today's workout" else "Workout", fontSize = 13.sp, color = F.accent, fontWeight = FontWeight.SemiBold)
                    }
                }

                Spacer(Modifier.height(8.dp))
                if (isRest && session == null) {
                    Title("Rest day", 22)
                    Spacer(Modifier.height(4.dp))
                    Body(
                        text = if (pickedId == Calc.REST) "You chose to rest today. It won't count against your streak."
                        else "Recovery is training too. Trained anyway? Start a freestyle session.",
                        color = F.mute,
                        size = 13
                    )
                    Spacer(Modifier.height(10.dp))
                    FButton(
                        text = "Freestyle session",
                        variant = Variant.Quiet,
                        onClick = { nav.navigate("workout/session/freestyle") }
                    )
                    // Feel like training on a rest day? Pick any plan day for today.
                    if (plan != null && plan.days.isNotEmpty()) {
                        Spacer(Modifier.height(10.dp))
                        Text(if (swapOpen) "Pick a day for today" else "Train today instead →", fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
                            color = F.accent, modifier = Modifier.clip(RoundedCornerShape(8.dp)).clickable { swapOpen = !swapOpen }.padding(vertical = 6.dp))
                        if (swapOpen) DayGrid(plan.days.map { it.id to it.name }, null) { s.pickDay(date, it); swapOpen = false }
                    }
                    if (pickedId == Calc.REST && !swapOpen) Text("Back to the planned order", fontSize = 12.sp, color = F.mute,
                        modifier = Modifier.clickable { s.pickDay(date, null) }.padding(vertical = 4.dp))
                } else if (todayDay != null) {
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.Bottom
                    ) {
                        Column(Modifier.weight(1f)) {
                            Title(todayDay.name, 22)
                            val setsDone = session?.exercises?.sumOf { e -> e.sets.count { it.done && it.warmup != true } } ?: 0
                            val subInfo = buildString {
                                append("${todayDay.exercises.size} exercises")
                                if (todayDay.focus.isNotBlank()) append(" · ${todayDay.focus}")
                                if (session != null) append(" · $setsDone sets done")
                            }
                            Text(subInfo, fontFamily = Mono, fontSize = 12.sp, color = F.mute)
                        }

                        val actionText = if (session?.finished_at != null) "View" else if (session != null) "Resume" else "Start"
                        FButton(
                            text = actionText,
                            onClick = { nav.navigate("workout/session/${todayDay.id}") }
                        )
                    }
                    // Not feeling this day (e.g. upper body two days running)? Pick any other day of the plan for today.
                    if (session == null && plan != null) {
                        Spacer(Modifier.height(10.dp))
                        Text(if (swapOpen) "Pick a day for today" else "Do a different day →", fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
                            color = F.accent, modifier = Modifier.clip(RoundedCornerShape(8.dp)).clickable { swapOpen = !swapOpen }.padding(vertical = 6.dp))
                        if (swapOpen) {
                            DayGrid(plan.days.map { it.id to it.name }, todayDay.id) { s.pickDay(date, it); swapOpen = false }
                            // Rest is not part of the plan, so it sits apart from the plan days, as a quiet option.
                            Spacer(Modifier.height(10.dp))
                            FButton("Rest today instead", Modifier.fillMaxWidth(), Variant.Ghost) { s.pickDay(date, Calc.REST); swapOpen = false }
                        }
                        if (pickedId != null && !swapOpen) Text("Back to the planned order", fontSize = 12.sp, color = F.mute,
                            modifier = Modifier.clickable { s.pickDay(date, null) }.padding(vertical = 4.dp))
                    }
                } else {
                    Body("No plan yet.", color = F.dim, size = 13)
                    Spacer(Modifier.height(6.dp))
                    FButton(text = "Build a plan", onClick = { nav.navigate("more/plan") })
                }
            }

            // Fuel log header
            Row(
                Modifier.fillMaxWidth().padding(top = 8.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Bottom
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Title("Meals", 20)
                    val loggedCount = st.mealTypes.count { byMeal[it.id] != null }
                    Text("· $loggedCount/${st.mealTypes.size} logged", fontFamily = Mono, fontSize = 12.sp, color = F.mute)
                }
                Text(
                    text = "DETAILS →",
                    fontFamily = Mono,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    color = F.accent,
                    modifier = Modifier.clickable { nav.navigate("diet") }
                )
            }

            // Meal types list
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                st.mealTypes.forEach { m ->
                    val mt = byMeal[m.id]
                    val items = logs.filter { it.meal_type_id == m.id }
                    val hasItems = mt != null && items.isNotEmpty()

                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(20.dp))
                            .background(if (hasItems) F.surface else Color.Transparent)
                            .border(
                                width = if (hasItems) 1.dp else 1.5.dp,
                                color = if (hasItems) F.line else F.line.copy(alpha = 0.5f),
                                shape = RoundedCornerShape(20.dp)
                            )
                            .clickable {
                                if (items.isNotEmpty()) nav.navigate("diet")
                                else addForMealId = m.id
                            }
                            .padding(14.dp)
                    ) {
                        Row(
                            Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(48.dp)
                                    .clip(RoundedCornerShape(16.dp))
                                    .background(F.raised),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(
                                    imageVector = if (hasItems) Icons.Filled.Check else Icons.Filled.Restaurant,
                                    contentDescription = null,
                                    tint = if (hasItems) F.lime else F.mute,
                                    modifier = Modifier.size(20.dp)
                                )
                            }

                            Column(Modifier.weight(1f)) {
                                Text(
                                    text = "${m.name} · ${m.time}",
                                    fontFamily = Mono,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = if (hasItems) F.lime else F.mute
                                )
                                Spacer(Modifier.height(2.dp))
                                val summary = if (items.isNotEmpty()) {
                                    items.joinToString(", ") { if (!it.serving_label.isNullOrBlank() && "(${it.serving_label})" !in it.name) "${it.name} (${it.serving_label})" else it.name }
                                } else "Tap to add"
                                Text(
                                    text = summary,
                                    fontSize = 14.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = if (hasItems) F.text else F.dim,
                                    lineHeight = 19.sp,
                                    maxLines = 3,
                                    overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis
                                )
                                if (hasItems) {
                                    Spacer(Modifier.height(2.dp))
                                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                        Text("P ${Math.round(mt!!.protein_g)}g", fontFamily = Mono, fontSize = 12.sp, color = F.protein)
                                        Text("·", color = F.mute, fontSize = 12.sp)
                                        Text("C ${Math.round(mt.carbs_g)}g", fontFamily = Mono, fontSize = 12.sp, color = F.carbs)
                                        Text("·", color = F.mute, fontSize = 12.sp)
                                        Text("F ${Math.round(mt.fat_g)}g", fontFamily = Mono, fontSize = 12.sp, color = F.fat)
                                    }
                                }
                            }

                            if (hasItems) {
                                Column(horizontalAlignment = Alignment.End) {
                                    Figure("${Math.round(mt!!.calories)}", 20)
                                    Eyebrow("KCAL", F.mute)
                                }
                            } else {
                                Chip(text = "+ Add", selected = false, onClick = { addForMealId = m.id })
                            }
                        }
                    }
                }
            }

            // Fasting card
            FastingCard(s = s)

            Spacer(Modifier.height(96.dp))
        }
    }

    // Step sheet
    StepSheet(open = stepSheet, onClose = { stepSheet = false }, date = date, s = s)

    // Water sheet
    WaterSheet(open = waterSheet, onClose = { waterSheet = false }, date = date, s = s)

    // Add food sheet
    if (addForMealId != null) {
        AddFoodSheet(
            open = true,
            onClose = { addForMealId = null },
            date = date,
            mealTypeId = addForMealId ?: st.mealTypes.firstOrNull()?.id ?: "",
            s = s,
            nav = nav
        )
    }

    // DatePicker dialog
    if (showDatePicker) {
        val initialMillis = runCatching {
            app.forge.fitness.logic.Calc.safeDate(date).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
        }.getOrNull() ?: System.currentTimeMillis()

        val datePickerState = rememberDatePickerState(initialSelectedDateMillis = initialMillis)
        DatePickerDialog(
            onDismissRequest = { showDatePicker = false },
            confirmButton = {
                TextButton(onClick = {
                    datePickerState.selectedDateMillis?.let { millis ->
                        val picked = Instant.ofEpochMilli(millis).atZone(ZoneOffset.UTC).toLocalDate().toString()
                        s.setDate(picked)
                    }
                    showDatePicker = false
                }) { Text("OK", color = F.accent) }
            },
            dismissButton = {
                TextButton(onClick = { showDatePicker = false }) { Text("Cancel", color = F.mute) }
            }
        ) {
            DatePicker(state = datePickerState)
        }
    }
}

@Composable
private fun CalorieArc(pct: Float) {
    LiquidRing(pct, 104.dp, 10.dp, F.accent, F.high, F.accent2) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text("${(pct * 100).toInt()}%", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = F.paperInk, lineHeight = 20.sp)
            Text("eaten", fontFamily = Mono, fontSize = 9.sp, color = F.paperDim)
        }
    }
}

private fun macroShare(kcal: Double, t: Calc.Totals): Float {
    val sum = t.protein_g * 4 + t.carbs_g * 4 + t.fat_g * 9
    return if (sum > 0) (kcal / sum).toFloat() else 0f
}

@Composable
private fun MacroBar(label: String, value: Double, target: Double?, color: Color, modifier: Modifier = Modifier, share: Float = 0f) {
    // No target yet: fill by this macro's share of the day's calories so the bar still says something.
    val frac = if (target != null && target > 0) (value / target).toFloat().coerceIn(0f, 1f) else share
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(16.dp))
            .background(F.raised)
            .padding(10.dp)
    ) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(label, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = color)
            if (target != null) {
                Text("${(frac * 100).toInt()}%", fontFamily = Mono, fontSize = 11.sp, color = F.mute)
            }
        }
        Spacer(Modifier.height(4.dp))
        Row(verticalAlignment = Alignment.Bottom) {
            Text("${Math.round(value)}", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = F.text)
            Text(" / ${target?.let { Math.round(it) } ?: "—"}g", fontFamily = Mono, fontSize = 12.sp, color = F.mute, modifier = Modifier.padding(bottom = 2.dp))
        }
        Spacer(Modifier.height(6.dp))
        ProgressBar(value = frac, color = color, height = 4.dp)
    }
}

@Composable
private fun StatTile(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    value: String,
    unit: String?,
    label: String,
    sub: String,
    done: Boolean = false,
    accent: Boolean = false,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    /** When set (0..1), the tile fills with a rippling water wave to that level. */
    fill: Float? = null,
) {
    // Edge-to-edge liquid: the whole tile is the vessel, filled to this stat's progress. Long values (5-digit steps)
    // step the type down instead of clipping.
    val tint = if (accent) F.accent else if (done) F.lime else F.dim
    Card(onClick = onClick, modifier = modifier.height(132.dp), pad = 0.dp) { Box(Modifier.fillMaxSize()) {
      if (fill != null) WaterWave(fill, Modifier.matchParentSize(), if (done) F.lime else if (accent) F.accent2 else F.protein)
      Column(Modifier.fillMaxSize().padding(12.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(28.dp).clip(CircleShape).background(tint.copy(alpha = .16f)), contentAlignment = Alignment.Center) {
                Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(16.dp))
            }
            if (done) Box(Modifier.size(8.dp).clip(CircleShape).background(F.lime))
        }
        Spacer(Modifier.weight(1f))
        val size = when { value.length >= 6 -> 19.sp; value.length >= 5 -> 22.sp; else -> 26.sp }
        Row(verticalAlignment = Alignment.Bottom) {
            Text(value, fontSize = size, lineHeight = size, fontWeight = FontWeight.Bold, color = if (accent) F.accent else F.text, maxLines = 1, softWrap = false)
            if (unit != null) Text(" $unit", fontSize = 12.sp, color = F.mute, maxLines = 1, modifier = Modifier.padding(bottom = 2.dp))
        }
        Spacer(Modifier.height(6.dp))
        Text(label, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = F.dim)
        Text(sub, fontSize = 12.sp, color = F.mute, lineHeight = 16.sp)
      }
    } }
}

/** Two offset sine waves filling the tile to [level]; the level eases when water is added. */
@Composable
private fun WaterWave(level: Float, modifier: Modifier, deep: Color = F.protein) {
    val l = rememberLiquid(level)
    val c1 = deep; val c2 = F.accent
    androidx.compose.foundation.Canvas(modifier) { drawLiquid(l, c1, c2) }
}

@Composable
private fun FastingCard(s: Store) {
    val st by s.state.collectAsStateWithLifecycle()
    val started = st.settings.fasting_started_at
    val hours = st.settings.fasting_hours ?: 16
    val scope = rememberCoroutineScope()

    var now by remember { mutableStateOf(System.currentTimeMillis()) }
    LaunchedEffect(started) { while (started != null) { kotlinx.coroutines.delay(30_000); now = System.currentTimeMillis() } }
    val elapsedHours = remember(started, now) {
        if (started != null) {
            val startMillis = runCatching { Instant.parse(started).toEpochMilli() }.getOrDefault(0L)
            if (startMillis > 0) (now - startMillis) / 3600000.0 else 0.0
        } else 0.0
    }
    val p = if (started != null && hours > 0) (elapsedHours / hours).toFloat() else 0f

    Card(modifier = Modifier.fillMaxWidth()) {
        Row(
            Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .background(F.raised),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    Icons.Filled.Timer,
                    contentDescription = null,
                    tint = if (started != null) F.accent else F.mute,
                    modifier = Modifier.size(22.dp)
                )
            }

            Column(Modifier.weight(1f)) {
                Text("Fasting · ${hours}h window", fontFamily = Mono, fontSize = 11.sp, fontWeight = FontWeight.Bold, color = F.mute)
                Spacer(Modifier.height(2.dp))
                val statusText = if (started != null) {
                    if (p >= 1f) "Done — ${elapsedHours.toInt()}h fasted"
                    else "${elapsedHours.toInt()}h ${(elapsedHours % 1.0 * 60).toInt()}m of ${hours}h"
                } else "Not fasting"
                Text(statusText, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = F.text)

                if (started != null) {
                    Spacer(Modifier.height(6.dp))
                    ProgressBar(value = p, color = if (p >= 1f) F.lime else F.accent, height = 4.dp)
                }
            }

            Chip(
                text = if (started != null) "End" else "Start",
                selected = false,
                onClick = {
                    scope.launch {
                        val nextStarted = if (started != null) null else Instant.now().toString()
                        s.save(Tables.settings, st.settings.copy(fasting_started_at = nextStarted))
                    }
                }
            )
        }
    }
}

@Composable
fun WaterSheet(open: Boolean, onClose: () -> Unit, date: String, s: Store) {
    if (!open) return
    val st by s.state.collectAsStateWithLifecycle()
    val entries = remember(st.water, date) { st.water.filter { it.date == date } }
    val totalMl = entries.sumOf { it.ml }
    val goalMl = st.settings.water_goal_ml ?: 2500
    val scope = rememberCoroutineScope()

    fun add(ml: Int) {
        scope.launch {
            s.save(Tables.water, WaterLog(id = uid(), date = date, ml = ml, at = nowIso()))
        }
    }

    Sheet(open = open, title = "Water", onClose = onClose) {
        Column(
            Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Row(verticalAlignment = Alignment.Bottom) {
                Text("${Calc.round1(totalMl / 1000.0)}", fontSize = 38.sp, fontWeight = FontWeight.Bold, color = F.text)
                Text(" / ${Calc.round1(goalMl / 1000.0)} L", fontFamily = Mono, fontSize = 16.sp, color = F.mute, modifier = Modifier.padding(bottom = 6.dp))
            }

            val glass by s.glassMl.collectAsStateWithLifecycle()
            val bottle by s.bottleMl.collectAsStateWithLifecycle()
            var editing by remember { mutableStateOf(false) }
            ProgressBar((totalMl.toFloat() / goalMl).coerceIn(0f, 1f), color = if (totalMl >= goalMl) F.lime else F.protein, height = 10.dp)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                listOf(Triple(glass, "Glass", Icons.Filled.LocalDrink), Triple(bottle, "Bottle", Icons.Filled.WaterDrop)).forEach { (ml, lbl, icon) ->
                    Card(onClick = { add(ml) }, modifier = Modifier.weight(1f)) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
                            Icon(icon, contentDescription = null, tint = F.protein, modifier = Modifier.size(32.dp))
                            Spacer(Modifier.height(6.dp))
                            Text(if (ml >= 1000) "+${Calc.round1(ml / 1000.0)} L" else "+$ml ml", fontWeight = FontWeight.Bold, fontSize = 18.sp, color = F.text)
                            Text("Tap: I drank a ${lbl.lowercase()}", fontSize = 12.sp, color = F.mute)
                        }
                    }
                }
            }
            if (editing) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Column(Modifier.weight(1f)) { Field("Glass (ml)") { NumberInput(glass.toDouble(), { it?.let { v -> s.setGlassMl(v.toInt()) } }) } }
                    Column(Modifier.weight(1f)) { Field("Bottle (ml)") { NumberInput(bottle.toDouble(), { it?.let { v -> s.setBottleMl(v.toInt()) } }) } }
                }
            }
            FButton(if (editing) "Done" else "Change glass / bottle size", Modifier.fillMaxWidth(), Variant.Quiet) { editing = !editing }

            if (entries.isNotEmpty()) {
                val last = entries.last()
                FButton(
                    text = "Undo last (${last.ml} ml)",
                    modifier = Modifier.fillMaxWidth(),
                    variant = Variant.Ghost,
                    onClick = {
                        scope.launch { s.del(Tables.water, last.id) }
                    }
                )
            }
        }
    }
}

@Composable
fun StepSheet(open: Boolean, onClose: () -> Unit, date: String, s: Store) {
    if (!open) return
    val st by s.state.collectAsStateWithLifecycle()
    val existing = remember(st.steps, date) { st.steps.find { it.date == date } }
    var text by remember(date) { mutableStateOf(existing?.steps?.toString() ?: "") }
    val scope = rememberCoroutineScope()

    Sheet(open = open, title = "Log steps", onClose = onClose) {
        Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Field(label = "Steps on $date", hint = "Goal: %,d".format(st.settings.step_goal)) {
                Input(
                    value = text,
                    onChange = { text = it.filter { ch -> ch.isDigit() } },
                    placeholder = "7842",
                    number = true
                )
            }

            FButton(
                text = "Save steps",
                modifier = Modifier.fillMaxWidth(),
                onClick = {
                    val n = text.toIntOrNull()
                    if (n != null && n in 0..200000) {
                        scope.launch {
                            s.save(Tables.steps, StepLog(id = existing?.id ?: uid(), date = date, steps = n))
                            onClose()
                        }
                    }
                }
            )

            if (existing != null) {
                FButton(
                    text = "Delete entry",
                    modifier = Modifier.fillMaxWidth(),
                    variant = Variant.Danger,
                    onClick = {
                        scope.launch {
                            s.del(Tables.steps, existing.id)
                            onClose()
                        }
                    }
                )
            }
        }
    }
}

/** Plan days as a two-column chip grid. "Day 1 — Upper Strength" shows as "Upper Strength" so every chip fits one line. */
@Composable
private fun DayGrid(days: List<Pair<String, String>>, selected: String?, pick: (String) -> Unit) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        days.chunked(2).forEach { row ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                row.forEach { (id, name) -> Chip(name.substringAfter(" — ").trim(), id == selected, Modifier.weight(1f)) { pick(id) } }
                if (row.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}
