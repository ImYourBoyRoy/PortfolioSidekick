package com.imyourboyroy.portfoliosidekick

import android.util.Log
import org.json.JSONObject
import java.net.URLEncoder
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap

/**
 * Native Robinhood login/MFA flow mirroring Tauri rh_robinhood_login + complete_challenge.
 * Uses [RobinhoodNativeHttp] cookie jar for pathfinder → inquiries → push session continuity.
 */
object RobinhoodAuthNative {
    private const val TAG = "RobinhoodAuth"
    private const val RH_CLIENT_ID = "c82SH0WZOsabOXGP2sxqcj34FxkvfnWRZBKlBjFS"
    private const val RH_API = "https://api.robinhood.com"

    data class PendingChallenge(
        var deviceToken: String,
        val loginForm: MutableMap<String, String>,
        val workflowId: String,
        val machineId: String,
        var challengeType: String,
        var challengeId: String?,
        var challengeStatus: String?,
        val inquiriesUrl: String,
    )

    private val pendingByProfile = ConcurrentHashMap<String, PendingChallenge>()

    fun resetSession(profileId: String) {
        RobinhoodNativeHttp.resetCookies()
        pendingByProfile.remove(profileId)
    }

    fun resetAllSessions() {
        RobinhoodNativeHttp.resetCookies()
        pendingByProfile.clear()
    }

    fun login(
        profileId: String,
        username: String,
        password: String,
        mfaCode: String?,
        continueMfa: Boolean,
    ): Map<String, Any?> {
        Log.i(TAG, "login profile=$profileId continueMfa=$continueMfa")
        if (continueMfa) {
            val pending = pendingByProfile[profileId]
            if (pending == null) {
                Log.i(TAG, "continueMfa: pending already cleared")
                return loginResult(
                    status = "success",
                    mode = "live",
                    message = "Successfully connected to Robinhood account!",
                )
            }
            val (result, updated, clear) = completeChallenge(pending, mfaCode)
            if (clear) {
                pendingByProfile.remove(profileId)
            } else {
                pendingByProfile[profileId] = updated
            }
            return result
        }

        resetSession(profileId)

        val deviceToken = generateDeviceToken()
        val loginForm = buildLoginForm(username, password, deviceToken)
        val loginUrl = "$RH_API/oauth2/token/"

        val (loginStatus, data) = rhFormPost(loginUrl, loginForm)
        Log.i(TAG, "oauth2/token HTTP $loginStatus access=${data.has("access_token")} workflow=${data.has("verification_workflow")}")

        data.optString("access_token").takeIf { it.isNotEmpty() }?.let { token ->
            return loginResult(
                status = "success",
                mode = "live",
                message = "Connected to Robinhood account!",
                session = sessionPayload(data, deviceToken),
            )
        }

        if (data.has("verification_workflow")) {
            val workflowId = data.optJSONObject("verification_workflow")?.optString("id")
                ?.takeIf { it.isNotEmpty() }
                ?: throw IllegalStateException("Missing verification workflow id")

            val pathfinderUrl = "$RH_API/pathfinder/user_machine/"
            val machineBody = JSONObject()
                .put("device_id", deviceToken)
                .put("flow", "suv")
                .put("input", JSONObject().put("workflow_id", workflowId))

            val (pfStatus, machine) = rhJsonPost(pathfinderUrl, machineBody)
            Log.i(TAG, "pathfinder HTTP $pfStatus machine=${machine.optString("id")}")
            val machineId = machine.optString("id").takeIf { it.isNotEmpty() }
                ?: throw IllegalStateException("Pathfinder did not return machine id")

            val inquiriesUrl = "$RH_API/pathfinder/inquiries/$machineId/user_view/"

            pendingByProfile[profileId] = PendingChallenge(
                deviceToken = deviceToken,
                loginForm = loginForm,
                workflowId = workflowId,
                machineId = machineId,
                challengeType = "prompt",
                challengeId = null,
                challengeStatus = null,
                inquiriesUrl = inquiriesUrl,
            )

            return loginResult(
                status = "mfa_required",
                mode = "live",
                message = "Check your Robinhood app for a login approval request.",
                challengeType = "prompt",
                challengeIssued = false,
            )
        }

        val detail = data.optString("detail").takeIf { it.isNotEmpty() } ?: "Unknown login error"
        return loginResult(
            status = "error",
            mode = "live",
            message = "Login failed: $detail",
        )
    }

