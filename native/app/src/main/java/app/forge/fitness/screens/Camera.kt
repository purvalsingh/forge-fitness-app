package app.forge.fitness.screens

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.PhotoLibrary
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import app.forge.fitness.ui.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import app.forge.fitness.data.Store
import app.forge.fitness.logic.Ai
import app.forge.fitness.logic.Catalog
import app.forge.fitness.logic.Photos
import app.forge.fitness.ui.*
import kotlinx.coroutines.launch
import java.io.File
import java.util.Base64

enum class CameraStage { CAPTURE, ANALYSING, REVIEW }

@Composable
fun CameraScreen(s: Store, nav: NavController) {
    val context = LocalContext.current
    val st by s.state.collectAsStateWithLifecycle()
    val date by s.date.collectAsStateWithLifecycle()
    // Pick the meal whose time is closest to now (breakfast in the morning, dinner at night), not always lunch.
    val mealTypeId = remember(st.mealTypes) {
        val nowMin = java.time.LocalTime.now().let { it.hour * 60 + it.minute }
        st.mealTypes.minByOrNull { m -> m.time.split(":").let { (it.getOrNull(0)?.toIntOrNull() ?: 12) * 60 + (it.getOrNull(1)?.toIntOrNull() ?: 0) }.let { kotlin.math.abs(it - nowMin) } }?.id ?: ""
    }
    val scope = rememberCoroutineScope()

    var stage by remember { mutableStateOf(CameraStage.CAPTURE) }
    var previewBytes by remember { mutableStateOf<ByteArray?>(null) }
    var previewBitmap by remember { mutableStateOf<Bitmap?>(null) }
    var previewBase64 by remember { mutableStateOf<String?>(null) }
    var hint by remember { mutableStateOf("") }
    var items by remember { mutableStateOf<List<Catalog.Grounded>?>(null) }
    var rejected by remember { mutableStateOf<List<Ai.RejectedItem>>(emptyList()) }
    var err by remember { mutableStateOf<String?>(null) }

    val photoFile = remember { File(context.cacheDir, "camera_capture.jpg") }
    val photoUri = remember {
        FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", photoFile)
    }

    suspend fun processImage(rawBytes: ByteArray) {
        err = null
        try {
            val downscaled = Photos.downscale(rawBytes, maxPx = 800, quality = 75) // smaller upload, faster AI; plenty for food
            previewBytes = downscaled
            previewBitmap = BitmapFactory.decodeByteArray(downscaled, 0, downscaled.size)
            previewBase64 = Base64.getEncoder().encodeToString(downscaled)
        } catch (e: Exception) {
            err = "Could not process that image: ${e.message}"
        }
    }

    val takePictureLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.TakePicture()
    ) { success ->
        if (success && photoFile.exists()) {
            scope.launch {
                val bytes = photoFile.readBytes()
                processImage(bytes)
            }
        }
    }

    val pickImageLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri ->
        if (uri != null) {
            scope.launch {
                val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                if (bytes != null) {
                    processImage(bytes)
                }
            }
        }
    }

    fun analyse() {
        val b64 = previewBase64 ?: return
        if (st.localMode) {
            err = "AI analysis needs Gemini keys. Use Search or Barcode offline."
            return
        }
        stage = CameraStage.ANALYSING
        err = null
        scope.launch {
            try {
                val res = Ai.analyzeFoodPhoto(
                    api = s.api,
                    imageBase64 = b64,
                    mimeType = "image/jpeg",
                    hint = hint.trim().ifBlank { null }
                )
                if (res.items.isEmpty()) {
                    err = "No food recognized. Try a clear top-down photo, or search manually."
                    stage = CameraStage.CAPTURE
                    return@launch
                }
                val catalog = runCatching { Catalog.loadCatalog(context) }.getOrNull()
                val grounded = res.items.map { rawItem ->
                    val g = Catalog.Grounded(
                        name = rawItem.name,
                        qty = rawItem.qty,
                        unit = rawItem.unit,
                        grams = rawItem.grams,
                        servingLabel = rawItem.servingLabel,
                        calories = rawItem.calories,
                        proteinG = rawItem.proteinG,
                        carbsG = rawItem.carbsG,
                        fatG = rawItem.fatG,
                        confidence = rawItem.confidence,
                        matched = null
                    )
                    if (catalog != null) Catalog.groundItem(catalog, g) else g
                }
                items = grounded
                rejected = res.rejected ?: emptyList()
                stage = CameraStage.REVIEW
            } catch (e: Exception) {
                err = e.message ?: "Unable to analyse this image. You can search for the food manually."
                stage = CameraStage.CAPTURE
            }
        }
    }

    if (stage == CameraStage.REVIEW && items != null) {
        Screen(
            title = "Scan result",
            sub = "AI food camera",
            back = {
                items = null
                stage = CameraStage.CAPTURE
            }
        ) {
            if (previewBitmap != null) {
                Image(
                    bitmap = previewBitmap!!.asImageBitmap(),
                    contentDescription = "Your meal",
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(160.dp)
                        .clip(RoundedCornerShape(16.dp)),
                    contentScale = ContentScale.Crop
                )
                Spacer(Modifier.height(8.dp))
            }
            // Wrong dish or wrong amount? Tell FORGE and it looks at the same photo again with that correction.
            var fix by remember { mutableStateOf("") }
            Card {
                Eyebrow("Not quite right?")
                Spacer(Modifier.height(6.dp))
                Input(fix, { if (it.length <= 300) fix = it }, singleLine = false,
                    placeholder = "e.g. It's chilli chicken, not baby corn. About 8 pieces.")
                Spacer(Modifier.height(8.dp))
                FButton("Re-analyse with this", Modifier.fillMaxWidth(), Variant.Quiet, enabled = fix.trim().length >= 3) {
                    hint = fix.trim(); analyse()
                }
            }
            ReviewItems(
                items = items!!,
                rejected = rejected,
                date = date,
                mealTypeId = mealTypeId,
                source = "ai_photo",
                s = s,
                onCancel = {
                    items = null
                    stage = CameraStage.CAPTURE
                },
                onDone = {
                    nav.navigate("diet") {
                        popUpTo("diet") { inclusive = true }
                    }
                }
            )
        }
        return
    }

    Screen(
        title = "Scan food",
        sub = "AI food camera",
        back = { nav.popBackStack() }
    ) {
        // Frame / Viewfinder
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(4f / 5f)
                .clip(RoundedCornerShape(24.dp))
                .background(Color.Black)
                .border(1.dp, F.line, RoundedCornerShape(24.dp)),
            contentAlignment = Alignment.Center
        ) {
            if (previewBitmap != null) {
                Image(
                    bitmap = previewBitmap!!.asImageBitmap(),
                    contentDescription = "Captured meal",
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Crop
                )
            } else {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.padding(24.dp)
                ) {
                    Icon(
                        Icons.Filled.CameraAlt,
                        contentDescription = null,
                        tint = F.accent,
                        modifier = Modifier.size(48.dp)
                    )
                    Text(
                        text = "Point at your plate",
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 16.sp,
                        color = Color.White
                    )
                    Text(
                        text = "Top-down, whole plate in frame, good light.",
                        fontSize = 12.sp,
                        color = Color(0xFF9B928A)
                    )
                }
            }

            if (stage == CameraStage.ANALYSING) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Color.Black.copy(alpha = 0.6f)),
                    contentAlignment = Alignment.Center
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        CircularProgressIndicator(color = F.accent, strokeWidth = 3.dp)
                        Text(
                            text = "IDENTIFYING FOOD…",
                            fontFamily = Mono,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color.White,
                            letterSpacing = 1.sp
                        )
                    }
                }
            }
        }

        if (st.localMode) {
            Notice("AI food photo analysis requires Gemini keys. Add them in You > AI keys.", tone = Tone.Info)
        }

        if (err != null) {
            Notice(err!!, tone = Tone.Error)
        }

        if (previewBitmap == null) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                FButton(
                    text = "Photo",
                    variant = Variant.Ghost,
                    onClick = { pickImageLauncher.launch("image/*") },
                    modifier = Modifier.weight(1f)
                )

                Spacer(Modifier.width(12.dp))

                // Big shutter button
                Box(
                    modifier = Modifier
                        .size(72.dp)
                        .clip(CircleShape)
                        .background(F.accent)
                        .border(4.dp, F.text, CircleShape)
                        .clickable {
                            takePictureLauncher.launch(photoUri)
                        },
                    contentAlignment = Alignment.Center
                ) {
                    Icon(Icons.Filled.CameraAlt, contentDescription = "Take picture", tint = F.accentInk, modifier = Modifier.size(30.dp))
                }

                Spacer(Modifier.width(12.dp))

                FButton(
                    text = "Manual",
                    variant = Variant.Ghost,
                    onClick = { nav.navigate("diet") },
                    modifier = Modifier.weight(1f)
                )
            }
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Field(
                    label = "Anything the photo can't show? (optional)",
                    hint = "e.g. “made with ghee”, “2 rotis under the sabzi”, “half eaten”"
                ) {
                    Input(
                        value = hint,
                        onChange = { if (it.length <= 200) hint = it },
                        placeholder = "Cooked in ghee"
                    )
                }

                FButton(
                    text = if (stage == CameraStage.ANALYSING) "Analysing…" else "Analyse meal",
                    modifier = Modifier.fillMaxWidth(),
                    enabled = stage != CameraStage.ANALYSING && !st.localMode,
                    onClick = { analyse() }
                )

                FButton(
                    text = "Retake",
                    modifier = Modifier.fillMaxWidth(),
                    variant = Variant.Ghost,
                    onClick = {
                        previewBitmap = null
                        previewBytes = null
                        previewBase64 = null
                        hint = ""
                        err = null
                    }
                )
            }
        }
    }
}
