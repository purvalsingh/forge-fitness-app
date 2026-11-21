package app.forge.fitness.data

import app.forge.fitness.ui.I18n
import android.app.Application
import android.content.Context
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import app.forge.fitness.logic.Calc
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.KSerializer
import app.forge.fitness.ui.PALETTES
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import java.io.File

data class State(
    val ready: Boolean = false,
    val signedIn: Boolean = false,
    val localMode: Boolean = false,
    val error: String? = null,
    val profile: Profile? = null,
    val settings: Settings = Settings(),
    val goal: Goal? = null,
    val target: NutritionTarget? = null,
    val mealTypes: List<MealType> = emptyList(),
    val foods: List<Food> = emptyList(),
    val recipes: List<Recipe> = emptyList(),
    val foodLogs: List<FoodLog> = emptyList(),
    val plans: List<WorkoutPlan> = emptyList(),
    val sessions: List<WorkoutSession> = emptyList(),
    val weights: List<WeightLog> = emptyList(),
    val steps: List<StepLog> = emptyList(),
    val insights: List<AIInsight> = emptyList(),
    val checkins: List<PhysiqueCheckin> = emptyList(),
    val water: List<WaterLog> = emptyList(),
    val customExercises: List<Exercise> = emptyList(),
)

/** Table name -> how to (de)serialize its rows and where they live in [State]. Mirrors src/lib/db.ts `Table`. */
class Table<T : Row>(val name: String, val ser: KSerializer<T>, val get: (State) -> List<T>, val set: (State, List<T>) -> State)

object Tables {
    val profiles = Table("profiles", Profile.serializer(), { listOfNotNull(it.profile) }) { s, l -> s.copy(profile = l.firstOrNull()) }
    val settings = Table("settings", Settings.serializer(), { listOf(it.settings) }) { s, l -> s.copy(settings = l.firstOrNull() ?: Seed.settings) }
    val goals = Table("goals", Goal.serializer(), { listOfNotNull(it.goal) }) { s, l -> s.copy(goal = l.maxByOrNull { it.updated_at }) }
    val targets = Table("nutrition_targets", NutritionTarget.serializer(), { listOfNotNull(it.target) }) { s, l -> s.copy(target = l.maxByOrNull { it.updated_at }) }
    val mealTypes = Table("meal_types", MealType.serializer(), { it.mealTypes }) { s, l -> s.copy(mealTypes = l.sortedBy { it.position }) }
    val foods = Table("foods", Food.serializer(), { it.foods }) { s, l -> s.copy(foods = l) }
    val recipes = Table("recipes", Recipe.serializer(), { it.recipes }) { s, l -> s.copy(recipes = l) }
    val foodLogs = Table("food_logs", FoodLog.serializer(), { it.foodLogs }) { s, l -> s.copy(foodLogs = l) }
    val plans = Table("workout_plans", WorkoutPlan.serializer(), { it.plans }) { s, l -> s.copy(plans = l) }
    val sessions = Table("workout_sessions", WorkoutSession.serializer(), { it.sessions }) { s, l -> s.copy(sessions = l) }
    val weights = Table("weight_logs", WeightLog.serializer(), { it.weights }) { s, l -> s.copy(weights = l) }
    val steps = Table("step_logs", StepLog.serializer(), { it.steps }) { s, l -> s.copy(steps = l) }
    val insights = Table("ai_insights", AIInsight.serializer(), { it.insights }) { s, l -> s.copy(insights = l.sortedByDescending { it.created_at }) }
    val checkins = Table("physique_checkins", PhysiqueCheckin.serializer(), { it.checkins }) { s, l -> s.copy(checkins = l.sortedByDescending { it.date }) }
    val water = Table("water_logs", WaterLog.serializer(), { it.water }) { s, l -> s.copy(water = l) }
    val exercises = Table("exercises", Exercise.serializer(), { it.customExercises }) { s, l -> s.copy(customExercises = l) }
    val all: List<Table<out Row>> = listOf(profiles, settings, goals, targets, mealTypes, foods, recipes, foodLogs, plans,
        sessions, weights, steps, insights, checkins, water, exercises)
    /** v2 tables: an older database without them must not take the app down. */
    val optional = setOf("water_logs", "exercises")
}

