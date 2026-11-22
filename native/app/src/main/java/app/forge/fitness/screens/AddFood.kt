@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
package app.forge.fitness.screens

import app.forge.fitness.ui.Text

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import app.forge.fitness.ui.Card
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import app.forge.fitness.data.*
import app.forge.fitness.logic.Ai
import app.forge.fitness.logic.Barcode
import app.forge.fitness.logic.Calc
import app.forge.fitness.logic.Catalog
import app.forge.fitness.ui.*
import com.google.mlkit.vision.barcode.common.Barcode as MlBarcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.roundToInt

val UNITS = listOf("g", "ml", "serving", "piece", "slice", "cup", "tbsp", "tsp", "scoop")

fun normUnit(u: String): String {
    if (u == "100g") return "g"
    if (u == "100ml") return "ml"
    return if (UNITS.contains(u)) u else "g"
}

fun unitShort(u: String): String = when (u) {
    "100g", "g" -> "g"
    "100ml", "ml" -> "ml"
    else -> " $u"
}

data class LogTargetValue(val date: String, val mealTypeId: String)

/**
 * Which meal and which day an entry goes to.
 * Port of LogTarget in src/screens/AddFood.tsx.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LogTarget(
    value: LogTargetValue,
    s: Store,
    onChange: (LogTargetValue) -> Unit
) {
    val t = Calc.today()
    val y = Calc.addDays(t, -1)
    var showDatePicker by remember { mutableStateOf(false) }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        // Meal types horizontal scroll
        FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            s.state.collectAsStateWithLifecycle().value.mealTypes.forEach { m ->
                Chip(
                    text = m.name,
                    selected = value.mealTypeId == m.id,
                    onClick = { onChange(value.copy(mealTypeId = m.id)) }
                )
            }
        }

        val isOther = value.date != t && value.date != y
        Tabs(
            value = if (isOther) "other" else value.date,
            options = listOf(t to "Today", y to "Yesterday", "other" to if (isOther) app.forge.fitness.logic.Calc.safeDate(value.date).format(java.time.format.DateTimeFormatter.ofPattern("d MMM")) else "Pick a day"),
            onChange = { if (it == "other") showDatePicker = true else onChange(value.copy(date = it)) }
        )
    }

    if (showDatePicker) {
        val initialMillis = runCatching {
            app.forge.fitness.logic.Calc.safeDate(value.date).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
        }.getOrNull() ?: System.currentTimeMillis()

        val datePickerState = rememberDatePickerState(initialSelectedDateMillis = initialMillis)
        DatePickerDialog(
            onDismissRequest = { showDatePicker = false },
            confirmButton = {
                TextButton(onClick = {
                    datePickerState.selectedDateMillis?.let { millis ->
                        val picked = Instant.ofEpochMilli(millis).atZone(ZoneOffset.UTC).toLocalDate().toString()
                        onChange(value.copy(date = picked))
                    }
                    showDatePicker = false
                }) { Text("OK", color = F.accent) }
            },
            dismissButton = {
                TextButton(onClick = { showDatePicker = false }) { Text("Cancel", color = F.mute) }
            }
        ) {
            DatePicker(state = datePickerState)
        }
    }
}

/**
 * Port of AddFoodSheet in src/screens/AddFood.tsx.
 */
@Composable
fun AddFoodSheet(
    open: Boolean,
    onClose: () -> Unit,
    date: String,
    mealTypeId: String,
    initialTab: String = "search",
    s: Store,
    nav: NavController? = null
) {
    if (!open) return

    var currentTab by remember(open, initialTab) { mutableStateOf(initialTab) }
    var target by remember(open, date, mealTypeId) { mutableStateOf(LogTargetValue(date, mealTypeId)) }

    Sheet(open = open, title = "Add food", onClose = onClose) {
        LogTarget(value = target, s = s, onChange = { target = it })

        Spacer(Modifier.height(8.dp))
        IconTabs(
            value = currentTab,
            options = listOf(
                Triple("search", "Search", Icons.Filled.Search),
                Triple("describe", "Type or say", Icons.Filled.Mic),
                Triple("barcode", "Barcode", Icons.Filled.QrCodeScanner),
                Triple("recipes", "Meals", Icons.Filled.AutoAwesome),
                Triple("custom", "Custom", Icons.Filled.Edit)
            ),
            onChange = { currentTab = it }
        )

        Spacer(Modifier.height(8.dp))
        when (currentTab) {
            "search" -> SearchTab(s = s, target = target, onDone = onClose)
            "describe" -> DescribeTab(s = s, target = target, onDone = onClose)
            "barcode" -> BarcodeTab(s = s, target = target, onDone = onClose)
            "recipes" -> RecipeTab(s = s, target = target, nav = nav, onDone = onClose)
            "custom" -> CustomTab(s = s, target = target, onDone = onClose)
        }
    }
}

private suspend fun logFood(
    s: Store,
    f: Food,
    grams: Double,
    date: String,
    mealTypeId: String,
    source: String,
    label: String? = null
) {
    if (s.state.value.foods.none { it.id == f.id }) {
        s.save(Tables.foods, f)
    }
    val n = Calc.scaleFood(f, grams)
    s.save(
        Tables.foodLogs,
        FoodLog(
            id = uid(),
            date = date,
            meal_type_id = mealTypeId,
            food_id = f.id,
            name = f.name,
            qty = Calc.round1(grams),
            unit = normUnit(f.unit),
            source = source,
            serving_label = label,
            calories = n.calories,
            protein_g = n.protein_g,
            carbs_g = n.carbs_g,
            fat_g = n.fat_g
        )
    )
}

/**
 * Port of PortionPicker in src/screens/AddFood.tsx.
 */
