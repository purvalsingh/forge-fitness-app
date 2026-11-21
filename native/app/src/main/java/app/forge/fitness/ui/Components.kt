package app.forge.fitness.ui

import app.forge.fitness.ui.Text

import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.clipPath
import kotlin.math.sin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/* Shared primitives — the Kotlin twin of src/ui.tsx. Anything a screen uses twice belongs here. */

/** Labels use Figtree too: the website has no monospace, so neither does the app. */
val Mono = Figtree

/** Section label (iOS grouped-list style): sentence case, muted, no tracking. Mixed-case text is kept as written. */
@Composable fun Eyebrow(text: String, color: Color = F.mute, modifier: Modifier = Modifier) =
    Text(sentence(I18n.t(text)), modifier, color = color, fontFamily = Figtree, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)

private val KEEP_CAPS = setOf("AI", "RPE", "RIR", "PR", "PRS", "BMR", "TDEE", "BW", "OK", "UT", "GPS", "CSV", "JSON", "SMS", "ID")
private val MONTHS = setOf("JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC")
private val DAYS = setOf("MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN")
/** ALL-CAPS strings become sentence case, keeping acronyms, units, weekdays and months readable. */
fun sentence(text: String): String {
    if (text.any { it.isLowerCase() }) return text
    var first = true
    return Regex("[A-Za-z0-9']+|[^A-Za-z0-9']+").findAll(text).joinToString("") { m ->
        val w = m.value
        if (!w.first().isLetterOrDigit()) return@joinToString w
        val out = when {
            w in KEEP_CAPS -> w
            w == "KCAL" -> "kcal"
            w == "KG" -> "kg"
            w in DAYS || w in MONTHS -> w.lowercase().replaceFirstChar { it.uppercase() }
            first -> w.lowercase().replaceFirstChar { it.uppercase() }
            else -> w.lowercase()
        }
        first = false; out
    }
}

/** The website's pill label (chilli on soft chilli). */
@Composable fun Pill(text: String, color: Color = F.accent, bg: Color = F.accentSoft) =
    Text(sentence(text), Modifier.clip(RoundedCornerShape(8.dp)).background(bg).padding(horizontal = 8.dp, vertical = 3.dp),
        color = color, fontFamily = Figtree, fontWeight = FontWeight.SemiBold, fontSize = 12.sp)

@Composable fun Title(text: String, size: Int = 28, modifier: Modifier = Modifier) =
    Text(text, modifier, color = F.text, fontSize = size.sp, fontFamily = Display, fontWeight = FontWeight.Bold, letterSpacing = (-0.6).sp, lineHeight = (size * 1.08).sp)

@Composable fun Figure(text: String, size: Int = 22, color: Color = F.text) =
    Text(text, color = color, fontSize = size.sp, fontFamily = Display, fontWeight = FontWeight.Bold, letterSpacing = (-0.5).sp)

@Composable fun Body(text: String, color: Color = F.dim, size: Int = 14, modifier: Modifier = Modifier) =
    Text(text, modifier, color = color, fontSize = size.sp, lineHeight = (size * 1.45).sp)

