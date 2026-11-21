@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
package app.forge.fitness.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import app.forge.fitness.ui.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import app.forge.fitness.data.*
import app.forge.fitness.logic.Calc
import app.forge.fitness.logic.Coach
import app.forge.fitness.logic.Training
import app.forge.fitness.ui.*
import kotlinx.coroutines.launch

/**
 * Every training number FORGE uses, editable, plus the AI coach: a reliability check must pass before the AI may set
 * weights, and its plans always stay inside these settings.
 */
@Composable
fun CoachSettingsScreen(s: Store, nav: NavController) {
    val st by s.state.collectAsStateWithLifecycle()
    val p = st.settings.coach ?: CoachPrefs()
    fun save(n: CoachPrefs) = s.save(Tables.settings, st.settings.copy(coach = n))
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    var err by remember { mutableStateOf<String?>(null) }
    val trusted = Coach.trusted(p)

    Screen("Coach", sub = "Training settings", back = { nav.popBackStack() }) {
        // ── Who coaches ───────────────────────────────────────────
        // The AI is still tested on known training situations before it may set weights, but that runs by itself
        // when the user picks "AI coach" instead of being a test the user has to operate.
        fun turnOnAi() {
            if (trusted) { save(p.copy(mode = "ai")); return }
            busy = true; err = null
            scope.launch {
                try {
                    val r = Coach.runCheck(s.api, p)
                    val ok = r.score >= Coach.PASS_MIN
                    save(p.copy(check_score = r.score, check_total = r.total, check_date = Calc.today(), check_failed = r.failed,
                        mode = if (ok) "ai" else "rules"))
                    if (!ok) err = "The AI didn't give safe enough answers today, so FORGE rules stay on. Try again later."
                } catch (e: Exception) { err = e.message ?: "Couldn't reach the AI. Try again." } finally { busy = false }
            }
        }
        Card(paper = true) {
            Eyebrow("Who sets your weights")
            Spacer(Modifier.height(10.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Chip("FORGE rules", p.mode != "ai", Modifier.weight(1f)) { save(p.copy(mode = "rules")) }
                Chip("AI coach", p.mode == "ai", Modifier.weight(1f)) {
                    if (st.localMode) err = "The AI coach needs an account and a Gemini key." else if (!busy) turnOnAi()
                }
            }
            Spacer(Modifier.height(10.dp))
            when {
                busy -> Spinner("Checking the AI gives safe answers")
                else -> Body(if (p.mode == "ai" && trusted) "The AI plans each session from your history, inside your limits below."
                     else "Weights come from your last sets and how hard they felt.", size = 13)
            }
            err?.let { Spacer(Modifier.height(8.dp)); Notice(it, Tone.Error) }
        }

        // ── Effort ────────────────────────────────────────────────
        Card {
            Eyebrow("Effort")
            Spacer(Modifier.height(10.dp))
            Text("Target RPE", color = F.text, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(8.dp))
            FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(6.0, 6.5, 7.0, 7.5, 8.0, 8.5, 9.0, 9.5, 10.0).forEach { v ->
                    Chip(if (v % 1.0 == 0.0) "${v.toInt()}" else "$v", p.target_rpe == v, Modifier.widthIn(min = 56.dp)) { save(p.copy(target_rpe = v)) }
                }
            }
            Spacer(Modifier.height(8.dp))
            val rir = 10 - p.target_rpe
            Text("RPE ${if (p.target_rpe % 1.0 == 0.0) p.target_rpe.toInt() else p.target_rpe}  ·  " +
                    if (rir <= 0.0) "all-out, no reps left" else "about ${if (rir % 1.0 == 0.0) rir.toInt() else rir} rep${if (rir == 1.0) "" else "s"} left in the tank",
                color = F.accent, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(6.dp)); RowDivider()
            SettingRow("Judge strength from the first set", "Later sets tire from fatigue and short rest") {
                Switch(p.first_set_strength, { save(p.copy(first_set_strength = it)) },
                    colors = SwitchDefaults.colors(checkedTrackColor = F.accent, checkedThumbColor = Color.White))
            }
        }

        // ── Progression ───────────────────────────────────────────
        Card {
            Eyebrow("Progression")
            Spacer(Modifier.height(4.dp))
            SettingRow("Biggest jump per session", "Applies to FORGE and the AI") {
                Stepper(p.max_jump_pct, 0.5, 0.5, 20.0, "%") { save(p.copy(max_jump_pct = it)) }
            }
            RowDivider()
            SettingRow("Barbell step", "Smallest plate change") { Stepper(p.barbell_increment_kg, 0.25, 0.25, 10.0, "kg") { save(p.copy(barbell_increment_kg = it)) } }
            RowDivider()
            SettingRow("Dumbbell step", "Gap between your dumbbells") { Stepper(p.dumbbell_increment_kg, 0.5, 0.5, 5.0, "kg") { save(p.copy(dumbbell_increment_kg = it)) } }
            RowDivider()
            SettingRow("Strength history", "Window used to estimate your max") { Stepper(p.max_window_weeks.toDouble(), 1.0, 2.0, 26.0, "wk") { save(p.copy(max_window_weeks = it.toInt())) } }
        }

        // ── Stalls ────────────────────────────────────────────────
        Card {
            Eyebrow("Stalls & deloads")
            Spacer(Modifier.height(4.dp))
            SettingRow("Deload after", "Sessions in a row below your reps") { Stepper(p.stall_sessions.toDouble(), 1.0, 2.0, 8.0, "") { save(p.copy(stall_sessions = it.toInt())) } }
            RowDivider()
            SettingRow("Deload size", "How much the weight drops") { Stepper(p.deload_pct, 1.0, 3.0, 40.0, "%") { save(p.copy(deload_pct = it)) } }
        }

        // ── Warm-ups ──────────────────────────────────────────────
        Card {
            Eyebrow("Warm-ups")
            Spacer(Modifier.height(10.dp))
            var ramp by remember(p.warmup_ramp) { mutableStateOf(p.warmup_ramp) }
            val preview = Training.warmupRamp(100.0, prefs = p.copy(warmup_ramp = ramp, warmup_min_kg = 0.0))
            Text("Ramp", color = F.text, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(8.dp))
            Input(ramp, { ramp = it; save(p.copy(warmup_ramp = it)) }, placeholder = "40x8, 60x5, 80x3")
            Spacer(Modifier.height(8.dp))
            if (preview.isEmpty()) Text("No automatic warm-ups", color = F.mute, fontSize = 12.sp)
            else Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("100 kg day:", color = F.mute, fontSize = 12.sp)
                preview.forEach { (w, r) ->
                    Box(Modifier.clip(RoundedCornerShape(10.dp)).background(F.accentSoft).padding(horizontal = 10.dp, vertical = 5.dp)) {
                        Text("${w.toInt()}×$r", color = F.accent, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
            Spacer(Modifier.height(4.dp)); RowDivider()
            SettingRow("Only above", "Skip warm-ups for light work") { Stepper(p.warmup_min_kg, 5.0, 0.0, 200.0, "kg") { save(p.copy(warmup_min_kg = it)) } }
            RowDivider()
            SettingRow("For the first", "Lifts of the day that get a ramp") { Stepper(p.warmup_lifts.toDouble(), 1.0, 0.0, 12.0, "") { save(p.copy(warmup_lifts = it.toInt())) } }
        }

        FButton("Reset to FORGE defaults", Modifier.fillMaxWidth(), Variant.Ghost) {
            save(CoachPrefs(mode = p.mode, check_score = p.check_score, check_total = p.check_total, check_date = p.check_date, check_failed = p.check_failed))
        }
    }
}