@Composable
fun PortionPicker(
    food: Food,
    onAdd: suspend (grams: Double, label: String?) -> Unit,
    onBack: () -> Unit,
    /** When given, a home-cooked dish gets the oil/ghee question and its line is logged here. */
    oilTarget: Triple<Store, String, String>? = null,
) {
    val g = food.serving_g
    val label = food.serving_label ?: "1 serving"
    var mode by remember(food) { mutableStateOf(if (g != null && g > 0) "serving" else "grams") }
    var servings by remember(food) { mutableDoubleStateOf(1.0) }
    var gramsText by remember(food) { mutableStateOf((g ?: food.base).let { if (it % 1.0 == 0.0) it.toLong().toString() else it.toString() }) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    val totalGrams = if (mode == "serving" && g != null && g > 0) g * servings else gramsText.toDoubleOrNull() ?: 0.0
    val n = Calc.scaleFood(food, totalGrams)

    fun labelFor(x: Double): String {
        val regex = Regex("^(\\d+(?:\\.\\d+)?)\\s+(.*)$")
        val m = regex.find(label)
        return if (m != null) {
            val num = m.groupValues[1].toDoubleOrNull() ?: 1.0
            val rest = m.groupValues[2]
            "${Calc.round1(num * x)} $rest"
        } else {
            "${if (x % 1.0 == 0.0) x.toLong().toString() else x.toString()} × $label"
        }
    }

    val unitName = when (food.unit) {
        "100ml", "ml" -> "ml"
        "100g", "g" -> "g"
        else -> food.unit
    }
    val quickAmounts = if (unitName == "g" || unitName == "ml") listOf(50.0, 100.0, 150.0, 200.0, 250.0) else listOf(0.5, 1.0, 2.0, 3.0)

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Column {
            Text(food.name, fontSize = 17.sp, fontWeight = FontWeight.Bold, color = F.text)
            val sub = buildString {
                if (!food.state.isNullOrBlank()) append("${food.state} · ")
                if (!food.brand.isNullOrBlank()) append(food.brand)
            }
            if (sub.isNotBlank()) {
                Text(sub, fontFamily = Mono, fontSize = 12.sp, color = F.mute)
            }
        }

        if (g != null && g > 0) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Chip(text = "Servings", selected = mode == "serving", onClick = { mode = "serving" })
                Chip(text = if (unitName == "ml") "Millilitres" else if (unitName == "g") "Grams" else unitName, selected = mode == "grams", onClick = { mode = "grams" })
            }
        }

        if (mode == "serving" && g != null && g > 0) {
            Row(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(16.dp))
                    .background(F.raised)
                    .padding(12.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(
                    onClick = { servings = max(0.5, Calc.round1(servings - 0.5)) },
                    modifier = Modifier
                        .size(48.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(F.high)
                ) {
                    Text("−", fontSize = 24.sp, fontWeight = FontWeight.Bold, color = F.text)
                }

                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Figure(labelFor(servings), size = 22)
                    Text("≈ ${Math.round(g * servings)} $unitName", fontFamily = Mono, fontSize = 12.sp, color = F.mute)
                }

                IconButton(
                    onClick = { servings = minOf(20.0, Calc.round1(servings + 0.5)) },
                    modifier = Modifier
                        .size(48.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(F.high)
                ) {
                    Text("+", fontSize = 24.sp, fontWeight = FontWeight.Bold, color = F.text)
                }
            }
        } else {
            Field(label = "Amount ($unitName)") {
                Input(
                    value = gramsText,
                    onChange = { gramsText = it },
                    placeholder = "100",
                    number = true
                )
            }
            FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                quickAmounts.forEach { v ->
                    val txt = if (v % 1.0 == 0.0) "${v.toLong()} $unitName" else "$v $unitName"
                    Chip(text = txt, selected = false, onClick = {
                        gramsText = if (v % 1.0 == 0.0) v.toLong().toString() else v.toString()
                    })
                }
            }
        }

        MacroRow(n = n)

        val oil = oilTarget?.let { (st, _, _) -> rememberOilStep(st, listOf(OilFood(food.name, if (food.unit == "100g" || food.unit == "100ml") food.fat_g else null))) }
        oil?.let { OilQuestion(it) }

        val isValid = totalGrams > 0.0 && totalGrams <= 5000.0
        FButton(
            text = if (busy) "Adding…" else "Add to meal",
            modifier = Modifier.fillMaxWidth(),
            enabled = isValid && !busy,
            onClick = {
                busy = true
                scope.launch {
                    try {
                        val lbl = if (mode == "serving" && g != null && g > 0) labelFor(servings) else null
                        oilTarget?.let { (_, date, meal) -> oil?.save(date, meal) }
                        onAdd(Calc.round1(totalGrams), lbl)
                    } finally {
                        busy = false
                    }
                }
            }
        )

        FButton(
            text = "Back",
            modifier = Modifier.fillMaxWidth(),
            variant = Variant.Ghost,
            onClick = onBack
        )
    }
}

/**
 * Port of ReviewItems in src/screens/AddFood.tsx.
 */