/** A screen with header (title, optional back + right slot) and a scrolling column body. */
@Composable fun Screen(title: String, sub: String? = null, back: (() -> Unit)? = null,
                       right: @Composable RowScope.() -> Unit = {}, scroll: Boolean = true, content: @Composable ColumnScope.() -> Unit) {
    Column(Modifier.fillMaxSize().statusBarsPadding()) {
        Row(Modifier.fillMaxWidth().padding(start = 8.dp, end = 8.dp, top = 6.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            if (back != null) IconButton(onClick = back) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back", tint = F.accent) }
            else Spacer(Modifier.width(8.dp))
            Spacer(Modifier.weight(1f))
            right()
        }
        // Large title, iOS style; no kicker label above it.
        Text(title, Modifier.padding(horizontal = 16.dp).padding(bottom = 10.dp), color = F.text, fontSize = 32.sp,
            fontFamily = Display, fontWeight = FontWeight.Bold, letterSpacing = (-0.8).sp, lineHeight = 36.sp, maxLines = 2)
        val m = Modifier.fillMaxWidth().weight(1f).padding(horizontal = 16.dp)
        Column(if (scroll) m.verticalScroll(rememberScrollState()) else m, verticalArrangement = Arrangement.spacedBy(16.dp)) {
            content(); Spacer(Modifier.height(96.dp))
        }
    }
}

@Composable fun Card(modifier: Modifier = Modifier, paper: Boolean = false, onClick: (() -> Unit)? = null, pad: Dp = 18.dp, content: @Composable ColumnScope.() -> Unit) {
    val shape = RoundedCornerShape(20.dp)
    // Glass: translucent body, a bright edge that fades downward (light catching the top of the pane), soft shadow.
    val edge = Brush.verticalGradient(if (F.dark) listOf(Color(0x40FFFFFF), Color(0x0DFFFFFF)) else listOf(Color(0xF2FFFFFF), Color(0x40FFFFFF)))
    // Tinted glass by default; hero cards (paper) get a glow in the top-right corner instead. Both follow the palette.
    val a1 = F.accent; val a2 = F.accent2; val dark = F.dark
    Column(modifier.fillMaxWidth()
        .shadow(6.dp, shape, ambientColor = Color(0x330F2A3A), spotColor = Color(0x260F2A3A))
        .clip(shape).background(F.surface)
        .drawBehind {
            if (paper) drawRect(Brush.radialGradient(listOf(a2.copy(alpha = if (dark) .32f else .30f), Color.Transparent),
                center = Offset(size.width, 0f), radius = size.width * .85f))
            else drawRect(Brush.linearGradient(listOf(a1.copy(alpha = if (dark) .16f else .14f), a2.copy(alpha = if (dark) .10f else .08f)),
                start = Offset.Zero, end = Offset(size.width, size.height)))
        }
        .border(1.dp, edge, shape)
        .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
        .padding(pad), content = content)
}

/**
 * Live liquid background: the palette gradient plus three soft colour pools that drift slowly, like light moving
 * through water. The glass cards above show them through.
 */
@Composable fun LiquidBackground(modifier: Modifier = Modifier) {
    val f = F
    val t = androidx.compose.animation.core.rememberInfiniteTransition(label = "liquid")
    fun anim(ms: Int) = androidx.compose.animation.core.infiniteRepeatable<Float>(
        androidx.compose.animation.core.tween(ms, easing = androidx.compose.animation.core.FastOutSlowInEasing),
        androidx.compose.animation.core.RepeatMode.Reverse)
    val a by t.animateFloat(0f, 1f, anim(14000), label = "a")
    val b by t.animateFloat(0f, 1f, anim(17000), label = "b")
    val c by t.animateFloat(0f, 1f, anim(11000), label = "c")
    Canvas(modifier.fillMaxSize().background(f.bgBrush)) {
        val w = size.width; val h = size.height
        fun pool(cx: Float, cy: Float, r: Float, col: Color) =
            drawCircle(Brush.radialGradient(listOf(col, col.copy(alpha = 0f)), center = Offset(cx, cy), radius = r), r, Offset(cx, cy))
        val alpha = if (f.dark) .30f else .42f
        pool(w * (0.15f + 0.35f * a), h * (0.12f + 0.10f * b), w * 0.75f, f.accent.copy(alpha = alpha))
        pool(w * (0.95f - 0.30f * b), h * (0.48f + 0.12f * c), w * 0.70f, f.accent2.copy(alpha = alpha * 0.9f))
        pool(w * (0.30f + 0.40f * c), h * (0.88f - 0.08f * a), w * 0.65f, f.protein.copy(alpha = alpha * 0.6f))
    }
}

enum class Variant { Primary, Ghost, Quiet, Danger }

@Composable fun FButton(text: String, modifier: Modifier = Modifier, variant: Variant = Variant.Primary, enabled: Boolean = true, onClick: () -> Unit) {
    val shape = RoundedCornerShape(14.dp)
    val (bg, fg, border) = when (variant) {
        Variant.Primary -> Triple(F.accent, F.accentInk, null)
        Variant.Ghost -> Triple(F.surface, F.accent, null)
        Variant.Quiet -> Triple(F.raised, F.text, null)
        Variant.Danger -> Triple(F.danger.copy(alpha = .10f), F.danger, null)
    }
    val grad = variant == Variant.Primary && enabled
    Button(onClick, modifier.heightIn(min = 52.dp).then(if (grad) Modifier.clip(shape).background(F.accentBrush) else Modifier),
        enabled = enabled, shape = shape, border = border,
        contentPadding = PaddingValues(horizontal = 22.dp),
        colors = ButtonDefaults.buttonColors(containerColor = if (grad) Color.Transparent else bg, contentColor = fg, disabledContainerColor = F.raised, disabledContentColor = F.mute)) {
        Text(text, fontFamily = Figtree, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable fun Chip(text: String, selected: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val shape = RoundedCornerShape(12.dp)
    // Selected = solid accent with white text; unselected = quiet filled tile.
    Box(modifier.heightIn(min = 44.dp).clip(shape)
        .then(if (selected) Modifier.background(F.accentBrush) else Modifier.background(F.high))
        .clickable(onClick = onClick).padding(horizontal = 14.dp, vertical = 8.dp), contentAlignment = Alignment.Center) {
        Text(text, color = if (selected) Color.White else F.text, fontSize = 14.sp, lineHeight = 18.sp, textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium)
    }
}

/** A settings row: title + one-line hint on the left, any control on the right. */
@Composable fun SettingRow(title: String, hint: String? = null, trailing: @Composable () -> Unit) {
    Row(Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f).padding(end = 12.dp)) {
            Text(title, color = F.text, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
            if (hint != null) { Spacer(Modifier.height(3.dp)); Text(hint, color = F.mute, fontSize = 12.sp, lineHeight = 17.sp) }
        }
        trailing()
    }
}

/** "−  5 %  +" pill for numbers: tap-friendly, no keyboard, always within [min, max]. */
@Composable fun Stepper(value: Double, step: Double, min: Double, max: Double, unit: String = "", onChange: (Double) -> Unit) {
    val shape = RoundedCornerShape(999.dp)
    fun fmt(v: Double) = if (v % 1.0 == 0.0) v.toInt().toString() else "%.2f".format(v).trimEnd('0').trimEnd('.')
    Row(Modifier.clip(shape).background(F.raised), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(44.dp).clickable(enabled = value > min) { onChange((value - step).coerceAtLeast(min)) }
            .semantics { contentDescription = "Decrease" }, contentAlignment = Alignment.Center) {
            Text("−", fontSize = 20.sp, color = if (value > min) F.accent else F.mute, fontWeight = FontWeight.Bold)
        }
        Text("${fmt(value)}${if (unit.isNotEmpty()) " $unit" else ""}", Modifier.widthIn(min = 58.dp), color = F.text,
            fontSize = 15.sp, fontWeight = FontWeight.Bold, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        Box(Modifier.size(44.dp).clickable(enabled = value < max) { onChange((value + step).coerceAtMost(max)) }
            .semantics { contentDescription = "Increase" }, contentAlignment = Alignment.Center) {
            Text("+", fontSize = 20.sp, color = if (value < max) F.accent else F.mute, fontWeight = FontWeight.Bold)
        }
    }
}

/** Thin divider between rows inside a card. */
@Composable fun RowDivider() = Box(Modifier.fillMaxWidth().height(1.dp).background(F.line))

@Composable fun <T> Tabs(value: T, options: List<Pair<T, String>>, onChange: (T) -> Unit) {
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(F.high).padding(2.dp)) {
        options.forEach { (v, label) ->
            val sel = v == value
            Box(Modifier.weight(1f).heightIn(min = 40.dp).shadow(if (sel) 2.dp else 0.dp, RoundedCornerShape(8.dp)).clip(RoundedCornerShape(8.dp))
                .background(if (sel) (if (F.dark) F.high else Color.White) else Color.Transparent).clickable { onChange(v) }, contentAlignment = Alignment.Center) {
                Text(label, color = F.text, fontSize = 14.sp, fontWeight = if (sel) FontWeight.SemiBold else FontWeight.Medium)
            }
        }
    }
}

/** Icon-over-label tabs: every option fits on one line at any width (5 modes in the Add food sheet). */
@Composable fun <T> IconTabs(value: T, options: List<Triple<T, String, androidx.compose.ui.graphics.vector.ImageVector>>, onChange: (T) -> Unit) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        options.forEach { (v, label, icon) ->
            val sel = v == value
            val shape = RoundedCornerShape(14.dp)
            Column(Modifier.weight(1f).heightIn(min = 62.dp).clip(shape)
                .then(if (sel) Modifier.background(F.accentBrush) else Modifier.background(F.raised).border(1.dp, F.line, shape))
                .clickable { onChange(v) }.padding(vertical = 8.dp),
                horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                Icon(icon, null, tint = if (sel) Color.White else F.accent, modifier = Modifier.size(22.dp))
                Spacer(Modifier.height(4.dp))
                Text(label, color = if (sel) Color.White else F.text, fontSize = 12.sp, lineHeight = 15.sp, textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                    fontWeight = if (sel) FontWeight.SemiBold else FontWeight.Medium)
            }
        }
    }
}

