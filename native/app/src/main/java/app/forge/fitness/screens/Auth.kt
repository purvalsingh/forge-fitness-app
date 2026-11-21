package app.forge.fitness.screens

import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.forge.fitness.data.Store
import app.forge.fitness.ui.*
import kotlinx.coroutines.launch

/** Sign in / sign up against Supabase, or continue in on-device demo mode (works with zero credentials). */
@Composable fun AuthScreen(s: Store) {
    var mode by remember { mutableStateOf("in") }
    var email by remember { mutableStateOf("") }
    var pw by remember { mutableStateOf("") }
    var name by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var err by remember { mutableStateOf<String?>(null) }
    var info by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    Screen("FORGE", sub = "Train hard. Eat Indian.") {
        Card(paper = true) {
            Tabs(mode, listOf("in" to "Sign in", "up" to "Create account")) { mode = it; err = null }
            Spacer(Modifier.height(12.dp))
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                if (mode == "up") Input(name, { name = it }, label = "Your name")
                Input(email.trim(), { email = it }, label = "Email")
                Input(pw, { pw = it }, label = "Password", password = true)
                err?.let { Notice(it, Tone.Error) }
                info?.let { Notice(it) }
                if (busy) Spinner(if (mode == "in") "Signing in" else "Creating account")
                else FButton(if (mode == "in") "Sign in" else "Create account", Modifier.fillMaxWidth(),
                    enabled = "@" in email && pw.length >= 6) {
                    busy = true; err = null
                    scope.launch {
                        try { if (mode == "in") s.signIn(email.trim(), pw) else s.signUp(email.trim(), pw, name.trim()) }
                        catch (e: Exception) { err = e.message } finally { busy = false }
                    }
                }
                if (mode == "in") FButton("Forgot password", Modifier.fillMaxWidth(), Variant.Ghost, enabled = "@" in email) {
                    scope.launch { try { s.api.resetPassword(email.trim()); info = "Reset link sent to $email." } catch (e: Exception) { err = e.message } }
                }
            }
        }
        Card {
            Eyebrow("No account?")
            Body("Try everything on this phone first. Your data stays on the device; AI features need an account.")
            Spacer(Modifier.height(8.dp))
            FButton("Continue without account", Modifier.fillMaxWidth(), Variant.Quiet) { s.useDemo() }
        }
    }
}