    private fun completeChallenge(
        pending: PendingChallenge,
        mfaCode: String?,
    ): Triple<Map<String, Any?>, PendingChallenge, Boolean> {
        try {
            val (inqStatus, inq) = rhGet(pending.inquiriesUrl)
            Log.i(TAG, "inquiries HTTP $inqStatus challenge=${inq.optJSONObject("context")?.optJSONObject("sheriff_challenge")?.optString("id")}")
            extractSheriffChallenge(inq)?.let { (ctype, cid, cstatus) ->
                pending.challengeType = ctype
                pending.challengeId = cid
                pending.challengeStatus = cstatus
            }
        } catch (e: Exception) {
            Log.w(TAG, "inquiries refresh failed: ${e.message}")
        }

        if (pending.challengeType == "prompt") {
            val challengeId = pending.challengeId
            if (challengeId.isNullOrEmpty()) {
                return Triple(
                    loginResult(
                        status = "mfa_required",
                        mode = "live",
                        message = "Waiting for Robinhood to issue the app push. Keep the Robinhood app open.",
                        challengeType = "prompt",
                        challengeIssued = false,
                    ),
                    pending,
                    false,
                )
            }

            val pushUrl = "$RH_API/push/$challengeId/get_prompts_status/"
            val pushApproved = try {
                val (pushStatus, push) = rhGet(pushUrl)
                val pushState = push.optString("challenge_status").takeIf { it.isNotEmpty() }
                    ?: push.optString("status").takeIf { it.isNotEmpty() }
                    ?: "unknown"
                Log.i(TAG, "push HTTP $pushStatus state=$pushState sheriff=${pending.challengeStatus}")
                isPushApproved(pending, pushState)
            } catch (e: Exception) {
                Log.w(TAG, "push status failed: ${e.message}")
                pending.challengeStatus == "validated"
            }

            if (!pushApproved) {
                return Triple(
                    loginResult(
                        status = "mfa_required",
                        mode = "live",
                        message = "Push sent — approve the login in your Robinhood app.",
                        challengeType = "prompt",
                        challengeIssued = false,
                    ),
                    pending,
                    false,
                )
            }
        } else {
            val challengeId = pending.challengeId
            if (challengeId.isNullOrEmpty()) {
                return Triple(
                    loginResult(
                        status = "mfa_required",
                        mode = "live",
                        message = "Robinhood is still preparing your verification challenge.",
                        challengeType = pending.challengeType,
                        challengeIssued = false,
                    ),
                    pending,
                    false,
                )
            }

            if (pending.challengeStatus != "issued") {
                return Triple(
                    loginResult(
                        status = "mfa_required",
                        mode = "live",
                        message = "Waiting for ${pending.challengeType} verification code...",
                        challengeType = pending.challengeType,
                        challengeIssued = false,
                    ),
                    pending,
                    false,
                )
            }

            val code = mfaCode?.takeIf { it.isNotEmpty() }
            if (code == null) {
                return Triple(
                    loginResult(
                        status = "mfa_required",
                        mode = "live",
                        message = "Enter the ${pending.challengeType} verification code.",
                        challengeType = pending.challengeType,
                        challengeIssued = true,
                    ),
                    pending,
                    false,
                )
            }

            val respondUrl = "$RH_API/challenge/$challengeId/respond/"
            val (_, resp) = rhFormPost(respondUrl, mapOf("response" to code))
            if (resp.optString("status") != "validated") {
                return Triple(
                    loginResult(
                        status = "mfa_required",
                        mode = "live",
                        message = "Invalid verification code. Please re-enter.",
                        challengeType = pending.challengeType,
                        challengeIssued = true,
                    ),
                    pending,
                    false,
                )
            }
        }

        pollWorkflow(pending.inquiriesUrl)

        val loginUrl = "$RH_API/oauth2/token/"
        val (_, data) = rhFormPost(loginUrl, pending.loginForm)

        data.optString("access_token").takeIf { it.isNotEmpty() }?.let { _ ->
            return Triple(
                loginResult(
                    status = "success",
                    mode = "live",
                    message = "Successfully connected to Robinhood account!",
                    session = sessionPayload(data, pending.deviceToken),
                ),
                pending,
                true,
            )
        }

        val detail = data.optString("detail").takeIf { it.isNotEmpty() }
            ?: "Login failed after verification."
        return Triple(
            loginResult(
                status = "error",
                mode = "live",
                message = detail,
            ),
            pending,
            false,
        )
    }

    private fun pollWorkflow(inquiriesUrl: String) {
        for (attempt in 0 until 5) {
            val body = JSONObject()
                .put("sequence", 0)
                .put("user_input", JSONObject().put("status", "continue"))
            val (_, data) = rhJsonPost(inquiriesUrl, body)
            if (workflowApproved(data)) {
                return
            }
            if (attempt < 4) {
                Thread.sleep(2000)
            }
        }
    }

    private fun workflowApproved(data: JSONObject): Boolean {
        val typeCtx = data.optJSONObject("type_context")
        if (typeCtx?.optString("result") == "workflow_status_approved") return true
        val vw = data.optJSONObject("verification_workflow")
        return vw?.optString("workflow_status") == "workflow_status_approved"
    }

