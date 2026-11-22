package app.forge.fitness.logic

/** Shown before the first food photo and in Settings (same words as the web app's src/lib/privacy.ts). */
object Privacy {
    const val PHOTO = "FORGE never stores your photo on its servers. It goes only to Google's Gemini AI, just to get this answer. FORGE's free AI and free Gemini keys use Google's free tier, where Google may use what you send to improve its products. " +
        "On this phone, photos you take in FORGE stay in its private storage (not your gallery) and are deleted after a day (next time you open FORGE) unless you turn that off in Settings."
    const val VOICE = "Voice is turned into text by your phone's speech service (Google). FORGE only receives the text."
    const val PHOTO_SEEN = "photo_privacy_seen"
    const val VOICE_SEEN = "voice_privacy_seen"
    /** The user confirmed their own age (physique check-ins are 18+; the stored age defaults to 25). */
    const val AGE_CONFIRMED = "age_confirmed"
}
