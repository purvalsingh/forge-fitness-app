package app.forge.fitness.data

import app.forge.fitness.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

val json = Json { ignoreUnknownKeys = true; explicitNulls = false; encodeDefaults = true; isLenient = true }
/** For writes: model fields that are null are SENT as null, so clearing a field actually clears it on the server. */
val jsonWrite = Json(json) { explicitNulls = true }

class ApiError(message: String, val code: String = "error", val status: Int = 0) : Exception(message)

@Serializable data class Session(val access_token: String, val refresh_token: String, val expires_at: Long = 0, val user_id: String = "")

/**
 * The whole server contract in one place: Supabase Auth (GoTrue) + PostgREST through the site's /sb proxy,
 * and the FORGE Vercel API (/api/ai, /api/keys). RLS on the server is the security boundary; this client
 * never filters by user id itself. No secret lives here: only the public publishable key.
 */
class Api(private val sessionStore: (Session?) -> Unit, initial: Session?) {
    var session: Session? = initial
        private set
    private val http = OkHttpClient.Builder().connectTimeout(15, TimeUnit.SECONDS).readTimeout(60, TimeUnit.SECONDS).build()
    /** AI calls: the server answers within ~22 s, so the whole call is capped at 28 s. */
    private val aiHttp = http.newBuilder().callTimeout(28, TimeUnit.SECONDS).readTimeout(28, TimeUnit.SECONDS).build()
    private val sb = BuildConfig.SITE + "/sb"
    private val key = BuildConfig.SUPABASE_KEY
    private val JSON_T = "application/json".toMediaType()
    val configured get() = key.isNotBlank()

    private fun setSession(s: Session?) { session = s; sessionStore(s) }

    private suspend fun send(req: Request, client: OkHttpClient = http): Pair<Int, String> = withContext(Dispatchers.IO) {
        try { client.newCall(req).execute().use { it.code to (it.body?.string() ?: "") } }
        catch (e: java.io.InterruptedIOException) { if (client === aiHttp) throw ApiError("The AI took too long to answer. Try again, or log it manually.", "ai_slow"); throw ApiError("Could not reach FORGE. Check your connection.", "offline") }
        catch (e: IOException) { throw ApiError("Could not reach FORGE. Check your connection.", "offline") }
    }

    private fun errorOf(status: Int, body: String): ApiError {
        if (status in 502..504 || "DNS_HOSTNAME_NOT_FOUND" in body)
            return ApiError("FORGE's server is offline right now. Your data is safe — try again in a few minutes, or use the app without an account meanwhile.", "server_down", status)
        val o = runCatching { json.parseToJsonElement(body).jsonObject }.getOrNull()
        val msg = listOf("msg", "message", "error_description", "error").firstNotNullOfOrNull { o?.get(it)?.jsonPrimitive?.contentOrNull }
        return ApiError(msg ?: "Request failed ($status)", o?.get("error")?.jsonPrimitive?.contentOrNull ?: "http_$status", status)
    }

    // ---------- auth ----------
    private fun parseSession(body: String): Session {
        val o = json.parseToJsonElement(body).jsonObject
        val token = o["access_token"]?.jsonPrimitive?.contentOrNull ?: throw ApiError("Check your email to confirm the account, then sign in.", "confirm")
        return Session(token, o["refresh_token"]!!.jsonPrimitive.content,
            o["expires_at"]?.jsonPrimitive?.longOrNull ?: (System.currentTimeMillis() / 1000 + 3600),
            o["user"]?.jsonObject?.get("id")?.jsonPrimitive?.content ?: "")
    }

    private suspend fun authPost(path: String, body: JsonObject): String {
        val (code, text) = send(Request.Builder().url("$sb/auth/v1/$path").header("apikey", key)
            .post(body.toString().toRequestBody(JSON_T)).build())
        if (code !in 200..299) throw errorOf(code, text)
        return text
    }

    suspend fun signIn(email: String, password: String) =
        setSession(parseSession(authPost("token?grant_type=password", buildJsonObject { put("email", email); put("password", password) })))

    suspend fun signUp(email: String, password: String, name: String) =
        setSession(parseSession(authPost("signup", buildJsonObject {
            put("email", email); put("password", password); putJsonObject("data") { put("display_name", name) }
        })))

    suspend fun resetPassword(email: String) { authPost("recover", buildJsonObject { put("email", email) }) }

