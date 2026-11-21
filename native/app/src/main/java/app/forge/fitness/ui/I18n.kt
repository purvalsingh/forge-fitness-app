package app.forge.fitness.ui

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.TextUnit
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * App language. The English text in the code is the key; assets/i18n/<code>.json maps it to the translation.
 * Every Text in the app goes through [Text] below, so a string without a translation simply stays English.
 */
object I18n {
    val LANGS = listOf("en" to "English", "hi" to "हिन्दी", "mr" to "मराठी")
    var lang by mutableStateOf("en"); private set
    private var dict: Map<String, String> = emptyMap()

    fun load(ctx: Context, code: String) {
        dict = if (code == "en") emptyMap() else runCatching {
            Json.parseToJsonElement(ctx.assets.open("i18n/$code.json").bufferedReader().readText()).jsonObject
                .mapValues { it.value.jsonPrimitive.content }
        }.getOrDefault(emptyMap())
        lang = code
    }

    fun t(s: String): String {
        if (dict.isEmpty() || s.isBlank()) return s
        dict[s]?.let { return it }
        val core = s.trim()
        return dict[core]?.let { s.replace(core, it) } ?: s
    }
}

/** Translating drop-in for material3.Text (same parameters). */
@Composable
fun Text(
    text: String, modifier: Modifier = Modifier, color: Color = Color.Unspecified, fontSize: TextUnit = TextUnit.Unspecified,
    fontStyle: FontStyle? = null, fontWeight: FontWeight? = null, fontFamily: FontFamily? = null,
    letterSpacing: TextUnit = TextUnit.Unspecified, textDecoration: TextDecoration? = null, textAlign: TextAlign? = null,
    lineHeight: TextUnit = TextUnit.Unspecified, overflow: TextOverflow = TextOverflow.Clip, softWrap: Boolean = true,
    maxLines: Int = Int.MAX_VALUE, minLines: Int = 1, onTextLayout: ((TextLayoutResult) -> Unit)? = null,
    style: TextStyle = androidx.compose.material3.LocalTextStyle.current,
) {
    I18n.lang // read so a language change recomposes every Text
    val out = I18n.t(text)
    // Our display fonts have no Devanagari: the fallback font plus tight letter spacing broke words mid-glyph ("आ / प").
    val indic = out.any { it in '\u0900'..'\u097F' }
    androidx.compose.material3.Text(text = out, modifier = modifier, color = color, fontSize = fontSize, fontStyle = fontStyle,
        fontWeight = fontWeight, fontFamily = if (indic) null else fontFamily, letterSpacing = if (indic) TextUnit.Unspecified else letterSpacing, textDecoration = textDecoration,
        textAlign = textAlign, lineHeight = if (indic && lineHeight.isSp && fontSize.isSp && lineHeight.value < fontSize.value * 1.3f) fontSize * 1.35f else lineHeight, overflow = overflow, softWrap = softWrap, maxLines = maxLines,
        minLines = minLines, onTextLayout = onTextLayout, style = style)
}

@Composable
fun Text(
    text: AnnotatedString, modifier: Modifier = Modifier, color: Color = Color.Unspecified, fontSize: TextUnit = TextUnit.Unspecified,
    fontWeight: FontWeight? = null, fontFamily: FontFamily? = null, textAlign: TextAlign? = null,
    lineHeight: TextUnit = TextUnit.Unspecified, maxLines: Int = Int.MAX_VALUE, style: TextStyle = androidx.compose.material3.LocalTextStyle.current,
) = androidx.compose.material3.Text(text = text, modifier = modifier, color = color, fontSize = fontSize, fontWeight = fontWeight, fontFamily = fontFamily, textAlign = textAlign,
    lineHeight = lineHeight, maxLines = maxLines, style = style)
