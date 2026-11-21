package app.forge.fitness.screens

import app.forge.fitness.ui.Text

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.*
import app.forge.fitness.ui.Card
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import app.forge.fitness.data.*
import app.forge.fitness.logic.Planner
import app.forge.fitness.logic.Templates
import app.forge.fitness.ui.*
import kotlinx.coroutines.launch

@Composable
fun PlanBuilderScreen(s: Store, nav: NavController) {
    val state by s.state.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()

    var planId by remember(state.plans) {
        mutableStateOf(
            state.plans.firstOrNull { it.active == true }?.id
                ?: state.plans.firstOrNull()?.id
                ?: ""
        )
    }
    val plan = state.plans.firstOrNull { it.id == planId } ?: state.plans.firstOrNull()

    var dayId by remember(plan?.id) { mutableStateOf(plan?.days?.firstOrNull()?.id ?: "") }
    var addOpen by remember { mutableStateOf(false) }
    var newOpen by remember { mutableStateOf(false) }
    var swapOpen by remember { mutableStateOf(false) }

    if (plan == null) {
        Screen(title = "Workout plans", back = { nav.popBackStack() }) {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                FButton(
                    text = "Use the supplied FORGE 5-day plan",
                    modifier = Modifier.fillMaxWidth()
                ) {
                    val p = Seed.plan.copy(id = uid(), active = true)
                    s.save(Tables.plans, p)
                }
                FButton(
                    text = "Build a different plan",
                    variant = Variant.Quiet,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    newOpen = true
                }
            }
            NewPlanSheet(
                open = newOpen,
                s = s,
                onClose = { newOpen = false },
                onCreated = { id ->
                    newOpen = false
                    planId = id
                }
            )
        }
        return
    }

    val day = plan.days.firstOrNull { it.id == dayId } ?: plan.days.firstOrNull() ?: plan.days.first()

    fun savePlan(next: WorkoutPlan) = s.save(Tables.plans, next)

    fun patchDay(patch: (WorkoutDay) -> WorkoutDay) {
        val updatedDays = plan.days.map { d -> if (d.id == day.id) patch(d) else d }
        savePlan(plan.copy(days = updatedDays))
    }

    fun move(i: Int, dir: Int) {
        val list = day.exercises.toMutableList()
        val j = i + dir
        if (j in list.indices) {
            val temp = list[i]
            list[i] = list[j]
            list[j] = temp
            patchDay { d -> d.copy(exercises = list.mapIndexed { k, e -> e.copy(position = k) }) }
        }
    }

    Screen(
        title = "Workout plan",
        sub = plan.name,
        back = { nav.popBackStack() }
    ) {
        if (state.plans.size > 1) {
            Tabs(
                value = planId,
                options = state.plans.map { it.id to it.name.take(14) },
                onChange = {
                    planId = it
                    val nextP = state.plans.firstOrNull { p -> p.id == it }
                    dayId = nextP?.days?.firstOrNull()?.id ?: ""
                }
            )
        }

        Card {
            Eyebrow("How weights progress")
            Spacer(Modifier.height(8.dp))
            val wave = plan.progression == "wave"
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Chip("Auto (from RPE)", !wave, Modifier.weight(1f)) { savePlan(plan.copy(progression = null)) }
                Chip("Powerlifting wave", wave, Modifier.weight(1f)) { s.setWaveStart(plan.id, app.forge.fitness.logic.Calc.today()); savePlan(plan.copy(progression = "wave")) }
            }
            Spacer(Modifier.height(8.dp))
            if (!wave) Body("Each session's weight comes from your last sets and how hard they felt (RPE).", size = 12)
            else {
                var pcts by remember(plan.id) { mutableStateOf(s.wavePcts(plan.id)) }
                val parsed = app.forge.fitness.logic.Training.parseWave(pcts)
                val week = app.forge.fitness.logic.Training.waveWeek(s.waveStart(plan.id), app.forge.fitness.logic.Calc.today(), parsed.size)
                Body("Weekly % of your estimated max from logged sets. Reps match the weight: 5 reps at 70%, 4 at 80%, 3 at 90%, singles at 100%+.", size = 12)
                Spacer(Modifier.height(8.dp))
                Field("Weekly percentages") { Input(pcts, { pcts = it; s.setWavePcts(plan.id, it) }, placeholder = "70, 80, 90, 105, 60") }
                Spacer(Modifier.height(8.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    parsed.forEachIndexed { i, (p, r) ->
                        Column(Modifier.weight(1f).clip(RoundedCornerShape(12.dp)).background(if (i == week) F.accent else F.raised).padding(vertical = 8.dp),
                            horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("W${i + 1}", fontSize = 11.sp, color = if (i == week) F.accentInk else F.mute, fontWeight = FontWeight.Bold)
                            Text("$p%", fontSize = 14.sp, color = if (i == week) F.accentInk else F.text, fontWeight = FontWeight.Bold)
                            Text("×$r", fontSize = 11.sp, color = if (i == week) F.accentInk else F.mute)
                        }
                    }
                }
                Spacer(Modifier.height(8.dp))
                FButton("Restart cycle this week (week 1)", Modifier.fillMaxWidth(), Variant.Ghost) { s.setWaveStart(plan.id, app.forge.fitness.logic.Calc.today()); pcts = pcts + "" }
            }
        }

        Card {
            Field(label = "Plan name") {
                var nameText by remember(plan.name) { mutableStateOf(plan.name) }
                Input(
                    value = nameText,
                    onChange = {
                        nameText = it
                        savePlan(plan.copy(name = it))
                    },
                    placeholder = "Plan name"
                )
            }

            Spacer(Modifier.height(8.dp))

            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FButton(
                    text = if (plan.active == true) "Active plan" else "Make active",
                    variant = Variant.Quiet,
                    modifier = Modifier.weight(1f)
                ) {
                    state.plans.forEach { p ->
                        if (p.id != plan.id && p.active == true) {
                            s.save(Tables.plans, p.copy(active = false))
                        }
                    }
                    savePlan(plan.copy(active = true))
                }
                FButton(
                    text = "Duplicate plan",
                    variant = Variant.Ghost,
                    modifier = Modifier.weight(1f)
                ) {
                    val newId = uid()
                    val dup = plan.copy(
                        id = newId,
                        name = "${plan.name} (copy)",
                        active = false,
                        days = plan.days.map { d ->
                            val dId = uid()
                            d.copy(
                                id = dId,
                                plan_id = newId,
                                exercises = d.exercises.map { e -> e.copy(id = uid()) }
                            )
                        }
                    )
                    s.save(Tables.plans, dup)
                    planId = newId
                }
            }

            Spacer(Modifier.height(8.dp))

            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FButton(text = "Replace / new plan", variant = Variant.Quiet, modifier = Modifier.weight(1f)) {
                    newOpen = true
                }
                FButton(text = "Swap this day", variant = Variant.Ghost, modifier = Modifier.weight(1f)) {
                    swapOpen = true
                }
            }

            if (state.plans.size > 1) {
                Spacer(Modifier.height(8.dp))
                FButton(
                    text = "Delete this plan",
                    variant = Variant.Danger,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    val remaining = state.plans.filter { it.id != plan.id }
                    s.del(Tables.plans, plan.id)
                    remaining.firstOrNull()?.let {
                        planId = it.id
                        dayId = it.days.firstOrNull()?.id ?: ""
                    }
                }
            }

            Spacer(Modifier.height(8.dp))
            Body(
                "Changing a plan never affects workout history — past sessions are stored separately.",
                F.mute,
                11
            )
        }

        Tabs(
            value = day.id,
            options = plan.days.mapIndexed { i, d -> d.id to "Day ${i + 1}" },
            onChange = { dayId = it }
        )

        Card {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Box(Modifier.weight(1f)) {
                    Field(label = "Day name") {
                        var dName by remember(day.name) { mutableStateOf(day.name) }
                        Input(
                            value = dName,
                            onChange = {
                                dName = it
                                patchDay { d -> d.copy(name = it) }
                            },
                            placeholder = "Day name"
                        )
                    }
                }
                Box(Modifier.weight(1f)) {
                    Field(label = "Focus") {
                        var dFocus by remember(day.focus) { mutableStateOf(day.focus) }
                        Input(
                            value = dFocus,
                            onChange = {
                                dFocus = it
                                patchDay { d -> d.copy(focus = it) }
                            },
                            placeholder = "Focus"
                        )
                    }
                }
            }
        }

        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            day.exercises.forEachIndexed { i, ex ->
                Card {
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            ex.name ?: nameOf(ex.exercise_id),
                            color = F.text,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.weight(1f)
                        )

                        Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                "↑",
                                color = if (i > 0) F.text else F.mute,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier
                                    .clip(RoundedCornerShape(6.dp))
                                    .clickable(enabled = i > 0) { move(i, -1) }
                                    .padding(horizontal = 8.dp, vertical = 4.dp)
                            )
                            Text(
                                "↓",
                                color = if (i < day.exercises.size - 1) F.text else F.mute,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier
                                    .clip(RoundedCornerShape(6.dp))
                                    .clickable(enabled = i < day.exercises.size - 1) { move(i, 1) }
                                    .padding(horizontal = 8.dp, vertical = 4.dp)
                            )
                            Text(
                                "⧉",
                                color = F.text,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier
                                    .clip(RoundedCornerShape(6.dp))
                                    .clickable {
                                        val list = day.exercises.toMutableList()
                                        list.add(i + 1, ex.copy(id = uid()))
                                        patchDay { d -> d.copy(exercises = list.mapIndexed { k, e -> e.copy(position = k) }) }
                                    }
                                    .padding(horizontal = 8.dp, vertical = 4.dp)
                            )
                            IconButton(
                                onClick = {
                                    val list = day.exercises.filter { it.id != ex.id }
                                    patchDay { d -> d.copy(exercises = list.mapIndexed { k, e -> e.copy(position = k) }) }
                                },
                                modifier = Modifier.size(32.dp)
                            ) {
                                Icon(Icons.Filled.Delete, contentDescription = "Remove exercise", tint = F.danger, modifier = Modifier.size(18.dp))
                            }
                        }
                    }

                    Spacer(Modifier.height(8.dp))

                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Box(Modifier.weight(1f)) {
                            Field(label = "Sets") {
                                var sText by remember(ex.sets) { mutableStateOf(ex.sets.toString()) }
                                Input(
                                    value = sText,
                                    onChange = {
                                        sText = it
                                        val num = it.toIntOrNull()?.coerceIn(1, 12) ?: 1
                                        patchDay { d -> d.copy(exercises = d.exercises.map { x -> if (x.id == ex.id) x.copy(sets = num) else x }) }
                                    },
                                    number = true
                                )
                            }
                        }
                        Box(Modifier.weight(1f)) {
                            Field(label = "Reps") {
                                var rText by remember(ex.reps) { mutableStateOf(ex.reps) }
                                Input(
                                    value = rText,
                                    onChange = {
                                        rText = it
                                        patchDay { d -> d.copy(exercises = d.exercises.map { x -> if (x.id == ex.id) x.copy(reps = it) else x }) }
                                    }
                                )
                            }
                        }
                        Box(Modifier.weight(1f)) {
                            Field(label = "Target") {
                                var tText by remember(ex.target) { mutableStateOf(ex.target) }
                                Input(
                                    value = tText,
                                    onChange = {
                                        tText = it
                                        patchDay { d -> d.copy(exercises = d.exercises.map { x -> if (x.id == ex.id) x.copy(target = it) else x }) }
                                    }
                                )
                            }
                        }
                    }

                    Spacer(Modifier.height(8.dp))

                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Box(Modifier.weight(1f)) {
                            Field(label = "Rest (sec)") {
                                var restText by remember(ex.rest_sec) { mutableStateOf(ex.rest_sec?.toString() ?: "") }
                                Input(
                                    value = restText,
                                    onChange = {
                                        restText = it
                                        val num = it.toIntOrNull()
                                        patchDay { d -> d.copy(exercises = d.exercises.map { x -> if (x.id == ex.id) x.copy(rest_sec = num) else x }) }
                                    },
                                    number = true
                                )
                            }
                        }
                        Box(Modifier.weight(1f)) {
                            Field(label = "Tempo") {
                                var tempoText by remember(ex.tempo) { mutableStateOf(ex.tempo ?: "") }
                                Input(
                                    value = tempoText,
                                    placeholder = "3-0-1",
                                    onChange = {
                                        tempoText = it
                                        patchDay { d -> d.copy(exercises = d.exercises.map { x -> if (x.id == ex.id) x.copy(tempo = it.ifEmpty { null }) else x }) }
                                    }
                                )
                            }
                        }
                    }

                    Spacer(Modifier.height(8.dp))

                    Field(label = "Notes") {
                        var noteText by remember(ex.note) { mutableStateOf(ex.note ?: "") }
                        Input(
                            value = noteText,
                            onChange = {
                                noteText = it
                                patchDay { d -> d.copy(exercises = d.exercises.map { x -> if (x.id == ex.id) x.copy(note = it.ifEmpty { null }) else x }) }
                            }
                        )
                    }
                }
            }
        }

        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            FButton(text = "+ Add exercise", variant = Variant.Quiet, modifier = Modifier.fillMaxWidth()) {
                addOpen = true
            }
            FButton(
                text = "+ Add day",
                variant = Variant.Ghost,
                modifier = Modifier.fillMaxWidth()
            ) {
                val newD = WorkoutDay(
                    id = uid(),
                    plan_id = plan.id,
                    name = "Day ${plan.days.size + 1}",
                    focus = "Strength",
                    position = plan.days.size,
                    exercises = emptyList()
                )
                savePlan(plan.copy(days = plan.days + newD))
            }
            if (plan.days.size > 1) {
                FButton(
                    text = "Delete this day",
                    variant = Variant.Danger,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    val remainingDays = plan.days.filter { it.id != day.id }.mapIndexed { idx, d -> d.copy(position = idx) }
                    dayId = remainingDays.first().id
                    savePlan(plan.copy(days = remainingDays))
                }
            }
        }

        // Sheet: Swap Day
        Sheet(open = swapOpen, title = "Replace “${day.name}” with", onClose = { swapOpen = false }) {
            val candidates = remember(state.plans, day.id) {
                state.plans.flatMap { p -> p.days.map { d -> p to d } }.filter { (_, d) -> d.id != day.id }
            }
            Column(Modifier.fillMaxWidth().heightIn(max = 400.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                candidates.forEach { (p, candidateDay) ->
                    Card(onClick = {
                        val newExercises = candidateDay.exercises.map { e -> e.copy(id = uid()) }
                        savePlan(
                            plan.copy(
                                days = plan.days.map { x ->
                                    if (x.id == day.id) {
                                        x.copy(name = candidateDay.name, focus = candidateDay.focus, exercises = newExercises)
                                    } else x
                                }
                            )
                        )
                        swapOpen = false
                    }) {
                        Text(candidateDay.name, color = F.text, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                        Spacer(Modifier.height(2.dp))
                        Text("${p.name} · ${candidateDay.exercises.size} exercises", color = F.mute, fontSize = 12.sp)
                    }
                }
            }
        }

        // Sheet: Add Exercise
        Sheet(open = addOpen, title = "Add exercise", onClose = { addOpen = false }) {
            var newName by remember { mutableStateOf("") }
            val known = remember(state.plans) {
                state.plans.flatMap { p -> p.days.flatMap { d -> d.exercises.map { it.name ?: nameOf(it.exercise_id) } } }.distinct().sorted()
            }

            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Field(label = "Exercise name") {
                    Input(value = newName, onChange = { newName = it }, placeholder = "Incline DB Press")
                }
                FButton(
                    text = "Add exercise",
                    enabled = newName.isNotBlank(),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    val nameTrimmed = newName.trim()
                    val slug = "ex-" + nameTrimmed.lowercase().replace(Regex("[^a-z0-9]+"), "-")
                    val exRow = WorkoutExercise(
                        id = uid(),
                        exercise_id = slug,
                        name = nameTrimmed,
                        sets = 3,
                        reps = "10",
                        target = "",
                        position = day.exercises.size
                    )
                    patchDay { d -> d.copy(exercises = d.exercises + exRow) }
                    addOpen = false
                }

                if (known.isNotEmpty()) {
                    Eyebrow("Already in your plans")
                    Column(
                        Modifier.fillMaxWidth().heightIn(max = 240.dp).verticalScroll(rememberScrollState()),
                        verticalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        known.forEach { kName ->
                            Card(onClick = {
                                val slug = "ex-" + kName.lowercase().replace(Regex("[^a-z0-9]+"), "-")
                                val exRow = WorkoutExercise(
                                    id = uid(),
                                    exercise_id = slug,
                                    name = kName,
                                    sets = 3,
                                    reps = "10",
                                    target = "",
                                    position = day.exercises.size
                                )
                                patchDay { d -> d.copy(exercises = d.exercises + exRow) }
                                addOpen = false
                            }) {
                                Text(kName, color = F.text, fontSize = 13.sp)
                            }
                        }
                    }
                }
            }
        }

        // Sheet: New Plan
        NewPlanSheet(
            open = newOpen,
            s = s,
            onClose = { newOpen = false },
            onCreated = { id ->
                newOpen = false
                planId = id
                val nextP = state.plans.firstOrNull { it.id == id }
                dayId = nextP?.days?.firstOrNull()?.id ?: ""
            }
        )
    }
}

