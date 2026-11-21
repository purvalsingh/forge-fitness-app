package app.forge.fitness.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import app.forge.fitness.ui.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import app.forge.fitness.data.Api
import app.forge.fitness.data.Store
import app.forge.fitness.logic.Ai
import app.forge.fitness.ui.*
import kotlinx.coroutines.launch

/** Classic "AIza…" keys and the newer "AQ.…" Google AI Studio keys. */
private val KEY_REGEX = Regex("^(AIza[0-9A-Za-z_-]{35}|AQ\\.[0-9A-Za-z_-]{30,120})$")

@Composable
fun KeysScreen(s: Store, nav: NavController) {
    val st by s.state.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()

    var keys by remember { mutableStateOf(listOf("")) }
    var status by remember { mutableStateOf<Api.KeyStatus?>(null) }
    var busy by remember { mutableStateOf(false) }
    var msg by remember { mutableStateOf<Pair<Tone, String>?>(null) }
    var showKeys by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        if (s.api.configured && !st.localMode) {
            try {
                status = Ai.keys(s.api)
            } catch (_: Exception) {
                // If API fails to reach keys, leave status null
            }
        }
    }

    val saved = status?.count ?: 0
    fun save() {
        val filled = keys.map { it.trim() }.filter { it.isNotBlank() }
        if (filled.isEmpty()) { msg = Tone.Error to "Paste a key first."; return }
        if (saved + filled.size < 1) {
            msg = Tone.Error to "Add a key first."
            return
        }
        if (saved + filled.size > 5) { msg = Tone.Error to "You can keep up to 5 keys. Remove one below first."; return }
        if (filled.any { !KEY_REGEX.matches(it) }) {
            msg = Tone.Error to "Gemini keys start with \"AIza\" or \"AQ.\" — check for missing characters."
            return
        }
        if (filled.distinct().size != filled.size) {
            msg = Tone.Error to "Each Gemini key must be different."
            return
        }

        busy = true
        msg = null
        scope.launch {
            try {
                val res = s.api.saveKeys(filled, add = true) // adds to the saved keys, never asks for them again
                status = res
                keys = listOf("")
                msg = Tone.Info to "Saved. You now have ${res.count} keys, and Google confirmed the new ones work."
            } catch (e: Exception) {
                msg = Tone.Error to (e.message ?: "Could not save keys.")
            } finally {
                busy = false
            }
        }
    }

    fun deleteKeys() {
        busy = true
        msg = null
        scope.launch {
            try {
                s.api.deleteKeys()
                status = Api.KeyStatus(0, emptyList())
                msg = Tone.Info to "Keys deleted."
            } catch (e: Exception) {
                msg = Tone.Error to (e.message ?: "Could not delete keys.")
            } finally {
                busy = false
            }
        }
    }

    Screen("AI keys", sub = "Gemini", back = { nav.popBackStack() }) {
        Card {
            Title("AI keys", size = 22)
            Spacer(Modifier.height(4.dp))
            Body(
                "FORGE's AI (food camera, meal parsing, coach, plans) runs on your free Gemini keys, so it stays free and never slows down.",
                size = 13
            )
        }

        if (st.localMode || !s.api.configured) {
            Notice("You are in demo/offline mode. Sign in to add and use Gemini keys.", Tone.Warn)
        }

        status?.let { stStatus ->
            if (stStatus.count > 0) Card {
                Eyebrow("Saved keys · ${stStatus.count} of 5")
                Spacer(Modifier.height(4.dp))
                Body(if (stStatus.count < 1) "Add a key to switch AI on." else "AI is on. New keys are added to these.", color = F.mute, size = 12)
                Spacer(Modifier.height(6.dp))
                stStatus.hints.forEach { h ->
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Text("Key ending $h", color = F.text, fontSize = 15.sp, modifier = Modifier.weight(1f))
                        IconButton(onClick = {
                            busy = true; msg = null
                            scope.launch {
                                try { status = s.api.deleteKey(h); msg = Tone.Info to "Removed the key ending $h." }
                                catch (e: Exception) { msg = Tone.Error to (e.message ?: "Could not remove that key.") }
                                finally { busy = false }
                            }
                        }, enabled = !busy) { Icon(Icons.Filled.Delete, contentDescription = "Remove key ending $h", tint = F.danger) }
                    }
                }
            }
        }

        Card {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(Modifier.weight(1f)) {
                    Eyebrow(if (saved > 0) "Add more keys" else "Add your Gemini keys")
                    Spacer(Modifier.height(2.dp))
                    Body(
                        "One key is enough; add up to 5 so FORGE can switch when one hits its limit. Free at aistudio.google.com/apikey. Saved keys stay saved; you only paste new ones here.",
                        color = F.mute,
                        size = 11
                    )
                }
                TextButton(onClick = { showKeys = !showKeys }) {
                    Text(if (showKeys) "Hide" else "Show", color = F.accent, fontSize = 12.sp)
                }
            }
            Spacer(Modifier.height(10.dp))
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                keys.forEachIndexed { i, k ->
                    Row(
                        Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        OutlinedTextField(
                            value = k,
                            onValueChange = { next ->
                                keys = keys.mapIndexed { idx, cur -> if (idx == i) next.trim() else cur }
                            },
                            modifier = Modifier.weight(1f),
                            placeholder = { Text("Key ${i + 1}: AIza… or AQ.…", color = F.mute) },
                            singleLine = true,
                            visualTransformation = if (showKeys) VisualTransformation.None else PasswordVisualTransformation(),
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                            isError = k.isNotBlank() && !KEY_REGEX.matches(k),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = F.accent,
                                unfocusedBorderColor = F.line,
                                errorBorderColor = F.danger,
                                focusedTextColor = F.text,
                                unfocusedTextColor = F.text,
                                focusedContainerColor = F.surface,
                                unfocusedContainerColor = F.surface,
                            )
                        )
                        if (keys.size > 1) {
                            IconButton(onClick = {
                                keys = keys.filterIndexed { idx, _ -> idx != i }
                            }) {
                                Icon(Icons.Filled.Delete, contentDescription = "Remove key ${i + 1}", tint = F.danger)
                            }
                        }
                    }
                }
            }

            if (saved + keys.size < 5) {
                Spacer(Modifier.height(8.dp))
                Chip("+ Add another key", selected = false) {
                    keys = keys + ""
                }
            }
        }

        msg?.let { (tone, text) ->
            Notice(text, tone)
        }

        FButton(
            text = if (busy) "Checking with Google…" else if (saved > 0) "Add these keys" else "Save keys",
            modifier = Modifier.fillMaxWidth(),
            enabled = !busy && (!st.localMode && s.api.configured),
            onClick = { save() }
        )

        status?.let { stStatus ->
            if (stStatus.count > 0) {
                FButton(
                    text = "Remove all keys",
                    modifier = Modifier.fillMaxWidth(),
                    variant = Variant.Danger,
                    enabled = !busy,
                    onClick = { deleteKeys() }
                )
            }
        }
    }
}
