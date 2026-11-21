package app.forge.fitness.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import app.forge.fitness.ui.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import app.forge.fitness.data.Store
import app.forge.fitness.logic.Ai
import app.forge.fitness.ui.*
import kotlinx.coroutines.launch

private data class ChatMsg(val role: String, val text: String)

private val STARTERS = listOf(
    "How much protein do I need to build muscle?",
    "High-protein vegetarian Indian breakfast ideas?",
    "My bench press has stalled for 3 weeks — what should I change?",
    "Is it okay to train on 5 hours of sleep?",
)

@Composable
fun CoachScreen(s: Store, nav: NavController) {
    val st by s.state.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    val listState = rememberLazyListState()

    var msgs by remember { mutableStateOf(listOf<ChatMsg>()) }
    var text by rememberSaveable { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var err by remember { mutableStateOf<String?>(null) }

    fun send(msgText: String) {
        val q = msgText.trim().take(1000)
        if (q.isBlank() || busy) return

        if (st.localMode || !s.api.configured) {
            err = "Coach requires an account with Gemini keys."
            return
        }

        val next = msgs + ChatMsg("user", q)
        msgs = next
        text = ""
        busy = true
        err = null

        scope.launch {
            try {
                val history = next.takeLast(10).map { mapOf("role" to it.role, "text" to it.text) }
                val reply = Ai.coachChat(s.api, history)
                msgs = next + ChatMsg("model", reply.reply)
                listState.animateScrollToItem((msgs.size - 1).coerceAtLeast(0))
            } catch (e: Exception) {
                err = e.message ?: "Coach is unavailable right now."
            } finally {
                busy = false
            }
        }
    }

    Column(
        Modifier
            .fillMaxSize()

            .statusBarsPadding()
            .navigationBarsPadding()
            .imePadding()
    ) {
        // Header
        Row(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(onClick = { nav.popBackStack() }) {
                Icon(
                    Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = "Back",
                    tint = F.text
                )
            }
            Column(Modifier.weight(1f)) {
                Eyebrow("Training & nutrition AI")
                Title("Coach", 24)
            }
            if (msgs.isNotEmpty()) {
                TextButton(onClick = { msgs = emptyList() }) {
                    Text("Clear", color = F.mute, fontSize = 12.sp)
                }
            }
        }

        // Chat list area
        LazyColumn(
            state = listState,
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
            contentPadding = PaddingValues(vertical = 12.dp)
        ) {
            if (msgs.isEmpty()) {
                item {
                    Card {
                        Title("Ask anything about training or food.", size = 18)
                        Spacer(Modifier.height(4.dp))
                        Body("Not a doctor — for pain, injury or medical conditions, see one.", color = F.mute, size = 12)
                        Spacer(Modifier.height(12.dp))
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            STARTERS.forEach { starter ->
                                Box(
                                    Modifier
                                        .fillMaxWidth()
                                        .clip(RoundedCornerShape(12.dp))
                                        .background(F.raised)
                                        .clickable { send(starter) }
                                        .padding(12.dp)
                                ) {
                                    Body(starter, color = F.text, size = 13)
                                }
                            }
                        }
                    }
                }
            }

            items(msgs) { m ->
                val isUser = m.role == "user"
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start
                ) {
                    val shape = RoundedCornerShape(18.dp)
                    Box(
                        Modifier
                            .widthIn(max = 300.dp)
                            .clip(shape)
                            .background(if (isUser) F.accent else F.surface)
                            .then(
                                if (!isUser) Modifier.border(1.dp, F.line, shape) else Modifier
                            )
                            .padding(horizontal = 14.dp, vertical = 10.dp)
                    ) {
                        Text(
                            text = m.text,
                            color = if (isUser) F.accentInk else F.text,
                            fontSize = 14.sp,
                            lineHeight = 20.sp
                        )
                    }
                }
            }

            if (busy) {
                item {
                    Text("Coach is thinking…", style = monoStyle)
                }
            }

            err?.let { errorText ->
                item {
                    Notice(errorText, Tone.Error)
                }
            }
        }

        // Input bottom bar
        Row(
            Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            OutlinedTextField(
                value = text,
                onValueChange = { text = it },
                modifier = Modifier.weight(1f),
                placeholder = { Text("Ask the coach…", color = F.mute) },
                maxLines = 4,
                shape = RoundedCornerShape(20.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = F.accent,
                    unfocusedBorderColor = F.line,
                    focusedTextColor = F.text,
                    unfocusedTextColor = F.text,
                    focusedContainerColor = F.surface,
                    unfocusedContainerColor = F.surface,
                )
            )
            val canSend = text.isNotBlank() && !busy
            IconButton(
                onClick = { send(text) },
                enabled = canSend,
                modifier = Modifier
                    .size(48.dp)
                    .clip(CircleShape)
                    .background(if (canSend) F.accent else F.raised)
            ) {
                Icon(
                    Icons.AutoMirrored.Filled.Send,
                    contentDescription = "Send",
                    tint = if (canSend) F.accentInk else F.mute
                )
            }
        }
    }
}