/**
 * The one app store (src/store.tsx in Kotlin). Signed in: Supabase is the source of truth and the local file is
 * only a cache. Demo mode (no account): the local file IS the database, so the app works with zero credentials.
 * Writes are optimistic; a failed server write reloads from the source of truth.
 */
class Store(app: Application) : AndroidViewModel(app) {
    private val prefs = app.getSharedPreferences("forge", Context.MODE_PRIVATE)
    private val dir = File(app.filesDir, "db").apply { mkdirs() }
    val api = Api({ s -> prefs.edit().putString("session", s?.let { json.encodeToString(Session.serializer(), it) }).apply() },
        prefs.getString("session", null)?.let { runCatching { json.decodeFromString(Session.serializer(), it) }.getOrNull() })

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state

    val localMode get() = prefs.getBoolean("local", false) || !api.configured
    val needsAuth get() = !localMode && api.session == null


    private fun <T : Row> readLocal(t: Table<T>): List<T> {
        val f = File(dir, t.name + ".json"); if (!f.exists()) return emptyList()
        return runCatching { json.decodeFromString(ListSerializer(t.ser), f.readText()) }.getOrDefault(emptyList())
    }
    private fun <T : Row> writeLocal(t: Table<T>, rows: List<T>) = synchronized(this) {
        File(dir, t.name + ".json").writeText(json.encodeToString(ListSerializer(t.ser), rows)) }

    private suspend fun <T : Row> fetch(t: Table<T>): List<T> {
        if (localMode) return readLocal(t)
        val arr: JsonArray = try { api.list(t.name) } catch (e: ApiError) {
            if (t.name in Tables.optional && e.status in 400..499) return emptyList()
            if (e.code == "offline") return readLocal(t) // offline: show the last synced copy
            throw e
        }
        val rows = arr.mapNotNull { runCatching { json.decodeFromJsonElement(t.ser, it) }.getOrNull() }
        writeLocal(t, rows)
        return rows
    }

    private suspend fun <T : Row> putRemote(t: Table<T>, rows: List<T>) {
        if (localMode) { val m = readLocal(t).associateBy { it.id }.toMutableMap(); rows.forEach { m[it.id] = it }; writeLocal(t, m.values.toList()); return }
        rows.forEach { api.upsert(t.name, jsonWrite.encodeToJsonElement(t.ser, it).jsonObject) }
    }

    // ---------- offline outbox ----------
    // A write that fails because the phone is offline or the server is down is kept in a file and sent on the next
    // reload/resume, instead of vanishing. The UI keeps showing it meanwhile.
    @kotlinx.serialization.Serializable private data class Pending(val table: String, val row: JsonObject? = null, val deleteId: String? = null)
    private val outboxFile = File(dir, "_outbox.json")
    private val outboxLock = kotlinx.coroutines.sync.Mutex()
    private fun readOutbox(): MutableList<Pending> = runCatching {
        json.decodeFromString(ListSerializer(Pending.serializer()), outboxFile.readText()).toMutableList() }.getOrDefault(mutableListOf())
    private fun writeOutbox(l: List<Pending>) = outboxFile.writeText(json.encodeToString(ListSerializer(Pending.serializer()), l))
    private val _pending = MutableStateFlow(readOutbox().size)
    /** Number of changes waiting to sync (shown as a small "saved on phone" chip). */
    val pending: StateFlow<Int> = _pending
    private fun transient(e: Exception) = e is ApiError && (e.code == "offline" || e.code == "server_down")
    private suspend fun enqueue(p: Pending) = outboxLock.withLock { val l = readOutbox(); l += p; writeOutbox(l); _pending.value = l.size }
    private suspend fun flushOutbox() = outboxLock.withLock {
        val l = readOutbox(); if (l.isEmpty()) return@withLock
        val it = l.iterator()
        while (it.hasNext()) {
            val p = it.next()
            try { if (p.deleteId != null) api.delete(p.table, p.deleteId) else api.upsert(p.table, p.row!!); it.remove() }
            catch (e: Exception) { if (transient(e)) break else { it.remove(); _state.update { s -> s.copy(error = "One change could not be saved: ${e.message}") } } }
        }
        writeOutbox(l); _pending.value = l.size
    }
    private fun <T : Row> cache(t: Table<T>) { if (!localMode) runCatching { writeLocal(t, t.get(_state.value)) } }

