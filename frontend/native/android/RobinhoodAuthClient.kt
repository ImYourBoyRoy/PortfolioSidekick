package com.imyourboyroy.portfoliosidekick

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
    }

    private fun postJson(url: String, body: JSONObject, auth: String? = null): JSONObject? {
        val reqBuilder = Request.Builder()
            .url(url)
            .post(body.toString().toRequestBody(jsonMedia))
        if (auth != null) reqBuilder.header("Authorization", auth)
        val resp = client.newCall(reqBuilder.build()).execute()
        val text = resp.body?.string() ?: return null
        return try {
            JSONObject(text)
        } catch (_: Exception) {
            null
        }
    }

    private fun getJson(url: String, auth: String? = null): JSONObject? {
        val reqBuilder = Request.Builder().url(url).get()
        if (auth != null) reqBuilder.header("Authorization", auth)
        val resp = client.newCall(reqBuilder.build()).execute()
        val text = resp.body?.string() ?: return null
        return try {
            JSONObject(text)
        } catch (_: Exception) {
            null
        }
    }

    fun buildLoginPayload(username: String, password: String, deviceToken: String): JSONObject =
        JSONObject().apply {
            put("client_id", CLIENT_ID)
            put("expires_in", 86400)
            put("grant_type", "password")
            put("password", password)
            put("scope", "internal")
            put("username", username)
            put("device_token", deviceToken)
            put("try_passkeys", false)
            put("token_request_path", "/login")
            put("create_read_only_secondary_token", true)
        }

    fun loginPhase1(username: String, password: String, deviceToken: String): JSONObject {
        val data = postJson(LOGIN_URL, buildLoginPayload(username, password, deviceToken))
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
            val challengeResp = postJson(
                CHALLENGE_URL.format(challengeId),
                JSONObject().put("response", mfaCode ?: "")
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

        val loginPayload = buildLoginPayload(username, password, deviceToken)
        val data = postJson(LOGIN_URL, loginPayload)
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
