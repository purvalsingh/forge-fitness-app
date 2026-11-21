package app.forge.fitness.data

import android.content.Context
import android.content.Intent
import androidx.core.content.FileProvider
import app.forge.fitness.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.security.MessageDigest

/**
 * Self-update from the FORGE server, so the app never needs the website again.
 * The site publishes /download/version.json next to the APK; when its versionCode is newer than this build,
 * the app downloads the APK, checks its SHA-256 against the manifest (the user never has to), and hands it
 * to Android's installer. Android only installs it if it is signed with the same key, so a tampered file is
 * rejected by the phone itself.
 */
object Updater {
    @Serializable data class Release(val versionCode: Int, val versionName: String, val url: String,
                                     val sha256: String = "", val notes: String = "")

    private val http = OkHttpClient()

    suspend fun check(): Release? = withContext(Dispatchers.IO) {
        runCatching {
            http.newCall(Request.Builder().url(BuildConfig.SITE + "/download/version.json?t=" + System.currentTimeMillis()).build()).execute().use {
                if (!it.isSuccessful) return@runCatching null
                json.decodeFromString(Release.serializer(), it.body!!.string())
            }
        }.getOrNull()?.takeIf { it.versionCode > BuildConfig.VERSION_CODE }
    }

    /** Downloads and verifies the APK, reporting progress 0..1. Throws ApiError with a plain message on failure. */
    suspend fun download(ctx: Context, r: Release, progress: (Float) -> Unit): File = withContext(Dispatchers.IO) {
        val url = if (r.url.startsWith("http")) r.url else BuildConfig.SITE + r.url
        val out = File(ctx.cacheDir, "forge-update.apk")
        val md = MessageDigest.getInstance("SHA-256")
        try {
            http.newCall(Request.Builder().url(url).build()).execute().use { res ->
                if (!res.isSuccessful) throw ApiError("Download failed (${res.code}). Try again.")
                val body = res.body!!; val total = body.contentLength()
                var done = 0L
                body.byteStream().use { input -> out.outputStream().use { o ->
                    val buf = ByteArray(64 * 1024)
                    while (true) { val n = input.read(buf); if (n < 0) break; o.write(buf, 0, n); md.update(buf, 0, n); done += n; progress(if (total > 0) (done.toFloat() / total).coerceIn(0f, 1f) else -1f) }
                } }
            }
        } catch (e: java.io.IOException) { throw ApiError("No connection. Try again when you're online.", "offline") }
        val hex = md.digest().joinToString("") { "%02x".format(it) }
        if (r.sha256.isNotBlank() && !hex.equals(r.sha256, ignoreCase = true)) { out.delete(); throw ApiError("The download was damaged. Try again.") }
        out
    }

    /** Opens Android's installer. The first time, Android asks to allow installs from FORGE. */
    fun install(ctx: Context, apk: File) {
        val uri = FileProvider.getUriForFile(ctx, ctx.packageName + ".fileprovider", apk)
        ctx.startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}