    private var reloadJob: kotlinx.coroutines.Job? = null
    /** Reload from the source of truth. A newer reload cancels an older one so stale data never wins. */
    fun reload() { reloadJob?.cancel(); reloadJob = viewModelScope.launch { doReload() } }
    private suspend fun doReload() {
        if (needsAuth) { _state.value = State(ready = true, signedIn = false); return }
        try {
            if (!localMode) flushOutbox()
            val seededKey = "seeded:" + (api.session?.user_id ?: "local")
            if (fetch(Tables.mealTypes).isEmpty() && !prefs.getBoolean(seededKey, false)) {
                // First run for this account/device: plant the seed data so the UI is meaningful.
                putRemote(Tables.mealTypes, Seed.mealTypes); putRemote(Tables.foods, Seed.foods)
                putRemote(Tables.recipes, Seed.recipes); putRemote(Tables.plans, listOf(Seed.plan))
                putRemote(Tables.settings, listOf(Seed.settings))
                prefs.edit().putBoolean(seededKey, true).apply()
            }
            var s = State(ready = true, signedIn = true, localMode = localMode)
            // All tables load in parallel (was one after another: 16 round trips back to back on every open).
            val setters = kotlinx.coroutines.coroutineScope { Tables.all.map { t -> async { loader(t) } }.awaitAll() }
            for (apply in setters) s = apply(s)
            if (s.profile == null && localMode) {
                val p = Profile("local"); putRemote(Tables.profiles, listOf(p)); s = s.copy(profile = p)
            }
            Calc.dayStartHour = s.settings.day_start_hour ?: 4
            _state.value = s
        } catch (e: kotlinx.coroutines.CancellationException) { throw e
        } catch (e: Exception) {
            if (e is ApiError && e.code == "unauthorized") { _state.value = State(ready = true, signedIn = false, error = e.message); return }
            _state.update { it.copy(ready = true, signedIn = true, error = e.message ?: "Could not load your data.") }
        }
    }
    private suspend fun <T : Row> load(s: State, t: Table<T>) = t.set(s, fetch(t))
    private suspend fun <T : Row> loader(t: Table<T>): (State) -> State { val rows = fetch(t); return { st -> t.set(st, rows) } }

    fun <T : Row> save(t: Table<T>, row: T) {
        _state.update { s -> t.set(s, t.get(s).filter { it.id != row.id } + row) }
        cache(t)
        viewModelScope.launch {
            try { putRemote(t, listOf(row)) } catch (e: Exception) {
                if (transient(e)) enqueue(Pending(t.name, row = jsonWrite.encodeToJsonElement(t.ser, row).jsonObject))
                else { _state.update { it.copy(error = e.message ?: "Save failed. Your entry was not stored.") }; reload() }
            }
        }
    }

    fun <T : Row> del(t: Table<T>, id: String) {
        _state.update { s -> t.set(s, t.get(s).filter { it.id != id }) }
        cache(t)
        viewModelScope.launch {
            try {
                if (localMode) writeLocal(t, readLocal(t).filter { it.id != id }) else api.delete(t.name, id)
            } catch (e: Exception) {
                if (transient(e)) enqueue(Pending(t.name, deleteId = id))
                else { _state.update { it.copy(error = e.message ?: "Delete failed.") }; reload() }
            }
        }
    }

    fun clearError() = _state.update { it.copy(error = null) }
    /** Show a plain message in the app's message bar. */
    fun notify(msg: String) = _state.update { it.copy(error = msg) }

