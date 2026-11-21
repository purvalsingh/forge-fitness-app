package app.forge.fitness.screens

import app.forge.fitness.ui.Text

import android.app.Activity
import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.view.WindowManager
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import app.forge.fitness.data.*
import app.forge.fitness.logic.Calc
import app.forge.fitness.logic.Exercises
import app.forge.fitness.logic.Training
import app.forge.fitness.ui.*
import kotlinx.coroutines.delay
import java.time.Instant
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.roundToInt

private fun fmtClock(totalSec: Long): String {
    val s = max(0L, totalSec)
    val hrs = s / 3600
    val mins = (s / 60) % 60
    val secs = s % 60
    return "%02d:%02d:%02d".format(hrs, mins, secs)
}

private fun fmtRest(totalSec: Int): String {
    val s = max(0, totalSec)
    val mins = s / 60
    val secs = s % 60
    return "%d:%02d".format(mins, secs)
}

@Composable
fun SessionScreen(s: Store, nav: NavController, dayId: String) {
    val context = LocalContext.current
    val activity = context as? Activity
    val state by s.state.collectAsStateWithLifecycle()
    val date by s.date.collectAsStateWithLifecycle()
    val today = Calc.today()

    val freestyle = dayId == "freestyle"
    val plan = state.plans.firstOrNull { it.active == true } ?: state.plans.firstOrNull()
    val day = if (freestyle) null else plan?.days?.firstOrNull { it.id == dayId }

    val lb = state.settings.units == "lb"
    val effortScale = (state.settings.effort_scale ?: "rpe").let { if (it == "off" && !s.rpeChosen) "rpe" else it } // RPE on unless the user turned it off

    val existing = remember(state.sessions, date, dayId) {
        state.sessions.firstOrNull { it.date == date && it.day_id == (if (freestyle) "freestyle" else dayId) }
    }
    var draft by remember { mutableStateOf<WorkoutSession?>(existing) }
    var current by remember { mutableStateOf(0) }
    var restEnd by remember { mutableStateOf<Long?>(null) }
    var restTotal by remember { mutableStateOf(0) }
    var now by remember { mutableStateOf(System.currentTimeMillis()) }
    var err by remember { mutableStateOf<String?>(null) }
    var toast by remember { mutableStateOf<String?>(null) }
    var menu by remember { mutableStateOf<Int?>(null) }
    var picker by remember { mutableStateOf<PickerMode?>(null) }
    var flash by remember { mutableStateOf(false) }
    var lib by remember { mutableStateOf<List<Exercises.LibExercise>>(emptyList()) }

    LaunchedEffect(Unit) {
        lib = try { Exercises.loadExercises(context) } catch (_: Exception) { emptyList() }
    }

    LaunchedEffect(existing) {
        if (existing != null && draft == null) draft = existing
    }

    // Timer clock loop
    LaunchedEffect(draft?.finished_at) {
        while (draft?.finished_at == null) {
            delay(250)
            now = System.currentTimeMillis()
        }
    }

    // Locked-phone backup: a system alarm posts "Rest over" if the screen is off when rest ends (see RestAlarm).
    val notifyPerm = androidx.activity.compose.rememberLauncherForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.RequestPermission()) { }
    LaunchedEffect(Unit) {
        if (Build.VERSION.SDK_INT >= 33 && androidx.core.content.ContextCompat.checkSelfPermission(context,
                android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED)
            notifyPerm.launch(android.Manifest.permission.POST_NOTIFICATIONS)
    }
    LaunchedEffect(restEnd) {
        restEnd.let { if (it != null) app.forge.fitness.data.RestAlarm.schedule(context, it) else app.forge.fitness.data.RestAlarm.cancel(context) }
    }
    DisposableEffect(Unit) { onDispose { if (restEnd == null) app.forge.fitness.data.RestAlarm.cancel(context) } }

    // Rest timer countdown and vibration
    val restLeft = restEnd?.let { max(0, ceil((it - now) / 1000.0).toInt()) }
    LaunchedEffect(restLeft, restEnd) {
        if (restEnd != null && restLeft == 0) {
            restEnd = null
            runCatching {
                val vibrator = context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vibrator?.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 200, 100, 200), -1))
                } else {
                    @Suppress("DEPRECATION")
                    vibrator?.vibrate(longArrayOf(0, 200, 100, 200), -1)
                }
            }
            if (state.settings.timer_flash == true) {
                flash = true
                delay(600)
                flash = false
            }
        }
    }

    // Keep screen awake
    val finished = draft?.finished_at != null
    DisposableEffect(activity, finished, state.settings.keep_awake) {
        if (state.settings.keep_awake != false && !finished) {
            activity?.window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
        onDispose {
            activity?.window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }

    val libById = remember(lib) { lib.associateBy { it.id } }
    fun meta(id: String, name: String?): Exercises.LibExercise? {
        return libById[id]
            ?: state.customExercises.firstOrNull { it.id == id }?.let {
                Exercises.LibExercise(
                    id = it.id, name = it.name, muscle = it.muscle, secondary = it.secondary,
                    body_part = it.body_part, equipment = it.equipment, kind = it.kind, custom = it.custom,
                    favorite = it.favorite, rest_sec = it.rest_sec, bar_kg = it.bar_kg
                )
            }
            ?: (if (!name.isNullOrBlank() && lib.isNotEmpty()) Exercises.matchExercise(lib, name) else null)
    }

    if (!freestyle && (plan == null || day == null)) {
        Screen(title = "Workout", back = { nav.popBackStack() }) {
            Notice("That workout day no longer exists.", Tone.Error)
        }
        return
    }

    // AI coach mode: before building a NEW session, let the coach plan today's weights (bounded by the user's
    // settings). Only when the coach passed its reliability check; any failure falls back to FORGE's rules.
    val coachP = state.settings.coach ?: CoachPrefs()
    val useCoach = !freestyle && draft == null && existing == null && coachP.mode == "ai" && app.forge.fitness.logic.Coach.trusted(coachP) && !state.localMode
    var coachDone by remember(day?.id) { mutableStateOf(!useCoach) }
    if (!coachDone) {
        LaunchedEffect(day?.id) {
            s.aiSessionTargets = try {
                kotlinx.coroutines.withTimeout(25_000) {
                    val ins = day!!.exercises.map { ex ->
                        val m = meta(ex.exercise_id, ex.name)
                        val inc = if (Regex("dumbbell|kettlebell").containsMatchIn((m?.equipment ?: ex.name ?: "").lowercase())) coachP.dumbbell_increment_kg else coachP.barbell_increment_kg
                        val lastTop = Training.exerciseHistory(state.sessions, ex.exercise_id, date).firstOrNull()?.second?.sets
                            ?.filter { it.warmup != true && it.done }?.maxOfOrNull { it.weight_kg ?: 0.0 }
                        app.forge.fitness.logic.Coach.ExerciseIn(ex.id, ex.name ?: nameOf(ex.exercise_id), ex.sets, ex.reps, m?.equipment,
                            app.forge.fitness.logic.Coach.historyFor(state.sessions, ex.exercise_id, date),
                            app.forge.fitness.logic.Coach.maxToday(lastTop, coachP, inc))
                    }
                    val profile = kotlinx.serialization.json.buildJsonObject {
                        state.goal?.let { put("goal", kotlinx.serialization.json.JsonPrimitive(it.mode)) }
                        state.profile?.let { put("age", kotlinx.serialization.json.JsonPrimitive(it.age)) }
                    }
                    val raw = app.forge.fitness.logic.Coach.askAi(s.api, coachP, profile, ins)
                    day.exercises.mapNotNull { ex ->
                        val pl = raw[ex.id] ?: return@mapNotNull null
                        val equip = (meta(ex.exercise_id, ex.name)?.equipment ?: ex.name ?: "").lowercase()
                        val inc = if (Regex("dumbbell|kettlebell").containsMatchIn(equip)) coachP.dumbbell_increment_kg else coachP.barbell_increment_kg
                        val lastTop = Training.exerciseHistory(state.sessions, ex.exercise_id, date).firstOrNull()?.second?.sets
                            ?.filter { it.warmup != true && it.done }?.maxOfOrNull { it.weight_kg ?: 0.0 }
                        val b = app.forge.fitness.logic.Coach.bound(pl, lastTop, coachP, inc)
                        ex.id to Training.Target(b.weightKg, b.reps, "Coach: ${b.reason}")
                    }.toMap()
                }
            } catch (e: Exception) {
                s.notify("Coach unavailable (${e.message ?: "timeout"}), so FORGE's rules set today's weights.")
                emptyMap()
            }
            coachDone = true
        }
        Screen("Workout", back = { nav.popBackStack() }) { Spinner("Your coach is planning today's weights") }
        return
    }

    val session: WorkoutSession = draft ?: remember(plan, day, date, existing) {
        val sId = uid()
        val sStarted = nowIso()
        val exercisesList: List<SessionExercise> = if (freestyle) {
            emptyList()
        } else {
            val coach = state.settings.coach ?: CoachPrefs()
            day!!.exercises.mapIndexed { idx, ex ->
                val hist = Training.exerciseHistory(state.sessions, ex.exercise_id, date)
                // Load step comes from the user's settings: dumbbells/kettlebells step smaller than barbells.
                val equip = (meta(ex.exercise_id, ex.name)?.equipment ?: ex.name ?: "").lowercase()
                val inc = if (Regex("dumbbell|kettlebell").containsMatchIn(equip)) coach.dumbbell_increment_kg else coach.barbell_increment_kg
                val aiPlanned = s.aiSessionTargets[ex.id]
                // 1) a target the user accepted from "Review my training" (used once), else 2) RPE-aware autoregulation.
                val ai = s.takeAiTarget(ex.name ?: nameOf(ex.exercise_id))
                val t = aiPlanned ?: ai?.let { Training.Target(it.first, it.second, "From your training review: ${it.third}") }
                    ?: run {
                        val rule = ex.progression ?: plan?.progression
                        val max = if (rule == "wave") Training.estimatedMax(hist, date, coach.max_window_weeks) else null
                        if (rule == "wave" && max != null && plan != null) {
                            val wave = Training.parseWave(s.wavePcts(plan.id))
                            Training.waveTarget(max, Training.waveWeek(s.waveStart(plan.id), date, wave.size), wave, inc)
                        } else Training.nextTargetRpe(history = hist, reps = ex.reps, rule = if (rule == "wave") null else rule, increment = inc, prefs = coach)
                    }
                val bar = state.settings.bar_weight_kg ?: 20.0
                // Explicit warm-up count from the plan wins; otherwise the first two lifts of the day get a ramp.
                val ramp: List<Pair<Double?, Int>> = when {
                    (ex.warmups ?: 0) > 0 -> (0 until ex.warmups!!).map { i ->
                        t?.weightKg?.let { Math.round(it * (0.4 + 0.2 * i) / inc) * inc } to maxOf(3, 8 - 2 * i) }
                    ex.warmups == null && idx < coach.warmup_lifts && t?.weightKg != null ->
                        Training.warmupRamp(t.weightKg, bar, inc, coach).map { it.first to it.second }
                    else -> emptyList()
                }
                val warmupsCount = ramp.size
                val warmSets = ramp.mapIndexed { i, (w, r) ->
                    WorkoutSet(set_no = i + 1, weight_kg = w, reps = r, done = false, warmup = true)
                }
                // A wave's heavy-single week (≥100 %) is one top single, not the plan's usual 4 sets.
                val setCount = if (t?.why?.startsWith("Wave") == true && t.reps == 1) 1 else ex.sets
                val workSets = (0 until setCount).map { i ->
                    WorkoutSet(
                        set_no = warmupsCount + i + 1,
                        weight_kg = t?.weightKg,
                        reps = t?.reps,
                        done = false
                    )
                }
                val targetText = if (t != null) {
                    "${ex.sets} × ${ex.reps}${if (t.weightKg != null) " @ ${t.weightKg} kg" else ""}"
                } else ex.target

                SessionExercise(
                    workout_exercise_id = ex.id, // the plan row's id, so the Train screen can tick it off
                    exercise_id = ex.exercise_id,
                    name = ex.name ?: nameOf(ex.exercise_id),
                    target = targetText,
                    note = t?.why,
                    superset = ex.superset,
                    rest_sec = ex.rest_sec,
                    sets = warmSets + workSets
                )
            }.also { s.aiSessionTargets = emptyMap() } // coach plan is for this one session only
        }
        WorkoutSession(
            id = sId,
            date = date,
            plan_id = if (freestyle) "freestyle" else plan!!.id,
            day_id = if (freestyle) "freestyle" else day!!.id,
            day_name = if (freestyle) "Freestyle" else day!!.name,
            started_at = sStarted,
            finished_at = null,
            exercises = exercisesList,
            backfilled = if (date < today) true else null,
            freestyle = if (freestyle) true else null,
            deload = plan?.deload
        )
    }

    val isFinished = session.finished_at != null
    val doneSets = session.exercises.sumOf { Training.workingSets(it.sets).count { it.done } }
    val totalSets = session.exercises.sumOf { it.sets.count { it.warmup != true } }

    val startMillis = try { Instant.parse(session.started_at).toEpochMilli() } catch (_: Exception) { now }
    val finishMillis = session.finished_at?.let { try { Instant.parse(it).toEpochMilli() } catch (_: Exception) { null } }
    val elapsedSec = max(0L, ((finishMillis ?: now) - startMillis) / 1000)

    fun persist(raw: WorkoutSession) {
        val next = raw.copy(exercises = raw.exercises.map(Training::settleWarmups))
        draft = next
        err = null
        try {
            s.save(Tables.sessions, next)
        } catch (_: Exception) {
            err = "Not saved yet — it stays on screen and will save when you are back online."
        }
    }

    fun patchEx(i: Int, patch: (SessionExercise) -> SessionExercise) {
        val updated = session.exercises.mapIndexed { idx, ex -> if (idx == i) patch(ex) else ex }
        persist(session.copy(exercises = updated))
    }

    fun patchSet(i: Int, j: Int, patch: (WorkoutSet) -> WorkoutSet) {
        patchEx(i) { ex ->
            ex.copy(sets = ex.sets.mapIndexed { idx, st -> if (idx == j) patch(st) else st })
        }
    }

    fun complete(i: Int, j: Int) {
        val ex = session.exercises[i]
        val st = ex.sets[j]
        val nextDone = !st.done
        var pr = false

        if (nextDone && st.warmup != true && session.backfilled != true) {
            val prev = Training.bestE1rm(state.sessions.filter { it.id != session.id }, ex.exercise_id, date)
            val mine = Training.e1rm(st.weight_kg, st.reps) ?: 0.0
            pr = prev > 0.0 && mine > prev
            if (pr) {
                toast = "New PR · ${ex.name} · est. 1RM ${mine.roundToInt()} kg"
            }
        }

        runCatching {
            val vibrator = context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator?.vibrate(VibrationEffect.createOneShot(15, VibrationEffect.DEFAULT_AMPLITUDE))
            } else {
                @Suppress("DEPRECATION")
                vibrator?.vibrate(15)
            }
        }

        // Record when and in what order each set was done (whole workout), so later reviews can see that RPE rose
        // because of short rest or earlier lifts, not lost strength. Un-ticking clears it.
        val nextSeq = (session.exercises.flatMap { it.sets }.mapNotNull { it.seq }.maxOrNull() ?: 0) + 1
        patchSet(i, j) { it.copy(done = nextDone, pr = if (nextDone) pr else false,
            seq = if (nextDone) nextSeq else null, done_at = if (nextDone) nowIso() else null) }

        if (nextDone && st.warmup != true) {
            val group = if (!ex.superset.isNullOrBlank()) {
                session.exercises.filter { it.superset == ex.superset }
            } else listOf(ex)
            val isLastInRound = group.lastOrNull() == ex
            if (isLastInRound) {
                val sec = group.mapNotNull { g ->
                    g.rest_sec ?: meta(g.exercise_id, g.name)?.rest_sec ?: state.settings.default_rest_sec ?: 120
                }.maxOrNull() ?: 120
                restTotal = sec
                restEnd = System.currentTimeMillis() + sec * 1000L
            }
        }
    }

    fun addExercise(x: Exercises.LibExercise) {
        val hist = Training.exerciseHistory(state.sessions, x.id, date)
        val last = hist.firstOrNull()?.second
        val sets: List<WorkoutSet> = if (last != null) {
            Training.workingSets(last.sets).mapIndexed { k, p ->
                WorkoutSet(set_no = k + 1, weight_kg = p.weight_kg, reps = p.reps, done = false)
            }
        } else {
            (0 until 3).map { k ->
                WorkoutSet(set_no = k + 1, weight_kg = null, reps = if (x.kind == "timed") null else 10, done = false)
            }
        }
        val newEx = SessionExercise(
            workout_exercise_id = uid(),
            exercise_id = x.id,
            name = x.name,
            target = if (last != null) "Same as last time" else "",
            sets = sets,
            kind = x.kind,
            muscle = x.muscle
        )
        persist(session.copy(exercises = session.exercises + newEx))
        current = session.exercises.size
    }

    val cur = session.exercises.getOrNull(current)

    fun toDisp(kg: Double?): String {
        if (kg == null) return ""
        val v = if (lb) Training.kgToLb(kg) else kg
        return if (v % 1.0 == 0.0) v.toLong().toString() else "%.1f".format(v)
    }

    fun fromDisp(sVal: String): Double? {
        val d = sVal.toDoubleOrNull() ?: return null
        return if (lb) Training.lbToKg(d) else d
    }

    Box(Modifier.fillMaxSize()) {
        if (flash) {
            Box(Modifier.fillMaxSize().background(F.accent.copy(alpha = 0.5f)))
        }

        Column(
            Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .navigationBarsPadding()
        ) {
            // Header
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                IconButton(onClick = { nav.popBackStack() }) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = F.text)
                }

                Column(Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (!isFinished) {
                            Box(Modifier.size(10.dp).clip(CircleShape).background(F.accent))
                        }
                        Text(fmtClock(elapsedSec), color = F.text, fontSize = 24.sp, fontFamily = Mono, fontWeight = FontWeight.Bold)
                        Box(
                            Modifier
                                .clip(RoundedCornerShape(999.dp))
                                .background(F.surface)
                                .border(1.dp, F.line, RoundedCornerShape(999.dp))
                                .padding(horizontal = 8.dp, vertical = 2.dp)
                        ) {
                            Text(
                                if (isFinished) "DONE" else if (session.backfilled == true) "PAST" else "LIVE",
                                color = F.mute,
                                fontFamily = Mono,
                                fontSize = 11.sp
                            )
                        }
                    }
                    Text(
                        "${session.day_name}${if (session.deload == true) " · deload" else ""}",
                        color = F.dim,
                        fontSize = 13.sp
                    )
                }

                if (!isFinished) {
                    FButton(
                        text = "Finish",
                        variant = Variant.Primary,
                        modifier = Modifier.heightIn(min = 44.dp)
                    ) {
                        persist(session.copy(finished_at = nowIso()))
                        nav.popBackStack()
                    }
                } else {
                    Chip(text = "Reopen", selected = false) {
                        persist(session.copy(finished_at = null))
                    }
                }
            }

            // Exercise stepper bar
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    "Exercise ${if (session.exercises.isEmpty()) 0 else current + 1} of ${session.exercises.size}",
                    color = F.text,
                    fontFamily = Mono,
                    fontSize = 12.sp
                )
                val totalKg = Calc.sessionVolume(session)
                val dispVol = if (lb) Training.kgToLb(totalKg) else totalKg
                Text(
                    "$doneSets/$totalSets sets · ${fmt(dispVol)} ${if (lb) "lb" else "kg"}",
                    color = F.mute,
                    fontFamily = Mono,
                    fontSize = 12.sp
                )
            }

            // Exercise indicator dashes
            if (session.exercises.isNotEmpty()) {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    session.exercises.forEachIndexed { idx, e ->
                        val isDone = e.sets.filter { it.warmup != true }.isNotEmpty() && e.sets.filter { it.warmup != true }.all { it.done }
                        val dashColor = when {
                            isDone -> F.accent
                            idx == current -> F.dim
                            else -> F.raised
                        }
                        Box(
                            Modifier
                                .weight(1f)
                                .height(6.dp)
                                .clip(RoundedCornerShape(3.dp))
                                .background(dashColor)
                                .clickable { current = idx }
                        )
                    }
                }
            }

            err?.let {
                Box(Modifier.padding(horizontal = 16.dp, vertical = 4.dp)) {
                    Notice(it, Tone.Error)
                }
            }

            // Scrolling content
            Column(
                Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                if (session.exercises.isEmpty()) {
                    Card {
                        Column(
                            Modifier.fillMaxWidth().padding(12.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Title("Freestyle session", 20)
                            Body("Add exercises as you go — each one pre-fills from the last time you did it.", F.mute, 13)
                            FButton(text = "+ Add exercise") {
                                picker = PickerMode.Add
                            }
                        }
                    }
                }

                if (cur != null) {
                    val m = meta(cur.exercise_id, cur.name)
                    val kind = cur.kind ?: m?.kind ?: "weight_reps"
                    val prevHist = Training.exerciseHistory(state.sessions, cur.exercise_id, date)
                    val prev = prevHist.firstOrNull()?.second
                    val topW = cur.sets.filter { it.warmup != true }.mapNotNull { it.weight_kg }.maxOrNull() ?: 0.0
                    val bar = m?.bar_kg
                        ?: if (Regex("barbell|smith|ez bar|trap bar", RegexOption.IGNORE_CASE).containsMatchIn(m?.equipment ?: cur.name)) state.settings.bar_weight_kg ?: 20.0 else null
                    val plates = if (bar != null && topW > bar) Training.platesPerSide(topW, bar) else null
                    val partner = if (!cur.superset.isNullOrBlank()) {
                        session.exercises.filter { it.superset == cur.superset && it != cur }.map { it.name }
                    } else emptyList()

                    Card {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Top) {
                            Column(Modifier.weight(1f)) {
                                val metaText = listOfNotNull(
                                    m?.muscle ?: cur.muscle,
                                    m?.equipment,
                                    if (partner.isNotEmpty()) "superset with ${partner.joinToString(", ")}" else null
                                ).joinToString(" · ")
                                if (metaText.isNotBlank()) {
                                    Eyebrow(metaText)
                                    Spacer(Modifier.height(2.dp))
                                }
                                Title(cur.name, 22)
                            }
                            IconButton(onClick = { menu = current }) {
                                Icon(Icons.Filled.MoreVert, contentDescription = "Exercise options", tint = F.mute)
                            }
                        }

                        if (!cur.target.isNullOrBlank() || !cur.note.isNullOrBlank()) {
                            Box(
                                Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(F.raised)
                                    .border(1.dp, F.accent.copy(alpha = 0.4f), RoundedCornerShape(12.dp))
                                    .padding(10.dp)
                            ) {
                                Column {
                                    Eyebrow("Target", color = F.accent)
                                    if (!cur.target.isNullOrBlank()) {
                                        Text(cur.target, color = F.text, fontFamily = Mono, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                                    }
                                    if (!cur.note.isNullOrBlank()) {
                                        Body(cur.note, F.dim, 12)
                                    }
                                }
                            }
                        }

                        if (plates != null && bar != null) {
                            Box(
                                Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(F.raised)
                                    .padding(horizontal = 12.dp, vertical = 8.dp)
                            ) {
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    Text("Bar ${bar.roundToInt()} kg · ${((topW - bar) / 2.0).roundToInt()} kg / side", color = F.dim, fontFamily = Mono, fontSize = 12.sp)
                                    Text(plates.joinToString(" + ") { if (it % 1.0 == 0.0) it.toInt().toString() else it.toString() }, color = F.accent, fontFamily = Mono, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                }
                            }
                        }

                        // Table header
                        Row(
                            Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text("SET", Modifier.width(36.dp), color = F.mute, fontFamily = Mono, fontSize = 11.sp)
                            Text("PREV", Modifier.weight(1f), color = F.mute, fontFamily = Mono, fontSize = 11.sp)
                            if (kind != "timed") {
                                Text(if (kind == "cardio") "MIN" else if (lb) "LB" else "KG", Modifier.width(64.dp), textAlign = TextAlign.Center, color = F.mute, fontFamily = Mono, fontSize = 11.sp)
                            }
                            Text(if (kind == "timed") "SEC" else if (kind == "cardio") "KM" else "REPS", Modifier.width(60.dp), textAlign = TextAlign.Center, color = F.mute, fontFamily = Mono, fontSize = 11.sp)
                            if (effortScale != "off") {
                                Text(effortScale.uppercase(), Modifier.width(44.dp), textAlign = TextAlign.Center, color = F.mute, fontFamily = Mono, fontSize = 11.sp)
                            }
                            Spacer(Modifier.width(44.dp))
                        }

                        // Set rows
                        val workingSetsList = cur.sets.filter { it.warmup != true }
                        cur.sets.forEachIndexed { j, st ->
                            val workIdx = cur.sets.take(j).count { it.warmup != true }
                            val p = prev?.sets?.filter { it.warmup != true }?.getOrNull(workIdx)
                            val isActive = !st.done && cur.sets.indexOfFirst { !it.done } == j

                            val rowBg = when {
                                isActive -> F.accent.copy(alpha = 0.12f)
                                st.done -> F.raised
                                else -> Color.Transparent
                            }
                            val borderModifier = if (isActive) Modifier.border(1.dp, F.accent, RoundedCornerShape(12.dp)) else Modifier

                            Row(
                                Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(rowBg)
                                    .then(borderModifier)
                                    .padding(vertical = 4.dp, horizontal = 4.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                // Set button (toggles warmup)
                                Box(
                                    Modifier
                                        .size(34.dp)
                                        .clip(RoundedCornerShape(8.dp))
                                        .background(F.raised)
                                        .clickable(enabled = !isFinished) {
                                            patchSet(current, j) { it.copy(warmup = it.warmup != true) }
                                        },
                                    contentAlignment = Alignment.Center
                                ) {
                                    val label = when {
                                        st.warmup == true -> "W"
                                        st.pr == true -> "★"
                                        else -> "${cur.sets.take(j + 1).count { it.warmup != true }}"
                                    }
                                    val labelColor = when {
                                        st.warmup == true -> F.mute
                                        st.pr == true -> F.lime
                                        else -> F.text
                                    }
                                    Text(label, color = labelColor, fontFamily = Mono, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                                }

                                // Prev
                                val pText = if (p != null) {
                                    if (kind == "timed") "${p.duration_sec ?: 0}s"
                                    else "${toDisp(p.weight_kg).ifEmpty { "BW" }}×${p.reps ?: 0}"
                                } else "—"
                                Text(pText, Modifier.weight(1f).padding(horizontal = 6.dp), color = F.mute, fontFamily = Mono, fontSize = 12.sp, lineHeight = 15.sp)

                                // Weight input
                                if (kind != "timed") {
                                    Box(Modifier.width(64.dp)) {
                                        var text by remember(st.weight_kg, st.duration_sec) {
                                            mutableStateOf(if (kind == "cardio") (st.duration_sec?.let { "${it / 60}" } ?: "") else toDisp(st.weight_kg))
                                        }
                                        OutlinedTextField(
                                            value = text,
                                            onValueChange = {
                                                text = it
                                                if (kind == "cardio") {
                                                    patchSet(current, j) { s -> s.copy(duration_sec = (it.toIntOrNull() ?: 0) * 60) }
                                                } else {
                                                    patchSet(current, j) { s -> s.copy(weight_kg = fromDisp(it)) }
                                                }
                                            },
                                            enabled = !isFinished,
                                            placeholder = { Text(if (kind == "bodyweight_reps") "BW" else "–", color = F.mute, fontSize = 14.sp) },
                                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                                            singleLine = true,
                                            textStyle = androidx.compose.ui.text.TextStyle(color = F.text, fontSize = 14.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center),
                                            colors = OutlinedTextFieldDefaults.colors(
                                                focusedBorderColor = F.accent, unfocusedBorderColor = Color.Transparent,
                                                focusedContainerColor = F.surface, unfocusedContainerColor = F.surface
                                            ),
                                            modifier = Modifier.fillMaxWidth().height(44.dp)
                                        )
                                    }
                                }

                                Spacer(Modifier.width(4.dp))

                                // Reps / Time input
                                Box(Modifier.width(60.dp)) {
                                    var text by remember(st.reps, st.duration_sec, st.distance_km) {
                                        mutableStateOf(
                                            if (kind == "timed") (st.duration_sec?.toString() ?: "")
                                            else if (kind == "cardio") (st.distance_km?.toString() ?: "")
                                            else (st.reps?.toString() ?: "")
                                        )
                                    }
                                    OutlinedTextField(
                                        value = text,
                                        onValueChange = {
                                            text = it
                                            if (kind == "timed") {
                                                patchSet(current, j) { s -> s.copy(duration_sec = it.toIntOrNull()) }
                                            } else if (kind == "cardio") {
                                                patchSet(current, j) { s -> s.copy(distance_km = it.toDoubleOrNull()) }
                                            } else {
                                                patchSet(current, j) { s -> s.copy(reps = it.toIntOrNull()) }
                                            }
                                        },
                                        enabled = !isFinished,
                                        placeholder = { Text("–", color = F.mute, fontSize = 14.sp) },
                                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                                        singleLine = true,
                                        textStyle = androidx.compose.ui.text.TextStyle(color = F.text, fontSize = 14.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center),
                                        colors = OutlinedTextFieldDefaults.colors(
                                            focusedBorderColor = F.accent, unfocusedBorderColor = Color.Transparent,
                                            focusedContainerColor = F.surface, unfocusedContainerColor = F.surface
                                        ),
                                        modifier = Modifier.fillMaxWidth().height(44.dp)
                                    )
                                }

                                // Effort scale (RIR/RPE)
                                if (effortScale != "off") {
                                    Spacer(Modifier.width(4.dp))
                                    var effMenu by remember { mutableStateOf(false) }
                                    val effColor = effortColor(st.effort, effortScale)
                                    Box(Modifier.width(44.dp)) {
                                        Box(
                                            Modifier
                                                .fillMaxWidth()
                                                .height(44.dp)
                                                .clip(RoundedCornerShape(8.dp))
                                                .background(F.surface)
                                                .clickable(enabled = !isFinished) { effMenu = true },
                                            contentAlignment = Alignment.Center
                                        ) {
                                            Text(
                                                st.effort?.let { if (it % 1.0 == 0.0) it.toInt().toString() else it.toString() } ?: "–",
                                                color = effColor,
                                                fontFamily = Mono,
                                                fontSize = 12.sp,
                                                fontWeight = FontWeight.Bold
                                            )
                                        }
                                        val effOptions = if (effortScale == "rir") listOf(0.0, 1.0, 2.0, 3.0, 4.0, 5.0)
                                        else listOf(6.0, 6.5, 7.0, 7.5, 8.0, 8.5, 9.0, 9.5, 10.0)
                                        DropdownMenu(expanded = effMenu, onDismissRequest = { effMenu = false }) {
                                            DropdownMenuItem(text = { Text("–") }, onClick = {
                                                patchSet(current, j) { it.copy(effort = null, effort_scale = effortScale) }
                                                effMenu = false
                                            })
                                            effOptions.forEach { v ->
                                                DropdownMenuItem(
                                                    text = { Text(if (v % 1.0 == 0.0) v.toInt().toString() else v.toString()) },
                                                    onClick = {
                                                        patchSet(current, j) { it.copy(effort = v, effort_scale = effortScale) }
                                                        effMenu = false
                                                    }
                                                )
                                            }
                                        }
                                    }
                                }

                                Spacer(Modifier.width(6.dp))

                                // Complete check button
                                val btnBg = when {
                                    st.done -> if (st.warmup == true) F.raised else F.lime.copy(alpha = 0.2f)
                                    isActive -> F.accent
                                    else -> F.raised
                                }
                                val iconTint = when {
                                    st.done -> F.lime
                                    isActive -> F.accentInk
                                    else -> F.mute
                                }
                                Box(
                                    Modifier
                                        .size(40.dp)
                                        .clip(CircleShape)
                                        .background(btnBg)
                                        .clickable(enabled = !isFinished) { complete(current, j) },
                                    contentAlignment = Alignment.Center
                                ) {
                                    Icon(Icons.Filled.Check, contentDescription = if (st.done) "Undo set" else "Complete set", tint = iconTint, modifier = Modifier.size(20.dp))
                                }
                            }
                        }

                        if (!isFinished) {
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Chip(text = "+ Add set", selected = false) {
                                    val last = cur.sets.lastOrNull()
                                    val nextSet = WorkoutSet(
                                        set_no = cur.sets.size + 1,
                                        weight_kg = last?.weight_kg,
                                        reps = last?.reps,
                                        done = false
                                    )
                                    patchEx(current) { it.copy(sets = it.sets + nextSet) }
                                }
                                if (cur.sets.size > 1) {
                                    Chip(text = "− Remove set", selected = false) {
                                        // Remove the last unfinished working set first; warm-ups and done sets go last.
                                        patchEx(current) { e ->
                                            val k = e.sets.indexOfLast { !it.done && it.warmup != true }.takeIf { it >= 0 }
                                                ?: e.sets.indexOfLast { !it.done }.takeIf { it >= 0 } ?: e.sets.lastIndex
                                            e.copy(sets = e.sets.filterIndexed { i, _ -> i != k }.mapIndexed { i, st -> st.copy(set_no = i + 1) })
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // All exercises list at the bottom
                if (session.exercises.isNotEmpty()) {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Eyebrow("All exercises")
                        session.exercises.forEachIndexed { i, e ->
                            val workSets = e.sets.filter { it.warmup != true }
                            val allDone = workSets.isNotEmpty() && workSets.all { it.done }
                            Card(
                                onClick = { current = i },
                                paper = i == current
                            ) {
                                Row(
                                    Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Box(
                                        Modifier
                                            .size(44.dp)
                                            .clip(CircleShape)
                                            .background(if (allDone) F.lime.copy(alpha = 0.2f) else F.raised),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Text(
                                            if (allDone) "✓" else "#${i + 1}",
                                            color = if (allDone) F.lime else F.dim,
                                            fontFamily = Mono,
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 12.sp
                                        )
                                    }
                                    Column(Modifier.weight(1f)) {
                                        Text(e.name, color = F.text, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                                        Spacer(Modifier.height(2.dp))
                                        Text(
                                            "${workSets.count { it.done }}/${workSets.size} sets${if (!e.superset.isNullOrBlank()) " · superset" else ""}",
                                            color = F.mute,
                                            fontFamily = Mono,
                                            fontSize = 12.sp
                                        )
                                    }
                                }
                            }
                        }
                        if (!isFinished) {
                            FButton(
                                text = "+ Add exercise",
                                variant = Variant.Quiet,
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                picker = PickerMode.Add
                            }
                        }
                    }
                }

                Spacer(Modifier.height(100.dp))
            }
        }

        // Rest timer floating overlay
        if (restLeft != null) {
            Box(
                Modifier
                    .align(Alignment.BottomCenter)
                    .padding(horizontal = 16.dp, vertical = 24.dp)
            ) {
                Card(modifier = Modifier.fillMaxWidth()) {
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        RestRing(left = restLeft, total = restTotal)
                        Column(Modifier.weight(1f)) {
                            Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text(fmtRest(restLeft), color = F.text, fontSize = 24.sp, fontFamily = Mono, fontWeight = FontWeight.Bold)
                                Text("REST", color = F.mute, fontFamily = Mono, fontSize = 12.sp)
                            }
                            Text("Target ${fmtRest(restTotal)}", color = F.mute, fontFamily = Mono, fontSize = 12.sp)
                        }
                        Chip(text = "+15s", selected = false) {
                            restEnd = (restEnd ?: System.currentTimeMillis()) + 15000L
                            restTotal += 15
                        }
                        FButton(
                            text = "Skip »",
                            variant = Variant.Primary,
                            modifier = Modifier.heightIn(min = 36.dp)
                        ) {
                            restEnd = null
                        }
                    }
                }
            }
        }

        // PR Toast overlay
        AnimatedVisibility(
            visible = toast != null,
            enter = fadeIn(),
            exit = fadeOut(),
            modifier = Modifier.align(Alignment.TopCenter).padding(top = 16.dp)
        ) {
            toast?.let { msg ->
                LaunchedEffect(msg) {
                    delay(3500)
                    toast = null
                }
                Box(
                    Modifier
                        .clip(RoundedCornerShape(16.dp))
                        .background(F.lime)
                        .padding(horizontal = 16.dp, vertical = 10.dp)
                ) {
                    Text("★ $msg", color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                }
            }
        }

        // Sheet: Exercise menu
        menu?.let { idx ->
            val ex = session.exercises.getOrNull(idx)
            if (ex != null) {
                ExerciseMenuSheet(
                    open = true,
                    exercise = ex,
                    index = idx,
                    totalExercises = session.exercises.size,
                    onPatch = { patchEx(idx) { it.copy(note = it.note, rest_sec = it.rest_sec) } },
                    onUpdateNote = { n -> patchEx(idx) { it.copy(note = n.ifEmpty { null }) } },
                    onUpdateRest = { r -> patchEx(idx) { it.copy(rest_sec = r) } },
                    onSwap = {
                        picker = PickerMode.Swap(idx)
                        menu = null
                    },
                    onMove = { dir ->
                        val k = idx + dir
                        if (k in session.exercises.indices) {
                            val list = session.exercises.toMutableList()
                            val temp = list[idx]
                            list[idx] = list[k]
                            list[k] = temp
                            persist(session.copy(exercises = list))
                            current = k
                            menu = null
                        }
                    },
                    onSuperset = { dir ->
                        val k = idx + dir
                        if (k in session.exercises.indices) {
                            val other = session.exercises[k]
                            val sId = ex.superset ?: other.superset ?: uid()
                            val list = session.exercises.mapIndexed { x, e ->
                                if (x == idx || x == k) e.copy(superset = sId) else e
                            }
                            persist(session.copy(exercises = list))
                            menu = null
                        }
                    },
                    onRemoveSuperset = {
                        patchEx(idx) { it.copy(superset = null) }
                        menu = null
                    },
                    onRemove = {
                        val list = session.exercises.filterIndexed { x, _ -> x != idx }
                        persist(session.copy(exercises = list))
                        current = 0
                        menu = null
                    },
                    onClose = { menu = null }
                )
            }
        }

        // Sheet: Exercise picker
        picker?.let { pMode ->
            ExercisePickerSheet(
                open = true,
                lib = lib,
                customExercises = state.customExercises,
                onClose = { picker = null },
                onPick = { chosen ->
                    when (pMode) {
                        is PickerMode.Add -> addExercise(chosen)
                        is PickerMode.Swap -> {
                            val i = pMode.index
                            patchEx(i) {
                                it.copy(
                                    exercise_id = chosen.id,
                                    name = chosen.name,
                                    kind = chosen.kind,
                                    muscle = chosen.muscle,
                                    target = "",
                                    note = "Swapped in for ${session.exercises[i].name}"
                                )
                            }
                        }
                    }
                    picker = null
                }
            )
        }
    }
}

private sealed class PickerMode {
    object Add : PickerMode()
    data class Swap(val index: Int) : PickerMode()
}

@Composable
private fun RestRing(left: Int, total: Int) {
    val progress = if (total > 0) left.toFloat() / total.toFloat() else 0f
    val surfaceHigh = F.raised
    val accent = F.accent
    Canvas(Modifier.size(48.dp)) {
        val stroke = 5.dp.toPx()
        val diameter = size.minDimension - stroke
        drawArc(
            color = surfaceHigh,
            startAngle = 0f,
            sweepAngle = 360f,
            useCenter = false,
            topLeft = Offset(stroke / 2, stroke / 2),
            size = Size(diameter, diameter),
            style = Stroke(width = stroke)
        )
        drawArc(
            color = accent,
            startAngle = -90f,
            sweepAngle = 360f * progress.coerceIn(0f, 1f),
            useCenter = false,
            topLeft = Offset(stroke / 2, stroke / 2),
            size = Size(diameter, diameter),
            style = Stroke(width = stroke, cap = StrokeCap.Round)
        )
    }
}

private fun effortColor(v: Double?, scale: String): Color {
    if (v == null) return Color(0xFF7D746C)
    val hard = if (scale == "rir") (5.0 - v) else (v - 5.0)
    return when {
        hard >= 5.0 -> Color(0xFFFF6B6B)
        hard >= 4.0 -> Color(0xFFFF6B2C)
        hard >= 2.0 -> Color(0xFFD9971F)
        else -> Color(0xFF2F7D5B)
    }
}

@Composable
private fun ExerciseMenuSheet(
    open: Boolean,
    exercise: SessionExercise,
    index: Int,
    totalExercises: Int,
    onPatch: () -> Unit,
    onUpdateNote: (String) -> Unit,
    onUpdateRest: (Int?) -> Unit,
    onSwap: () -> Unit,
    onMove: (Int) -> Unit,
    onSuperset: (Int) -> Unit,
    onRemoveSuperset: () -> Unit,
    onRemove: () -> Unit,
    onClose: () -> Unit
) {
    var note by remember(exercise.note) { mutableStateOf(exercise.note ?: "") }
    var restSecText by remember(exercise.rest_sec) { mutableStateOf(exercise.rest_sec?.toString() ?: "") }

    Sheet(
        open = open,
        title = exercise.name,
        onClose = {
            if (note != (exercise.note ?: "")) onUpdateNote(note)
            val rVal = restSecText.toIntOrNull()?.coerceIn(0, 900)
            if (rVal != exercise.rest_sec) onUpdateRest(rVal)
            onClose()
        }
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Field(label = "Note") {
                Input(
                    value = note,
                    onChange = { if (it.length <= 300) note = it },
                    placeholder = "Exercise note"
                )
            }

            Field(label = "Rest for this exercise (seconds)") {
                Input(
                    value = restSecText,
                    onChange = { restSecText = it },
                    placeholder = "Default",
                    number = true
                )
            }

            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FButton(text = "Swap exercise", variant = Variant.Quiet, modifier = Modifier.weight(1f)) { onSwap() }
                FButton(
                    text = "Superset with next",
                    variant = Variant.Quiet,
                    enabled = index < totalExercises - 1,
                    modifier = Modifier.weight(1f)
                ) { onSuperset(1) }
            }

            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FButton(
                    text = "Move up",
                    variant = Variant.Quiet,
                    enabled = index > 0,
                    modifier = Modifier.weight(1f)
                ) { onMove(-1) }
                FButton(
                    text = "Move down",
                    variant = Variant.Quiet,
                    enabled = index < totalExercises - 1,
                    modifier = Modifier.weight(1f)
                ) { onMove(1) }
            }

            if (!exercise.superset.isNullOrBlank()) {
                FButton(
                    text = "Remove from superset",
                    variant = Variant.Ghost,
                    modifier = Modifier.fillMaxWidth()
                ) { onRemoveSuperset() }
            }

            FButton(
                text = "Remove exercise",
                variant = Variant.Danger,
                modifier = Modifier.fillMaxWidth()
            ) { onRemove() }
        }
    }
}

@Composable
private fun ExercisePickerSheet(
    open: Boolean,
    lib: List<Exercises.LibExercise>,
    customExercises: List<Exercise>,
    onClose: () -> Unit,
    onPick: (Exercises.LibExercise) -> Unit
) {
    var q by remember { mutableStateOf("") }
    var muscle by remember { mutableStateOf("") }

    val favs = remember(customExercises) { customExercises.filter { it.favorite == true }.map { it.id }.toSet() }
    val mine = remember(customExercises) {
        customExercises.map {
            Exercises.LibExercise(
                id = it.id, name = it.name, muscle = it.muscle, secondary = it.secondary,
                body_part = it.body_part, equipment = it.equipment, kind = it.kind, custom = it.custom,
                favorite = it.favorite, rest_sec = it.rest_sec, bar_kg = it.bar_kg
            )
        }
    }
    val all = remember(mine, lib) { mine + lib }
    val muscles = listOf("chest", "back", "shoulders", "upper arms", "upper legs", "lower legs", "waist", "cardio")

    val res = remember(all, q, muscle, favs) {
        Exercises.searchExercises(
            list = all,
            q = q,
            filter = Exercises.Filter(muscle = muscle.ifEmpty { null }),
            favorites = favs
        ).take(80)
    }

    Sheet(open = open, title = "Pick an exercise", onClose = onClose) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Input(value = q, onChange = { q = it }, placeholder = "Search 1,324 exercises")

            Row(
                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                muscles.forEach { m ->
                    Chip(text = m, selected = muscle == m) {
                        muscle = if (muscle == m) "" else m
                    }
                }
            }

            if (lib.isEmpty()) {
                Body("Loading library…", F.mute, 13)
            }

            Column(
                Modifier.fillMaxWidth().heightIn(max = 350.dp).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                res.forEach { x ->
                    val isFav = favs.contains(x.id)
                    Card(onClick = { onPick(x) }) {
                        Row(
                            Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(x.name, color = F.text, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                                Spacer(Modifier.height(2.dp))
                                Text("${x.muscle ?: ""} · ${x.equipment ?: ""}", color = F.mute, fontFamily = Mono, fontSize = 12.sp)
                            }
                            if (isFav) {
                                Icon(Icons.Filled.Star, contentDescription = "Favorite", tint = F.accent, modifier = Modifier.size(16.dp))
                            }
                        }
                    }
                }
            }
        }
    }
}
