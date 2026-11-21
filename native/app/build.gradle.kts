import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
}

// Public client config (Supabase URL + publishable key) comes from the web app's .env.local, never hard-coded.
val env = Properties().apply {
    val f = rootProject.file("../.env.local")
    if (f.exists()) f.readLines().filter { "=" in it && !it.startsWith("#") }
        .forEach { val (k, v) = it.split("=", limit = 2); setProperty(k.trim(), v.trim().trim('"')) }
}
val signDir = System.getenv("FORGE_SIGNING_DIR") ?: (System.getProperty("user.home") + "/.forge-signing")
val pwFile = file("$signDir/keystore-password.txt")

android {
    namespace = "app.forge.fitness"
    compileSdk = 36
    defaultConfig {
        applicationId = "app.forge.fitness"
        minSdk = 26
        targetSdk = 36
        versionCode = (project.findProperty("vc") as String?)?.toInt() ?: 35
        versionName = "3.8.1"
        // The app talks to Supabase through the site's /sb proxy (supabase.co is DNS-blocked on some Indian ISPs).
        buildConfigField("String", "SITE", "\"https://forgefit-india.vercel.app\"")
        buildConfigField("String", "SUPABASE_KEY", "\"${env.getProperty("VITE_SUPABASE_PUBLISHABLE_KEY", "")}\"")
    }
    signingConfigs {
        create("release") {
            if (pwFile.exists()) {
                val pw = pwFile.readText().trim()
                storeFile = file("$signDir/android.keystore"); storePassword = pw; keyAlias = "forge"; keyPassword = pw
            }
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.getByName("release")
        }
    }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlin { compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) } }
    buildFeatures { compose = true; buildConfig = true }
}

dependencies {
    val bom = platform("androidx.compose:compose-bom:2025.10.01")
    implementation(bom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended:1.7.8")
    implementation("androidx.activity:activity-compose:1.11.0")
    implementation("androidx.core:core-ktx:1.17.0")
    implementation("androidx.navigation:navigation-compose:2.9.5")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.9.4")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.9.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("androidx.fragment:fragment-ktx:1.8.9")
    implementation("com.google.android.gms:play-services-code-scanner:16.1.0")
    testImplementation("junit:junit:4.13.2")
}
