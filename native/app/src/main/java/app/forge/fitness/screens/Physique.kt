package app.forge.fitness.screens

import app.forge.fitness.ui.Text

import android.graphics.BitmapFactory
import android.net.Uri
import android.util.Base64
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material3.*
import app.forge.fitness.ui.Card
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import app.forge.fitness.data.*
import app.forge.fitness.logic.*
import app.forge.fitness.ui.*
import kotlinx.coroutines.launch
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlin.math.roundToInt

private val ANGLES = listOf(
    Triple("front", "Front", true),
    Triple("side", "Side", false),
    Triple("back", "Back", false),
    Triple("relaxed", "Relaxed", false),
    Triple("flexed", "Flexed", false)
)

private enum class PhysiqueStep {
    Timeline, Upload, Goal, Analysing, Result
}

@Composable
fun PhysiqueScreen(s: Store, nav: NavController) {
    val context = LocalContext.current
    val state by s.state.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    val today = Calc.today()

    var step by remember { mutableStateOf(PhysiqueStep.Timeline) }
    var pics by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var reference by remember { mutableStateOf<String?>(null) }
    var goal by remember { mutableStateOf("strength_aesthetics") }
    var priorities by remember { mutableStateOf("") }
    var days by remember { mutableStateOf(state.goal?.training_days_per_week ?: 5) }
    var analysis by remember { mutableStateOf<PhysiqueAnalysis?>(null) }
    var aiUsed by remember { mutableStateOf(false) }
    var err by remember { mutableStateOf<String?>(null) }
    var pendingId by remember { mutableStateOf<String?>(null) }

    val previous = remember(state.checkins) { state.checkins.firstOrNull() }

    fun analyse() {
        step = PhysiqueStep.Analysing
        err = null
        scope.launch {
            val local = Physique.localRoadmap(
                goal = Templates.FOCUS_LABELS[goal] ?: goal,
                priorities = priorities,
                bodyGoal = state.goal,
                trainingDays = days
            )
            var result = local
            var usedAI = false

            if (s.api.configured && !state.localMode && pics.isNotEmpty()) {
                try {
                    val photosList = pics.map { (angle, dataUrl) ->
                        val (mime, b64) = Photos.splitDataUrl(dataUrl)
                        Ai.PhysiquePhoto(angle = angle, mimeType = mime, data = b64)
                    }
                    val refPhoto = reference?.let {
                        val (mime, b64) = Photos.splitDataUrl(it)
                        Ai.PhysiquePhoto(angle = "reference", mimeType = mime, data = b64)
                    }
                    val ctxJson = buildJsonObject {
                        put("training_days_per_week", days)
                        state.goal?.let { put("goal_mode", it.mode) }
                    }
                    val prevJson = previous?.analysis?.let {
                        json.encodeToJsonElement(PhysiqueAnalysis.serializer(), it)
                    }

                    val out = Ai.physiqueAnalysis(
                        api = s.api,
                        photos = photosList,
                        reference = refPhoto,
                        goal = Templates.FOCUS_LABELS[goal] ?: goal,
                        priorities = priorities,
                        context = ctxJson,
                        previous = prevJson
                    )
                    result = Physique.reconcile(out, local)
                    usedAI = true
                } catch (e: Exception) {
                    err = "Could not analyse those photos. Showing the calculated roadmap instead."
                }
            } else if (!s.api.configured || state.localMode) {
                err = "AI is not configured, so photos were not analysed. This roadmap is calculated from your goal and training frequency."
            }

            // Photos stay on this device: only keys go into the record.
            val checkinId = uid()
            val photoKeys = mutableMapOf<String, String>()
            for ((angle, dataUrl) in pics) {
                val key = "$checkinId:$angle"
                val (_, b64) = Photos.splitDataUrl(dataUrl)
                Photos.put(context, key, Base64.decode(b64, Base64.DEFAULT))
                photoKeys[angle] = key
            }

            var refKey: String? = null
            if (reference != null) {
                refKey = "$checkinId:reference"
                val (_, b64) = Photos.splitDataUrl(reference!!)
                Photos.put(context, refKey, Base64.decode(b64, Base64.DEFAULT))
            }

            val checkin = PhysiqueCheckin(
                id = checkinId,
                date = today,
                created_at = nowIso(),
                photo_keys = photoKeys,
                reference_key = refKey,
                goal = goal,
                priorities = priorities,
                analysis = result,
                weight_kg = state.weights.firstOrNull { it.date == today }?.weight_kg
            )
            s.save(Tables.checkins, checkin)

            pendingId = checkinId
            analysis = result
            aiUsed = usedAI
            step = PhysiqueStep.Result
        }
    }

    when (step) {
        PhysiqueStep.Analysing -> {
            Screen(title = "Physique Lab", sub = "Analysing", back = { step = PhysiqueStep.Goal }) {
                Spinner("Reviewing your check-in")
                Notice("Your photos are sent once to Google Gemini, using your own key, for this analysis. FORGE does not save them anywhere except this phone. With free Gemini keys, Google may use what you send to improve its products.")
            }
        }

        PhysiqueStep.Result -> {
            analysis?.let { ana ->
                ResultScreen(
                    analysis = ana,
                    aiUsed = aiUsed,
                    err = err,
                    goal = goal,
                    priorities = priorities,
                    days = days,
                    checkinId = pendingId,
                    s = s,
                    nav = nav,
                    onDone = {
                        step = PhysiqueStep.Timeline
                        pics = emptyMap()
                        reference = null
                        analysis = null
                    }
                )
            }
        }

        PhysiqueStep.Upload -> if ((state.profile?.age ?: 18) < 18) {
            Screen(title = "New check-in", back = { step = PhysiqueStep.Timeline }) {
                Notice("Physique check-ins are for people 18 and over. You can still track training, food and weight.")
            }
        } else {
            Screen(title = "New check-in", sub = "Step 1 · Photos", back = { step = PhysiqueStep.Timeline }) {
                Notice("Your photos stay on this device. They are sent to the AI only when you run an analysis, and are deleted with the check-in.")

                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    ANGLES.chunked(2).forEach { row ->
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            row.forEach { (key, label, req) ->
                                Box(Modifier.weight(1f)) {
                                    PhotoSlot(
                                        label = label,
                                        required = req,
                                        value = pics[key],
                                        onPick = { pics = pics + (key to it) },
                                        onClear = { pics = pics - key }
                                    )
                                }
                            }
                            if (row.size == 1) Spacer(Modifier.weight(1f))
                        }
                    }
                }

                Spacer(Modifier.height(8.dp))
                Eyebrow("Reference physique (optional)")
                PhotoSlot(
                    label = "Reference",
                    value = reference,
                    onPick = { reference = it },
                    onClear = { reference = null },
                    wide = true
                )
                Body(
                    "A reference is a visual target, not a guaranteed result — bone structure, insertions, and proportions differ. FORGE turns it into training goals.",
                    F.mute,
                    11
                )

                Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    FButton(
                        text = "Continue",
                        enabled = pics.containsKey("front"),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        step = PhysiqueStep.Goal
                    }
                    FButton(
                        text = "Cancel",
                        variant = Variant.Ghost,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        step = PhysiqueStep.Timeline
                    }
                }
            }
        }

        PhysiqueStep.Goal -> {
            Screen(title = "New check-in", sub = "Step 2 · Objective", back = { step = PhysiqueStep.Upload }) {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Templates.FOCUS_LABELS.entries.chunked(2).forEach { row ->
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            row.forEach { (key, label) ->
                                val isSel = goal == key
                                Card(
                                    modifier = Modifier.weight(1f),
                                    paper = isSel,
                                    onClick = { goal = key }
                                ) {
                                    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                                        Text(
                                            label,
                                            color = if (isSel) F.accent else F.text,
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 13.sp
                                        )
                                    }
                                }
                            }
                            if (row.size == 1) Spacer(Modifier.weight(1f))
                        }
                    }
                }

                Card {
                    Field(
                        label = "Specific priorities",
                        hint = "Example: bigger shoulders, wider back, larger arms, smaller waist appearance."
                    ) {
                        Input(
                            value = priorities,
                            onChange = { priorities = it },
                            placeholder = "Specific priorities"
                        )
                    }
                }

                Card {
                    Field(label = "Training days per week") {
                        Input(
                            value = "$days",
                            onChange = { it.toIntOrNull()?.let { d -> days = d.coerceIn(3, 6) } },
                            number = true
                        )
                    }
                }

                if (!s.api.configured || state.localMode) {
                    Notice("AI is not set up — you will still get a calculated roadmap and plan.", Tone.Warn)
                }

                FButton(
                    text = "Analyse check-in",
                    modifier = Modifier.fillMaxWidth()
                ) {
                    analyse()
                }
            }
        }

        PhysiqueStep.Timeline -> {
            Screen(
                title = "Physique Lab",
                sub = "AI physique coach",
                back = { nav.navigate("more") },
                right = {
                    IconButton(onClick = { step = PhysiqueStep.Upload }) {
                        Icon(Icons.Filled.Add, contentDescription = "New check-in", tint = F.text)
                    }
                }
            ) {
                Card(paper = true) {
                    Eyebrow("Physique Lab", color = F.paperDim)
                    Spacer(Modifier.height(4.dp))
                    Title("Define your road to elite performance", 22)
                    Spacer(Modifier.height(6.dp))
                    Body(
                        "Check in with photos every few weeks. FORGE tracks changes over time to update your training priorities, plan, and nutrition strategy — and you approve every change.",
                        F.paperDim,
                        13
                    )
                    Spacer(Modifier.height(12.dp))
                    FButton(text = "New check-in", modifier = Modifier.fillMaxWidth()) {
                        step = PhysiqueStep.Upload
                    }
                }

                if (state.checkins.isEmpty()) {
                    Empty(
                        title = "No check-ins yet",
                        body = "Your first check-in is the baseline for all comparisons."
                    )
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        state.checkins.forEach { checkin ->
                            CheckinCard(checkin = checkin, s = s)
                        }
                    }
                }

                Card {
                    Eyebrow("Privacy")
                    Spacer(Modifier.height(4.dp))
                    Body(
                        "Physique photos stay in this app's private storage on your device. They are never uploaded or shared. Deleting a check-in deletes its photos.",
                        F.mute,
                        12
                    )
                    Spacer(Modifier.height(12.dp))
                    FButton(
                        text = "Delete all physique data",
                        variant = Variant.Danger,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        scope.launch {
                            state.checkins.forEach { c -> s.del(Tables.checkins, c.id) }
                            Photos.clear(context)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun CheckinCard(checkin: PhysiqueCheckin, s: Store) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var open by remember { mutableStateOf(false) }
    var photosMap by remember { mutableStateOf<Map<String, ByteArray>>(emptyMap()) }

    LaunchedEffect(open) {
        if (open && photosMap.isEmpty()) {
            val loaded = mutableMapOf<String, ByteArray>()
            checkin.photo_keys.forEach { (angle, key) ->
                val bytes = Photos.get(context, key)
                if (bytes != null) loaded[angle] = bytes
            }
            photosMap = loaded
        }
    }

    Card {
        Row(
            Modifier
                .fillMaxWidth()
                .clickable { open = !open },
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(checkin.date, color = F.text, fontSize = 15.sp, fontWeight = FontWeight.ExtraBold)
                Spacer(Modifier.height(2.dp))
                val goalLabel = Templates.FOCUS_LABELS[checkin.goal] ?: checkin.goal
                val wText = if (checkin.weight_kg != null) " · ${checkin.weight_kg} kg" else ""
                Text(
                    "$goalLabel · ${checkin.photo_keys.size} photos$wText",
                    color = F.mute,
                    fontSize = 12.sp
                )
            }
            Text(if (open) "−" else "+", color = F.mute, fontSize = 18.sp, fontWeight = FontWeight.Bold)
        }

        if (open) {
            Spacer(Modifier.height(12.dp))

            if (photosMap.isNotEmpty()) {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    photosMap.forEach { (angle, bytes) ->
                        val bmp = remember(bytes) { BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap() }
                        if (bmp != null) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Image(
                                    bitmap = bmp,
                                    contentDescription = "$angle check-in",
                                    modifier = Modifier
                                        .size(width = 112.dp, height = 160.dp)
                                        .clip(RoundedCornerShape(12.dp)),
                                    contentScale = ContentScale.Crop
                                )
                                Spacer(Modifier.height(4.dp))
                                Eyebrow(angle)
                            }
                        }
                    }
                }
                Spacer(Modifier.height(12.dp))
            }

            checkin.analysis?.let { ana ->
                AnalysisBody(ana)
                Spacer(Modifier.height(12.dp))
            }

            if (checkin.priorities.isNotBlank()) {
                Eyebrow("Stated priorities")
                Spacer(Modifier.height(2.dp))
                Body(checkin.priorities, F.text, 13)
                Spacer(Modifier.height(12.dp))
            }

            FButton(
                text = "Delete this check-in",
                variant = Variant.Danger,
                modifier = Modifier.fillMaxWidth()
            ) {
                scope.launch {
                    checkin.photo_keys.values.forEach { k -> Photos.del(context, k) }
                    checkin.reference_key?.let { Photos.del(context, it) }
                    s.del(Tables.checkins, checkin.id)
                }
            }
        }
    }
}

