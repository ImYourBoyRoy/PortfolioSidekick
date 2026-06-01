# Local Agent Guidelines & Versioning Standards

This document establishes local execution rules and cutting-edge versioning directives for Portfolio Sidekick agents.

## 1. Cutting-Edge Versioning Directive
- **Node.js Environment:** Always compile and execute utilizing the latest LTS or cutting-edge Node.js environment (specifically **Node 24+**). Legacy configurations (Node 20 or lower) are strictly deprecated to prevent dependency conflicts with next-generation packages.
- **Build Configurations:** In all automated environments (such as GitHub Actions pipelines and local compiler scripts), specify Node.js `'24'` or higher and force JavaScript actions to execute in Node 24 by configuring `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true` at the global env scale.
- **Capacitor & Mobile SDKs:** Standardize on Capacitor 6/7/8+ which mandates Node >= 22.0.0. Ensure the Gradle wrapper, JDK (Java 21+), and compiler targets remain fully modern.
- **Python Environment:** Enforce the latest stable Python 3.12+ environments for all local interpreter instances and CI runner configurations to maximize efficiency, compile optimization, and syntax safety.

## 2. Maintenance & Continuity
- **Database Migrations:** Keep SQLite databases portable and zero-dependency. Do not introduce database schemas that break multi-platform portability (e.g. Edge WebView2, Android Capacitor, macOS packages).
- **Security Checkpoints:** When testing locally or in CI/CD, scrub and wipe active session tokens cleanly. Never commit or track `.pickle` or `.db` files containing credentials.