@Composable
private fun NewPlanSheet(
    open: Boolean,
    s: Store,
    onClose: () -> Unit,
    onCreated: (String) -> Unit
) {
    val state by s.state.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()

    var focus by remember { mutableStateOf("strength_aesthetics") }
    var daysCount by remember { mutableStateOf(5) }
    var preferences by remember { mutableStateOf("") }
    var equipment by remember { mutableStateOf("") }
    var experience by remember { mutableStateOf("intermediate") }
    var replaceActive by remember { mutableStateOf(true) }
    var busy by remember { mutableStateOf(false) }
    var proposal by remember { mutableStateOf<WorkoutPlan?>(null) }
    var rationale by remember { mutableStateOf<String?>(null) }
    var note by remember { mutableStateOf<String?>(null) }
    var aiUsed by remember { mutableStateOf(false) }

    val templatePlan = remember(focus, daysCount, preferences) {
        Templates.generatePlan(
            Templates.GenerateOptions(
                focus = focus,
                daysPerWeek = daysCount.coerceIn(3, 6), // built-in templates exist for 3–6 days; AI handles 2–7
                emphasis = emptyList()
            )
        )
    }
    val preview = proposal ?: templatePlan

    fun activate(p: WorkoutPlan, source: String) {
        if (replaceActive) {
            state.plans.filter { it.active == true }.forEach {
                s.save(Tables.plans, it.copy(active = false))
            }
        }
        val ready = p.copy(active = replaceActive, source = source)
        s.save(Tables.plans, ready)
        onCreated(ready.id)
    }

    Sheet(open = open, title = "Build a plan", onClose = onClose) {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Eyebrow("Training focus")
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Templates.FOCUS_LABELS.entries.chunked(2).forEach { row ->
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        row.forEach { (key, label) ->
                            val isSel = focus == key
                            Box(
                                Modifier
                                    .weight(1f)
                                    .heightIn(min = 44.dp)
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(if (isSel) F.accent else F.surface)
                                    .border(1.dp, if (isSel) F.accent else F.line, RoundedCornerShape(12.dp))
                                    .clickable {
                                        focus = key
                                        proposal = null
                                    }
                                    .padding(horizontal = 8.dp, vertical = 8.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    label,
                                    color = if (isSel) F.accentInk else F.text,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }
                        if (row.size == 1) Spacer(Modifier.weight(1f))
                    }
                }
            }

            Eyebrow("Days per week")
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                (2..7).forEach { n ->
                    val isSel = daysCount == n
                    Box(
                        Modifier
                            .weight(1f)
                            .heightIn(min = 44.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(if (isSel) F.accent else F.surface)
                            .border(1.dp, if (isSel) F.accent else F.line, RoundedCornerShape(12.dp))
                            .clickable {
                                daysCount = n
                                proposal = null
                            },
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            "$n",
                            color = if (isSel) F.accentInk else F.text,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }

            Field(
                label = "Tell FORGE about you and your goal",
                hint = "Write as much as you like: what you want to achieve, injuries or exercises to avoid, how long you can train, " +
                    "anything you love or hate. Your age, height, weight and goal from your profile are added automatically."
            ) {
                OutlinedTextField(
                    value = preferences,
                    onValueChange = { if (it.length <= 2000) { preferences = it; proposal = null } },
                    modifier = Modifier.fillMaxWidth().heightIn(min = 150.dp),
                    minLines = 6,
                    placeholder = { Text("Example: I want bigger shoulders and a wider back while losing belly fat. Keep bench press heavy. " +
                        "No barbell squats, my left knee hurts. I have 75 minutes per session.", color = F.mute) },
                    shape = RoundedCornerShape(16.dp),
                    colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = F.accent, unfocusedBorderColor = F.line,
                        focusedContainerColor = F.surface, unfocusedContainerColor = F.surface, focusedTextColor = F.text, unfocusedTextColor = F.text)
                )
                Text("${preferences.length} / 2000", color = F.mute, fontSize = 12.sp, modifier = Modifier.fillMaxWidth(), textAlign = androidx.compose.ui.text.style.TextAlign.End)
            }

            Field(label = "Equipment in your gym", hint = "List it all: barbells, dumbbells up to 30 kg, cable machine, leg press, pull-up bar…") {
                OutlinedTextField(
                    value = equipment,
                    onValueChange = { if (it.length <= 600) equipment = it },
                    modifier = Modifier.fillMaxWidth().heightIn(min = 90.dp),
                    minLines = 3,
                    placeholder = { Text("Full commercial gym", color = F.mute) },
                    shape = RoundedCornerShape(16.dp),
                    colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = F.accent, unfocusedBorderColor = F.line,
                        focusedContainerColor = F.surface, unfocusedContainerColor = F.surface, focusedTextColor = F.text, unfocusedTextColor = F.text)
                )
            }

            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Box(Modifier.weight(1f)) {
                    Field(label = "Experience") {
                        var expExpanded by remember { mutableStateOf(false) }
                        val expOptions = listOf("beginner" to "Beginner", "intermediate" to "Intermediate", "advanced" to "Advanced")
                        Box(Modifier.fillMaxWidth()) {
                            Box(
                                Modifier
                                    .fillMaxWidth()
                                    .heightIn(min = 48.dp)
                                    .clip(RoundedCornerShape(14.dp))
                                    .background(F.surface)
                                    .border(1.dp, F.line, RoundedCornerShape(14.dp))
                                    .clickable { expExpanded = true }
                                    .padding(horizontal = 14.dp, vertical = 12.dp),
                                contentAlignment = Alignment.CenterStart
                            ) {
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                                    Text(expOptions.firstOrNull { it.first == experience }?.second ?: experience, color = F.text, fontSize = 14.sp)
                                    Icon(Icons.Filled.ArrowDropDown, contentDescription = "Select", tint = F.mute)
                                }
                            }
                            DropdownMenu(
                                expanded = expExpanded,
                                onDismissRequest = { expExpanded = false },
                                modifier = Modifier.background(F.surface).border(1.dp, F.line)
                            ) {
                                expOptions.forEach { (k, v) ->
                                    DropdownMenuItem(
                                        text = { Text(v, color = F.text) },
                                        onClick = { experience = k; expExpanded = false }
                                    )
                                }
                            }
                        }
                    }
                }
            }

            if (busy) {
                Spinner("Designing your plan")
            } else {
                FButton(
                    text = "Generate with AI",
                    enabled = s.api.configured && !state.localMode,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    busy = true
                    note = null
                    scope.launch {
                        try {
                            val res = Planner.requestPlan(
                                api = s.api,
                                req = Planner.PlanRequest(
                                    focus = focus,
                                    daysPerWeek = daysCount,
                                    preferences = aboutMe(state, preferences),
                                    equipment = equipment.ifBlank { null },
                                    experience = experience
                                ),
                                localMode = state.localMode
                            )
                            proposal = res.plan
                            rationale = res.rationale
                            aiUsed = res.source == "ai"
                            note = res.fallbackReason
                        } catch (e: Exception) {
                            note = e.message ?: "Failed to generate plan."
                        } finally {
                            busy = false
                        }
                    }
                }
            }

            if (!s.api.configured || state.localMode) {
                Notice("AI is not configured — the template plan below still works.", Tone.Warn)
            }
            note?.let { Notice(it, Tone.Warn) }

            if (!rationale.isNullOrBlank() && aiUsed) {
                Card {
                    Eyebrow("Why this plan")
                    Spacer(Modifier.height(4.dp))
                    Body(rationale!!, F.text, 12)
                }
            }

            Card {
                Eyebrow(
                    if (proposal != null) {
                        if (aiUsed) "AI plan — review before activating" else "Template plan"
                    } else "Template preview"
                )
                Spacer(Modifier.height(4.dp))
                Title(preview.name, 16)
                Spacer(Modifier.height(8.dp))
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    preview.days.forEach { d ->
                        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(F.raised).padding(8.dp)) {
                            Text("${d.name} — ${d.exercises.size} exercises", color = F.text, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                            d.exercises.forEach { ex ->
                                Text(
                                    "• ${ex.name ?: nameOf(ex.exercise_id)} — ${ex.sets} × ${ex.reps}${if (ex.rest_sec != null) " · ${ex.rest_sec}s" else ""}",
                                    color = F.dim,
                                    fontSize = 12.sp
                                )
                            }
                        }
                    }
                }
            }

            Row(
                Modifier.fillMaxWidth().clickable { replaceActive = !replaceActive },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Checkbox(
                    checked = replaceActive,
                    onCheckedChange = { replaceActive = it },
                    colors = CheckboxDefaults.colors(checkedColor = F.accent)
                )
                Text("Make this my active plan", color = F.text, fontSize = 13.sp)
            }

            FButton(
                text = if (proposal != null) "Activate this plan" else "Create template plan",
                modifier = Modifier.fillMaxWidth()
            ) {
                activate(preview, if (proposal != null && aiUsed) "ai" else "template")
            }

            FButton(
                text = "Use the supplied FORGE 5-day plan",
                variant = Variant.Ghost,
                modifier = Modifier.fillMaxWidth()
            ) {
                val copy = Seed.plan.copy(id = uid(), active = replaceActive)
                if (replaceActive) {
                    state.plans.filter { it.active == true }.forEach {
                        s.save(Tables.plans, it.copy(active = false))
                    }
                }
                s.save(Tables.plans, copy)
                onCreated(copy.id)
            }

            FButton(
                text = "Start from an empty plan",
                variant = Variant.Ghost,
                modifier = Modifier.fillMaxWidth()
            ) {
                val id = uid()
                val blank = WorkoutPlan(
                    id = id,
                    name = "My plan",
                    active = replaceActive,
                    focus = "custom",
                    days_per_week = daysCount,
                    source = "custom",
                    days = listOf(
                        WorkoutDay(
                            id = uid(),
                            plan_id = id,
                            name = "Day 1",
                            focus = "Custom",
                            position = 0,
                            exercises = emptyList()
                        )
                    )
                )
                if (replaceActive) {
                    state.plans.filter { it.active == true }.forEach {
                        s.save(Tables.plans, it.copy(active = false))
                    }
                }
                s.save(Tables.plans, blank)
                onCreated(id)
            }
        }
    }
}


/** The trainee's own words plus their profile facts, so the AI knows age, height, weight and goal without retyping. */
private fun aboutMe(st: app.forge.fitness.data.State, words: String): String? {
    val p = st.profile; val g = st.goal
    val latest = st.weights.maxByOrNull { it.date }?.weight_kg ?: g?.current_weight_kg
    val facts = listOfNotNull(
        p?.let { "${it.age} years old, ${it.sex}, ${it.height_cm.toInt()} cm" },
        latest?.let { "weighs $it kg" },
        g?.let { "goal: ${it.mode} to ${it.target_weight_kg} kg, ${it.training_minutes} min per session" },
    )
    val about = if (facts.isEmpty()) "" else "About me: " + facts.joinToString(", ") + ".\n"
    return (about + words.trim()).ifBlank { null }
}
