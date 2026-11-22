package app.forge.fitness.screens

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Cameraswitch
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import app.forge.fitness.ui.*
import java.io.ByteArrayOutputStream

/**
 * Full-screen camera inside FORGE (CameraX): live preview, shutter, front/back switch. The photo comes back as
 * upright JPEG bytes in memory; nothing is written to the gallery. The caller decides where (if anywhere) it is kept.
 */
@Composable
fun InAppCamera(onDismiss: () -> Unit, onCaptured: (ByteArray) -> Unit, front: Boolean = false, hint: String? = null) {
    val ctx = LocalContext.current
    val owner = LocalLifecycleOwner.current
    var granted by remember { mutableStateOf(ContextCompat.checkSelfPermission(ctx, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) }
    var denied by remember { mutableStateOf(false) }
    val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ok -> granted = ok; denied = !ok }
    LaunchedEffect(Unit) { if (!granted) ask.launch(Manifest.permission.CAMERA) }

    var useFront by remember { mutableStateOf(front) }
    var busy by remember { mutableStateOf(false) }
    var err by remember { mutableStateOf<String?>(null) }
    val capture = remember { ImageCapture.Builder().setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY).build() }
    val previewView = remember { PreviewView(ctx).apply { scaleType = PreviewView.ScaleType.FILL_CENTER } }

    if (granted) DisposableEffect(useFront) {
        val future = ProcessCameraProvider.getInstance(ctx)
        future.addListener({
            runCatching {
                val provider = future.get()
                val preview = Preview.Builder().build().also { it.surfaceProvider = previewView.surfaceProvider }
                provider.unbindAll()
                provider.bindToLifecycle(owner, if (useFront) CameraSelector.DEFAULT_FRONT_CAMERA else CameraSelector.DEFAULT_BACK_CAMERA, preview, capture)
            }.onFailure { err = "Couldn't start the camera. Use “From gallery” instead." }
        }, ContextCompat.getMainExecutor(ctx))
        onDispose { runCatching { future.get().unbindAll() } }
    }

    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
        Box(Modifier.fillMaxSize().background(Color.Black)) {
            if (granted) AndroidView({ previewView }, Modifier.fillMaxSize())
            else Column(Modifier.align(Alignment.Center).padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text(if (denied) "Camera permission is off. Allow it in Android Settings → Apps → FORGE, or use “From gallery”." else "Allow the camera to take a photo inside FORGE.",
                    color = Color.White)
                if (denied) { Spacer(Modifier.height(12.dp)); FButton("Try again", Modifier.fillMaxWidth()) { ask.launch(Manifest.permission.CAMERA) } }
            }
            // Dark band so the close button and hint stay readable over a bright scene.
            Row(Modifier.align(Alignment.TopCenter).fillMaxWidth().background(Color.Black.copy(alpha = 0.55f)).statusBarsPadding().padding(4.dp),
                verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onDismiss) { Icon(Icons.Filled.Close, contentDescription = "Close camera", tint = Color.White) }
                hint?.let { Text(it, color = Color.White) }
            }
            err?.let { Box(Modifier.align(Alignment.Center).padding(24.dp)) { Notice(it, tone = Tone.Error) } }
            Row(Modifier.align(Alignment.BottomCenter).fillMaxWidth().background(Color.Black.copy(alpha = 0.35f)).navigationBarsPadding().padding(vertical = 20.dp),
                horizontalArrangement = Arrangement.SpaceEvenly, verticalAlignment = Alignment.CenterVertically) {
                Spacer(Modifier.size(48.dp))
                Box(Modifier.size(78.dp).clip(CircleShape).background(F.accent).border(4.dp, Color.White, CircleShape)
                    .semantics { contentDescription = "Take photo" }
                    .clickable(enabled = granted && !busy) {
                        busy = true
                        capture.takePicture(ContextCompat.getMainExecutor(ctx), object : ImageCapture.OnImageCapturedCallback() {
                            override fun onCaptureSuccess(image: ImageProxy) {
                                val bytes = runCatching { upright(image, mirror = useFront) }.getOrNull()
                                image.close(); busy = false
                                if (bytes != null) onCaptured(bytes) else err = "Couldn't read that photo. Try again."
                            }
                            override fun onError(e: ImageCaptureException) { busy = false; err = "Couldn't take the photo. Try again." }
                        })
                    }, contentAlignment = Alignment.Center) {
                    if (busy) CircularProgressIndicator(color = F.accentInk, strokeWidth = 3.dp, modifier = Modifier.size(30.dp))
                }
                IconButton(onClick = { useFront = !useFront }, modifier = Modifier.size(48.dp)) {
                    Icon(Icons.Filled.Cameraswitch, contentDescription = "Switch camera", tint = Color.White)
                }
            }
        }
    }
}

/** CameraX hands back a JPEG plus a rotation: turn it into an upright JPEG (mirrored for the selfie camera). */
private fun upright(image: ImageProxy, mirror: Boolean): ByteArray {
    val buf = image.planes[0].buffer
    val raw = ByteArray(buf.remaining()).also { buf.get(it) }
    val rot = image.imageInfo.rotationDegrees
    if (rot == 0 && !mirror) return raw
    val bmp = BitmapFactory.decodeByteArray(raw, 0, raw.size)
    val m = Matrix().apply { postRotate(rot.toFloat()); if (mirror) postScale(-1f, 1f) }
    val out = Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, m, true)
    return ByteArrayOutputStream().use { out.compress(Bitmap.CompressFormat.JPEG, 90, it); it.toByteArray() }
}