/**
 * Calorie meter: a see-through jelly bar in the theme's own gradient. The tip springs past its level, squashes while
 * it moves and wobbles after a change; soft light bands drift through the body. Width always = value (0..1).
 */
@Composable fun JellyBar(value: Float, height: Dp = 12.dp) {
    val f = F
    val tip = animateFloatAsState(value.coerceIn(0f, 1f), androidx.compose.animation.core.spring(dampingRatio = .35f, stiffness = 90f), label = "tip")
    val l = rememberLiquid(value)
    val c1 = f.accent; val c2 = f.accent2; val track = f.raised
    Canvas(Modifier.fillMaxWidth().height(height)) {
        val w = size.width; val h = size.height
        drawRoundRect(track, Offset(0f, h * .18f), Size(w, h * .64f), androidx.compose.ui.geometry.CornerRadius(h * .32f))
        val tv = tip.value
        if (tv <= .002f) return@Canvas
        val sq = ((value.coerceIn(0f, 1f) - tv) * 3f).coerceIn(-.35f, .35f)
        val hh = h * (1f - kotlin.math.abs(sq) * .5f); val y = (h - hh) / 2; val r = hh / 2
        val e = maxOf(hh, w * tv)
        val wob = 2.dp.toPx() * l.slosh.value; val ph = l.phase.value
        val n = 24
        val body = Path().apply {
            moveTo(r, y)
            for (k in 0..n) { val x = r + (e - 2 * r) * k / n; lineTo(x, y + wob * sin(k * .9f + ph * 2.5f) * sin(k.toFloat() / n * Math.PI.toFloat())) }
            arcTo(androidx.compose.ui.geometry.Rect(e - hh, y, e, y + hh), -90f, 180f, false)
            for (k in n downTo 0) { val x = r + (e - 2 * r) * k / n; lineTo(x, y + hh - wob * sin(k * .9f + ph * 2.5f + 1f) * sin(k.toFloat() / n * Math.PI.toFloat())) }
            arcTo(androidx.compose.ui.geometry.Rect(0f, y, hh, y + hh), 90f, 180f, false)
            close()
        }
        drawPath(body, Brush.horizontalGradient(listOf(c1.copy(alpha = .80f), androidx.compose.ui.graphics.lerp(c1, c2, .5f).copy(alpha = .82f), c2.copy(alpha = .86f)), endX = e))
        clipPath(body) {
            val band = 14.dp.toPx(); val step = 46.dp.toPx(); val drift = ph / (2 * Math.PI.toFloat()) * step
            var sx = -step + drift
            while (sx < e + step) {
                drawPath(Path().apply { moveTo(sx, 0f); lineTo(sx + band, 0f); lineTo(sx + band - h * .6f, h); lineTo(sx - h * .6f, h); close() }, Color.White.copy(alpha = .16f))
                sx += step
            }
            drawRect(Brush.verticalGradient(listOf(Color.White.copy(alpha = .65f), Color.Transparent, Color.Transparent, Color(0x40000033)), startY = y, endY = y + hh))
        }
    }
}

