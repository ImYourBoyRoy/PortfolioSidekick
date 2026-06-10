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
    private const val PUSH_CHECK_INTERVAL_MS = 12_000L
    private const val PUSH_RATE_LIMIT_BACKOFF_MS = 45_000L

    data class PendingChallenge(
        var deviceToken: String,
        val loginForm: MutableMap<String, String>,
        val workflowId: String,
        val machineId: String,
        var challengeType: String,
        var challengeId: String?,
        var challengeStatus: String?,
        val inquiriesUrl: String,
        var inquiriesExpired: Boolean = false,
        var pushApproved: Boolean = false,
        var pushIssued: Boolean = false,
        var mfaStartedAtMs: Long = System.currentTimeMillis(),
        var lastPushCheckMs: Long = 0,
        var pushRateLimitedUntilMs: Long = 0,
    )

    private val pendingByProfile = ConcurrentHashMap<String, PendingChallenge>()
    private val loginLocks = ConcurrentHashMap<String, Any>()

    fun resetSession(profileId: String) {
        RobinhoodNativeHttp.resetCookies()
        pendingByProfile.remove(profileId)
    }

    fun resetAllSessions() {
        RobinhoodNativeHttp.resetCookies()
        pendingByProfile.clear()
    }

    fun resetCookiesOnly() {
        RobinhoodNativeHttp.resetCookies()
    }

    fun hasPending(profileId: String): Boolean = pendingByProfile.containsKey(profileId)

    fun restorePending(profileId: String, json: JSONObject) {
        val loginForm = mutableMapOf<String, String>()
        val formObj = json.optJSONObject("login_form") ?: json.optJSONObject("login_payload")
        formObj?.keys()?.forEach { key ->
            loginForm[key] = formObj.optString(key)
        }
        pendingByProfile[profileId] = PendingChallenge(
            deviceToken = json.optString("device_token"),
            loginForm = loginForm,
            workflowId = json.optString("workflow_id"),
            machineId = json.optString("machine_id"),
            challengeType = json.optString("challenge_type", "prompt"),
            challengeId = json.optString("challenge_id").takeIf { it.isNotEmpty() },
            challengeStatus = json.optString("challenge_status").takeIf { it.isNotEmpty() },
            inquiriesUrl = json.optString("inquiries_url"),
            inquiriesExpired = json.optBoolean("inquiries_expired", false),
            pushApproved = json.optBoolean("push_approved", false),
            pushIssued = json.optBoolean("push_issued", false),
            mfaStartedAtMs = json.optLong("mfa_started_at_ms", System.currentTimeMillis()),
            lastPushCheckMs = json.optLong("last_push_check_ms", 0),
            pushRateLimitedUntilMs = json.optLong("push_rate_limited_until_ms", 0),
        )
    }

    fun pendingSnapshot(profileId: String): JSONObject? {
        val pending = pendingByProfile[profileId] ?: return null
        val loginForm = JSONObject()
        pending.loginForm.forEach { (key, value) -> loginForm.put(key, value) }
        return JSONObject()
            .put("device_token", pending.deviceToken)
            .put("login_form", loginForm)
            .put("workflow_id", pending.workflowId)
            .put("machine_id", pending.machineId)
            .put("challenge_type", pending.challengeType)
            .put("challenge_id", pending.challengeId)
            .put("challenge_status", pending.challengeStatus)
            .put("inquiries_url", pending.inquiriesUrl)
            .put("inquiries_expired", pending.inquiriesExpired)
            .put("push_approved", pending.pushApproved)
            .put("push_issued", pending.pushIssued)
            .put("mfa_started_at_ms", pending.mfaStartedAtMs)
            .put("last_push_check_ms", pending.lastPushCheckMs)
            .put("push_rate_limited_until_ms", pending.pushRateLimitedUntilMs)
    }

    fun <T> withLoginLock(profileId: String, block: () -> T): T {
        val lock = loginLocks.getOrPut(profileId) { Any() }
        synchronized(lock) {
            return block()
        }
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
        if (pending.pushApproved) {
            return completeAfterChallengeValidated(pending, mfaCode)
        }

        refreshSheriffFromInquiries(pending)

        if (pending.challengeType != "prompt") {
            return completeCodeChallenge(pending, mfaCode)
        }

        run {
            val optionalCode = mfaCode?.takeIf { it.isNotEmpty() }
            if (optionalCode != null && !pending.challengeId.isNullOrEmpty()) {
                val respondUrl = "$RH_API/challenge/${pending.challengeId}/respond/"
                val (_, resp) = rhFormPost(respondUrl, mapOf("response" to optionalCode))
                if (resp.optString("status") == "validated") {
                    Log.i(TAG, "optional MFA code accepted — polling workflow before token")
                    pending.pushApproved = true
                    return completeAfterChallengeValidated(pending, mfaCode)
                }
                Log.w(TAG, "optional MFA code not validated status=${resp.optString("status")}")
            }

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

            val now = System.currentTimeMillis()
            var pushState: String? = null
            var pushHttpStatus = 0
            val canCheckPush = now - pending.lastPushCheckMs >= PUSH_CHECK_INTERVAL_MS
                && now >= pending.pushRateLimitedUntilMs

            if (canCheckPush) {
                pending.lastPushCheckMs = now
                val pushUrl = "$RH_API/push/$challengeId/get_prompts_status/"
                try {
                    val (status, push) = rhGet(pushUrl)
                    pushHttpStatus = status
                    if (status == 429) {
                        pending.pushRateLimitedUntilMs = now + PUSH_RATE_LIMIT_BACKOFF_MS
                        Log.w(TAG, "push HTTP 429 — rate limited; will poll workflow if push was approved")
                    } else {
                        pushState = push.optString("challenge_status").takeIf { it.isNotEmpty() }
                            ?: push.optString("status").takeIf { it.isNotEmpty() }
                            ?: "unknown"
                        Log.i(TAG, "push HTTP $status state=$pushState id=$challengeId")
                        if (pushState == "issued") pending.pushIssued = true
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "push status failed: ${e.message}")
                }
            } else {
                Log.i(TAG, "skipping push check (throttled ${now - pending.lastPushCheckMs}ms)")
            }

            if (pushState != null && isPromptApproved(pending, pushState)) {
                Log.i(TAG, "push validated — polling workflow before token")
                pending.pushApproved = true
                Thread.sleep(1500)
                return completeAfterChallengeValidated(pending, mfaCode)
            }

            if (
                pushHttpStatus == 429
                && pending.pushIssued
                && now - pending.mfaStartedAtMs >= 20_000L
            ) {
                Log.i(TAG, "push rate-limited but issued — assuming approval and polling workflow")
                pending.pushApproved = true
                return completeAfterChallengeValidated(pending, mfaCode)
            }

            return Triple(
                loginResult(
                    status = "mfa_required",
                    mode = "live",
                    message = when (pushState) {
                        "issued" -> "Push sent — approve in the Robinhood app, or enter the SMS code if you received one."
                        else -> if (pending.pushIssued) {
                            "Waiting for approval in your Robinhood app (or enter SMS code if you received one)…"
                        } else {
                            "Push sent — approve in the Robinhood app, or enter the SMS code if you received one."
                        }
                    },
                    challengeType = "prompt",
                    challengeIssued = false,
                ),
                pending,
                false,
            )
        }
    }

    private fun completeCodeChallenge(
        pending: PendingChallenge,
        mfaCode: String?,
    ): Triple<Map<String, Any?>, PendingChallenge, Boolean> {
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
                    message = "Robinhood sent a ${pending.challengeType} code — enter it below.",
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

        pending.pushApproved = true
        return completeAfterChallengeValidated(pending, mfaCode)
    }

    /**
     * Mirrors robin_stocks: poll pathfinder until workflow_status_approved, then POST oauth2/token once.
     */
    private fun completeAfterChallengeValidated(
        pending: PendingChallenge,
        mfaCode: String?,
    ): Triple<Map<String, Any?>, PendingChallenge, Boolean> {
        refreshSheriffFromInquiries(pending)
        if (pending.challengeType != "prompt") {
            pending.pushApproved = false
            return completeCodeChallenge(pending, mfaCode)
        }
        if (!pending.inquiriesExpired) {
            pollWorkflowUntilApproved(pending, maxWaitMs = 60_000)
        }
        return finalizeLoginOnce(pending)
    }

    private fun pollWorkflowUntilApproved(pending: PendingChallenge, maxWaitMs: Long = 60_000): Boolean {
        val start = System.currentTimeMillis()
        var attempt = 0
        while (System.currentTimeMillis() - start < maxWaitMs) {
            if (pending.inquiriesExpired) return false
            val body = JSONObject()
                .put("sequence", 0)
                .put("user_input", JSONObject().put("status", "continue"))
            val (status, data) = rhJsonPost(pending.inquiriesUrl, body)
            if (status == 410) {
                pending.inquiriesExpired = true
                Log.i(TAG, "workflow poll HTTP 410")
                return false
            }
            applySheriffUpdate(pending, data)
            if (pending.challengeType != "prompt" && pending.challengeStatus == "issued") {
                Log.i(TAG, "workflow poll requires ${pending.challengeType} code before token")
                pending.pushApproved = false
                return false
            }
            val wfStatus = data.optJSONObject("verification_workflow")?.optString("workflow_status").orEmpty()
            val typeResult = data.optJSONObject("type_context")?.optString("result").orEmpty()
            Log.i(TAG, "workflow poll #$attempt HTTP $status result=$typeResult wf=$wfStatus")
            if (workflowApproved(data) || wfStatus == "workflow_status_approved") {
                Log.i(TAG, "workflow_status_approved")
                return true
            }
            Thread.sleep(5000)
            attempt++
        }
        Log.w(TAG, "workflow poll timeout — proceeding with token (robin_stocks fallback)")
        return false
    }

    private fun finalizeLoginOnce(pending: PendingChallenge): Triple<Map<String, Any?>, PendingChallenge, Boolean> {
        val loginUrl = "$RH_API/oauth2/token/"
        val (_, data) = rhFormPost(loginUrl, pending.loginForm)
        data.optString("access_token").takeIf { it.isNotEmpty() }?.let { _ ->
            Log.i(TAG, "oauth2/token success after workflow approval")
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
        if (data.has("verification_workflow")) {
            val wfStatus = data.optJSONObject("verification_workflow")?.optString("workflow_status")
            Log.w(TAG, "token still has verification_workflow wf=$wfStatus")
            pending.pushApproved = false
            return Triple(
                loginResult(
                    status = "mfa_required",
                    mode = "live",
                    message = "Robinhood is still processing approval — keep this app open.",
                    challengeType = pending.challengeType,
                    challengeIssued = false,
                ),
                pending,
                false,
            )
        }
        val detail = data.optString("detail").takeIf { it.isNotEmpty() }
            ?: "Login failed after verification."
        Log.w(TAG, "post-MFA token failed: $detail")
        pending.pushApproved = false
        return Triple(
            loginResult(
                status = "mfa_required",
                mode = "live",
                message = detail,
                challengeType = pending.challengeType,
                challengeIssued = false,
            ),
            pending,
            false,
        )
    }

    private fun applySheriffUpdate(pending: PendingChallenge, inq: JSONObject) {
        extractSheriffChallenge(inq)?.let { (ctype, cid, cstatus) ->
            if (ctype != "prompt" && pending.challengeType == "prompt") {
                Log.i(TAG, "sheriff changed prompt -> $ctype during workflow poll")
                pending.pushApproved = false
            }
            pending.challengeType = ctype
            if (!cid.isNullOrEmpty()) pending.challengeId = cid
            if (!cstatus.isNullOrEmpty()) pending.challengeStatus = cstatus
        }
    }

    /** Refresh sheriff challenge metadata each poll (matches desktop Rust). */
    private fun refreshSheriffFromInquiries(pending: PendingChallenge) {
        if (pending.inquiriesExpired) return
        try {
            val (inqStatus, inq) = rhGet(pending.inquiriesUrl)
            if (inqStatus == 410) {
                pending.inquiriesExpired = true
                Log.i(TAG, "inquiries HTTP 410 — workflow session consumed; using cached challenge")
                return
            }
            val sheriff = findSheriffChallenge(inq)
            Log.i(
                TAG,
                "inquiries HTTP $inqStatus id=${sheriff?.optString("id")} status=${sheriff?.optString("status")}",
            )
            applySheriffUpdate(pending, inq)
            if (pending.challengeType == "prompt" && pending.challengeStatus == "issued") {
                pending.pushIssued = true
            }
        } catch (e: Exception) {
            Log.w(TAG, "inquiries refresh failed: ${e.message}")
        }
    }

    private fun pollWorkflow(inquiriesUrl: String, maxAttempts: Int = 8) {
        for (attempt in 0 until maxAttempts) {
            val body = JSONObject()
                .put("sequence", 0)
                .put("user_input", JSONObject().put("status", "continue"))
            val (_, data) = rhJsonPost(inquiriesUrl, body)
            if (workflowApproved(data)) {
                return
            }
            if (attempt < maxAttempts - 1) {
                Thread.sleep(2000)
            }
        }
        Log.i(TAG, "workflow poll finished (proceeding with token request)")
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

    private fun isPromptApproved(pending: PendingChallenge, pushState: String): Boolean {
        if (pushState in PROMPT_APPROVED_STATES) return true
        val sheriffStatus = pending.challengeStatus.orEmpty()
        if (sheriffStatus in PROMPT_APPROVED_STATES) return true
        return false
    }

    private val PROMPT_APPROVED_STATES = setOf("validated", "redeemed", "approved", "completed")

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
