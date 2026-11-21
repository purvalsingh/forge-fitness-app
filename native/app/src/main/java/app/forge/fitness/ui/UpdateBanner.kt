package app.forge.fitness.ui

import androidx.compose.foundation.layout.*
import app.forge.fitness.ui.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.forge.fitness.data.Updater
import kotlinx.coroutines.launch

/** Shown when the server has a newer FORGE. One tap downloads, verifies and opens the installer. */
@Composable fun UpdateBanner(release: Updater.Release, onDismiss: () -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var progress by remember { mutableStateOf<Float?>(null) }
    var err by remember { mutableStateOf<String?>(null) }
    // Solid (not glass): it floats over other screens, so see-through text behind it made it unreadable.
    val shape = androidx.compose.foundation.shape.RoundedCornerShape(28.dp)
    Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp).fillMaxWidth()
        .shadow(24.dp, shape).clip(shape).background(androidx.compose.material3.MaterialTheme.colorScheme.surface)
        .border(1.dp, F.accent.copy(alpha = .35f), shape).padding(18.dp)) {
        Pill("Update ready")
        Spacer(Modifier.height(10.dp))
        Title("FORGE ${release.versionName}", 22)
        Body(release.notes.ifBlank { "A newer version is ready. It keeps all your data." }, size = 13)
        err?.let { Spacer(Modifier.height(8.dp)); Notice(it, Tone.Error) }
        Spacer(Modifier.height(12.dp))
        val p = progress
        if (p != null) {
            if (p >= 0f) ProgressBar(p, height = 8.dp) else androidx.compose.material3.LinearProgressIndicator(Modifier.fillMaxWidth(), color = F.accent)
            Spacer(Modifier.height(6.dp))
            Text(if (p >= 0f) "Downloading… ${(p * 100).toInt()}%" else "Downloading…", color = F.dim, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
        } else Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            FButton("Update now", Modifier.weight(1f)) {
                err = null; progress = 0f
                scope.launch {
                    try { Updater.install(ctx, Updater.download(ctx, release) { progress = it }) }
                    catch (e: Exception) { err = e.message ?: "Update failed. Try again." }
                    finally { progress = null }
                }
            }
            FButton("Later", variant = Variant.Ghost, onClick = onDismiss)
        }
    }
}