/** Shortcut tile: gradient icon badge, title and a one-line hint. */
@Composable fun ActionTile(icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, hint: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Card(modifier, onClick = onClick) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(F.accentBrush), contentAlignment = Alignment.Center) {
                Icon(icon, null, tint = Color.White, modifier = Modifier.size(20.dp))
            }
            Column {
                Text(title, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = F.text)
                Spacer(Modifier.height(2.dp))
                Text(hint, fontSize = 12.sp, lineHeight = 16.sp, color = F.mute)
            }
        }
    }
}

@Composable fun Field(label: String, hint: String? = null, content: @Composable () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Eyebrow(label); content(); if (hint != null) Body(hint, F.mute, 12)
    }
}

@Composable fun Input(value: String, onChange: (String) -> Unit, modifier: Modifier = Modifier, placeholder: String = "",
                      number: Boolean = false, password: Boolean = false, singleLine: Boolean = true, label: String? = null) {
    OutlinedTextField(value, onChange, modifier.fillMaxWidth(), singleLine = singleLine,
        placeholder = { Text(placeholder, color = F.mute) }, label = label?.let { { Text(it) } },
        visualTransformation = if (password) androidx.compose.ui.text.input.PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
        keyboardOptions = KeyboardOptions(keyboardType = when { number -> KeyboardType.Decimal; password -> KeyboardType.Password; label == "Email" -> KeyboardType.Email; else -> KeyboardType.Text }),
        shape = RoundedCornerShape(12.dp),
        colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = F.accent, unfocusedBorderColor = Color.Transparent,
            focusedContainerColor = F.raised, unfocusedContainerColor = F.raised, cursorColor = F.accent,
            focusedTextColor = F.text, unfocusedTextColor = F.text))
}

