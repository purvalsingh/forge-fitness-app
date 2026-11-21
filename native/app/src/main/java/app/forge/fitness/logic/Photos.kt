package app.forge.fitness.logic

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.util.Base64

/**
 * On-device photo store for physique check-ins — ported from src/lib/photos.ts.
 *
 * Photos are treated as highly private:
 *  - Stored as JPEGs in [Context.filesDir]/photos (never on external storage, never synced).
 *  - Never uploaded to the database.
 *  - Sent over the network exactly once — to the AI endpoint, only when the user triggers it.
 *  - Deleted with their check-in.
 *
 * All file I/O runs on [Dispatchers.IO].
 */
object Photos {

    // ─── Storage ──────────────────────────────────────────────────────────────

    private fun dir(context: Context): File =
        File(context.filesDir, "photos").also { it.mkdirs() }

    private fun file(context: Context, key: String): File =
        File(dir(context), key.replace(Regex("[^a-zA-Z0-9._\\-]"), "_") + ".jpg")

    /**
     * Write a JPEG byte array to on-device storage under [key].
     * Existing content is overwritten.
     */
    suspend fun put(context: Context, key: String, jpegBytes: ByteArray): Unit =
        withContext(Dispatchers.IO) {
            FileOutputStream(file(context, key)).use { it.write(jpegBytes) }
        }

    /**
     * Store a photo from a data-URL string (the format used in the web version).
     * The data-URL prefix ("data:image/jpeg;base64,") is stripped automatically.
     */
    suspend fun putDataUrl(context: Context, key: String, dataUrl: String): Unit {
        val bytes = dataUrlToBytes(dataUrl)
        put(context, key, bytes)
    }

    /**
     * Read a stored photo as a JPEG byte array, or null if the key does not exist.
     */
    suspend fun get(context: Context, key: String): ByteArray? =
        withContext(Dispatchers.IO) {
            val f = file(context, key)
            if (f.exists()) f.readBytes() else null
        }

    /**
     * Read a stored photo as a data-URL string, or null if the key does not exist.
     * Convenience wrapper for the AI call which expects base64.
     */
    suspend fun getDataUrl(context: Context, key: String): String? =
        get(context, key)?.let { bytes ->
            "data:image/jpeg;base64," + Base64.getEncoder().encodeToString(bytes)
        }

    /**
     * Delete a stored photo. No-op if the key does not exist.
     */
    suspend fun del(context: Context, key: String): Unit =
        withContext(Dispatchers.IO) { file(context, key).delete() }

    /**
     * List all stored photo keys (without the .jpg extension).
     */
    suspend fun keys(context: Context): List<String> =
        withContext(Dispatchers.IO) {
            dir(context).listFiles()?.map { it.nameWithoutExtension } ?: emptyList()
        }

    /**
     * Delete all stored photos.
     */
    suspend fun clear(context: Context): Unit =
        withContext(Dispatchers.IO) { dir(context).listFiles()?.forEach { it.delete() } }

    // ─── Downscaling ──────────────────────────────────────────────────────────

    /**
     * Downscale a JPEG/PNG byte array so the longest edge is at most [maxPx] pixels.
     * Returns a JPEG-encoded byte array at [quality] 0–100.
     * This keeps on-device storage small and AI requests fast.
     *
     * @param input   Raw image bytes (JPEG or PNG).
     * @param maxPx   Maximum side length in pixels (default 720).
     * @param quality JPEG compression quality 0–100 (default 72).
     * @throws IllegalArgumentException when the input cannot be decoded as an image.
     */
    suspend fun downscale(input: ByteArray, maxPx: Int = 720, quality: Int = 72): ByteArray =
        withContext(Dispatchers.IO) {
            val original = BitmapFactory.decodeByteArray(input, 0, input.size)
                ?: throw IllegalArgumentException("Could not decode that image.")
            val scale = minOf(1.0, maxPx.toDouble() / maxOf(original.width, original.height))
            val scaled = if (scale >= 1.0) original else {
                val w = (original.width * scale).toInt().coerceAtLeast(1)
                val h = (original.height * scale).toInt().coerceAtLeast(1)
                Bitmap.createScaledBitmap(original, w, h, true)
            }
            java.io.ByteArrayOutputStream().use { out ->
                scaled.compress(Bitmap.CompressFormat.JPEG, quality, out)
                out.toByteArray()
            }
        }

    // ─── Data-URL helpers ─────────────────────────────────────────────────────

    /**
     * Split a data-URL into its MIME type and base64 string.
     * Falls back to "image/jpeg" when the MIME type cannot be parsed.
     */
    fun splitDataUrl(dataUrl: String): Pair<String, String> {
        val comma = dataUrl.indexOf(',')
        return if (comma < 0) {
            "image/jpeg" to dataUrl
        } else {
            val head = dataUrl.substring(0, comma)
            val mime = Regex("data:(.*?);").find(head)?.groupValues?.getOrNull(1) ?: "image/jpeg"
            mime to dataUrl.substring(comma + 1)
        }
    }

    // ─── Private ──────────────────────────────────────────────────────────────

    private fun dataUrlToBytes(dataUrl: String): ByteArray {
        val (_, base64) = splitDataUrl(dataUrl)
        return Base64.getDecoder().decode(base64)
    }
}