@Composable
fun ReviewItems(
    items: List<Catalog.Grounded>,
    rejected: List<Ai.RejectedItem> = emptyList(),
    date: String,
    mealTypeId: String,
    source: String,
    s: Store,
    onCancel: () -> Unit,
    onDone: () -> Unit
) {
    data class ReviewRow(
        val item: Catalog.Grounded,
        var factor: Double,
        var customName: String? = null,
        var customKcal: Double? = null,
        var customP: Double? = null,
        var customC: Double? = null,
        var customF: Double? = null
    )

    var rows by remember(items) {
        mutableStateOf(items.map { ReviewRow(item = it, factor = 1.0) })
    }
    var editingIndex by remember { mutableStateOf<Int?>(null) }
    var busy by remember { mutableStateOf(false) }
    var target by remember { mutableStateOf(LogTargetValue(date, mealTypeId)) }
    val scope = rememberCoroutineScope()

    // Oil, ghee and tadka are the biggest blind spot in Indian food logging: ask once per meal (OilStep.kt).
    val oil = rememberOilStep(s, rows.map { r -> OilFood(r.customName ?: r.item.name, r.item.grams?.takeIf { it > 0 }?.let { r.item.fatG / it * 100 }) })
    val oilLine = oil.line
    val totalKcal = (oilLine?.calories ?: 0.0) + rows.sumOf { (it.customKcal ?: (it.item.calories * it.factor)) }
    val totalP = rows.sumOf { (it.customP ?: (it.item.proteinG * it.factor)) }
    val totalC = rows.sumOf { (it.customC ?: (it.item.carbsG * it.factor)) }
    val totalF = (oilLine?.grams ?: 0.0) + rows.sumOf { (it.customF ?: (it.item.fatG * it.factor)) }

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("We found ${rows.size} item${if (rows.size == 1) "" else "s"}", fontSize = 17.sp, fontWeight = FontWeight.Bold, color = F.text)
            Chip(text = if (rows.all { it.item.confidence == null && it.item.matched != null }) "FORGE database" else "AI estimate", selected = true, onClick = {})
        }

        if (rejected.isNotEmpty()) {
            Notice("Skipped: " + rejected.joinToString("; ") { "${it.name} — ${it.reason}" }, tone = Tone.Error)
        }
        Notice("Portions are estimated — adjust with − / + before logging.", tone = Tone.Warn)

        // No inner scroll box: the sheet scrolls, so the Total row never sits on top of a clipped item card.
        Column(
            Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            rows.forEachIndexed { i, r ->
                val name = r.customName ?: r.item.name
                val cal = r.customKcal ?: (r.item.calories * r.factor)
                val p = r.customP ?: (r.item.proteinG * r.factor)
                val c = r.customC ?: (r.item.carbsG * r.factor)
                val f = r.customF ?: (r.item.fatG * r.factor)

                Card(Modifier.fillMaxWidth()) {
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.Top
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(name, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, color = F.text)
                            val sub = buildString {
                                append(r.item.servingLabel ?: "${r.item.qty} ${r.item.unit}")
                                if (r.item.grams != null && r.item.grams > 0) append(" ≈ ${Math.round(r.item.grams * r.factor)} g")
                                if (r.item.matched != null) append(" · matched FORGE database")
                                if (r.item.confidence != null) append(" · ${(r.item.confidence * 100).roundToInt()}% sure")
                            }
                            Text(sub, fontFamily = Mono, fontSize = 12.sp, color = F.mute)
                        }
                        IconButton(
                            onClick = { rows = rows.filterIndexed { idx, _ -> idx != i } },
                            modifier = Modifier.size(28.dp)
                        ) {
                            Icon(Icons.Filled.Delete, contentDescription = "Remove $name", tint = F.danger, modifier = Modifier.size(18.dp))
                        }
                    }

                    Spacer(Modifier.height(8.dp))
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            IconButton(
                                onClick = {
                                    val nextFactor = max(0.25, Calc.round1(r.factor - 0.25))
                                    rows = rows.mapIndexed { idx, row -> if (idx == i) row.copy(factor = nextFactor) else row }
                                },
                                modifier = Modifier
                                    .size(44.dp)
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(F.high)
                            ) {
                                Text("−", fontWeight = FontWeight.Bold, color = F.text)
                            }

                            Text("×${r.factor}", fontFamily = Mono, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = F.text, modifier = Modifier.width(48.dp), textAlign = androidx.compose.ui.text.style.TextAlign.Center)

                            IconButton(
                                onClick = {
                                    val nextFactor = minOf(10.0, Calc.round1(r.factor + 0.25))
                                    rows = rows.mapIndexed { idx, row -> if (idx == i) row.copy(factor = nextFactor) else row }
                                },
                                modifier = Modifier
                                    .size(44.dp)
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(F.high)
                            ) {
                                Text("+", fontWeight = FontWeight.Bold, color = F.text)
                            }
                        }

                        Column(horizontalAlignment = Alignment.End) {
                            Text("${Math.round(cal)} kcal", fontFamily = Mono, fontWeight = FontWeight.Bold, fontSize = 12.sp, color = F.text)
                            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text("P ${Calc.round1(p)}", fontFamily = Mono, fontSize = 12.sp, color = F.protein)
                                Text("·", color = F.mute, fontSize = 12.sp)
                                Text("C ${Calc.round1(c)}", fontFamily = Mono, fontSize = 12.sp, color = F.carbs)
                                Text("·", color = F.mute, fontSize = 12.sp)
                                Text("F ${Calc.round1(f)}", fontFamily = Mono, fontSize = 12.sp, color = F.fat)
                            }
                        }
                    }

                    Text(
                        text = if (editingIndex == i) "Done editing" else "Edit name & numbers",
                        color = F.mute,
                        fontSize = 12.sp,
                        modifier = Modifier
                            .clickable { editingIndex = if (editingIndex == i) null else i }
                            .padding(top = 4.dp)
                    )

                    if (editingIndex == i) {
                        Spacer(Modifier.height(6.dp))
                        Input(
                            value = r.customName ?: r.item.name,
                            onChange = { v ->
                                rows = rows.mapIndexed { idx, row -> if (idx == i) row.copy(customName = v) else row }
                            },
                            placeholder = "Food name"
                        )
                        Spacer(Modifier.height(4.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            NumberInput(
                                value = cal,
                                onCommit = { v ->
                                    rows = rows.mapIndexed { idx, row -> if (idx == i) row.copy(customKcal = v ?: 0.0) else row }
                                },
                                modifier = Modifier.weight(1f),
                                placeholder = "kcal"
                            )
                            NumberInput(
                                value = p,
                                onCommit = { v ->
                                    rows = rows.mapIndexed { idx, row -> if (idx == i) row.copy(customP = v ?: 0.0) else row }
                                },
                                modifier = Modifier.weight(1f),
                                placeholder = "P"
                            )
                            NumberInput(
                                value = c,
                                onCommit = { v ->
                                    rows = rows.mapIndexed { idx, row -> if (idx == i) row.copy(customC = v ?: 0.0) else row }
                                },
                                modifier = Modifier.weight(1f),
                                placeholder = "C"
                            )
                            NumberInput(
                                value = f,
                                onCommit = { v ->
                                    rows = rows.mapIndexed { idx, row -> if (idx == i) row.copy(customF = v ?: 0.0) else row }
                                },
                                modifier = Modifier.weight(1f),
                                placeholder = "F"
                            )
                        }
                    }
                }
            }
        }

        // Total row
        Row(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(14.dp))
                .background(F.raised)
                .padding(12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Eyebrow("TOTAL")
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("${Math.round(totalKcal)} kcal", fontFamily = Mono, fontWeight = FontWeight.Bold, fontSize = 14.sp, color = F.text)
                Text("·", color = F.mute)
                Text("P ${Calc.round1(totalP)}", fontFamily = Mono, fontSize = 12.sp, color = F.protein)
                Text("·", color = F.mute)
                Text("C ${Calc.round1(totalC)}", fontFamily = Mono, fontSize = 12.sp, color = F.carbs)
                Text("·", color = F.mute)
                Text("F ${Calc.round1(totalF)}", fontFamily = Mono, fontSize = 12.sp, color = F.fat)
            }
        }

        OilQuestion(oil)

        LogTarget(value = target, s = s, onChange = { target = it })

        FButton(
            text = if (busy) "Saving…" else "Log ${rows.size} item${if (rows.size == 1) "" else "s"}${oilLine?.let { " + " + it.name.lowercase() } ?: ""}",
            modifier = Modifier.fillMaxWidth(),
            enabled = !busy && rows.isNotEmpty(),
            onClick = {
                busy = true
                scope.launch {
                    try {
                        rows.forEach { r ->
                            val foodName = (r.customName ?: r.item.name).take(80)
                            val finalGrams = if (r.item.grams != null && r.item.grams > 0) r.item.grams * r.factor else r.item.qty * r.factor
                            val cal = r.customKcal ?: (r.item.calories * r.factor)
                            val p = r.customP ?: (r.item.proteinG * r.factor)
                            val c = r.customC ?: (r.item.carbsG * r.factor)
                            val f = r.customF ?: (r.item.fatG * r.factor)
                            val unitStr = if (r.item.grams != null && r.item.grams > 0) "g" else normUnit(r.item.unit)

                            s.save(
                                Tables.foodLogs,
                                FoodLog(
                                    id = uid(),
                                    date = target.date,
                                    meal_type_id = target.mealTypeId,
                                    food_id = r.item.matched?.first,
                                    name = foodName,
                                    qty = Calc.round1(finalGrams),
                                    unit = unitStr,
                                    source = source,
                                    serving_label = r.item.servingLabel,
                                    calories = Calc.round1(cal),
                                    protein_g = Calc.round1(p),
                                    carbs_g = Calc.round1(c),
                                    fat_g = Calc.round1(f)
                                )
                            )
                        }
                        oil.save(target.date, target.mealTypeId)
                        onDone()
                    } finally {
                        busy = false
                    }
                }
            }
        )

        FButton(
            text = "Cancel",
            modifier = Modifier.fillMaxWidth(),
            variant = Variant.Ghost,
            onClick = onCancel
        )
    }
}

