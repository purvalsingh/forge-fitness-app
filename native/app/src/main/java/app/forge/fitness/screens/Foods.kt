@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
package app.forge.fitness.screens

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import app.forge.fitness.ui.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import app.forge.fitness.data.Food
import app.forge.fitness.data.Store
import app.forge.fitness.data.Tables
import app.forge.fitness.data.uid
import app.forge.fitness.logic.Calc
import app.forge.fitness.logic.Catalog
import app.forge.fitness.ui.*
import kotlinx.coroutines.launch

@Composable
fun FoodsScreen(s: Store, nav: NavController) {
    val context = LocalContext.current
    val st by s.state.collectAsStateWithLifecycle()
    var q by remember { mutableStateOf("") }
    var editingFood by remember { mutableStateOf<Food?>(null) }
    var catalog by remember { mutableStateOf<List<Catalog.CatalogFood>?>(null) }

    LaunchedEffect(Unit) {
        catalog = runCatching { Catalog.loadCatalog(context) }.getOrDefault(emptyList())
    }

    val list = remember(q, st.foods, catalog) {
        val query = q.trim().lowercase()
        val mine = st.foods
            .filter { query.isBlank() || it.name.lowercase().contains(query) }
            .sortedWith(compareByDescending<Food> { it.custom == true }.thenBy { it.name })

        if (catalog == null) mine
        else {
            val seen = mine.map { it.name.lowercase() }.toSet()
            val fromCat = Catalog.searchFoods(catalog!!, q, 80)
                .filter { !seen.contains(it.name.lowercase()) }
                .map { Catalog.toFoodRow(it) }
            mine + fromCat
        }
    }

    fun blankFood() = Food(
        id = uid(),
        name = "",
        unit = "100g",
        base = 100.0,
        calories = 0.0,
        protein_g = 0.0,
        carbs_g = 0.0,
        fat_g = 0.0,
        custom = true,
        category = "Custom"
    )

    val countSubtitle = if (catalog != null) "%,d foods".format(st.foods.size + catalog!!.size)
    else "${st.foods.size} foods"

    Screen(
        title = "Food database",
        sub = countSubtitle,
        back = { nav.popBackStack() },
        right = {
            IconButton(
                onClick = { editingFood = blankFood() },
                modifier = Modifier
                    .clip(CircleShape)
            ) {
                Icon(Icons.Filled.Add, contentDescription = "Add food", tint = F.text)
            }
        }
    ) {
        Input(
            value = q,
            onChange = { q = it },
            placeholder = "Search foods and dishes"
        )

        if (catalog == null) {
            Spinner("Loading food database")
        }

        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            list.forEach { food ->
                Card(
                    onClick = { editingFood = food },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(Modifier.weight(1f)) {
                            val displayName = buildString {
                                append(food.name)
                                if (!food.brand.isNullOrBlank()) append(" · ${food.brand}")
                            }
                            Text(displayName, fontSize = 14.sp, fontWeight = FontWeight.Bold, color = F.text)
                            Spacer(Modifier.height(2.dp))
                            val macroText = "${Math.round(food.calories)} kcal / ${Math.round(food.base)} ${food.unit} · P${Calc.round1(food.protein_g)} C${Calc.round1(food.carbs_g)} F${Calc.round1(food.fat_g)}"
                            Text(macroText, fontFamily = Mono, fontSize = 12.sp, color = F.mute)
                        }

                        val badge = if (food.custom == true) "Custom" else food.category ?: ""
                        if (badge.isNotBlank()) {
                            Eyebrow(badge)
                        }
                    }
                }
            }
        }

        if (catalog != null && catalog!!.isNotEmpty()) {
            Notice("Built-in foods come from USDA FoodData Central (public domain). Dishes marked as estimates are computed from their ingredients — edit any of them into your own copy if your recipe differs.")
        }

        if (editingFood != null) {
            FoodSheet(
                food = editingFood!!,
                s = s,
                onClose = { editingFood = null }
            )
        }
    }
}