    fun signOut() = setSession(null)

    /** Deletes the caller's account; the database cascades every row they own. */
    suspend fun deleteAccount() {
        val (code, text) = send(authed(Request.Builder().url("$sb/rest/v1/rpc/delete_my_account")).post("{}".toRequestBody(JSON_T)).build())
        if (code !in 200..299) throw errorOf(code, text)
    }

    private val refreshLock = kotlinx.coroutines.sync.Mutex()
    private suspend fun token(): String = refreshLock.withLock { tokenLocked() }
    private suspend fun tokenLocked(): String {
        val s = session ?: throw ApiError("Sign in first.", "unauthorized", 401)
        if (s.expires_at - 60 > System.currentTimeMillis() / 1000) return s.access_token
        val fresh = try { parseSession(authPost("token?grant_type=refresh_token", buildJsonObject { put("refresh_token", s.refresh_token) })) }
            catch (e: ApiError) {
                if (e.status in 400..401) { setSession(null); throw ApiError("Your session expired. Please sign in again.", "unauthorized", 401) }
                throw e
            }
        setSession(fresh.copy(user_id = fresh.user_id.ifBlank { s.user_id }))
        return fresh.access_token
    }

    private suspend fun authed(b: Request.Builder) = b.header("apikey", key).header("Authorization", "Bearer ${token()}")

    // ---------- data (PostgREST) ----------
    /** Every row of the table, 1,000 at a time: the server caps one response at 1,000 rows, so a single request
     *  silently dropped older meals once a user passed that. Ordered by id so pages never overlap or skip. */
    suspend fun list(table: String): JsonArray {
        val all = mutableListOf<JsonElement>(); val page = 1000
        while (true) {
            val (code, text) = send(authed(Request.Builder().url("$sb/rest/v1/$table?select=*&order=id&limit=$page&offset=${all.size}")).build())
            if (code !in 200..299) throw errorOf(code, text)
            val rows = json.parseToJsonElement(text).jsonArray
            all.addAll(rows)
            if (rows.size < page) return JsonArray(all)
        }
    }

    /** Upsert by id. Nulls are dropped so a column the web app added later is never blanked by an old APK. */
    /** NOT NULL columns per table (from the live schema). A null for these is dropped so the column's DB default
     *  applies; sending it made Postgres refuse the whole row ("null value violates not-null constraint"). */
    internal val NOT_NULL: Map<String, Set<String>> = mapOf(
        "ai_insights" to setOf("created_at", "applied", "dismissed", "text", "kind"),
        "exercises" to setOf("updated_at", "name"),
        "food_logs" to setOf("name", "meal_type_id", "date", "created_at", "source", "fat_g", "carbs_g", "protein_g", "calories", "unit", "qty"),
        "foods" to setOf("unit", "name", "fat_g", "custom", "carbs_g", "protein_g", "calories", "base"),
        "goals" to setOf("current_weight_kg", "training_days_per_week", "training_minutes", "avg_daily_steps", "activity_level", "mode", "rate_kg_per_week", "updated_at", "target_weight_kg"),
        "meal_types" to setOf("position", "name", "time"),
        "nutrition_targets" to setOf("source", "updated_at", "calories", "protein_g", "carbs_g", "fat_g"),
        "physique_checkins" to setOf("priorities", "created_at", "date", "goal", "photo_keys"),
        "profiles" to setOf("created_at", "updated_at", "display_name", "age", "height_cm", "theme", "sex"),
        "recipes" to setOf("ingredients", "favorite", "name"),
        "settings" to setOf("keep_awake", "step_goal", "rest_days", "adherence_weights", "diet_tolerance", "updated_at", "day_start_hour", "water_goal_ml", "week_start", "units", "bar_weight_kg", "default_rest_sec", "effort_scale", "timer_flash", "fasting_hours"),
        "step_logs" to setOf("steps", "date"),
        "water_logs" to setOf("ml", "at", "date"),
        "weight_logs" to setOf("date", "weight_kg"),
        "workout_plans" to setOf("name", "deload", "updated_at", "days", "source", "active"),
        "workout_sessions" to setOf("day_name", "freestyle", "deload", "started_at", "date", "exercises", "backfilled", "plan_id", "day_id")
    )