@Composable
private fun SearchTab(
    s: Store,
    target: LogTargetValue,
    onDone: () -> Unit
) {
    var q by remember { mutableStateOf("") }
    var selectedRegion by remember { mutableStateOf<String?>(null) }
    var pickedFood by remember { mutableStateOf<Food?>(null) }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var catalog by remember { mutableStateOf<List<Catalog.CatalogFood>?>(null) }
    var catalogError by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        try {
            catalog = Catalog.loadCatalog(context)
        } catch (e: Exception) {
            catalogError = true
        }
    }

    val st by s.state.collectAsStateWithLifecycle()

    val recentFoods = remember(st.foodLogs, st.foods) {
        val seen = mutableSetOf<String>()
        val out = mutableListOf<Food>()
        st.foodLogs.sortedByDescending { it.date }.forEach { log ->
            val food = st.foods.find { it.id == log.food_id }
            if (food != null && !seen.contains(food.id)) {
                seen.add(food.id)
                out.add(food)
                if (out.size >= 10) return@forEach
            }
        }
        out
    }

    val results = remember(q, selectedRegion, st.foods, catalog) {
        if (!selectedRegion.isNullOrBlank() && catalog != null && q.isBlank()) {
            Catalog.byRegion(catalog!!, selectedRegion!!).map { Catalog.toFoodRow(it) }
        } else if (q.isBlank()) {
            emptyList()
        } else {
            val queryTrimmed = q.trim().lowercase()
            val mine = st.foods.filter { it.custom == true && it.name.lowercase().contains(queryTrimmed) }
            val fromCat = catalog?.let { Catalog.searchFoods(it, q, 60) }?.map { Catalog.toFoodRow(it) } ?: emptyList()
            val seen = mine.map { it.name.lowercase() }.toSet()
            (mine + fromCat.filter { !seen.contains(it.name.lowercase()) }).take(60)
        }
    }

    if (pickedFood != null) {
        PortionPicker(
            food = pickedFood!!,
            onBack = { pickedFood = null },
            oilTarget = Triple(s, target.date, target.mealTypeId),
            onAdd = { grams, label ->
                logFood(s, pickedFood!!, grams, target.date, target.mealTypeId, "search", label)
                onDone()
            }
        )
        return
    }

    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Input(
            value = q,
            onChange = { q = it },
            placeholder = "Vada pav, dal makhani, paneer…"
        )

        if (catalog == null && !catalogError) {
            Spinner("Loading 16,000 foods")
        }
        if (catalogError) {
            Notice("Could not load the food database. Your own foods still work.", tone = Tone.Warn)
        }

        if (q.isBlank()) {
            if (recentFoods.isNotEmpty() && selectedRegion == null) {
                Eyebrow("Recent")
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    recentFoods.forEach { f ->
                        FoodRowItem(food = f, onPick = { pickedFood = it })
                    }
                }
            }

            Eyebrow("Browse by state")
            Row(
                Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Catalog.REGIONS.forEach { reg ->
                    Chip(
                        text = reg,
                        selected = selectedRegion == reg,
                        onClick = { selectedRegion = if (selectedRegion == reg) null else reg }
                    )
                }
            }
        }

        Column(
            Modifier
                .fillMaxWidth()
                .heightIn(max = 300.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            if (catalog != null && q.isNotBlank() && results.isEmpty()) {
                Text("No matches. Try “Type or say”, or add it under “Custom”.", fontSize = 13.sp, color = F.mute)
            }
            results.forEach { f ->
                FoodRowItem(food = f, onPick = { pickedFood = it })
            }
        }
    }
}