@Composable
private fun AnalysisBody(analysis: PhysiqueAnalysis) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Column {
            Eyebrow("Body composition — estimate")
            Spacer(Modifier.height(2.dp))
            Body(analysis.composition_estimate, F.text, 13)
        }

        if (!analysis.changes_since_last.isNullOrEmpty()) {
            ListSection("Changes since last check-in", analysis.changes_since_last)
        }
        if (analysis.strengths.isNotEmpty()) {
            ListSection("Already strong", analysis.strengths)
        }
        if (analysis.priorities.isNotEmpty()) {
            ListSection("Training priorities", analysis.priorities)
        }
        if (analysis.observations.isNotEmpty()) {
            ListSection("Observations", analysis.observations)
        }

        Box(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(14.dp))
                .background(F.raised)
                .padding(12.dp)
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Eyebrow("Estimated timeline")
                Text(analysis.timeline.range, color = F.text, fontSize = 20.sp, fontWeight = FontWeight.Black)

                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    analysis.timeline.milestones.forEach { m ->
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text(m.window, color = F.text, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                            Text("— ${m.expectation}", color = F.dim, fontSize = 12.sp)
                        }
                    }
                }

                if (analysis.timeline.assumptions.isNotEmpty()) {
                    Text(
                        "Assumptions: ${analysis.timeline.assumptions.joinToString(" · ")}",
                        color = F.mute,
                        fontSize = 12.sp
                    )
                }
                Text(
                    "This is an estimate, not a guarantee. Genetics, starting condition, consistency, nutrition and recovery can change it substantially.",
                    color = F.mute,
                    fontSize = 12.sp
                )
            }
        }
    }
}