    // ---------- account ----------
    suspend fun signIn(email: String, pw: String) { api.signIn(email, pw); claimDevice(); reload() }
    suspend fun signUp(email: String, pw: String, name: String) { api.signUp(email, pw, name); claimDevice(); reload() }
    /** A different person signing in on this phone must never see (or upload) the previous account's cached data. */
    private fun claimDevice() {
        val uid = api.session?.user_id.orEmpty()
        val owner = prefs.getString("owner", null)
        if (owner != null && owner != uid) wipeDevice()
        prefs.edit().putBoolean("local", false).putString("owner", uid).apply()
    }
    private fun wipeDevice() {
        dir.listFiles()?.forEach { it.delete() }
        _pending.value = 0
        // Private physique photos, the step baseline and day picks belong to the previous person, not the next one.
        java.io.File(getApplication<Application>().filesDir, "photos").deleteRecursively()
        getApplication<Application>().getSharedPreferences("forge_steps", Context.MODE_PRIVATE).edit().clear().apply()
        prefs.edit().apply { prefs.all.keys.filter { it.startsWith("pick:") }.forEach(::remove) }.remove("owner").apply()
        dayPicks.value = emptyMap(); Calc.dayPicks = emptyMap()
    }
    /** Plan day the user chose for a date instead of the next one in rotation (kept on this phone). */
    val dayPicks = kotlinx.coroutines.flow.MutableStateFlow(prefs.all.filterKeys { it.startsWith("pick:") }.mapNotNull { (k, v) -> (v as? String)?.let { k.removePrefix("pick:") to it } }.toMap())
    /** dayId: a plan day to train, Calc.REST for a rest day, null to return to the planned order. */
    fun pickDay(date: String, dayId: String?) {
        prefs.edit().apply { if (dayId == null) remove("pick:$date") else putString("pick:$date", dayId) }.apply()
        dayPicks.value = if (dayId == null) dayPicks.value - date else dayPicks.value + (date to dayId)
        Calc.dayPicks = dayPicks.value
    }
    init { Calc.dayPicks = dayPicks.value }
    init { I18n.load(app, prefs.getString("lang", "en") ?: "en") }
    /** App language for this phone: "en", "hi" or "mr". */
    fun setLang(code: String) { prefs.edit().putString("lang", code).apply(); I18n.load(getApplication(), code) }
    fun useDemo() { prefs.edit().putBoolean("local", true).apply(); reload() }
    /** Leave demo mode to sign in or create an account (demo data stays on this phone). */
    fun leaveDemo() { prefs.edit().putBoolean("local", false).apply(); reload() }
    /** Called on resume: a new logical day moves "today" forward, and queued changes get another try. */
    fun onResume() {
        val t = Calc.today()
        if (_date.value != t && _date.value == lastToday) _date.value = t
        lastToday = t
        if (!localMode && _pending.value > 0) viewModelScope.launch { flushOutbox() }
    }
    private var lastToday = Calc.today()
    fun signOut() {
        api.signOut(); prefs.edit().putBoolean("local", false).apply()
        wipeDevice()
        reload()
    }

    // ---------- device-only preferences (theme + accent, like localStorage on the web) ----------
    private val _theme = MutableStateFlow(prefs.getString("theme", "light")!!)
    val theme: StateFlow<String> = _theme
    fun setTheme(t: String) { prefs.edit().putString("theme", t).apply(); _theme.value = t }
    private val _accent = MutableStateFlow(prefs.getString("accent", "monsoon")!!.let { if (it in PALETTES) it else "monsoon" })
    val accent: StateFlow<String> = _accent
    fun setAccent(a: String) {
        prefs.edit().putString("accent", a).apply(); _accent.value = a
        runCatching { IconSwitcher.apply(getApplication(), a) } // home-screen icon follows the theme
    }

