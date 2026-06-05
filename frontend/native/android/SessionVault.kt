package com.imyourboyroy.portfoliosidekick

import android.content.Context
import android.util.Base64
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import org.json.JSONObject

class SessionVault(private val context: Context) {
    private fun prefs(profileId: Int) = EncryptedSharedPreferences.create(
        context,
        "sidekick_rh_vault_$profileId",
        MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    fun save(profileId: Int, payload: JSONObject) {
        prefs(profileId).edit().putString("session", payload.toString()).apply()
    }

    fun load(profileId: Int): JSONObject? {
        val raw = prefs(profileId).getString("session", null) ?: return null
        return try {
            JSONObject(raw)
        } catch (_: Exception) {
            null
        }
    }

    fun wipe(profileId: Int) {
        prefs(profileId).edit().clear().apply()
    }

    fun saveChallenge(profileId: Int, payload: JSONObject) {
        prefs(profileId).edit().putString("pending_challenge", payload.toString()).apply()
    }

    fun loadChallenge(profileId: Int): JSONObject? {
        val raw = prefs(profileId).getString("pending_challenge", null) ?: return null
        return try {
            JSONObject(raw)
        } catch (_: Exception) {
            null
        }
    }

    fun clearChallenge(profileId: Int) {
        prefs(profileId).edit().remove("pending_challenge").apply()
    }

    fun saveUsername(profileId: Int, username: String) {
        prefs(profileId).edit().putString("robinhood_username", username).apply()
    }

    fun getUsername(profileId: Int): String? =
        prefs(profileId).getString("robinhood_username", null)

    companion object {
        fun generateDeviceToken(): String {
            val bytes = ByteArray(24)
            java.security.SecureRandom().nextBytes(bytes)
            return Base64.encodeToString(bytes, Base64.NO_WRAP)
        }
    }
}
