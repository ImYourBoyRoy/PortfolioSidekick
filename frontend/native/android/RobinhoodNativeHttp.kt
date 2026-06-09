package com.imyourboyroy.portfoliosidekick

import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

/**
 * OkHttp client with an in-memory cookie jar for the Robinhood login/MFA flow.
 * Mirrors Tauri reqwest cookie_store(true) so pathfinder → inquiries → push share session cookies.
 */
object RobinhoodNativeHttp {
    private val cookieJar = RobinhoodCookieJar()

    private val client: OkHttpClient = OkHttpClient.Builder()
        .cookieJar(cookieJar)
        .connectTimeout(45, TimeUnit.SECONDS)
        .readTimeout(45, TimeUnit.SECONDS)
        .writeTimeout(45, TimeUnit.SECONDS)
        .followRedirects(true)
        .build()

    fun resetCookies() {
        cookieJar.clear()
    }

    fun request(
        method: String,
        url: String,
        headers: Map<String, String>,
        body: String?,
        contentType: String?,
    ): Pair<Int, String> {
        val httpUrl = url.toHttpUrlOrNull() ?: throw IllegalArgumentException("Invalid URL: $url")
        val builder = Request.Builder().url(httpUrl)
        for ((key, value) in headers) {
            if (key.equals("Cookie", ignoreCase = true)) continue
            builder.addHeader(key, value)
        }

        val upper = method.uppercase()
        val request = when (upper) {
            "GET" -> builder.get().build()
            "HEAD" -> builder.head().build()
            else -> {
                val mediaType = (contentType ?: "application/json").toMediaType()
                val requestBody = (body ?: "").toRequestBody(mediaType)
                builder.method(upper, requestBody).build()
            }
        }

        client.newCall(request).execute().use { response ->
            val text = response.body?.string() ?: ""
            return response.code to text
        }
    }

    private class RobinhoodCookieJar : CookieJar {
        private val store = ConcurrentHashMap<String, MutableList<Cookie>>()

        override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
            if (cookies.isEmpty()) return
            val bucket = store.getOrPut(url.host) { mutableListOf() }
            for (cookie in cookies) {
                bucket.removeAll { it.name == cookie.name && it.domain == cookie.domain && it.path == cookie.path }
                bucket.add(cookie)
            }
        }

        override fun loadForRequest(url: HttpUrl): List<Cookie> {
            val hostCookies = store[url.host] ?: return emptyList()
            return hostCookies.filter { it.matches(url) }
        }

        fun clear() {
            store.clear()
        }
    }
}
