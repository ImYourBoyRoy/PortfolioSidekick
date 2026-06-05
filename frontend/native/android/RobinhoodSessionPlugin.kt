package com.imyourboyroy.portfoliosidekick

import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONArray
import org.json.JSONObject

@CapacitorPlugin(name = "RobinhoodSession")
class RobinhoodSessionPlugin : Plugin() {
    private val authClient = RobinhoodAuthClient()
    private val vault by lazy { SessionVault(context) }

    @PluginMethod
    fun login(call: PluginCall) {
        val profileId = call.getInt("profileId") ?: run {
            call.reject("profileId required")
            return
        }
        val username = call.getString("username") ?: run {
            call.reject("username required")
            return
        }
        val password = call.getString("password") ?: run {
            call.reject("password required")
            return
        }
        val mfaCode = call.getString("mfaCode")

        if (username.equals("sandbox", ignoreCase = true) ||
            username.equals("example", ignoreCase = true) ||
            username.contains("test", ignoreCase = true)
        ) {
            val res = JSObject()
            res.put("status", "success")
            res.put("mode", "sandbox")
            res.put("message", "Connected to Sandbox Profile! Using Yahoo Finance quotes.")
            call.resolve(res)
            return
        }

        Thread {
            try {
                val pending = vault.loadChallenge(profileId)
                val result = if ((mfaCode != null || pending?.optString("challenge_type") == "prompt") && pending != null) {
                    authClient.completeChallenge(pending, mfaCode)
                } else {
                    vault.clearChallenge(profileId)
                    val deviceToken = SessionVault.generateDeviceToken()
                    authClient.loginPhase1(username, password, deviceToken)
                }

                when (result.getString("status")) {
                    "mfa_required" -> {
                        vault.saveChallenge(profileId, result.getJSONObject("pending"))
                        call.resolve(jsonToJSObject(result))
                    }
                    "success" -> {
                        val session = result.getJSONObject("session")
                        val deviceToken = result.getString("device_token")
                        vault.save(profileId, authClient.sessionPayload(session, deviceToken))
                        vault.saveUsername(profileId, username)
                        vault.clearChallenge(profileId)
                        call.resolve(jsonToJSObject(result))
                    }
                    else -> call.reject(result.optString("message", "Authentication failed"))
                }
            } catch (e: Exception) {
                call.reject("Login error: ${e.message}")
            }
        }.start()
    }

    @PluginMethod
    fun logout(call: PluginCall) {
        val profileId = call.getInt("profileId") ?: run {
            call.reject("profileId required")
            return
        }
        vault.wipe(profileId)
        vault.clearChallenge(profileId)
        val res = JSObject()
        res.put("status", "success")
        res.put("message", "Successfully logged out and wiped session from this device.")
        call.resolve(res)
    }

    @PluginMethod
    fun getStatus(call: PluginCall) {
        val profileId = call.getInt("profileId") ?: run {
            call.reject("profileId required")
            return
        }
        val username = vault.getUsername(profileId)
        val session = vault.load(profileId)
        if (username == null || session == null) {
            val res = JSObject()
            res.put("authenticated", false)
            call.resolve(res)
            return
        }
        // Network must run off the main thread (validateSession hits the network).
        Thread {
            try {
                var valid = authClient.validateSession(session)
                if (!valid) {
                    val refreshed = authClient.refreshSession(session)
                    if (refreshed != null) {
                        vault.save(profileId, refreshed)
                        valid = authClient.validateSession(refreshed)
                    }
                }
                val res = JSObject()
                res.put("authenticated", valid)
                if (valid) res.put("username", username)
                call.resolve(res)
            } catch (e: Exception) {
                val res = JSObject()
                res.put("authenticated", false)
                call.resolve(res)
            }
        }.start()
    }

    @PluginMethod
    fun syncHoldings(call: PluginCall) {
        val profileId = call.getInt("profileId") ?: run {
            call.reject("profileId required")
            return
        }
        val session = vault.load(profileId)
        if (session == null) {
            call.reject("Not authenticated. Please sign in first.")
            return
        }

        Thread {
            try {
                var active = session
                if (!authClient.validateSession(active)) {
                    val refreshed = authClient.refreshSession(active)
                    if (refreshed != null) {
                        vault.save(profileId, refreshed)
                        active = refreshed
                    }
                }
                if (!authClient.validateSession(active)) {
                    call.reject("Robinhood session expired. Please sign in again.")
                    return@Thread
                }
                val holdings = authClient.fetchHoldings(active)
                val arr = JSArray()
                for (i in 0 until holdings.length()) {
                    arr.put(jsonToJSObject(holdings.getJSONObject(i)))
                }
                val res = JSObject()
                res.put("status", "success")
                res.put("synced_count", holdings.length())
                res.put("holdings", arr)
                call.resolve(res)
            } catch (e: Exception) {
                call.reject("Sync failed: ${e.message}")
            }
        }.start()
    }

    private fun jsonToJSObject(obj: JSONObject): JSObject {
        val js = JSObject()
        val keys = obj.keys()
        while (keys.hasNext()) {
            val key = keys.next()
            val value = obj.get(key)
            when (value) {
                is JSONObject -> js.put(key, jsonToJSObject(value))
                is JSONArray -> {
                    val arr = JSArray()
                    for (i in 0 until value.length()) {
                        val item = value.get(i)
                        if (item is JSONObject) arr.put(jsonToJSObject(item))
                        else arr.put(item)
                    }
                    js.put(key, arr)
                }
                else -> js.put(key, value)
            }
        }
        return js
    }
}
