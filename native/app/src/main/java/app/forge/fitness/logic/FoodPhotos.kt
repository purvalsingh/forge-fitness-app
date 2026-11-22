package app.forge.fitness.logic

import android.content.ContentValues
import android.content.Context
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

/**
 * Food photos taken inside FORGE. They live in the app's private cache (not the gallery, not synced, never uploaded
 * except the one AI request), and are deleted automatically after [RETENTION_MS] unless the user turns that off.
 * "Save to gallery" copies them out on request.
 */
object FoodPhotos {
    const val RETENTION_MS = 24L * 60 * 60 * 1000
    /** Store flag: true = keep photos (auto-delete switched off). Off by default, so photos are auto-deleted. */
    const val KEEP_FLAG = "food_photos_keep"

    private fun dir(ctx: Context) = File(ctx.cacheDir, "food_photos").also { it.mkdirs() }

    fun list(ctx: Context): List<File> = dir(ctx).listFiles { f -> f.extension == "jpg" }?.sortedBy { it.lastModified() } ?: emptyList()

    suspend fun save(ctx: Context, jpeg: ByteArray): File = withContext(Dispatchers.IO) {
        File(dir(ctx), "meal_${System.currentTimeMillis()}.jpg").also { it.writeBytes(jpeg) }
    }

    /** Delete photos older than the retention window. Called on app start and whenever the camera opens. */
    suspend fun cleanup(ctx: Context, keep: Boolean, now: Long = System.currentTimeMillis()): Int = withContext(Dispatchers.IO) {
        if (keep) 0 else cleanupDir(dir(ctx), now)
    }

    /** Delete photos in [dir] older than the retention window; returns how many went. */
    fun cleanupDir(dir: File, now: Long = System.currentTimeMillis()): Int =
        (dir.listFiles { f -> f.extension == "jpg" } ?: emptyArray()).count { now - it.lastModified() > RETENTION_MS && it.delete() }

    suspend fun deleteAll(ctx: Context): Int = withContext(Dispatchers.IO) { list(ctx).count { it.delete() } }

    /** Copy every kept photo to the gallery (Pictures/FORGE). Returns how many were saved. */
    suspend fun exportToGallery(ctx: Context): Int = withContext(Dispatchers.IO) {
        var n = 0
        for (f in list(ctx)) {
            val values = ContentValues().apply {
                put(MediaStore.Images.Media.DISPLAY_NAME, "FORGE_${f.nameWithoutExtension}.jpg")
                put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg")
                put(MediaStore.Images.Media.DATE_TAKEN, f.lastModified())
                if (Build.VERSION.SDK_INT >= 29) put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/FORGE")
                else {
                    @Suppress("DEPRECATION")
                    val legacy = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), "FORGE").also { it.mkdirs() }
                    @Suppress("DEPRECATION")
                    put(MediaStore.Images.Media.DATA, File(legacy, "FORGE_${f.name}").absolutePath)
                }
            }
            val uri = ctx.contentResolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values) ?: continue
            ctx.contentResolver.openOutputStream(uri)?.use { out -> f.inputStream().use { it.copyTo(out) } } ?: continue
            n++
        }
        n
    }
}