@Composable
private fun FoodSheet(food: Food, s: Store, onClose: () -> Unit) {
    val st by s.state.collectAsStateWithLifecycle()
    val exists = remember(food.id) { st.foods.any { it.id == food.id } }
    val scope = rememberCoroutineScope()

    var name by remember(food) { mutableStateOf(food.name) }
    var brand by remember(food) { mutableStateOf(food.brand ?: "") }
    var category by remember(food) { mutableStateOf(food.category ?: "") }
    var unit by remember(food) { mutableStateOf(food.unit) }
    var base by remember(food) { mutableDoubleStateOf(food.base) }
    var calories by remember(food) { mutableDoubleStateOf(food.calories) }
    var protein by remember(food) { mutableDoubleStateOf(food.protein_g) }
    var carbs by remember(food) { mutableDoubleStateOf(food.carbs_g) }
    var fat by remember(food) { mutableDoubleStateOf(food.fat_g) }
    var fiber by remember(food) { mutableStateOf(food.fiber_g) }
    var sugar by remember(food) { mutableStateOf(food.sugar_g) }
    var sodium by remember(food) { mutableStateOf(food.sodium_mg) }

    Sheet(
        open = true,
        title = if (exists) "Edit food" else "New food",
        onClose = onClose
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Field(label = "Name") {
                Input(value = name, onChange = { name = it })
            }

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Column(Modifier.weight(1f)) {
                    Field(label = "Brand") {
                        Input(value = brand, onChange = { brand = it })
                    }
                }
                Column(Modifier.weight(1f)) {
                    Field(label = "Category") {
                        Input(value = category, onChange = { category = it })
                    }
                }
            }

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Column(Modifier.weight(1f)) {
                    Field(label = "Per amount") {
                        NumberInput(value = base, onCommit = { base = it ?: 100.0 })
                    }
                }
                Column(Modifier.weight(1f)) {
                    Field(label = "Unit") {
                        FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            listOf("100g", "100ml", "g", "ml", "serving", "piece", "slice", "cup", "tbsp", "tsp", "scoop").forEach { u ->
                                Chip(text = u, selected = unit == u, onClick = { unit = u })
                            }
                        }
                    }
                }
            }

            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Column(Modifier.weight(1f)) {
                    Field(label = "kcal") {
                        NumberInput(value = calories, onCommit = { calories = it ?: 0.0 })
                    }
                }
                Column(Modifier.weight(1f)) {
                    Field(label = "P") {
                        NumberInput(value = protein, onCommit = { protein = it ?: 0.0 })
                    }
                }
                Column(Modifier.weight(1f)) {
                    Field(label = "C") {
                        NumberInput(value = carbs, onCommit = { carbs = it ?: 0.0 })
                    }
                }
                Column(Modifier.weight(1f)) {
                    Field(label = "F") {
                        NumberInput(value = fat, onCommit = { fat = it ?: 0.0 })
                    }
                }
            }

            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Column(Modifier.weight(1f)) {
                    Field(label = "Fiber") {
                        NumberInput(value = fiber, onCommit = { fiber = it })
                    }
                }
                Column(Modifier.weight(1f)) {
                    Field(label = "Sugar") {
                        NumberInput(value = sugar, onCommit = { sugar = it })
                    }
                }
                Column(Modifier.weight(1f)) {
                    Field(label = "Sodium (mg)") {
                        NumberInput(value = sodium, onCommit = { sodium = it })
                    }
                }
            }

            FButton(
                text = "Save food",
                modifier = Modifier.fillMaxWidth(),
                enabled = name.isNotBlank() && base > 0,
                onClick = {
                    scope.launch {
                        val updated = food.copy(
                            name = name.trim(),
                            brand = brand.trim().ifBlank { null },
                            category = category.trim().ifBlank { null },
                            unit = unit,
                            base = base,
                            calories = calories,
                            protein_g = protein,
                            carbs_g = carbs,
                            fat_g = fat,
                            fiber_g = fiber,
                            sugar_g = sugar,
                            sodium_mg = sodium,
                            custom = true
                        )
                        s.save(Tables.foods, updated)
                        onClose()
                    }
                }
            )

            if (exists) {
                FButton(
                    text = "Delete food",
                    modifier = Modifier.fillMaxWidth(),
                    variant = Variant.Danger,
                    onClick = {
                        scope.launch {
                            s.del(Tables.foods, food.id)
                            onClose()
                        }
                    }
                )
            }
        }
    }
}
