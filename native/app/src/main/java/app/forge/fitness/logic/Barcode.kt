package app.forge.fitness.logic

import app.forge.fitness.data.Food
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.*
import okhttp3.OkHttpClient
import okhttp3.Request
import kotlin.math.round

/** Look up a packaged product on Open Food Facts (ODbL, free). Port of src/lib/barcode.ts with OkHttp. */
object Barcode {
    private val client = OkHttpClient()
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    suspend fun lookupBarcode(code: String): Food? = withContext(Dispatchers.IO) {
        val clean = code.filter { it.isDigit() }
        if (clean.length < 8 || clean.length > 14) return@withContext null
        val url = "https://world.openfoodfacts.org/api/v2/product/$clean.json?fields=product_name,brands,nutriments,serving_quantity,serving_size"
        val req = Request.Builder()
            .url(url)
            .header("User-Agent", "FORGE-Fitness/3.0.0 (Android)")
            .build()
        try {
            client.newCall(req).execute().use { response ->
                if (!response.isSuccessful) return@withContext null
                val bodyStr = response.body?.string() ?: return@withContext null
                val j = json.parseToJsonElement(bodyStr).jsonObject
                val status = j["status"]?.jsonPrimitive?.intOrNull ?: 0
                if (status != 1) return@withContext null
                val p = j["product"]?.jsonObject ?: return@withContext null
                val n = p["nutriments"]?.jsonObject ?: return@withContext null
                val name = p["product_name"]?.jsonPrimitive?.contentOrNull?.take(80) ?: return@withContext null
                if (name.isBlank()) return@withContext null

                fun num(element: JsonElement?): Double {
                    if (element == null) return 0.0
                    return element.jsonPrimitive.doubleOrNull ?: element.jsonPrimitive.contentOrNull?.toDoubleOrNull() ?: 0.0
                }

                val energyKcal = num(n["energy-kcal_100g"])
                val energyKj = num(n["energy_100g"])
                val kcal = if (energyKcal > 0) energyKcal else if (energyKj > 0) energyKj / 4.184 else 0.0
                val protein = num(n["proteins_100g"])
                if (kcal == 0.0 && protein == 0.0) return@withContext null

                val carbs = num(n["carbohydrates_100g"])
                val fat = num(n["fat_100g"])
                val fiber = n["fiber_100g"]?.let { num(it) }?.takeIf { it > 0 }
                val sugar = n["sugars_100g"]?.let { num(it) }?.takeIf { it > 0 }
                val sodium = n["sodium_100g"]?.let { num(it) }?.let { round(it * 1000.0) }
                val brandsStr = p["brands"]?.jsonPrimitive?.contentOrNull
                val brand = brandsStr?.split(",")?.firstOrNull()?.trim()?.take(40)?.ifBlank { null }
                val servingQuantity = num(p["serving_quantity"])
                val servingSize = p["serving_size"]?.jsonPrimitive?.contentOrNull?.take(40)?.ifBlank { null }
                val (servingG, servingLabel) = if (servingQuantity in 0.001..1999.999) {
                    Pair(servingQuantity, servingSize ?: "1 serving")
                } else Pair(null, null)

                Food(
                    id = "off-$clean",
                    name = name,
                    brand = brand,
                    unit = "100g",
                    base = 100.0,
                    calories = round(kcal * 10.0) / 10.0,
                    protein_g = protein,
                    carbs_g = carbs,
                    fat_g = fat,
                    fiber_g = fiber,
                    sugar_g = sugar,
                    sodium_mg = sodium,
                    category = "Packaged",
                    serving_g = servingG,
                    serving_label = servingLabel
                )
            }
        } catch (e: Exception) {
            null
        }
    }
}
