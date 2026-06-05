package com.imyourboyroy.portfoliosidekick

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONObject

/**
 * Encrypted session vault for Android. Robinhood HTTP auth runs in embedded JS
 * (robinhoodAuth.js / robinhoodAuthCore.js) via Capacitor native HTTP — this plugin
 * only persists tokens and pending MFA state on-device.
 */
@CapacitorPlugin(name = "RobinhoodSession")
class RobinhoodSessionPlugin : Plugin() {
    private val vault by lazy { SessionVault(context) }

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