@Composable
private fun FoodRowItem(food: Food, onPick: (Food) -> Unit) {
    val g = food.serving_g
    val perServing = if (g != null && g > 0) Calc.scaleFood(food, g) else null

    Card(
        onClick = { onPick(food) },
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(Modifier.weight(1f)) {
                Text(food.name, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = F.text)
                val sub = if (perServing != null && g != null) {
                    "${Math.round(perServing.calories)} kcal · ${food.serving_label ?: "1 serving"} (${Math.round(g)} g) · P${Math.round(perServing.protein_g)}"
                } else {
                    "${Math.round(food.calories)} kcal / ${Math.round(food.base)}${unitShort(food.unit)} · P${Calc.round1(food.protein_g)}"
                }
                Text(sub, fontFamily = Mono, fontSize = 12.sp, color = F.mute)
            }

            val badge = if (food.custom == true) "Mine"
            else if (!food.state.isNullOrBlank()) food.state!!.split(" ").mapNotNull { it.firstOrNull() }.joinToString("")
            else if (food.category == "Dish") "Dish"
            else ""

            if (badge.isNotBlank()) {
                Text(app.forge.fitness.ui.sentence(badge.uppercase()), fontSize = 12.sp, color = F.accent, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

@Composable
private fun DescribeTab(
    s: Store,
    target: LogTargetValue,
    onDone: () -> Unit
) {
    var text by remember { mutableStateOf("") }
    var items by remember { mutableStateOf<List<Catalog.Grounded>?>(null) }
    var rejected by remember { mutableStateOf<List<Ai.RejectedItem>>(emptyList()) }
    var busy by remember { mutableStateOf(false) }
    var err by remember { mutableStateOf<String?>(null) }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    // Instant and offline: what the local Hinglish parser understands, refreshed shortly after typing stops.
    var cat by remember { mutableStateOf<List<Catalog.CatalogFood>?>(null) }
    LaunchedEffect(Unit) { cat = runCatching { Catalog.loadCatalog(context) }.getOrNull() }
    val hinglish = remember { app.forge.fitness.logic.Hinglish(app.forge.fitness.logic.Portions.get(context)) }
    var local by remember { mutableStateOf<app.forge.fitness.logic.Hinglish.Result?>(null) }
    LaunchedEffect(text, cat) {
        val c = cat
        if (c == null || text.trim().length < 2) { local = null; return@LaunchedEffect }
        kotlinx.coroutines.delay(250)
        local = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.Default) { hinglish.parse(c, text) }
    }
    var usedAi by remember { mutableStateOf(false) }

    fun analyse() {
        if (text.trim().length < 2 || busy) return
        busy = true; err = null
        scope.launch {
            try {
                val c = cat ?: runCatching { Catalog.loadCatalog(context) }.getOrNull()
                val found = if (c != null) kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.Default) { hinglish.parse(c, text) }
                    else app.forge.fitness.logic.Hinglish.Result(emptyList(), listOf(text))
                fun why(t: String) = if (t in found.tooLarge) "that amount looks too large, check it" else if (s.localMode) "not recognised offline" else "the AI could not read it just now"
                // Every phrase matched exactly: no AI, no wait.
                if (found.unmatched.isEmpty() && found.partial.isEmpty() && found.items.isNotEmpty()) { usedAi = false; items = found.items; rejected = emptyList(); return@launch }
                if (s.localMode) {
                    if (found.items.isEmpty()) err = "Couldn't match those foods. Try simpler names, or use Search."
                    else { usedAi = false; items = found.items; rejected = found.unmatched.map { Ai.RejectedItem(it, why(it)) } }
                    return@launch
                }
                // Anything unclear: the AI reads the WHOLE meal, because words like "with butter a lot" or "restaurant style"
                // change the other items. Its answer is then grounded to the catalog.
                val out = try { Ai.parseFoodText(s.api, text) } catch (e: Exception) {
                    // Say WHY the AI failed (offline, slow, quota, signed out...) instead of hiding it behind the offline guess.
                    val reason = (e as? app.forge.fitness.data.ApiError)?.message ?: "the AI could not be reached (${e.javaClass.simpleName})."
                    if (found.items.isNotEmpty()) { usedAi = false; items = found.items; rejected = listOf(Ai.RejectedItem("AI", "$reason Showing the offline guess.")) + found.unmatched.map { Ai.RejectedItem(it, why(it)) }; return@launch }
                    throw e
                }
                val got = out.items.map { rawItem ->
                    val g = Catalog.Grounded(name = rawItem.name, qty = rawItem.qty, unit = rawItem.unit, grams = rawItem.grams,
                        servingLabel = rawItem.servingLabel, calories = rawItem.calories, proteinG = rawItem.proteinG,
                        carbsG = rawItem.carbsG, fatG = rawItem.fatG, confidence = rawItem.confidence, matched = null)
                    if (c != null) Catalog.groundItem(c, g) else g
                }
                if (got.isEmpty()) err = "No foods recognised. Name the foods, or use Search."
                else { usedAi = true; items = got; rejected = out.rejected ?: emptyList() }
            } catch (e: Exception) {
                err = e.message ?: "Could not analyse that. Enter it manually."
            } finally { busy = false }
        }
    }

    if (items != null) {
        ReviewItems(
            items = items!!,
            rejected = rejected,
            date = target.date,
            mealTypeId = target.mealTypeId,
            source = if (usedAi) "ai_text" else "search",
            s = s,
            onCancel = { items = null },
            onDone = onDone
        )
        return
    }

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Field(
            label = "What did you eat?",
            hint = "Type it like you'd say it: “2 roti, 1 katori dal, thoda ghee, chai”. No quantity = one normal serving."
        ) {
            OutlinedTextField(
                value = text,
                onValueChange = { if (it.length <= 500) text = it },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(96.dp),
                placeholder = { Text("2 roti, 1 katori dal, thoda ghee, chai", color = F.mute) },
                shape = RoundedCornerShape(14.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = F.accent,
                    unfocusedBorderColor = F.line,
                    focusedContainerColor = F.surface,
                    unfocusedContainerColor = F.surface,
                    focusedTextColor = F.text,
                    unfocusedTextColor = F.text
                )
            )
        }

        // Live preview of what was understood without AI; leftover words are listed so the user knows what goes to the AI.
        local?.let { r ->
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                r.items.forEach { i ->
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("${i.name} · ${i.servingLabel ?: ""}", fontFamily = Mono, fontSize = 12.sp, color = F.text, maxLines = 1, modifier = Modifier.weight(1f))
                        Text("${i.calories.toInt()} kcal", fontFamily = Mono, fontSize = 12.sp, color = F.text)
                    }
                }
                if (r.unmatched.isNotEmpty() || r.partial.isNotEmpty()) Body(
                    if (s.localMode) "Not found offline: ${r.unmatched.joinToString(", ")}"
                    else "Unclear: ${(r.unmatched + r.partial).joinToString(", ")}. The AI will read the whole meal.", F.mute, 12)
            }
        }

        // Speak instead of typing: Android's own speech recogniser. Indian English is the default (it handles
        // Hinglish like "do roti"); in the Hindi/Marathi app a Hindi option is offered too.
        var hindiVoice by remember { mutableStateOf(false) }
        var voiceSeen by remember { mutableStateOf(s.flag(app.forge.fitness.logic.Privacy.VOICE_SEEN)) }
        val speak = androidx.activity.compose.rememberLauncherForActivityResult(
            androidx.activity.result.contract.ActivityResultContracts.StartActivityForResult()) { r ->
            val said = r.data?.getStringArrayListExtra(android.speech.RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()
            if (!said.isNullOrBlank()) text = if (text.isBlank()) said else "${text.trim()}, $said"
        }
        if (app.forge.fitness.ui.I18n.lang == "hi" || app.forge.fitness.ui.I18n.lang == "mr") {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Chip("Voice: Hinglish", !hindiVoice, Modifier.weight(1f)) { hindiVoice = false }
                Chip("Voice: हिन्दी", hindiVoice, Modifier.weight(1f)) { hindiVoice = true }
            }
        }
        FButton("Speak your meal", Modifier.fillMaxWidth(), Variant.Quiet) {
            s.setFlag(app.forge.fitness.logic.Privacy.VOICE_SEEN); voiceSeen = true
            val i = android.content.Intent(android.speech.RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                .putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE_MODEL, android.speech.RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                .putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE, if (hindiVoice) "hi-IN" else "en-IN")
                .putExtra(android.speech.RecognizerIntent.EXTRA_PROMPT, "Say what you ate, e.g. \"do roti aur ek katori dal\"")
            try { speak.launch(i) } catch (e: android.content.ActivityNotFoundException) {
                err = "This phone has no speech recogniser. Install or enable the Google app, or type instead."
            }
        }
        if (!voiceSeen) Body(app.forge.fitness.logic.Privacy.VOICE, F.mute, 12)

        if (s.state.collectAsStateWithLifecycle().value.localMode) {
            Notice("No account, so FORGE matches words to its food list without AI. Check amounts before saving.", tone = Tone.Info)
        }

        if (err != null) {
            Notice(err!!, tone = Tone.Error)
        }

        if (busy) {
            Spinner("Reading your meal")
        } else {
            FButton(
                text = if (local?.let { it.unmatched.isEmpty() && it.partial.isEmpty() && it.items.isNotEmpty() } == true || s.localMode) "Review and log" else "Analyse",
                modifier = Modifier.fillMaxWidth(),
                enabled = text.trim().length >= 2 && !busy,
                onClick = { analyse() }
            )
        }
    }
}

