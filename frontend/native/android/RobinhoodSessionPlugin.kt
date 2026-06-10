package com.imyourboyroy.portfoliosidekick

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONObject

/**
 * Android Robinhood bridge: encrypted vault + OkHttp auth transport (cookie jar).
 * Login/MFA HTTP uses [RobinhoodNativeHttp]; holdings sync may use JS CapacitorHttp.
 */
@CapacitorPlugin(name = "RobinhoodSession")
class RobinhoodSessionPlugin : Plugin() {
    private val vault by lazy { SessionVault(context) }

    @PluginMethod
    fun httpReset(call: PluginCall) {
        Thread {
            try {
                RobinhoodAuthNative.resetCookiesOnly()
                call.resolve()
            } catch (e: Exception) {
                call.reject(e.message ?: "httpReset failed")
            }
        }.start()
    }

    @PluginMethod
    fun robinhoodLogin(call: PluginCall) {
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
        val continueMfa = call.getBoolean("continueMfa", false) ?: false

        call.setKeepAlive(true)
        Thread {
            try {
                val profileKey = profileId.toString()
                if (continueMfa && !RobinhoodAuthNative.hasPending(profileKey)) {
                    vault.loadChallenge(profileId)?.let { stored ->
                        RobinhoodAuthNative.restorePending(profileKey, stored)
                    }
                }

                val result = RobinhoodAuthNative.login(
                    profileKey,
                    username,
                    password,
                    mfaCode,
                    continueMfa,
                )

                if (!continueMfa && result["status"] == "mfa_required") {
                    RobinhoodAuthNative.pendingSnapshot(profileKey)?.let { snapshot ->
                        vault.saveChallenge(profileId, snapshot)
                    }
                } else if (result["status"] == "success" && result["session"] != null) {
                    vault.clearChallenge(profileId)
                }

                bridge.activity.runOnUiThread {
                    call.resolve(mapToJSObject(result))
                }
            } catch (e: Exception) {
                bridge.activity.runOnUiThread {
                    call.reject(e.message ?: "robinhoodLogin failed")
                }
            }
        }.start()
    }

    @PluginMethod
    fun httpRequest(call: PluginCall) {
        val method = call.getString("method") ?: run {
            call.reject("method required")
            return
        }
        val url = call.getString("url") ?: run {
            call.reject("url required")
            return
        }
        val body = call.getString("body")
        val jsonBody = call.getObject("jsonBody")
        val headersObj = call.getObject("headers")

        call.setKeepAlive(true)
        Thread {
            try {
                val headers = mutableMapOf<String, String>()
                headersObj?.keys()?.forEach { key ->
                    headersObj.getString(key)?.let { headers[key] = it }
                }

                val contentType: String?
                val payload: String?
                when {
                    jsonBody != null -> {
                        contentType = "application/json"
                        payload = JSObjectToJson(jsonBody).toString()
                    }
                    body != null -> {
                        contentType = headers["Content-Type"]
                            ?: headers.entries.firstOrNull { it.key.equals("Content-Type", true) }?.value
                            ?: "application/x-www-form-urlencoded; charset=utf-8"
                        payload = body
                    }
                    else -> {
                        contentType = null
                        payload = null
                    }
                }

                val (status, responseBody) = RobinhoodNativeHttp.request(
                    method,
                    url,
                    headers,
                    payload,
                    contentType,
                )
                val res = JSObject()
                res.put("status", status)
                res.put("body", responseBody)
                bridge.activity.runOnUiThread { call.resolve(res) }
            } catch (e: Exception) {
                bridge.activity.runOnUiThread {
                    call.reject(e.message ?: "httpRequest failed")
                }
            }
        }.start()
    }

    @PluginMethod
    fun saveSession(call: PluginCall) {
        val profileId = call.getInt("profileId") ?: run {
            call.reject("profileId required")
            return
        }
        val session = call.getObject("session") ?: run {
            call.reject("session required")
            return
        }
        val username = call.getString("username") ?: ""
        vault.save(profileId, JSObjectToJson(session))
        if (username.isNotEmpty()) vault.saveUsername(profileId, username)
        call.resolve()
    }

    @PluginMethod
    fun loadSession(call: PluginCall) {
        val profileId = call.getInt("profileId") ?: run {
            call.reject("profileId required")
            return
        }
        val session = vault.load(profileId)
        val res = JSObject()
        if (session != null) res.put("session", jsonToJSObject(session))
        call.resolve(res)
    }

    @PluginMethod
    fun saveChallenge(call: PluginCall) {
        val profileId = call.getInt("profileId") ?: run {
            call.reject("profileId required")
            return
        }
        val pending = call.getObject("pending") ?: run {
            call.reject("pending required")
            return
        }
        vault.saveChallenge(profileId, JSObjectToJson(pending))
        call.resolve()
    }

    @PluginMethod
    fun loadChallenge(call: PluginCall) {
        val profileId = call.getInt("profileId") ?: run {
            call.reject("profileId required")
            return
        }
        val pending = vault.loadChallenge(profileId)
        val res = JSObject()
        if (pending != null) res.put("pending", jsonToJSObject(pending))
        call.resolve(res)
    }

    @PluginMethod
    fun clearChallenge(call: PluginCall) {
        val profileId = call.getInt("profileId") ?: run {
            call.reject("profileId required")
            return
        }
        vault.clearChallenge(profileId)
        call.resolve()
    }

    @PluginMethod
    fun getUsername(call: PluginCall) {
        val profileId = call.getInt("profileId") ?: run {
            call.reject("profileId required")
            return
        }
        val username = vault.getUsername(profileId)
        val res = JSObject()
        if (username != null) res.put("username", username)
        call.resolve(res)
    }

    @PluginMethod
    fun wipe(call: PluginCall) {
        val profileId = call.getInt("profileId") ?: run {
            call.reject("profileId required")
            return
        }
        vault.wipe(profileId)
        vault.clearChallenge(profileId)
        call.resolve()
    }

    @Suppress("UNCHECKED_CAST")
    private fun mapToJSObject(map: Map<String, Any?>): JSObject {
        val js = JSObject()
        for ((key, value) in map) {
            when (value) {
                null -> Unit
                is Map<*, *> -> js.put(key, mapToJSObject(value as Map<String, Any?>))
                else -> js.put(key, value)
            }
        }
        return js
    }

    private fun JSObjectToJson(obj: JSObject): JSONObject {
        val json = JSONObject()
        val keys = obj.keys()
        while (keys.hasNext()) {
            val key = keys.next()
            when (val value = obj.get(key)) {
                is JSObject -> json.put(key, JSObjectToJson(value))
                else -> json.put(key, value)
            }
        }
        return json
    }

    private fun jsonToJSObject(obj: JSONObject): JSObject {
        val js = JSObject()
        val keys = obj.keys()
        while (keys.hasNext()) {
            val key = keys.next()
            when (val value = obj.get(key)) {
                is JSONObject -> js.put(key, jsonToJSObject(value))
                else -> js.put(key, value)
            }
        }
        return js
    }
}