/** Numeric input that commits on change but keeps the raw text while typing (DraftInput on the web). */
@Composable fun NumberInput(value: Double?, onCommit: (Double?) -> Unit, modifier: Modifier = Modifier, placeholder: String = "") {
    var text by remember(value) { mutableStateOf(value?.let { if (it % 1.0 == 0.0) it.toLong().toString() else it.toString() } ?: "") }
    Input(text, { text = it; onCommit(it.toDoubleOrNull()) }, modifier, placeholder, number = true)
}

/**
 * Live liquid shared by the water tile, rings, circles and bars: the level springs to its new value with a little
 * overshoot, a change sloshes the surface for ~2 s, and two waves keep drifting. State is read only while drawing,
 * so the animation redraws without recomposing.
 */
class Liquid(val level: State<Float>, val slosh: State<Float>, val phase: State<Float>, val bob: State<Float>)

@Composable fun rememberLiquid(level: Float): Liquid {
    val lv = animateFloatAsState(level.coerceIn(0f, 1f), androidx.compose.animation.core.spring(dampingRatio = 0.55f, stiffness = 60f), label = "lv")
    val slosh = remember { androidx.compose.animation.core.Animatable(0f) }
    LaunchedEffect(level) { slosh.snapTo(1f); slosh.animateTo(0f, tween(2200, easing = androidx.compose.animation.core.LinearOutSlowInEasing)) }
    val t = androidx.compose.animation.core.rememberInfiniteTransition(label = "liquid")
    val phase = t.animateFloat(0f, (2 * Math.PI).toFloat(), androidx.compose.animation.core.infiniteRepeatable(
        tween(2400, easing = androidx.compose.animation.core.LinearEasing)), label = "ph")
    val bob = t.animateFloat(-1f, 1f, androidx.compose.animation.core.infiniteRepeatable(
        tween(3100, easing = androidx.compose.animation.core.FastOutSlowInEasing), androidx.compose.animation.core.RepeatMode.Reverse), label = "bob")
    return remember { Liquid(lv, slosh.asState(), phase, bob) }
}