@Composable
private fun BarcodeTab(
    s: Store,
    target: LogTargetValue,
    onDone: () -> Unit
) {
    var code by remember { mutableStateOf("") }
    var food by remember { mutableStateOf<Food?>(null) }
    var busy by remember { mutableStateOf(false) }
    var err by remember { mutableStateOf<String?>(null) }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    fun find(c: String) {
        busy = true
        err = null
        scope.launch {
            try {
                val f = Barcode.lookupBarcode(c)
                if (f != null) {
                    food = f
                } else {
                    err = "Product not found in Open Food Facts. Add it under “Custom”."
                }
            } catch (e: Exception) {
                err = "Lookup failed. Check your connection."
            } finally {
                busy = false
            }
        }
    }

    fun startLiveScanner() {
        err = null
        try {
            val options = GmsBarcodeScannerOptions.Builder()
                .setBarcodeFormats(
                    MlBarcode.FORMAT_EAN_13,
                    MlBarcode.FORMAT_EAN_8,
                    MlBarcode.FORMAT_UPC_A,
                    MlBarcode.FORMAT_UPC_E
                )
                .build()
            val scanner = GmsBarcodeScanning.getClient(context, options)
            scanner.startScan()
                .addOnSuccessListener { barcode ->
                    val raw = barcode.rawValue
                    if (!raw.isNullOrBlank()) {
                        code = raw
                        find(raw)
                    }
                }
                .addOnFailureListener { e ->
                    err = "Scanner failed: ${e.message}"
                }
        } catch (e: Exception) {
            err = "Code scanner unavailable. Type the barcode number below."
        }
    }

    if (food != null) {
        PortionPicker(
            food = food!!,
            onBack = { food = null },
            onAdd = { grams, label ->
                logFood(s, food!!, grams, target.date, target.mealTypeId, "barcode", label)
                onDone()
            }
        )
        return
    }

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        FButton(
            text = "Scan barcode",
            modifier = Modifier.fillMaxWidth(),
            onClick = { startLiveScanner() }
        )

        Field(label = "Barcode number") {
            Input(
                value = code,
                onChange = { code = it.filter { ch -> ch.isDigit() } },
                placeholder = "8901234567890",
                number = true
            )
        }

        if (err != null) {
            Notice(err!!, tone = Tone.Error)
        }

        FButton(
            text = if (busy) "Looking up…" else "Look up",
            modifier = Modifier.fillMaxWidth(),
            variant = Variant.Quiet,
            enabled = !busy && code.length >= 8,
            onClick = { find(code) }
        )
    }
}

