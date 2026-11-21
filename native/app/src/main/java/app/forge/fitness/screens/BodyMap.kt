package app.forge.fitness.screens

import android.content.Context
import android.graphics.RectF
import android.graphics.Region
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import app.forge.fitness.ui.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.asComposePath
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.graphics.PathParser
import androidx.navigation.NavController
import app.forge.fitness.data.Store
import app.forge.fitness.ui.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlin.math.roundToInt

val REGION_LABEL: Map<String, String> = mapOf(
    "chest" to "Chest", "abs" to "Abs", "obliques" to "Obliques",
    "biceps" to "Biceps", "triceps" to "Triceps", "deltoids" to "Shoulders",
    "forearm" to "Forearms", "quadriceps" to "Quads", "adductors" to "Adductors",
    "calves" to "Calves", "tibialis" to "Shins", "trapezius" to "Traps",
    "upper-back" to "Upper back & lats", "lower-back" to "Lower back",
    "gluteal" to "Glutes", "hamstring" to "Hamstrings"
)

private val NON_MUSCLE = setOf("head", "hands", "feet", "ankles", "knees", "neck", "hair")

private val REGION_RULES: List<Pair<Regex, String>> = listOf(
    Regex("pector|chest") to "chest",
    Regex("serratus|oblique") to "obliques",
    Regex("\\babs\\b|abdom|core|rectus") to "abs",
    Regex("bicep|brachialis") to "biceps",
    Regex("tricep") to "triceps",
    Regex("delt|shoulder|rotator") to "deltoids",
    Regex("forearm|wrist|grip|brachioradialis") to "forearm",
    Regex("quad") to "quadriceps",
    Regex("adductor|groin|inner thigh") to "adductors",
    Regex("abductor|glute|hip") to "gluteal",
    Regex("hamstring") to "hamstring",
    Regex("calf|calves|soleus|gastro") to "calves",
    Regex("shin|tibialis") to "tibialis",
    Regex("trap|levator") to "trapezius",
    Regex("lat|upper back|rhomboid|teres|back$") to "upper-back",
    Regex("spine|lower back|erector") to "lower-back"
)

fun regionOf(muscle: String): String? {
    val m = muscle.lowercase()
    for ((re, slug) in REGION_RULES) {
        if (re.containsMatchIn(m)) return slug
    }
    return null
}

fun untrained(sets: Map<String, Double>): List<String> =
    REGION_LABEL.keys.filter { (sets[it] ?: 0.0) <= 0.0 }.mapNotNull { REGION_LABEL[it] }

fun regionSets(raw: Map<String, Double>): Map<String, Double> {
    val out = mutableMapOf<String, Double>()
    for ((muscle, n) in raw) {
        val r = regionOf(muscle)
        if (r != null) {
            out[r] = (out[r] ?: 0.0) + n
        }
    }
    return out
}

@Serializable private data class RawPart(val slug: String, val d: List<String> = emptyList())
@Serializable private data class RawView(val viewBox: String = "0 0 724 1448", val outline: String? = null, val parts: List<RawPart> = emptyList())
@Serializable private data class RawFigure(val front: RawView, val back: RawView)
@Serializable private data class RawBody(val male: RawFigure, val female: RawFigure)

private class ParsedPart(val slug: String, val composePaths: List<Path>, val androidPaths: List<android.graphics.Path>)
private class ParsedView(val viewBoxW: Float, val viewBoxH: Float, val outline: Path?, val parts: List<ParsedPart>)
private class ParsedFigure(val front: ParsedView, val back: ParsedView)

private object BodyCache {
    private var cache: Map<String, ParsedFigure>? = null