/** Fills the current draw area from the bottom up to [Liquid.level] with two moving waves. */
fun DrawScope.drawLiquid(l: Liquid, c1: Color, c2: Color, a1: Float = .38f, a2: Float = .55f) {
    val lv = l.level.value
    if (lv <= 0.001f) return
    val top = size.height * (1f - lv.coerceIn(0f, 1.05f)) + l.bob.value * minOf(1.5.dp.toPx(), size.height * .02f)
    val amp = minOf(4.dp.toPx(), size.height * .06f) * (1f + 2.2f * l.slosh.value)
    val ph = l.phase.value
    fun wave(shift: Float, a: Float) = Path().apply {
        moveTo(0f, size.height)
        var x = 0f
        while (x <= size.width) { lineTo(x, top + a * sin(x / size.width * 8.8f + ph + shift)); x += 3f }
        lineTo(size.width, size.height); close()
    }
    drawPath(wave(1.6f + ph * .5f, amp * .8f), c2.copy(alpha = a2 * .4f))
    drawPath(wave(0f, amp), Brush.verticalGradient(listOf(c1.copy(alpha = a1), c2.copy(alpha = a2)), startY = top, endY = size.height))
}

/** Circular progress ring (value 0..1) with the same liquid rising inside it. */
@Composable fun Ring(value: Float, size: Dp = 74.dp, stroke: Dp = 7.dp, color: Color = F.accent, track: Color = F.raised, content: @Composable BoxScope.() -> Unit = {}) {
    LiquidRing(value, size, stroke, color, track, F.protein, content)
}

@Composable fun LiquidRing(value: Float, size: Dp, stroke: Dp, color: Color, track: Color, deep: Color, content: @Composable BoxScope.() -> Unit = {}) {
    val l = rememberLiquid(value)
    Box(Modifier.size(size), contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            val s = stroke.toPx(); val d = this.size.minDimension - s
            val inner = Path().apply { addOval(androidx.compose.ui.geometry.Rect(Offset(s, s), Size(this@Canvas.size.width - 2 * s, this@Canvas.size.height - 2 * s))) }
            clipPath(inner) { drawLiquid(l, deep, color, .16f, .30f) }
            drawArc(track, 0f, 360f, false, Offset(s / 2, s / 2), Size(d, d), style = Stroke(s))
            val v = l.level.value.coerceIn(0f, 1f)
            if (v > 0f) drawArc(color, -90f, 360f * v, false, Offset(s / 2, s / 2), Size(d, d), style = Stroke(s, cap = StrokeCap.Round))
        }
        content()
    }
}

/** Completion shown as circle FILL, never a percentage number (CLAUDE.md rule 6). */
@Composable fun FillCircle(value: Float, size: Dp = 30.dp, label: String? = null) {
    val c = if (value >= 0.999f) F.lime else F.accent
    val l = rememberLiquid(value)
    Box(Modifier.size(size).clip(CircleShape).background(F.raised).semantics { contentDescription = "${(value * 100).toInt()} percent complete" }, contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) { drawLiquid(l, c, c, .7f, .9f) }
        if (label != null) Text(label, fontSize = 12.sp, color = F.text)
    }
}

