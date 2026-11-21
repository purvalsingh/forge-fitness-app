package app.forge.fitness.screens

import app.forge.fitness.ui.Text

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.*
import app.forge.fitness.ui.Card
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import app.forge.fitness.data.Exercise
import app.forge.fitness.data.Store
import app.forge.fitness.data.Tables
import app.forge.fitness.data.uid
import app.forge.fitness.logic.Exercises
import app.forge.fitness.logic.Training
import app.forge.fitness.ui.*
import kotlin.math.roundToInt

private val MUSCLES = listOf("chest", "back", "shoulders", "upper arms", "lower arms", "upper legs", "lower legs", "waist", "cardio")
private val EQUIP = listOf("barbell", "dumbbell", "machine", "cable", "bodyweight", "kettlebell", "band", "ez bar", "smith machine")

private fun Exercise.toLib(): Exercises.LibExercise = Exercises.LibExercise(
    id = id, name = name, muscle = muscle, secondary = secondary, body_part = body_part,
    equipment = equipment, instructions = instructions, kind = kind, per_side = per_side,
    custom = custom, favorite = favorite, rest_sec = rest_sec, bar_kg = bar_kg
)

/** The exercise library: search, filter by body part and equipment you own, favourites, your own exercises. */
@Composable
fun ExercisesScreen(s: Store, nav: NavController) {
    val context = LocalContext.current
    val state by s.state.collectAsStateWithLifecycle()

    var lib by remember { mutableStateOf<List<Exercises.LibExercise>?>(null) }
    var q by remember { mutableStateOf("") }
    var muscle by remember { mutableStateOf("") }
    var equip by remember { mutableStateOf("") }
    var open by remember { mutableStateOf<Exercises.LibExercise?>(null) }
    var create by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        lib = try {
            Exercises.loadExercises(context)
        } catch (_: Exception) {
            emptyList()
        }
    }

    val favs = remember(state.customExercises) {
        state.customExercises.filter { it.favorite == true }.map { it.id }.toSet()
    }
    val mine = remember(state.customExercises) {
        state.customExercises.filter { it.custom == true }.map { it.toLib() }
    }
    val all = remember(mine, lib) {
        mine + (lib ?: emptyList())
    }
    val list = remember(all, q, muscle, equip, favs) {
        Exercises.searchExercises(
            list = all,
            q = q,
            filter = Exercises.Filter(
                muscle = muscle.ifEmpty { null },
                equipment = equip.ifEmpty { null }
            ),
            favorites = favs
        ).take(150)
    }

    Screen(
        title = "Exercises",
        sub = "${fmt(all.size.toDouble())} in library",
        back = { nav.popBackStack() },
        right = {
            Chip(text = "+ Mine", selected = false) { create = true }
        }
    ) {
        Input(
            value = q,
            onChange = { q = it },
            placeholder = "Search exercises"
        )

        Row(
            Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            MUSCLES.forEach { m ->
                Chip(text = m, selected = muscle == m) {
                    muscle = if (muscle == m) "" else m
                }
            }
        }

        Row(
            Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            EQUIP.forEach { e ->
                Chip(text = e, selected = equip == e) {
                    equip = if (equip == e) "" else e
                }
            }
        }

        if (lib == null) {
            Spinner("Loading library")
        }

        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            list.forEach { x ->
                val isFav = favs.contains(x.id)
                Card(onClick = { open = x }) {
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(x.name, color = F.text, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                            Spacer(Modifier.height(2.dp))
                            Text(
                                "${x.muscle ?: "other"} · ${x.equipment ?: "various"}${if (x.custom == true) " · mine" else ""}",
                                color = F.mute,
                                fontFamily = Mono,
                                fontSize = 12.sp
                            )
                        }
                        if (isFav) {
                            Icon(Icons.Filled.Star, contentDescription = "Favorite", tint = F.accent, modifier = Modifier.size(16.dp))
                        }
                    }
                }
            }
        }

        DetailSheet(
            ex = open,
            fav = open?.let { favs.contains(it.id) } ?: false,
            s = s,
            onClose = { open = null }
        )

        CreateExerciseSheet(
            open = create,
            s = s,
            onClose = { create = false }
        )
    }
}