@Composable
private fun ListSection(title: String, items: List<String>) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Eyebrow(title)
        items.forEach { item ->
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("•", color = F.accent, fontSize = 13.sp)
                Text(item, color = F.text, fontSize = 13.sp)
            }
        }
    }
}

@Composable
private fun ResultScreen(
    analysis: PhysiqueAnalysis,
    aiUsed: Boolean,
    err: String?,
    goal: String,
    priorities: String,
    days: Int,
    checkinId: String?,
    s: Store,
    nav: NavController,
    onDone: () -> Unit
) {
    val state by s.state.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()

    var appliedPlan by remember { mutableStateOf(false) }
    var appliedTarget by remember { mutableStateOf(false) }

    val proposedFocus = remember(analysis.training.focus, goal) {
        Physique.coerceFocus(analysis.training.focus, goal)
    }
    val proposedDays = remember(analysis.training.days_per_week, days) {
        if (analysis.training.days_per_week in 2..7) analysis.training.days_per_week else days
    }

    var plan by remember { mutableStateOf<WorkoutPlan?>(null) }
    var planNote by remember { mutableStateOf<String?>(null) }
    var planRationale by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(proposedFocus, proposedDays, priorities, analysis.training.emphasis) {
        val r = Planner.requestPlan(
            api = s.api,
            req = Planner.PlanRequest(
                focus = proposedFocus,
                daysPerWeek = proposedDays,
                preferences = priorities.ifBlank { null },
                priorities = analysis.training.emphasis.ifEmpty { null },
                name = "${Templates.FOCUS_LABELS[proposedFocus] ?: proposedFocus} · $proposedDays days"
            ),
            localMode = state.localMode
        )
        plan = r.plan
        planNote = r.fallbackReason
        planRationale = r.rationale
    }

    val nutrition = remember(state.goal, state.profile, analysis) {
        val g = state.goal
        val p = state.profile
        if (g != null && p != null) {
            val base = Calc.calcTargets(
                Calc.TargetInput(
                    sex = p.sex,
                    age = p.age,
                    heightCm = p.height_cm,
                    weightKg = g.current_weight_kg,
                    targetWeightKg = g.target_weight_kg,
                    activity = g.activity_level,
                    avgSteps = g.avg_daily_steps,
                    mode = g.mode,
                    rateKgPerWeek = g.rate_kg_per_week
                )
            )
            val cals = (base.maintenance + analysis.nutrition.calorie_delta).roundToInt().toDouble()
            val prot = (g.current_weight_kg * analysis.nutrition.protein_g_per_kg).roundToInt().toDouble()
            val fat = ((cals * 0.25) / 9.0).roundToInt().toDouble()
            val carbs = maxOf(30.0, ((cals - prot * 4.0 - fat * 9.0) / 4.0).roundToInt().toDouble())
            NutritionValues(calories = cals, protein = prot, carbs = carbs, fat = fat, maintenance = base.maintenance)
        } else null
    }

    Screen(
        title = "Your roadmap",
        sub = if (aiUsed) "AI physique analysis" else "Calculated roadmap",
        back = onDone
    ) {
        err?.let { Notice(it, Tone.Warn) }

        Notice(
            if (aiUsed) "AI estimate from photos — review before acting on it. Not a measurement and not medical advice."
            else "Calculated from your goal, weight and training frequency."
        )

        Card {
            AnalysisBody(analysis)
        }

        Card {
            Eyebrow("Recommended training")
            Spacer(Modifier.height(4.dp))
            if (plan == null) {
                Spinner("Building your plan")
            } else {
                Text(plan!!.name, color = F.text, fontSize = 16.sp, fontWeight = FontWeight.ExtraBold)
                Spacer(Modifier.height(4.dp))
                Body(planRationale ?: analysis.training.rationale, F.mute, 12)
                planNote?.let {
                    Spacer(Modifier.height(6.dp))
                    Notice(it, Tone.Warn)
                }
                Spacer(Modifier.height(8.dp))
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    plan!!.days.forEach { d ->
                        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(F.raised).padding(8.dp)) {
                            Text(d.name, color = F.text, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                            Text("${d.exercises.size} exercises · ${d.exercises.sumOf { it.sets }} sets", color = F.mute, fontSize = 12.sp)
                        }
                    }
                }
                Spacer(Modifier.height(10.dp))
                FButton(
                    text = if (appliedPlan) "Plan activated" else "Review & activate this plan",
                    enabled = !appliedPlan,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    state.plans.filter { it.active == true }.forEach {
                        s.save(Tables.plans, it.copy(active = false))
                    }
                    s.save(Tables.plans, plan!!.copy(active = true))
                    appliedPlan = true
                }
            }
            Spacer(Modifier.height(6.dp))
            Body("Your existing workout history is kept — activating a plan never deletes past sessions.", F.mute, 11)
        }

        Card {
            Eyebrow("Nutrition strategy")
            Spacer(Modifier.height(4.dp))
            Body(analysis.nutrition.strategy, F.text, 13)
            Spacer(Modifier.height(8.dp))
            if (nutrition != null) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Stat(label = "Calories", value = fmt(nutrition.calories), sub = "maintenance ${fmt(nutrition.maintenance.toDouble())}", modifier = Modifier.weight(1f))
                    Stat(label = "Protein", value = "${nutrition.protein.roundToInt()} g", modifier = Modifier.weight(1f))
                }
                Spacer(Modifier.height(8.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Stat(label = "Carbs", value = "${nutrition.carbs.roundToInt()} g", modifier = Modifier.weight(1f))
                    Stat(label = "Fat", value = "${nutrition.fat.roundToInt()} g", modifier = Modifier.weight(1f))
                }
                Spacer(Modifier.height(10.dp))
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    val isValid = Calc.isValidTarget(nutrition.calories, nutrition.protein, nutrition.carbs, nutrition.fat)
                    FButton(
                        text = if (appliedTarget) "Target applied" else "Apply nutrition target",
                        variant = Variant.Quiet,
                        enabled = !appliedTarget && isValid,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        val row = NutritionTarget(
                            id = state.target?.id ?: uid(),
                            calories = nutrition.calories,
                            protein_g = nutrition.protein,
                            carbs_g = nutrition.carbs,
                            fat_g = nutrition.fat,
                            source = if (aiUsed) "ai" else "calculated",
                            note = analysis.nutrition.strategy,
                            updated_at = nowIso()
                        )
                        s.save(Tables.targets, row)
                        appliedTarget = true
                    }
                    FButton(
                        text = "Adjust it first",
                        variant = Variant.Ghost,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        nav.navigate("more/target")
                    }
                }
            } else {
                FButton(
                    text = "Set your goal to get targets",
                    variant = Variant.Quiet,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    nav.navigate("more/goals")
                }
            }
        }

        FButton(
            text = if (checkinId != null) "Done — check-in saved" else "Done",
            variant = Variant.Ghost,
            modifier = Modifier.fillMaxWidth()
        ) {
            onDone()
        }
    }
}