/** Liquid bar: the fill springs to its level, its leading edge ripples (more right after a change) and a sheen flows through it. */
@Composable fun ProgressBar(value: Float, color: Color = F.accent, height: Dp = 6.dp) {
    val l = rememberLiquid(value)
    val track = F.raised
    Canvas(Modifier.fillMaxWidth().height(height).clip(RoundedCornerShape(99.dp)).background(track)) {
        val lv = l.level.value.coerceIn(0f, 1.03f)
        if (lv <= 0.001f) return@Canvas
        val edge = size.width * lv
        val ph = l.phase.value
        val amp = minOf(size.height * .6f, 3.dp.toPx()) * (.45f + 1.6f * l.slosh.value)
        val fill = Path().apply {
            moveTo(0f, 0f)
            var y = 0f
            while (y <= size.height) { lineTo(edge + amp * sin(y / size.height * 3.4f + ph * 2f), y); y += 1f }
            lineTo(0f, size.height); close()
        }
        drawPath(fill, Brush.horizontalGradient(listOf(color.copy(alpha = .7f), color), endX = edge.coerceAtLeast(1f)))
        val span = 60.dp.toPx()
        val sx = ph / (2 * Math.PI).toFloat() * (edge + 2 * span) - span
        clipPath(fill) { drawRect(Brush.horizontalGradient(listOf(Color.Transparent, Color.White.copy(alpha = .45f), Color.Transparent), startX = sx - span / 2, endX = sx + span / 2)) }
    }
}

enum class Tone { Info, Warn, Error }
@Composable fun Notice(text: String, tone: Tone = Tone.Info) {
    val c = when (tone) { Tone.Info -> F.protein; Tone.Warn -> if (F.dark) F.carbs else Color(0xFF8A5A00); Tone.Error -> F.danger }
    Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(c.copy(alpha = .10f)).padding(12.dp)) {
        Text(text, color = c, fontSize = 13.sp)
    }
}

@Composable fun Empty(title: String, body: String? = null, action: (@Composable () -> Unit)? = null) {
    Column(Modifier.fillMaxWidth().padding(vertical = 28.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(title, color = F.text, fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
        if (body != null) Body(body, F.mute, 13)
        action?.invoke()
    }
}

@Composable fun Spinner(label: String? = null) {
    Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        CircularProgressIndicator(Modifier.size(20.dp), color = F.accent, strokeWidth = 2.dp)
        if (label != null) Body("$label…", F.mute, 13)
    }
}

@Composable fun Stat(label: String, value: String, sub: String? = null, modifier: Modifier = Modifier) {
    Column(modifier.clip(RoundedCornerShape(14.dp)).background(F.raised).padding(14.dp)) {
        Eyebrow(label); Spacer(Modifier.height(4.dp)); Figure(value, 18); if (sub != null) Body(sub, F.mute, 11)
    }
}

/** Bottom sheet wrapper (Sheet on the web): a glass pane with the app's own live background, not a solid slab. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable fun Sheet(open: Boolean, title: String, onClose: () -> Unit, content: @Composable ColumnScope.() -> Unit) {
    if (!open) return
    val f = F
    val shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp)
    val edge = Brush.verticalGradient(if (f.dark) listOf(Color(0x59FFFFFF), Color(0x00FFFFFF)) else listOf(Color(0xFFFFFFFF), Color(0x00FFFFFF)), endY = 240f)
    ModalBottomSheet(onClose, containerColor = Color.Transparent, contentColor = f.text, dragHandle = null, shape = shape,
        scrimColor = Color.Black.copy(alpha = if (f.dark) .35f else .2f)) {
        Box(Modifier.fillMaxWidth().clip(shape).border(1.dp, edge, shape)) {
            LiquidBackground(Modifier.matchParentSize())
            Column(Modifier.fillMaxWidth().background(if (f.dark) Color(0x14FFFFFF) else Color(0x40FFFFFF))
                .padding(horizontal = 16.dp).navigationBarsPadding().padding(bottom = 24.dp).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Box(Modifier.fillMaxWidth().padding(top = 10.dp, bottom = 4.dp), contentAlignment = Alignment.Center) {
                    Box(Modifier.size(36.dp, 5.dp).clip(RoundedCornerShape(99.dp)).background(f.mute.copy(alpha = .5f)))
                }
                Title(title, 20); content()
            }
        }
    }
}

@Composable fun Divider() = HorizontalDivider(color = F.line)

fun fmt(n: Double, dp: Int = 0): String = if (dp == 0) "%,d".format(Math.round(n)) else "%.${dp}f".format(n)
val monoStyle @Composable get() = TextStyle(fontFamily = Mono, fontSize = 12.sp, color = F.mute)