@Composable
private fun DetailSheet(
    ex: Exercises.LibExercise?,
    fav: Boolean,
    s: Store,
    onClose: () -> Unit
) {
    val state by s.state.collectAsStateWithLifecycle()
    var hi by remember { mutableStateOf(false) }

    Sheet(open = ex != null, title = ex?.name ?: "", onClose = onClose) {
        if (ex == null) return@Sheet

        val hist = remember(state.sessions, ex.id) {
            Training.exerciseHistory(state.sessions, ex.id).take(8)
        }
        val best = remember(state.sessions, ex.id) {
            Training.bestE1rm(state.sessions, ex.id, "9999-12-31")
        }
        val steps = (if (hi && !ex.steps_hi.isNullOrEmpty()) ex.steps_hi else ex.steps) ?: emptyList()

        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(
                "${ex.muscle ?: ""}${if (!ex.secondary.isNullOrEmpty()) " + " + ex.secondary.joinToString(", ") else ""} · ${ex.equipment ?: ""}${if (ex.per_side == true) " · per side" else ""}",
                color = F.mute,
                fontFamily = Mono,
                fontSize = 12.sp
            )

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Chip(
                    text = if (fav) "Favourite" else "Add to favourites",
                    selected = fav
                ) {
                    s.save(
                        Tables.exercises,
                        ex.toExercise().copy(favorite = !fav, custom = ex.custom ?: false)
                    )
                }
                if (!ex.steps_hi.isNullOrEmpty()) {
                    Chip(text = "हिन्दी", selected = hi) {
                        hi = !hi
                    }
                }
            }

            if (best > 0.0) {
                Box(
                    Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(16.dp))
                        .background(F.raised)
                        .padding(12.dp)
                ) {
                    Column {
                        Eyebrow("Best estimated 1RM")
                        Spacer(Modifier.height(4.dp))
                        Figure("${best.roundToInt()} kg", 24)
                    }
                }
            }

            if (steps.isNotEmpty()) {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    steps.forEachIndexed { idx, st ->
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("${idx + 1}.", color = F.accent, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                            Text(st, color = F.dim, fontSize = 13.sp, modifier = Modifier.weight(1f))
                        }
                    }
                }
            }

            if (hist.isNotEmpty()) {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Eyebrow("History")
                    hist.forEach { (date, sessionEx) ->
                        val wSets = Training.workingSets(sessionEx.sets)
                        val maxE1rm = wSets.mapNotNull { Training.e1rm(it.weight_kg, it.reps) }.maxOrNull() ?: 0.0
                        Row(
                            Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(date, color = F.text, fontFamily = Mono, fontSize = 12.sp)
                            Text(
                                wSets.joinToString("  ") { ws ->
                                    val wStr = ws.weight_kg?.let { if (it % 1.0 == 0.0) it.toInt().toString() else it.toString() } ?: "BW"
                                    "${wStr}×${ws.reps ?: "-"}"
                                },
                                color = F.mute,
                                fontFamily = Mono,
                                fontSize = 12.sp
                            )
                            Text(
                                if (maxE1rm > 0.0) "${maxE1rm.roundToInt()} kg" else "",
                                color = F.text,
                                fontFamily = Mono,
                                fontSize = 12.sp
                            )
                        }
                    }
                }
            }

            if (ex.custom == true) {
                FButton(
                    text = "Delete my exercise",
                    variant = Variant.Danger,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    s.del(Tables.exercises, ex.id)
                    onClose()
                }
            }
        }
    }
}

@Composable
private fun CreateExerciseSheet(
    open: Boolean,
    s: Store,
    onClose: () -> Unit
) {
    var name by remember { mutableStateOf("") }
    var bodyPart by remember { mutableStateOf(MUSCLES[0]) }
    var equip by remember { mutableStateOf(EQUIP[1]) } // dumbbell
    var kind by remember { mutableStateOf("weight_reps") }

    val kinds = listOf(
        "weight_reps" to "Weight × reps",
        "bodyweight_reps" to "Bodyweight reps",
        "timed" to "Time (hold)",
        "cardio" to "Cardio (time + distance)"
    )

    Sheet(open = open, title = "Your own exercise", onClose = onClose) {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Field(label = "Name") {
                Input(
                    value = name,
                    onChange = { if (it.length <= 80) name = it },
                    placeholder = "Landmine press"
                )
            }

            Field(label = "Body part") {
                DropdownSelect(
                    current = bodyPart,
                    options = MUSCLES.map { it to it },
                    onSelect = { bodyPart = it }
                )
            }

            Field(label = "Equipment") {
                DropdownSelect(
                    current = equip,
                    options = EQUIP.map { it to it },
                    onSelect = { equip = it }
                )
            }

            Field(label = "Logged as") {
                DropdownSelect(
                    current = kind,
                    options = kinds,
                    onSelect = { kind = it }
                )
            }

            FButton(
                text = "Save exercise",
                enabled = name.isNotBlank(),
                modifier = Modifier.fillMaxWidth()
            ) {
                val ex = Exercise(
                    id = "my-" + uid().take(8),
                    name = name.trim(),
                    muscle = bodyPart,
                    body_part = bodyPart,
                    equipment = equip,
                    kind = kind,
                    custom = true
                )
                s.save(Tables.exercises, ex)
                name = ""
                onClose()
            }
        }
    }
}

@Composable
private fun DropdownSelect(
    current: String,
    options: List<Pair<String, String>>,
    onSelect: (String) -> Unit
) {
    var expanded by remember { mutableStateOf(false) }
    val currentLabel = options.firstOrNull { it.first == current }?.second ?: current

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
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(currentLabel, color = F.text, fontSize = 14.sp)
                Icon(Icons.Filled.ArrowDropDown, contentDescription = "Select", tint = F.mute)
            }
        }

        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
            modifier = Modifier
                .background(F.surface)
                .border(1.dp, F.line, RoundedCornerShape(8.dp))
        ) {
            options.forEach { (value, label) ->
                DropdownMenuItem(
                    text = { Text(label, color = F.text, fontSize = 14.sp) },
                    onClick = {
                        onSelect(value)
                        expanded = false
                    }
                )
            }
        }
    }
}