    internal fun cleanRow(table: String, row: JsonObject): JsonObject {
        val required = NOT_NULL[table].orEmpty()
        return JsonObject(row.filter { (k, v) -> !(v is JsonNull && k in required) })
    }

    suspend fun upsert(table: String, row: JsonObject) {
        // Only this model's own columns are sent (nulls included), so columns the web app added later stay untouched.
        val clean = JsonObject(cleanRow(table, row) + ("user_id" to JsonPrimitive(session?.user_id ?: "")))
        // Steps and weight allow one row per day (unique user_id+date): upsert on that, not on id, so a second
        // device or the step sensor updates the day's row instead of failing with "duplicate key".
        val conflict = if (table == "step_logs" || table == "weight_logs") "?on_conflict=user_id,date" else ""
        val (code, text) = send(authed(Request.Builder().url("$sb/rest/v1/$table$conflict"))
            .header("Prefer", "resolution=merge-duplicates,return=minimal")
            .post(clean.toString().toRequestBody(JSON_T)).build())
        if (code !in 200..299) throw errorOf(code, text)
    }

    /** Feedback is insert-only: the database fills in the id, user and time. */
    suspend fun sendFeedback(kind: String, message: String, app: String) {
        val body = buildJsonObject { put("kind", kind); put("message", message); put("app", app) }
        val (code, text) = send(authed(Request.Builder().url("$sb/rest/v1/feedback")).header("Prefer", "return=minimal")
            .post(body.toString().toRequestBody(JSON_T)).build())
        if (code !in 200..299) throw errorOf(code, text)
    }

    suspend fun delete(table: String, id: String) {
        val (code, text) = send(authed(Request.Builder().url("$sb/rest/v1/$table?id=eq.${java.net.URLEncoder.encode(id, "UTF-8")}")).delete().build())
        if (code !in 200..299) throw errorOf(code, text)
    }

    // ---------- FORGE API ----------
    /**
     * One AI task. The server uses the caller's own encrypted Gemini keys and answers within ~22 s.
     * No automatic retry: it would double the wait. Timeouts and gateway errors say "AI was slow", not "server offline".
     */
    suspend fun ai(task: String, payload: JsonElement): JsonObject {
        val body = buildJsonObject { put("task", task); put("payload", payload); put("lang", app.forge.fitness.ui.I18n.lang) }.toString()
        val (code, text) = send(authed(Request.Builder().url(BuildConfig.SITE + "/api/ai")).post(body.toRequestBody(JSON_T)).build(), aiHttp)
        if (code !in 200..299) {
            if (code in 502..504) throw ApiError("The AI took too long to answer. Try again, or log it manually.", "ai_slow", code)
            throw errorOf(code, text)
        }
        return runCatching { json.parseToJsonElement(text).jsonObject }.getOrElse {
            throw ApiError("The AI returned an unexpected response. Enter the details manually.", "bad_ai")
        }
    }

    @Serializable data class KeyStatus(val count: Int = 0, val hints: List<String> = emptyList())

    suspend fun keys(): KeyStatus {
        val (code, text) = send(authed(Request.Builder().url(BuildConfig.SITE + "/api/keys")).build())
        if (code !in 200..299) throw errorOf(code, text)
        return json.decodeFromString(text)
    }
    /** [add] = merge into the saved keys instead of replacing them, so adding one key never needs the others again. */
    suspend fun saveKeys(keys: List<String>, add: Boolean = false): KeyStatus {
        val body = buildJsonObject { putJsonArray("keys") { keys.forEach { add(it) } }; if (add) put("mode", "add") }.toString()
        val (code, text) = send(authed(Request.Builder().url(BuildConfig.SITE + "/api/keys")).post(body.toRequestBody(JSON_T)).build())
        if (code !in 200..299) throw errorOf(code, text)
        return json.decodeFromString(text)
    }
    suspend fun deleteKeys() { send(authed(Request.Builder().url(BuildConfig.SITE + "/api/keys")).delete().build()) }
    /** Remove one saved key by its hint ("…abcd"). */
    suspend fun deleteKey(hint: String): KeyStatus {
        val (code, text) = send(authed(Request.Builder().url(BuildConfig.SITE + "/api/keys?hint=" + java.net.URLEncoder.encode(hint, "UTF-8"))).delete().build())
        if (code !in 200..299) throw errorOf(code, text)
        return json.decodeFromString(text)
    }
}