@Composable
private fun RecipeTab(
    s: Store,
    target: LogTargetValue,
    nav: NavController?,
    onDone: () -> Unit
) {
    val st by s.state.collectAsStateWithLifecycle()
    var busy by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    val logged = st.foodLogs.filter { it.date == target.date && it.meal_type_id == target.mealTypeId }
    val yesterdayDate = Calc.addDays(target.date, -1)
    val yesterdayLogs = st.foodLogs.filter { it.date == yesterdayDate && it.meal_type_id == target.mealTypeId }

    Column(
        Modifier
            .fillMaxWidth()
            .heightIn(max = 420.dp)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        if (yesterdayLogs.isNotEmpty()) {
            FButton(
                text = "Copy this meal from the day before (${yesterdayLogs.size} items)",
                modifier = Modifier.fillMaxWidth(),
                variant = Variant.Quiet,
                enabled = busy != "copy",
                onClick = {
                    busy = "copy"
                    scope.launch {
                        try {
                            yesterdayLogs.forEach { l ->
                                s.save(Tables.foodLogs, l.copy(id = uid(), date = target.date, source = "copy", created_at = null))
                            }
                            onDone()
                        } finally {
                            busy = null
                        }
                    }
                }
            )
        }

        FButton(
            text = "+ New quick meal",
            modifier = Modifier.fillMaxWidth(),
            variant = Variant.Quiet,
            onClick = {
                nav?.navigate("more/recipes")
                onDone()
            }
        )

        if (logged.isNotEmpty()) {
            FButton(
                text = "Save this meal as a quick meal",
                modifier = Modifier.fillMaxWidth(),
                variant = Variant.Ghost,
                onClick = {
                    scope.launch {
                        val ingredients = mutableListOf<RecipeIngredient>()
                        logged.forEach { l ->
                            var foodId = l.food_id
                            if (foodId == null || st.foods.none { it.id == foodId }) {
                                foodId = uid()
                                s.save(
                                    Tables.foods,
                                    Food(
                                        id = foodId,
                                        name = l.name,
                                        unit = l.unit,
                                        base = l.qty,
                                        calories = l.calories,
                                        protein_g = l.protein_g,
                                        carbs_g = l.carbs_g,
                                        fat_g = l.fat_g,
                                        custom = true,
                                        category = "Custom"
                                    )
                                )
                            }
                            ingredients.add(RecipeIngredient(food_id = foodId, qty = l.qty))
                        }
                        val mealName = st.mealTypes.find { it.id == target.mealTypeId }?.name ?: "Meal"
                        s.save(Tables.recipes, Recipe(id = uid(), name = "$mealName — ${target.date}", ingredients = ingredients))
                        onDone()
                    }
                }
            )
        }

        if (st.recipes.isEmpty()) {
            Text("No saved quick meals yet.", fontSize = 13.sp, color = F.mute)
        }

        st.recipes.forEach { r ->
            val parts = r.ingredients.mapNotNull { ing ->
                val food = st.foods.find { it.id == ing.food_id }
                if (food != null) Triple(food, ing.qty, Calc.scaleFood(food, ing.qty)) else null
            }
            val tot = parts.fold(Calc.Totals()) { acc, (_, _, n) -> acc + n }

            Card(Modifier.fillMaxWidth()) {
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(r.name, fontSize = 15.sp, fontWeight = FontWeight.Bold, color = F.text)
                    Text("${Math.round(tot.calories)} kcal", fontFamily = Mono, fontWeight = FontWeight.Bold, fontSize = 12.sp, color = F.text)
                }
                Spacer(Modifier.height(4.dp))
                val summary = parts.joinToString(" · ") { (f, q, _) -> "${f.name} $q${unitShort(f.unit)}" }
                Text(summary, fontSize = 12.sp, color = F.mute)
                Spacer(Modifier.height(2.dp))
                Text("P ${Calc.round1(tot.protein_g)}g · C ${Calc.round1(tot.carbs_g)}g · F ${Calc.round1(tot.fat_g)}g", fontFamily = Mono, fontSize = 12.sp, color = F.dim)
                Spacer(Modifier.height(10.dp))
                FButton(
                    text = if (busy == r.id) "Adding…" else "Add all",
                    modifier = Modifier.fillMaxWidth(),
                    enabled = busy != r.id,
                    onClick = {
                        busy = r.id
                        scope.launch {
                            try {
                                parts.forEach { (food, qty, scaled) ->
                                    s.save(
                                        Tables.foodLogs,
                                        FoodLog(
                                            id = uid(),
                                            date = target.date,
                                            meal_type_id = target.mealTypeId,
                                            food_id = food.id,
                                            name = food.name,
                                            qty = qty,
                                            unit = normUnit(food.unit),
                                            source = "recipe",
                                            calories = scaled.calories,
                                            protein_g = scaled.protein_g,
                                            carbs_g = scaled.carbs_g,
                                            fat_g = scaled.fat_g
                                        )
                                    )
                                }
                                onDone()
                            } finally {
                                busy = null
                            }
                        }
                    }
                )
            }
        }
    }
}

