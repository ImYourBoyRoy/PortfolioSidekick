package com.imyourboyroy.portfoliosidekick

import android.content.Context
import org.json.JSONObject

class SessionVault(private val context: Context) {
    private fun prefs(profileId: Int) =
        context.getSharedPreferences("sidekick_rh_vault_$profileId", Context.MODE_PRIVATE)

    private fun putEncrypted(profileId: Int, key: String, value: String) {
        prefs(profileId).edit().putString(key, VaultCrypto.encrypt(value)).apply()
    }

    private fun getEncrypted(profileId: Int, key: String): String? {
        val encoded = prefs(profileId).getString(key, null) ?: return null
        return VaultCrypto.decrypt(encoded)
    }

    fun save(profileId: Int, payload: JSONObject) {
        putEncrypted(profileId, "session", payload.toString())
    }

    fun load(profileId: Int): JSONObject? {
        val raw = getEncrypted(profileId, "session") ?: return null
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
        putEncrypted(profileId, "pending_challenge", payload.toString())
    }

    fun loadChallenge(profileId: Int): JSONObject? {
        val raw = getEncrypted(profileId, "pending_challenge") ?: return null
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
        putEncrypted(profileId, "robinhood_username", username)
    }

    fun getUsername(profileId: Int): String? = getEncrypted(profileId, "robinhood_username")
}
