package com.imyourboyroy.portfoliosidekick

import okhttp3.FormBody
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class RobinhoodAuthClient {
    private val client = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    private val jsonMedia = "application/json; charset=utf-8".toMediaType()

    companion object {
        const val LOGIN_URL = "https://api.robinhood.com/oauth2/token/"
        const val PATHFINDER_URL = "https://api.robinhood.com/pathfinder/user_machine/"
        const val CHALLENGE_URL = "https://api.robinhood.com/challenge/%s/respond/"
        const val INQUIRIES_URL = "https://api.robinhood.com/pathfinder/inquiries/%s/user_view/"
        const val PUSH_URL = "https://api.robinhood.com/push/%s/get_prompts_status/"
        const val POSITIONS_URL = "https://api.robinhood.com/positions/?nonzero=true"
        const val INSTRUMENT_URL = "https://api.robinhood.com/instruments/"
        const val QUOTES_URL = "https://api.robinhood.com/quotes/"
        const val CLIENT_ID = "c82SH0WZOsabOXGP2sxqcj34FxkvfnWRZBKlBjFS"
        // Robinhood's API gates on these headers. They mirror the robin_stocks
        // default session exactly so the native flow behaves like the desktop one.
        const val RH_API_VERSION = "1.431.4"
        const val RH_USER_AGENT = "Robinhood/823 (iPhone; iOS 7.1.2; Scale/2.00)"
    }

    // Apply the Robinhood-required headers (and optional auth) to every request.
    private fun Request.Builder.rhHeaders(auth: String?): Request.Builder {
        header("Accept", "*/*")
        header("Accept-Language", "en-US,en;q=1")
        header("X-Robinhood-API-Version", RH_API_VERSION)
        header("Connection", "keep-alive")
        header("User-Agent", RH_USER_AGENT)
        if (auth != null) header("Authorization", auth)
        return this
    }

    private fun exec(req: Request): JSONObject? {
        val resp = client.newCall(req).execute()
        val text = resp.body?.string() ?: return null
        return try {
            JSONObject(text)
        } catch (_: Exception) {
            null
        }
    }

    // Form-encoded POST (application/x-www-form-urlencoded) — used for the OAuth
    // token endpoint and challenge responses, matching robin_stocks' default.
    private fun postForm(url: String, params: Map<String, String>, auth: String? = null): JSONObject? {
        val form = FormBody.Builder()
        for ((k, v) in params) form.add(k, v)
        val req = Request.Builder().url(url).post(form.build()).rhHeaders(auth).build()
        return exec(req)
    }

    // JSON POST — used for the pathfinder/inquiries flow (robin_stocks json=True).
    private fun postJson(url: String, body: JSONObject, auth: String? = null): JSONObject? {
        val req = Request.Builder().url(url)
            .post(body.toString().toRequestBody(jsonMedia))
            .rhHeaders(auth).build()
        return exec(req)
    }

    private fun getJson(url: String, auth: String? = null): JSONObject? {
        val req = Request.Builder().url(url).get().rhHeaders(auth).build()
        return exec(req)
    }

    // Login params as ordered form fields. Booleans are encoded as Python-style
    // "True"/"False" to byte-for-byte match the working desktop request.
    fun loginParams(username: String, password: String, deviceToken: String): Map<String, String> =
        linkedMapOf(
            "client_id" to CLIENT_ID,
            "expires_in" to "86400",
            "grant_type" to "password",
            "password" to password,
            "scope" to "internal",
            "username" to username,
            "device_token" to deviceToken,
            "try_passkeys" to "False",
            "token_request_path" to "/login",
            "create_read_only_secondary_token" to "True"
        )

    fun loginPhase1(username: String, password: String, deviceToken: String): JSONObject {
        val data = postForm(LOGIN_URL, loginParams(username, password, deviceToken))
            ?: return error("No response from Robinhood servers. Check your internet connection.")

        if (data.has("access_token")) {
            return JSONObject().apply {
                put("status", "success")
                put("mode", "live")
                put("message", "Connected to Robinhood account!")
                put("session", data)
                put("device_token", deviceToken)
            }
        }

        if (data.has("verification_workflow")) {
            return initiateChallenge(data, deviceToken, username, password)
        }

        val detail = data.optString("detail", "Unknown error. Check credentials.")
        return error("Login failed: $detail")
    }

    private fun initiateChallenge(
        loginResponse: JSONObject,
        deviceToken: String,
        username: String,
        password: String
    ): JSONObject {
        val workflowId = loginResponse.getJSONObject("verification_workflow").getString("id")
        val machinePayload = JSONObject().apply {
            put("device_id", deviceToken)
            put("flow", "suv")
            put("input", JSONObject().put("workflow_id", workflowId))
        }
        val machineData = postJson(PATHFINDER_URL, machinePayload)
            ?: return error("Failed to initiate Robinhood verification flow.")

        val machineId = machineData.getString("id")
        val inquiriesUrl = INQUIRIES_URL.format(machineId)

        var challengeType = "sms"
        var challengeId: String? = null
        repeat(3) {
            Thread.sleep(2000)
            val inquiries = getJson(inquiriesUrl) ?: return@repeat
            val ctx = inquiries.optJSONObject("context") ?: return@repeat
            val challenge = ctx.optJSONObject("sheriff_challenge") ?: return@repeat
            challengeType = challenge.optString("type", "sms")
            challengeId = challenge.optString("id", null)
            return@repeat
        }

        val msg = when (challengeType) {
            "prompt" -> "Approve this login request in your Robinhood mobile app, then click Confirm Approval."
            "email" -> "A verification code has been sent to your email. Enter it below."
            else -> "A verification code has been sent via SMS. Enter it below."
        }

        val pending = JSONObject().apply {
            put("device_token", deviceToken)
            put("username", username)
            put("password", password)
            put("workflow_id", workflowId)
            put("machine_id", machineId)
            put("challenge_type", challengeType)
            put("challenge_id", challengeId)
            put("inquiries_url", inquiriesUrl)
        }

        return JSONObject().apply {
            put("status", "mfa_required")
            put("mode", "live")
            put("challenge_type", challengeType)
            put("message", msg)
            put("pending", pending)
        }
    }

    fun completeChallenge(pending: JSONObject, mfaCode: String?): JSONObject {
        val challengeType = pending.getString("challenge_type")
        val deviceToken = pending.getString("device_token")
        val username = pending.getString("username")
        val password = pending.getString("password")
        val inquiriesUrl = pending.getString("inquiries_url")

        if (challengeType == "prompt") {
            val challengeId = pending.optString("challenge_id", "")
            if (challengeId.isNotEmpty()) {
                val push = getJson(PUSH_URL.format(challengeId))
                if (push == null || push.optString("challenge_status") != "validated") {
                    return JSONObject().apply {
                        put("status", "mfa_required")
                        put("mode", "live")
                        put("challenge_type", "prompt")
                        put("message", "Push not yet approved. Open your Robinhood app and approve the login.")
                    }
                }
            }
        } else {
            val challengeId = pending.optString("challenge_id", "")
            if (challengeId.isEmpty()) return error("No challenge ID found. Please restart login.")
            val challengeResp = postForm(
                CHALLENGE_URL.format(challengeId),
                mapOf("response" to (mfaCode ?: ""))
            ) ?: return error("No response from Robinhood challenge endpoint.")
            if (challengeResp.optString("status") != "validated") {
                return JSONObject().apply {
                    put("status", "mfa_required")
                    put("mode", "live")
                    put("challenge_type", challengeType)
                    put("message", "Invalid verification code. Please check and re-enter.")
                }
            }
        }

        repeat(5) {
            postJson(inquiriesUrl, JSONObject().put("sequence", 0).put("user_input", JSONObject().put("status", "continue")))
            Thread.sleep(2000)
        }

        val data = postForm(LOGIN_URL, loginParams(username, password, deviceToken))
            ?: return error("No response from Robinhood after verification.")

        if (data.has("access_token")) {
            return JSONObject().apply {
                put("status", "success")
                put("mode", "live")
                put("message", "Successfully connected to Robinhood account!")
                put("session", data)
                put("device_token", deviceToken)
            }
        }
        return error("Login failed after verification: ${data.optString("detail", "Unknown error")}")
    }

    fun validateSession(session: JSONObject): Boolean {
        val auth = authHeader(session)
        val data = getJson(POSITIONS_URL, auth) ?: return false
        return data.has("results")
    }

    // Exchange the stored refresh_token for a fresh access_token so sessions don't
    // force a daily re-login. Mirrors robin_stocks' refresh grant. Returns a new
    // session payload (with the rotated refresh_token) or null if refresh fails.
    fun refreshSession(session: JSONObject): JSONObject? {
        val refreshToken = session.optString("refresh_token", "")
        val deviceToken = session.optString("device_token", "")
        if (refreshToken.isEmpty()) return null
        val params = linkedMapOf(
            "grant_type" to "refresh_token",
            "refresh_token" to refreshToken,
            "scope" to "internal",
            "client_id" to CLIENT_ID,
            "expires_in" to "86400",
            "device_token" to deviceToken
        )
        val data = postForm(LOGIN_URL, params) ?: return null
        if (!data.has("access_token")) return null
        return sessionPayload(data, deviceToken)
    }

    fun authHeader(session: JSONObject): String {
        val tokenType = session.optString("token_type", "Bearer")
        val access = session.getString("access_token")
        return "$tokenType $access"
    }

    fun sessionPayload(session: JSONObject, deviceToken: String): JSONObject =
        JSONObject().apply {
            put("token_type", session.optString("token_type", "Bearer"))
            put("access_token", session.getString("access_token"))
            put("refresh_token", session.optString("refresh_token", ""))
            put("device_token", deviceToken)
        }

    fun fetchHoldings(session: JSONObject): JSONArray {
        val auth = authHeader(session)
        val positions = getJson(POSITIONS_URL, auth) ?: return JSONArray()
        val results = positions.optJSONArray("results") ?: return JSONArray()
        val holdings = JSONArray()

        for (i in 0 until results.length()) {
            val pos = results.getJSONObject(i)
            val qty = pos.optString("quantity", "0").toDoubleOrNull() ?: 0.0
            if (qty <= 0) continue
            val instrumentUrl = pos.getString("instrument")
            val instrument = getJson(instrumentUrl, auth) ?: continue
            val symbol = instrument.optString("symbol", "") ?: continue
            val avgBuy = pos.optString("average_buy_price", "0").toDoubleOrNull() ?: 0.0
            var price = avgBuy
            val quoteUrl = "$QUOTES_URL$symbol/"
            val quote = getJson(quoteUrl, auth)
            if (quote != null) {
                price = quote.optString("last_trade_price", price.toString()).toDoubleOrNull() ?: price
            }
            holdings.put(
                JSONObject().apply {
                    put("ticker", symbol)
                    put("shares", qty)
                    put("avg_buy_price", avgBuy)
                    put("current_price", price)
                }
            )
        }
        return holdings
    }

    private fun error(message: String): JSONObject =
        JSONObject().apply {
            put("status", "error")
            put("mode", "live")
            put("message", message)
        }
}