@Composable
private fun CustomTab(
    s: Store,
    target: LogTargetValue,
    onDone: () -> Unit
) {
    var name by remember { mutableStateOf("") }
    var brand by remember { mutableStateOf("") }
    var unit by remember { mutableStateOf("g") }
    var base by remember { mutableDoubleStateOf(100.0) }
    var calories by remember { mutableDoubleStateOf(0.0) }
    var protein by remember { mutableDoubleStateOf(0.0) }
    var carbs by remember { mutableDoubleStateOf(0.0) }
    var fat by remember { mutableDoubleStateOf(0.0) }
    var saveToDb by remember { mutableStateOf(true) }
    val scope = rememberCoroutineScope()

    val macroKcal = 4 * protein + 4 * carbs + 9 * fat
    val mismatch = calories > 0 && abs(macroKcal - calories) > max(30.0, calories * 0.3)

    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Field(label = "Name") {
            Input(value = name, onChange = { if (it.length <= 80) name = it }, placeholder = "Mom's rajma")
        }

        Field(label = "Brand (optional)") {
            Input(value = brand, onChange = { if (it.length <= 40) brand = it }, placeholder = "Homemade")
        }

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Column(Modifier.weight(1f)) {
                Field(label = "Per amount") {
                    NumberInput(value = base, onCommit = { base = it ?: 100.0 }, placeholder = "100")
                }
            }
            Column(Modifier.weight(1f)) {
                Field(label = "Unit") {
                    FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        UNITS.forEach { u ->
                            Chip(text = u, selected = unit == u, onClick = { unit = u })
                        }
                    }
                }
            }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Column(Modifier.weight(1f)) {
                Field(label = "kcal") {
                    NumberInput(value = calories, onCommit = { calories = it ?: 0.0 }, placeholder = "0")
                }
            }
            Column(Modifier.weight(1f)) {
                Field(label = "P") {
                    NumberInput(value = protein, onCommit = { protein = it ?: 0.0 }, placeholder = "0")
                }
            }
            Column(Modifier.weight(1f)) {
                Field(label = "C") {
                    NumberInput(value = carbs, onCommit = { carbs = it ?: 0.0 }, placeholder = "0")
                }
            }
            Column(Modifier.weight(1f)) {
                Field(label = "F") {
                    NumberInput(value = fat, onCommit = { fat = it ?: 0.0 }, placeholder = "0")
                }
            }
        }

        if (mismatch) {
            Notice("Macros add up to ${Math.round(macroKcal)} kcal, not ${Math.round(calories)}. Double-check the label.", tone = Tone.Warn)
        }

        Row(
            Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Checkbox(
                checked = saveToDb,
                onCheckedChange = { saveToDb = it },
                colors = CheckboxDefaults.colors(checkedColor = F.accent, checkmarkColor = F.accentInk)
            )
            Text("Save to my foods", fontSize = 13.sp, color = F.text)
        }

        val isValid = name.isNotBlank() && base > 0 && calories >= 0 && calories <= 5000
        FButton(
            text = "Add to meal",
            modifier = Modifier.fillMaxWidth(),
            enabled = isValid,
            onClick = {
                scope.launch {
                    val foodId = uid()
                    val f = Food(
                        id = foodId,
                        name = name.trim(),
                        brand = brand.trim().ifBlank { null },
                        unit = unit,
                        base = base,
                        calories = calories,
                        protein_g = protein,
                        carbs_g = carbs,
                        fat_g = fat,
                        custom = true,
                        category = "Custom"
                    )
                    if (saveToDb) {
                        s.save(Tables.foods, f)
                    }
                    s.save(
                        Tables.foodLogs,
                        FoodLog(
                            id = uid(),
                            date = target.date,
                            meal_type_id = target.mealTypeId,
                            food_id = if (saveToDb) foodId else null,
                            name = f.name,
                            qty = f.base,
                            unit = normUnit(f.unit),
                            source = "manual",
                            calories = f.calories,
                            protein_g = f.protein_g,
                            carbs_g = f.carbs_g,
                            fat_g = f.fat_g
                        )
                    )
                    onDone()
                }
            }
        )
    }
}

@Composable
private fun MacroRow(n: Calc.Totals) {
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(F.raised)
            .padding(12.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.weight(1f)) {
            Eyebrow("KCAL")
            Figure("${Math.round(n.calories)}", size = 17, color = F.text)
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.weight(1f)) {
            Eyebrow("PROTEIN")
            Figure("${Calc.round1(n.protein_g)}", size = 17, color = F.protein)
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.weight(1f)) {
            Eyebrow("CARBS")
            Figure("${Calc.round1(n.carbs_g)}", size = 17, color = F.carbs)
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.weight(1f)) {
            Eyebrow("FAT")
            Figure("${Calc.round1(n.fat_g)}", size = 17, color = F.fat)
        }
    }
}
