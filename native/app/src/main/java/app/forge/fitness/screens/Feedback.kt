package app.forge.fitness.screens

import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import app.forge.fitness.BuildConfig
import app.forge.fitness.data.Store
import app.forge.fitness.ui.*
import kotlinx.coroutines.launch

/** Ideas, problems and praise go straight to the FORGE team (the feedback table; only the sender and the owner can read it). */
@Composable
fun FeedbackScreen(s: Store, nav: NavController) {
    val st by s.state.collectAsStateWithLifecycle()
    var kind by remember { mutableStateOf("idea") }
    var text by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var sent by remember { mutableStateOf(false) }
    var err by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    Screen("Feedback", back = { nav.popBackStack() }) {
        Card {
            Eyebrow("Tell us what you think")
            Spacer(Modifier.height(4.dp))
            Body("Something broken, confusing or missing? Something you like? We read every message.", F.mute, 13)
            Spacer(Modifier.height(14.dp))
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(listOf("idea" to "Idea", "problem" to "Problem"), listOf("praise" to "I like it", "other" to "Other")).forEach { row ->
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        row.forEach { (k, l) -> Chip(l, kind == k, Modifier.weight(1f)) { kind = k; sent = false } }
                    }
                }
            }
            Spacer(Modifier.height(14.dp))
            Input(text, { text = it.take(4000); sent = false }, Modifier.fillMaxWidth().heightIn(min = 140.dp),
                placeholder = "Write your message", singleLine = false)
            Spacer(Modifier.height(14.dp))
            when {
                st.localMode -> Notice("Sign in to send feedback.", Tone.Info)
                sent -> Notice("Thanks! Your message reached the FORGE team.", Tone.Info)
                busy -> Spinner("Sending")
                else -> FButton("Send", Modifier.fillMaxWidth(), enabled = text.isNotBlank()) {
                    busy = true; err = null
                    scope.launch {
                        try { s.api.sendFeedback(kind, text.trim(), "android ${BuildConfig.VERSION_NAME}"); sent = true; text = "" }
                        catch (e: Exception) { err = e.message ?: "Couldn't send. Try again." }
                        finally { busy = false }
                    }
                }
            }
            err?.let { Spacer(Modifier.height(8.dp)); Notice(it, Tone.Error) }
        }
    }
}