    fun get(context: Context): Map<String, ParsedFigure> {
        cache?.let { return it }
        val text = context.assets.open("body.json").bufferedReader().use { it.readText() }
        val raw = Json { ignoreUnknownKeys = true }.decodeFromString<RawBody>(text)

        fun parseView(v: RawView): ParsedView {
            val vb = v.viewBox.trim().split(Regex("\\s+"))
            val w = vb.getOrNull(2)?.toFloatOrNull() ?: 724f
            val h = vb.getOrNull(3)?.toFloatOrNull() ?: 1448f
            // The back view's viewBox starts at x=724; shift paths to the origin or they draw off-canvas.
            val ox = -(vb.getOrNull(0)?.toFloatOrNull() ?: 0f); val oy = -(vb.getOrNull(1)?.toFloatOrNull() ?: 0f)
            fun parse(d: String) = runCatching { PathParser.createPathFromPathData(d).apply { offset(ox, oy) } }.getOrNull()
            val outlinePath = v.outline?.takeIf { it.isNotBlank() }?.let {
                parse(it)?.asComposePath()
            }
            val parts = v.parts.map { p ->
                // A malformed path skips that shape instead of crashing the History screen.
                val aPaths = p.d.mapNotNull { parse(it) }
                val cPaths = aPaths.map { it.asComposePath() }
                ParsedPart(p.slug, cPaths, aPaths)
            }
            return ParsedView(w, h, outlinePath, parts)
        }

        val map = mapOf(
            "male" to ParsedFigure(parseView(raw.male.front), parseView(raw.male.back)),
            "female" to ParsedFigure(parseView(raw.female.front), parseView(raw.female.back))
        )
        cache = map
        return map
    }
}

@Composable
fun BodyMap(
    sets: Map<String, Double>,
    sex: String,
    onSexChange: ((String) -> Unit)? = null
) {
    val context = LocalContext.current
    val figures = remember(context) { BodyCache.get(context) }
    val fig = figures[sex.lowercase()] ?: figures["male"] ?: return
    var picked by remember { mutableStateOf<String?>(null) }
    val maxVal = sets.values.maxOrNull()?.coerceAtLeast(1.0) ?: 1.0

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (onSexChange != null) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End, verticalAlignment = Alignment.CenterVertically) {
                Chip(text = "Male", selected = sex.lowercase() == "male") { onSexChange("male") }
                Spacer(Modifier.width(6.dp))
                Chip(text = "Female", selected = sex.lowercase() == "female") { onSexChange("female") }
            }
        }

        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(Modifier.weight(1f)) {
                FigureCanvas(
                    view = fig.front,
                    label = "Front",
                    sets = sets,
                    maxVal = maxVal,
                    picked = picked,
                    onPick = { slug -> picked = if (picked == slug) null else slug }
                )
            }
            Box(Modifier.weight(1f)) {
                FigureCanvas(
                    view = fig.back,
                    label = "Back",
                    sets = sets,
                    maxVal = maxVal,
                    picked = picked,
                    onPick = { slug -> picked = if (picked == slug) null else slug }
                )
            }
        }

        Box(Modifier.fillMaxWidth().heightIn(min = 20.dp), contentAlignment = Alignment.Center) {
            if (picked != null) {
                Text(
                    text = "${REGION_LABEL[picked] ?: picked} · ${(sets[picked] ?: 0.0).roundToInt()} sets",
                    color = F.text,
                    fontSize = 12.sp,
                    fontFamily = Mono
                )
            } else {
                Text(
                    text = "Tap a muscle to see its sets",
                    color = F.mute,
                    fontSize = 12.sp,
                    fontFamily = Mono
                )
            }
        }

        Legend()
    }
}