    private fun findSheriffChallenge(data: JSONObject): JSONObject? {
        data.optJSONObject("context")?.optJSONObject("sheriff_challenge")?.let { return it }
        data.optJSONObject("type_context")?.optJSONObject("context")?.optJSONObject("sheriff_challenge")?.let { return it }
        data.optJSONObject("type_context")?.optJSONObject("sheriff_challenge")?.let { return it }
        return null
    }

    private fun extractSheriffChallenge(data: JSONObject): Triple<String, String?, String?>? {
        val challenge = findSheriffChallenge(data) ?: return null
        val challengeType = challenge.optString("type").takeIf { it.isNotEmpty() } ?: return null
        val challengeId = challenge.optString("id").takeIf { it.isNotEmpty() }
        val challengeStatus = challenge.optString("status").takeIf { it.isNotEmpty() }
        return Triple(challengeType, challengeId, challengeStatus)
    }

    private fun isPushApproved(pending: PendingChallenge, pushState: String): Boolean {
        if (pushState == "validated") return true
        if (pending.challengeStatus == "validated") return true
        return false
    }

    private fun rhFormPost(url: String, form: Map<String, String>): Pair<Int, JSONObject> {
        val headers = rhHeaders().toMutableMap()
        headers["Content-Type"] = "application/x-www-form-urlencoded; charset=utf-8"
        val body = encodeForm(form)
        val (status, text) = RobinhoodNativeHttp.request("POST", url, headers, body, headers["Content-Type"])
        return status to parseJson(text)
    }

    private fun rhJsonPost(url: String, body: JSONObject): Pair<Int, JSONObject> {
        val headers = rhHeaders().toMutableMap()
        headers["Content-Type"] = "application/json"
        val (status, text) = RobinhoodNativeHttp.request("POST", url, headers, body.toString(), "application/json")
        return status to parseJson(text)
    }

    private fun rhGet(url: String): Pair<Int, JSONObject> {
        val (status, text) = RobinhoodNativeHttp.request("GET", url, rhHeaders(), null, null)
        return status to parseJson(text)
    }

    private fun parseJson(text: String): JSONObject {
        if (text.isEmpty()) return JSONObject()
        return try {
            JSONObject(text)
        } catch (_: Exception) {
            JSONObject().put("raw", text)
        }
    }

    private fun rhHeaders(): Map<String, String> = mapOf(
        "accept" to "*/*",
        "user-agent" to "*",
        "x-robinhood-api-version" to "1.431.4",
    )

    private fun formBool(value: Boolean): String = if (value) "True" else "False"

    private fun buildLoginForm(username: String, password: String, deviceToken: String): MutableMap<String, String> =
        mutableMapOf(
            "client_id" to RH_CLIENT_ID,
            "expires_in" to "86400",
            "grant_type" to "password",
            "password" to password,
            "scope" to "internal",
            "username" to username,
            "device_token" to deviceToken,
            "try_passkeys" to formBool(false),
            "token_request_path" to "/login",
            "create_read_only_secondary_token" to formBool(true),
        )

    private fun generateDeviceToken(): String {
        val instant = Instant.now()
        var state = instant.epochSecond * 1_000_000_000L + instant.nano
        val token = StringBuilder()
        for (i in 0 until 16) {
            state = state * 6364136223846793005L + 1
            val byte = ((state ushr 32) and 0xff).toInt()
            token.append(String.format("%02x", byte))
            if (i in listOf(3, 5, 7, 9)) {
                token.append('-')
            }
        }
        return token.toString()
    }

    private fun encodeForm(form: Map<String, String>): String =
        form.entries.joinToString("&") { (key, value) ->
            "${URLEncoder.encode(key, Charsets.UTF_8.name())}=${URLEncoder.encode(value, Charsets.UTF_8.name())}"
        }

    private fun sessionPayload(data: JSONObject, deviceToken: String): Map<String, String> {
        val tokenType = data.optString("token_type").takeIf { it.isNotEmpty() } ?: "Bearer"
        return mapOf(
            "token_type" to tokenType,
            "access_token" to data.optString("access_token"),
            "refresh_token" to data.optString("refresh_token"),
            "device_token" to deviceToken,
        )
    }

    private fun loginResult(
        status: String,
        mode: String,
        message: String,
        challengeType: String? = null,
        challengeIssued: Boolean? = null,
        session: Map<String, String>? = null,
    ): Map<String, Any?> {
        val result = linkedMapOf<String, Any?>(
            "status" to status,
            "mode" to mode,
            "message" to message,
        )
        if (challengeType != null) result["challenge_type"] = challengeType
        if (challengeIssued != null) result["challenge_issued"] = challengeIssued
        if (session != null) result["session"] = session
        return result
    }
}