private data class NutritionValues(val calories: Double, val protein: Double, val carbs: Double, val fat: Double, val maintenance: Int)

@Composable
private fun PhotoSlot(
    label: String,
    value: String?,
    onPick: (String) -> Unit,
    onClear: () -> Unit,
    required: Boolean = false,
    wide: Boolean = false
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var err by remember { mutableStateOf<String?>(null) }

    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            try {
                err = null
                val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                if (bytes != null) {
                    val downscaled = Photos.downscale(bytes)
                    val b64 = Base64.encodeToString(downscaled, Base64.NO_WRAP)
                    val dataUrl = "data:image/jpeg;base64,$b64"
                    onPick(dataUrl)
                } else {
                    err = "Could not read that image."
                }
            } catch (_: Exception) {
                err = "Could not read that image."
            }
        }
    }

    val bmp = remember(value) {
        if (!value.isNullOrBlank()) {
            val (_, b64) = Photos.splitDataUrl(value)
            val bytes = Base64.decode(b64, Base64.DEFAULT)
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap()
        } else null
    }

    Column {
        Box(
            Modifier
                .fillMaxWidth()
                .aspectRatio(if (wide) 1.6f else 0.75f)
                .clip(RoundedCornerShape(14.dp))
                .background(F.surface)
                .border(1.dp, F.line, RoundedCornerShape(14.dp))
                .clickable {
                    launcher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                },
            contentAlignment = Alignment.Center
        ) {
            if (bmp != null) {
                Image(
                    bitmap = bmp,
                    contentDescription = "$label photo",
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Crop
                )
            } else {
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Icon(Icons.Filled.CameraAlt, contentDescription = "Camera", tint = F.mute, modifier = Modifier.size(24.dp))
                    Text(
                        "$label${if (required) " *" else ""}",
                        color = F.text,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Text("Tap to add", color = F.mute, fontSize = 11.sp)
                }
            }
        }

        if (value != null) {
            TextButton(
                onClick = onClear,
                modifier = Modifier.fillMaxWidth().height(28.dp)
            ) {
                Text("Remove", color = F.danger, fontSize = 12.sp)
            }
        }
        err?.let {
            Text(it, color = F.danger, fontSize = 12.sp)
        }
    }
}
