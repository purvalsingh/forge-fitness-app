package app.forge.fitness.screens

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Checkbox
import app.forge.fitness.ui.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import app.forge.fitness.data.*
import app.forge.fitness.logic.Ai
import app.forge.fitness.logic.Calc
import app.forge.fitness.logic.Importers
import app.forge.fitness.ui.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

private val REST_DAYS_MAP = listOf("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat")
private val DAY_START_HOURS = listOf(0, 1, 2, 3, 4, 5, 6)

private fun toFoodCsv(logs: List<FoodLog>): String {
    val sb = StringBuilder("date,meal_type_id,name,qty,unit,calories,protein_g,carbs_g,fat_g,note\n")
    logs.forEach { l ->
        sb.append("\"${l.date}\",\"${l.meal_type_id}\",\"${l.name.replace("\"", "\"\"")}\",${l.qty},\"${l.unit}\",${l.calories},${l.protein_g},${l.carbs_g},${l.fat_g},\"${(l.note ?: "").replace("\"", "\"\"")}\"\n")
    }
    return sb.toString()
}

private fun toWeightCsv(weights: List<WeightLog>): String {
    val sb = StringBuilder("date,weight_kg\n")
    weights.forEach { w ->
        sb.append("\"${w.date}\",${w.weight_kg}\n")
    }
    return sb.toString()
}

private fun toWorkoutCsv(sessions: List<WorkoutSession>): String {
    val sb = StringBuilder("date,plan_id,day_name,started_at,finished_at,exercises_count\n")
    sessions.forEach { s ->
        sb.append("\"${s.date}\",\"${s.plan_id}\",\"${s.day_name.replace("\"", "\"\"")}\",\"${s.started_at}\",\"${s.finished_at ?: ""}\",${s.exercises.size}\n")
    }
    return sb.toString()
}

private fun shareText(context: Context, text: String, title: String) {
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TITLE, title)
        putExtra(Intent.EXTRA_TEXT, text)
    }
    context.startActivity(Intent.createChooser(intent, title))
}