@Composable
private fun FigureCanvas(
    view: ParsedView,
    label: String,
    sets: Map<String, Double>,
    maxVal: Double,
    picked: String?,
    onPick: (String) -> Unit
) {
    val surfaceColor = F.surface
    val raisedColor = F.raised
    val accentColor = F.accent
    val textColor = F.text
    val bgColor = F.bg
    val lineColor = F.line

    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Canvas(
            modifier = Modifier
                .fillMaxWidth()
                .height(320.dp)
                .pointerInput(view, picked) {
                    detectTapGestures { tapOffset ->
                        val sx = size.width / view.viewBoxW
                        val sy = size.height / view.viewBoxH
                        val mx = tapOffset.x / sx
                        val my = tapOffset.y / sy

                        val hitBounds = RectF()
                        val hitRegion = Region()
                        // Search in reverse order so top-drawn parts hit first
                        for (part in view.parts.asReversed()) {
                            if (part.slug in NON_MUSCLE) continue
                            for (aPath in part.androidPaths) {
                                aPath.computeBounds(hitBounds, true)
                                hitRegion.setPath(
                                    aPath,
                                    Region(
                                        hitBounds.left.toInt() - 1,
                                        hitBounds.top.toInt() - 1,
                                        hitBounds.right.toInt() + 1,
                                        hitBounds.bottom.toInt() + 1
                                    )
                                )
                                if (hitRegion.contains(mx.toInt(), my.toInt()) || hitBounds.contains(mx, my)) {
                                    onPick(part.slug)
                                    return@detectTapGestures
                                }
                            }
                        }
                    }
                }
        ) {
            val sx = size.width / view.viewBoxW
            val sy = size.height / view.viewBoxH

            withTransform({
                scale(sx, sy, Offset.Zero)
            }) {
                for (part in view.parts) {
                    val isNonMuscle = part.slug in NON_MUSCLE
                    val setVal = sets[part.slug] ?: 0.0
                    val isPicked = picked == part.slug

                    val fillColor = when {
                        isNonMuscle -> surfaceColor
                        setVal <= 0.0 -> raisedColor
                        else -> {
                            val ratio = (setVal / maxVal).coerceIn(0.0, 1.0).toFloat()
                            val alpha = 0.3f + 0.7f * ratio
                            accentColor.copy(alpha = alpha)
                        }
                    }
                    val strokeColor = if (isPicked) textColor else bgColor
                    val strokeWidth = if (isPicked) 5f else 2.5f

                    for (cPath in part.composePaths) {
                        drawPath(cPath, color = fillColor, style = Fill)
                        drawPath(cPath, color = strokeColor, style = Stroke(width = strokeWidth))
                    }
                }

                view.outline?.let {
                    drawPath(it, color = lineColor, style = Stroke(width = 3f))
                }
            }
        }
        Eyebrow(label, color = F.mute)
    }
}

@Composable
private fun Legend() {
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text("None", color = F.mute, fontFamily = Mono, fontSize = 11.sp)
        Spacer(Modifier.width(8.dp))
        listOf(0f, 0.3f, 0.55f, 0.8f, 1f).forEach { o ->
            val bg = if (o == 0f) F.raised else F.accent.copy(alpha = o)
            Box(
                Modifier
                    .size(width = 20.dp, height = 10.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(bg)
            )
            Spacer(Modifier.width(4.dp))
        }
        Spacer(Modifier.width(4.dp))
        Text("Most", color = F.mute, fontFamily = Mono, fontSize = 11.sp)
    }
}

@Composable
fun BodyMapScreen(s: Store, nav: NavController) {
    val state by s.state.collectAsState()
    val sex = state.profile?.sex ?: "male"
    val today = s.date.collectAsState().value
    val sets = remember(state.sessions, today) {
        val raw = app.forge.fitness.logic.Training.muscleSets(
            sessions = state.sessions,
            today = today,
            days = 7,
            muscleOf = { e -> (e.muscle ?: "chest") to emptyList() }
        )
        regionSets(raw)
    }
    Screen("Muscle Map", back = { nav.popBackStack() }) {
        BodyMap(sets = sets, sex = sex, onSexChange = { nextSex ->
            state.profile?.let { s.save(app.forge.fitness.data.Tables.profiles, it.copy(sex = nextSex)) }
        })
    }
}