    // ---------- automatic steps + water presets (device settings) ----------
    private var lastSavedSteps = 0
    /** Called by [StepCounter]. Never lowers a day's count (a manual entry that is higher wins); saves in 50-step chunks. */
    fun onSensorSteps(date: String, steps: Int) {
        val st = _state.value
        if (!st.signedIn || !st.ready || reloadJob?.isActive == true) return // wait for the day's real row first
        val existing = st.steps.find { it.date == date }
        if (existing != null && existing.steps >= steps) return
        if (existing != null && steps - existing.steps < 50 && steps - lastSavedSteps < 50) return
        lastSavedSteps = steps
        save(Tables.steps, StepLog(existing?.id ?: uid(), date, steps))
    }
    private val _autoSteps = MutableStateFlow(prefs.getBoolean("auto_steps", true))
    val autoSteps: StateFlow<Boolean> = _autoSteps
    fun setAutoSteps(v: Boolean) { prefs.edit().putBoolean("auto_steps", v).apply(); _autoSteps.value = v }

    private val _glassMl = MutableStateFlow(prefs.getInt("glass_ml", 250))
    val glassMl: StateFlow<Int> = _glassMl
    private val _bottleMl = MutableStateFlow(prefs.getInt("bottle_ml", 1000))
    val bottleMl: StateFlow<Int> = _bottleMl
    fun setGlassMl(v: Int) { val c = v.coerceIn(50, 1000); prefs.edit().putInt("glass_ml", c).apply(); _glassMl.value = c }
    fun setBottleMl(v: Int) { val c = v.coerceIn(100, 3000); prefs.edit().putInt("bottle_ml", c).apply(); _bottleMl.value = c }

    /** Weights the AI coach planned for the session being opened (workout-exercise id -> target). Cleared after use. */
    var aiSessionTargets: Map<String, app.forge.fitness.logic.Training.Target> = emptyMap()

    // ---------- training review targets (accepted from the AI, used once at the next session) ----------
    @kotlinx.serialization.Serializable data class AiTarget(val name: String, val weight_kg: Double, val reps: Int, val note: String = "")
    fun saveAiTargets(list: List<AiTarget>) = prefs.edit().putString("ai_targets", json.encodeToString(ListSerializer(AiTarget.serializer()), list)).apply()
    fun aiTargets(): List<AiTarget> = runCatching { json.decodeFromString(ListSerializer(AiTarget.serializer()), prefs.getString("ai_targets", "[]")!!) }.getOrDefault(emptyList())
    /** Returns (kg, reps, note) for this exercise and removes it, so it applies to exactly one session. */
    fun takeAiTarget(name: String): Triple<Double, Int, String>? {
        val all = aiTargets(); val hit = all.firstOrNull { it.name.equals(name, ignoreCase = true) } ?: return null
        saveAiTargets(all - hit); return Triple(hit.weight_kg, hit.reps, hit.note)
    }
    /** True once the user has picked an effort scale themselves; until then RPE is on by default. */
    val rpeChosen get() = prefs.getBoolean("rpe_chosen", false)
    fun markRpeChosen() = prefs.edit().putBoolean("rpe_chosen", true).apply()

    // ---------- powerlifting wave settings per plan (device setting) ----------
    fun waveStart(planId: String): String = prefs.getString("wave_start:$planId", null) ?: Calc.today().also { setWaveStart(planId, it) }
    fun setWaveStart(planId: String, date: String) = prefs.edit().putString("wave_start:$planId", date).apply()
    fun wavePcts(planId: String): String = prefs.getString("wave_pcts:$planId", "70, 80, 90, 105, 60")!!
    fun setWavePcts(planId: String, v: String) = prefs.edit().putString("wave_pcts:$planId", v).apply()

    /** The day being viewed/logged (Today's ‹ › switcher). */
    private val _date = MutableStateFlow(Calc.today())
    val date: StateFlow<String> = _date
    fun setDate(d: String) { _date.value = d }

    fun exportJson(): String = JsonObject(Tables.all.associate { t -> t.name to exportTable(t) }).toString()
    private fun <T : Row> exportTable(t: Table<T>) = json.encodeToJsonElement(ListSerializer(t.ser), t.get(_state.value))

    // Must stay LAST in the class: Kotlin runs initializers top to bottom, and reload() touches the outbox lock,
    // reload job and flows declared above. Running it earlier crashed signed-in users with a null Mutex.
    init { Seed.init(app); reload() }
}

fun uid(): String = java.util.UUID.randomUUID().toString()
fun nowIso(): String = java.time.Instant.now().toString()