@Composable
fun SettingsScreen(s: Store, nav: NavController) {
    val st by s.state.collectAsStateWithLifecycle()
    val theme by s.theme.collectAsStateWithLifecycle()
    val accent by s.accent.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var msg by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var err by remember { mutableStateOf<String?>(null) }

    // Backend probe state
    var probeState by remember { mutableStateOf<Pair<String, String>?>(null) }
    var probeBusy by remember { mutableStateOf(false) }

    // SAF launchers for export
    var pendingExportData by remember { mutableStateOf<Pair<String, String>?>(null) } // mime, content
    val createDocLauncher = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri: Uri? ->
        uri?.let { dest ->
            pendingExportData?.let { (_, content) ->
                scope.launch(Dispatchers.IO) {
                    try {
                        context.contentResolver.openOutputStream(dest)?.use { it.write(content.toByteArray()) }
                        withContext(Dispatchers.Main) { msg = "Export saved." }
                    } catch (e: Exception) {
                        withContext(Dispatchers.Main) { err = "Export failed: ${e.message}" }
                    }
                }
            }
        }
    }

    // SAF launcher for Strong / Hevy CSV import
    val openDocLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
        uri?.let { src ->
            scope.launch(Dispatchers.IO) {
                try {
                    val text = context.contentResolver.openInputStream(src)?.bufferedReader()?.use { it.readText() } ?: ""
                    val imported = Importers.importWorkouts(text)
                    withContext(Dispatchers.Main) {
                        if (imported != null && imported.sessions.isNotEmpty()) {
                            imported.sessions.forEach { s.save(Tables.sessions, it) }
                            msg = "Imported ${imported.sessions.size} workouts (${imported.format})."
                        } else {
                            err = "No workouts recognized. Supported formats: Strong CSV, Hevy CSV."
                        }
                    }
                } catch (e: Exception) {
                    withContext(Dispatchers.Main) { err = "Import error: ${e.message}" }
                }
            }
        }
    }

    Screen("Settings", sub = "System", back = { nav.popBackStack() }) {
        Card {
            Eyebrow("Profile")
            Spacer(Modifier.height(8.dp))
            Field("Display name") {
                st.profile?.let { prof ->
                    Input(
                        value = prof.display_name,
                        onChange = { s.save(Tables.profiles, prof.copy(display_name = it)) },
                        placeholder = "Athlete"
                    )
                }
            }
            Spacer(Modifier.height(10.dp))
            Field(label = "Gender", hint = "Sets your calorie math and muscle map body.") {
                Row(Modifier.fillMaxWidth().heightIn(min = 44.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Chip(
                        text = "Male",
                        selected = st.profile?.sex == "male",
                        modifier = Modifier.weight(1f)
                    ) {
                        st.profile?.let { s.save(Tables.profiles, it.copy(sex = "male")) }
                    }
                    Chip(
                        text = "Female",
                        selected = st.profile?.sex == "female",
                        modifier = Modifier.weight(1f)
                    ) {
                        st.profile?.let { s.save(Tables.profiles, it.copy(sex = "female")) }
                    }
                }
            }
        }

        Card {
            Eyebrow("Language")
            Spacer(Modifier.height(10.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                I18n.LANGS.forEach { (code, name) -> Chip(name, I18n.lang == code, Modifier.weight(1f)) { s.setLang(code) } }
            }
        }

        Card {
            Eyebrow("Theme")
            Spacer(Modifier.height(8.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("dark" to "Dark", "light" to "Light", "system" to "System").forEach { (th, label) ->
                    Box(Modifier.weight(1f)) {
                        FButton(
                            text = label,
                            modifier = Modifier.fillMaxWidth(),
                            variant = if (theme == th) Variant.Primary else Variant.Ghost,
                            onClick = { s.setTheme(th) }
                        )
                    }
                }
            }
            Spacer(Modifier.height(14.dp))
            Eyebrow("Gradient theme")
            Spacer(Modifier.height(10.dp))
            app.forge.fitness.ui.PALETTES.entries.chunked(3).forEach { row ->
                Row(Modifier.fillMaxWidth().padding(bottom = 10.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    row.forEach { (name, p) ->
                        val sel = accent == name
                        Column(Modifier.weight(1f).clip(RoundedCornerShape(18.dp))
                            .border(if (sel) 2.dp else 1.dp, if (sel) Color(p.a1) else F.line, RoundedCornerShape(18.dp))
                            .clickable { s.setAccent(name) }.padding(8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                            Box(Modifier.fillMaxWidth().height(54.dp).clip(RoundedCornerShape(12.dp))
                                .background(androidx.compose.ui.graphics.Brush.linearGradient(listOf(Color(p.g1), Color(p.g2), Color(p.g3)))),
                                contentAlignment = Alignment.BottomEnd) {
                                Box(Modifier.padding(6.dp).size(18.dp).clip(CircleShape)
                                    .background(androidx.compose.ui.graphics.Brush.linearGradient(listOf(Color(p.a1), Color(p.a2)))))
                            }
                            Spacer(Modifier.height(6.dp))
                            Text(p.label, fontSize = 12.sp, fontWeight = if (sel) FontWeight.Bold else FontWeight.Medium, color = F.text, maxLines = 1)
                        }
                    }
                }
            }
        }

        Card {
            Eyebrow("Steps & adherence")
            val auto by s.autoSteps.collectAsStateWithLifecycle()
            Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("Count steps automatically", color = F.text, fontWeight = FontWeight.SemiBold)
                    Body("Uses your phone's step sensor. Keep the phone in your pocket or bag.", F.mute, 12)
                }
                androidx.compose.material3.Switch(auto, { s.setAutoSteps(it) })
            }
            Spacer(Modifier.height(8.dp))
            RowDivider()
            SettingRow("Daily step goal") {
                Stepper(st.settings.step_goal.toDouble(), 500.0, 1000.0, 50000.0) { s.save(Tables.settings, st.settings.copy(step_goal = it.toInt())) }
            }
            RowDivider()
            Spacer(Modifier.height(12.dp))
            Field(label = "Rest days", hint = "A rest day never counts as a missed workout.") {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    REST_DAYS_MAP.forEachIndexed { i, d ->
                        val on = st.settings.rest_days.contains(i)
                        val shape = RoundedCornerShape(12.dp)
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .heightIn(min = 38.dp)
                                .clip(shape)
                                .background(if (on) F.accent else Color.Transparent)
                                .border(1.dp, if (on) Color.Transparent else F.line, shape)
                                .clickable {
                                    val next = if (on) st.settings.rest_days.filter { it != i } else st.settings.rest_days + i
                                    s.save(Tables.settings, st.settings.copy(rest_days = next))
                                },
                            contentAlignment = Alignment.Center
                        ) {
                            Text(d, color = if (on) F.accentInk else F.text, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
            Spacer(Modifier.height(10.dp))
            RowDivider()
            SettingRow("Diet margin", "How close to your calorie and protein targets still counts as a full day") {
                Stepper(Math.round(st.settings.diet_tolerance * 100).toDouble(), 1.0, 1.0, 50.0, "%") { s.save(Tables.settings, st.settings.copy(diet_tolerance = it / 100.0)) }
            }
        }

        Card {
            Eyebrow("Day & training")
            Spacer(Modifier.height(12.dp))
            Text("My day ends at", color = F.text, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(10.dp))
            // 4 + 3 grid so "12 AM" always fits on one line.
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                DAY_START_HOURS.chunked(4).forEach { row ->
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        row.forEach { h ->
                            Chip(if (h == 0) "12 AM" else "$h AM", (st.settings.day_start_hour ?: 4) == h, Modifier.weight(1f)) {
                                s.save(Tables.settings, st.settings.copy(day_start_hour = h)); Calc.dayStartHour = h
                            }
                        }
                        repeat(4 - row.size) { Spacer(Modifier.weight(1f)) }
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
            Body("Food and workouts logged before this time count for the day before.", F.mute, 12)
            Spacer(Modifier.height(12.dp)); RowDivider()
            fun save(x: Settings) = s.save(Tables.settings, x)
            SettingRow("Units") {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Chip("kg", st.settings.units != "lb", Modifier.width(64.dp)) { save(st.settings.copy(units = "kg")) }
                    Chip("lb", st.settings.units == "lb", Modifier.width(64.dp)) { save(st.settings.copy(units = "lb")) }
                }
            }
            RowDivider()
            SettingRow("Week starts on") {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Chip("Mon", (st.settings.week_start ?: 1) == 1, Modifier.width(64.dp)) { save(st.settings.copy(week_start = 1)) }
                    Chip("Sun", (st.settings.week_start ?: 1) == 0, Modifier.width(64.dp)) { save(st.settings.copy(week_start = 0)) }
                }
            }
            RowDivider()
            SettingRow("Rest timer", "Default rest between sets") {
                Stepper((st.settings.default_rest_sec ?: 120).toDouble(), 15.0, 0.0, 900.0, "s") { save(st.settings.copy(default_rest_sec = it.toInt())) }
            }
            RowDivider()
            SettingRow("Barbell weight", "Used for plate maths") {
                Stepper(st.settings.bar_weight_kg ?: 20.0, 2.5, 0.0, 50.0, "kg") { save(st.settings.copy(bar_weight_kg = it)) }
            }
            RowDivider()
            SettingRow("Water goal", "Per day") {
                Stepper((st.settings.water_goal_ml ?: 2500).toDouble(), 250.0, 0.0, 10000.0, "ml") { save(st.settings.copy(water_goal_ml = it.toInt())) }
            }
            RowDivider()
            SettingRow("Fasting window", "Set 0 to turn fasting off") {
                Stepper((st.settings.fasting_hours ?: 16).toDouble(), 1.0, 0.0, 72.0, "h") { save(st.settings.copy(fasting_hours = it.toInt())) }
            }
            RowDivider()
            Spacer(Modifier.height(12.dp))
            Text("Effort scale", color = F.text, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(4.dp))
            Body("How you rate how hard a set felt", F.mute, 12)
            Spacer(Modifier.height(10.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("off" to "Off", "rir" to "RIR", "rpe" to "RPE").forEach { (sc, l) ->
                    Chip(l, ((st.settings.effort_scale ?: "rpe").let { if (it == "off" && !s.rpeChosen) "rpe" else it }) == sc, Modifier.weight(1f)) {
                        s.markRpeChosen(); save(st.settings.copy(effort_scale = sc))
                    }
                }
            }
            Spacer(Modifier.height(12.dp)); RowDivider()
            SettingRow("Keep screen on", "During workouts") {
                androidx.compose.material3.Switch(st.settings.keep_awake != false, { save(st.settings.copy(keep_awake = it)) })
            }
            RowDivider()
            SettingRow("Flash when rest ends", "Useful in loud gyms") {
                androidx.compose.material3.Switch(st.settings.timer_flash == true, { save(st.settings.copy(timer_flash = it)) })
            }
        }

        Card {
            Eyebrow("Meal configuration")
            Spacer(Modifier.height(8.dp))
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                st.mealTypes.forEach { m ->
                    Row(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(F.raised).padding(8.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Box(Modifier.weight(1f)) {
                            Input(value = m.name, onChange = { s.save(Tables.mealTypes, m.copy(name = it)) }, placeholder = "Meal name")
                        }
                        Box(Modifier.width(100.dp)) {
                            Input(value = m.time, onChange = { s.save(Tables.mealTypes, m.copy(time = it)) }, placeholder = "12:00")
                        }
                    }
                }
            }
            Spacer(Modifier.height(10.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Box(Modifier.weight(1f)) {
                    FButton("+ Add meal", Modifier.fillMaxWidth(), Variant.Ghost) {
                        s.save(Tables.mealTypes, MealType(id = uid(), name = "New meal", time = "16:00", position = st.mealTypes.size))
                    }
                }
                if (st.mealTypes.size > 1) {
                    Box(Modifier.weight(1f)) {
                        FButton("Remove last", Modifier.fillMaxWidth(), Variant.Danger) {
                            s.del(Tables.mealTypes, st.mealTypes.last().id)
                        }
                    }
                }
            }
        }

        Card {
            Eyebrow("AI assistant")
            Spacer(Modifier.height(8.dp))
            FButton("Manage my Gemini keys", Modifier.fillMaxWidth(), Variant.Ghost) { nav.navigate("more/keys") }
            Spacer(Modifier.height(8.dp))
            val aiOk = s.api.configured && !st.localMode
            if (!aiOk) {
                Notice("AI needs an account — sign in to use your own Gemini keys.", Tone.Warn)
            } else if (busy) {
                Spinner("Generating insights")
            } else {
                FButton("Generate insights", Modifier.fillMaxWidth(), Variant.Quiet) {
                    busy = true
                    err = null
                    scope.launch {
                        try {
                            val daysArr = buildJsonArray {
                                Calc.daysBack(28).forEach { d ->
                                    val fLogs = st.foodLogs.filter { it.date == d }
                                    val tot = Calc.sumTotals(fLogs)
                                    val adh = Calc.adherenceFor(st, d)
                                    add(buildJsonObject {
                                        put("date", d)
                                        put("calories", Calc.jsRound(tot.calories))
                                        put("protein", Calc.jsRound(tot.protein_g))
                                        st.steps.find { it.date == d }?.let { put("steps", it.steps) }
                                        st.weights.find { it.date == d }?.let { put("weight", it.weight_kg) }
                                        put("score", adh.score)
                                    })
                                }
                            }
                            val payload = buildJsonObject {
                                st.target?.let {
                                    put("target", buildJsonObject {
                                        put("calories", it.calories)
                                        put("protein_g", it.protein_g)
                                        put("carbs_g", it.carbs_g)
                                        put("fat_g", it.fat_g)
                                    })
                                }
                                st.goal?.let {
                                    put("goal", buildJsonObject {
                                        put("mode", it.mode)
                                        put("current_weight_kg", it.current_weight_kg)
                                        put("target_weight_kg", it.target_weight_kg)
                                    })
                                }
                                put("days", daysArr)
                            }
                            val out = Ai.insights(s.api, payload)
                            out.forEach { i ->
                                s.save(Tables.insights, AIInsight(id = uid(), created_at = nowIso(), kind = i.kind, text = i.text))
                            }
                            msg = "Insights updated."
                        } catch (e: Exception) {
                            err = e.message ?: "Could not generate insights right now."
                        } finally {
                            busy = false
                        }
                    }
                }
            }
            err?.let {
                Spacer(Modifier.height(8.dp))
                Notice(it, Tone.Error)
            }
            if (st.insights.isNotEmpty()) {
                Spacer(Modifier.height(10.dp))
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    st.insights.take(6).forEach { i ->
                        Column(
                            Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp))
                                .background(F.raised).padding(12.dp)
                        ) {
                            Eyebrow("AI insight" + if (i.kind == "adjustment") " · review target adjustment" else "")
                            Spacer(Modifier.height(4.dp))
                            Body(i.text, size = 13)
                            Spacer(Modifier.height(8.dp))
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                if (i.kind == "adjustment") {
                                    Box(Modifier.weight(1f)) {
                                        FButton("Review target", Modifier.fillMaxWidth(), Variant.Quiet) { nav.navigate("more/target") }
                                    }
                                }
                                Box(Modifier.weight(1f)) {
                                    FButton("Dismiss", Modifier.fillMaxWidth(), Variant.Ghost) { s.del(Tables.insights, i.id) }
                                }
                            }
                        }
                    }
                }
            }
        }

        Card {
            Eyebrow("Data, backup & import")
            Spacer(Modifier.height(8.dp))
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                FButton("Export everything (JSON)", Modifier.fillMaxWidth(), Variant.Quiet) {
                    val content = s.exportJson()
                    pendingExportData = "application/json" to content
                    createDocLauncher.launch("forge-export-${Calc.today()}.json")
                }
                FButton("Share JSON (Share Sheet)", Modifier.fillMaxWidth(), Variant.Ghost) {
                    shareText(context, s.exportJson(), "FORGE Full Backup")
                }
                FButton("Export food logs (CSV)", Modifier.fillMaxWidth(), Variant.Ghost) {
                    val csv = toFoodCsv(st.foodLogs)
                    pendingExportData = "text/csv" to csv
                    createDocLauncher.launch("forge-food-logs.csv")
                }
                FButton("Export weight history (CSV)", Modifier.fillMaxWidth(), Variant.Ghost) {
                    val csv = toWeightCsv(st.weights)
                    pendingExportData = "text/csv" to csv
                    createDocLauncher.launch("forge-weight-history.csv")
                }
                FButton("Export workout history (CSV)", Modifier.fillMaxWidth(), Variant.Ghost) {
                    val csv = toWorkoutCsv(st.sessions)
                    pendingExportData = "text/csv" to csv
                    createDocLauncher.launch("forge-workout-history.csv")
                }
                FButton("Import workouts (Strong / Hevy CSV)", Modifier.fillMaxWidth(), Variant.Ghost) {
                    openDocLauncher.launch(arrayOf("text/*", "application/octet-stream"))
                }
            }
        }

        Card {
            Eyebrow("App updates")
            var checking by remember { mutableStateOf(false) }
            var found by remember { mutableStateOf<app.forge.fitness.data.Updater.Release?>(null) }
            var none by remember { mutableStateOf(false) }
            val scope = rememberCoroutineScope()
            Body("You're on FORGE ${app.forge.fitness.BuildConfig.VERSION_NAME}. Updates download straight from FORGE, no website needed.", size = 13)
            Spacer(Modifier.height(10.dp))
            found?.let { app.forge.fitness.ui.UpdateBanner(it) { found = null } }
            if (none) Notice("You have the latest version.")
            if (found == null) FButton(if (checking) "Checking…" else "Check for updates", Modifier.fillMaxWidth(), Variant.Quiet, enabled = !checking) {
                checking = true; none = false
                scope.launch { found = app.forge.fitness.data.Updater.check(); none = found == null; checking = false }
            }
        }

        Card {
            Eyebrow("Connection")
            Spacer(Modifier.height(6.dp))
            Body(
                probeState?.first ?: "FORGE tries the server first and moves to local backup if offline.",
                color = F.dim,
                size = 12
            )
            probeState?.second?.let {
                Spacer(Modifier.height(4.dp))
                Eyebrow("Checked $it")
            }
            Spacer(Modifier.height(8.dp))
            FButton(
                text = if (probeBusy) "Checking…" else "Check backends",
                modifier = Modifier.fillMaxWidth(),
                variant = Variant.Quiet,
                enabled = !probeBusy,
                onClick = {
                    probeBusy = true
                    scope.launch(Dispatchers.IO) {
                        val results = mutableListOf<String>()
                        try {
                            if (!s.api.configured) {
                                results += "Data: local mode"
                                results += "AI: not configured"
                            } else {
                                results += "Data: reachable (${if (st.signedIn) "authed" else "anon"})"
                                val k = s.api.keys()
                                results += "AI: reachable (${k.count} keys)"
                            }
                        } catch (e: Exception) {
                            results += "Server: ${e.message ?: "error"}"
                        }
                        val now = java.time.LocalTime.now().toString().take(8)
                        withContext(Dispatchers.Main) {
                            probeState = results.joinToString(" · ") to now
                            probeBusy = false
                        }
                    }
                }
            )
        }

        if (s.api.configured && !st.localMode) Card {
            Eyebrow("Privacy")
            Spacer(Modifier.height(10.dp))
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f).padding(end = 12.dp)) {
                    Text("Help improve FORGE", color = F.text, fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.height(4.dp))
                    Body("Share your meals, workouts and weight with the FORGE team, without your name or email, so we can make the AI and plans better.", F.mute, 12)
                }
                androidx.compose.material3.Switch(st.settings.share_data, { s.save(Tables.settings, st.settings.copy(share_data = it)) })
            }
            Spacer(Modifier.height(10.dp))
            Body("Off by default. Other users can never see your data, whatever you choose here. Physique photos are never shared this way.", F.mute, 12)
        }

        Card {
            Eyebrow("Account")
            Spacer(Modifier.height(8.dp))
            if (s.api.configured && !st.localMode) {
                FButton("Sign out", Modifier.fillMaxWidth(), Variant.Quiet) {
                    s.signOut()
                }
                Spacer(Modifier.height(16.dp)); RowDivider(); Spacer(Modifier.height(16.dp))
                Text("Delete my account", color = F.text, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.height(4.dp))
                Body("Permanently deletes your account and all your data: meals, workouts, weight, plans and saved keys. This can't be undone.", F.mute, 12)
                Spacer(Modifier.height(10.dp))
                var armed by remember { mutableStateOf(false) }
                var delErr by remember { mutableStateOf<String?>(null) }
                val delScope = rememberCoroutineScope()
                FButton(if (armed) "Yes, delete everything" else "Delete my account", Modifier.fillMaxWidth(), if (armed) Variant.Danger else Variant.Ghost) {
                    if (!armed) armed = true
                    else delScope.launch {
                        try { s.api.deleteAccount(); s.signOut() }
                        catch (e: Exception) { delErr = "Couldn't delete your account right now. Try again later."; armed = false }
                    }
                }
                delErr?.let { Spacer(Modifier.height(8.dp)); Notice(it, Tone.Error) }
            } else {
                Notice("You're using FORGE without an account, so data stays on this phone.", Tone.Info)
                Spacer(Modifier.height(10.dp))
                FButton("Sign in or create an account", Modifier.fillMaxWidth()) { s.leaveDemo() }
            }
        }

        msg?.let { Notice(it, Tone.Info) }
    }
}
