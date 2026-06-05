# Portfolio Sidekick (for Robinhood)

An advanced, premium, and locally-running stock analysis, prediction, and tracking tool designed specifically to help users plan, strategize, and execute trades while managing risks. It integrates secure local authentication with **Robinhood** via the excellent open-source `robin_stocks` library, while utilizing a localized SQLite DB (or serverless `localStorage` inside mobile environments) to record custom price predictions ("Gut Predictions") and automatically evolve indicator weights based on historical accuracy.

Created by: **Roy Dawson IV**  
* GitHub: [https://github.com/imyourboyroy](https://github.com/imyourboyroy)  
* PyPi: [https://pypi.org/user/ImYourBoyRoy/](https://pypi.org/user/ImYourBoyRoy/)

---

## 💻 High-Fidelity Interface

**Portfolio Sidekick** features a premium, state-of-the-art **Obsidian Glassmorphic Interface** custom designed with Google Outfit/Inter typography, harmonious purple/mint accent colors, glowing overlays, and full interactive SVG charts.

> [!TIP]
> Jump directly to the [Sample Walkthrough & Visuals](#4-sample-walkthrough--visuals) section to view high-resolution, real screenshots of all dashboard views, sync modals, and strategy planners!

---

## 🔒 Security & Privacy (Segregated Standalone Architecture)

Your peace of mind and data security are the highest priority. **Portfolio Sidekick** uses a **fully segregated, device-local architecture**:

* **Zero Cross-Device Sync:** Android and desktop are **completely independent**. Robinhood sessions, tokens, and profiles **never sync** between your phone and PC. Use either platform on its own.
* **No Companion / LAN Mode:** There is no pairing, no shared backend URL, and no `HOST=0.0.0.0` network exposure. Desktop production builds use **pywebview IPC only** (no TCP listener). Android uses a **native on-device Robinhood plugin** (HTTPS to `api.robinhood.com` only).
* **Encrypted Session Vaults:** Robinhood OAuth tokens are stored in encrypted vaults (Windows DPAPI / Fernet on desktop; Android Keystore + EncryptedSharedPreferences on mobile). Passwords are **never persisted**.
* **Sync is 100% Optional:** Sandbox mode, paste import, and manual holdings work without any Robinhood connection.
* **True Local Isolation (Zero Cloud):** No cloud databases, telemetry, or third-party relay servers.

---

## 1. Use Case Synopsis

**Portfolio Sidekick** delivers a high-aesthetic, production-grade local suite to track and analyze equity holdings securely:
* **Multi-User Profiles**: Seamless profile-switching supporting independent portfolios and prediction track-records.
* **Two-Phase Non-Blocking Auth**: Secure integration with Robinhood supporting SMS, Email, and App Push multi-factor authentication (MFA) challenges.
* **Advanced Scoring Scanners**: Pure Python calculation engine for Wilder Relative Strength Index (RSI), MACD Histogram, Bollinger Bands, and dynamic EMA/SMA crossovers.
* **Watchlist & Entry Triggers**: High-fidelity watchlist supporting live quote checks and technical entry scanning (e.g. *Oversold Pullback*, *Bollinger Support Bounce*, *Bullish Momentum Shift*).
* **Tactical Rebalancer**: Real-time allocation simulator previews share trades and cash shifts before making live movements.
* **Bracket Strategy Blueprints**: Dynamic trade templates automatically calculating multi-stage Scale-Out profit takes and Scale-In DCA support entries.
* **Self-Evolving Local Weights**: Resolves custom price predictions over time, backtesting indicators across multiple historical epochs (Swing, Cycle, and Peak-to-Trough Stress) to calibrate the local recommender automatically.

---

## 2. Platform Portability & Releases

The toolkit is designed to be fully portable and compiled into standalone executable environments across major architectures (supporting both **x64** and **ARM64** platforms natively):

| Platform | Output Artifact | Format / Delivery | Architecture Support |
| :--- | :--- | :--- | :--- |
| **Windows** | `PortfolioSidekick-Windows.exe` | Standalone Portable Executable | x64 |
| **macOS** | `PortfolioSidekick-MacOS.zip` | Standalone `.app` Application Bundle | ARM64 / Universal |
| **Linux (Ubuntu)** | `PortfolioSidekick-Linux.tar.gz` | Standalone Portable Tarball | x64 |
| **Android** | `PortfolioSidekick-Android.apk` | Native Mobile Application Package (Home Launcher label: **Sidekick**) | ARM64 |

### Automated Compilations on GitHub
Every release tag pushed (e.g., `v*`) automatically triggers our GitHub Actions pipeline, compiling static frontend assets, packing the Python server, and embedding custom native icons (`assets/icon.ico` / `assets/icon.icns`) for clean desktop presentation. 

---

## 3. Integration Guide

### Standalone Integration (Local Execution)

If you prefer running the development server locally:

#### Prerequisites
* **Python**: 3.11+ (Tested on **Python 3.11.15** and native **Python 3.14.5**)
* **Node.js**: v20+ (Tested on **v20** & **v26**)

#### Installation & Execution
1. **Clone and Enter Workspace**:
   ```bash
   git clone https://github.com/imyourboyroy/StockToolkit.git
   cd StockToolkit
   ```
2. **Install Python Server Dependencies**:
   ```bash
   pip install -r backend/requirements.txt
   ```
3. **Development Desktop (loopback HTTP + IPC window)**:
   ```bash
   cd backend
   python main.py
   ```
   *Dev mode serves API at `http://127.0.0.1:8000` with a local session token. Production `.exe` / `.app` builds use IPC only — no HTTP port.*
4. **Boot React Frontend Dashboard (optional hot reload)**:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   *Loads at `http://localhost:5173` and talks to the dev backend using `X-Sidekick-Local-Session`.*
5. **Android standalone build**:
   ```bash
   cd frontend
   npm run build
   npx cap sync android
   ```
   *Robinhood auth runs entirely on-device via the native `RobinhoodSession` Capacitor plugin. No desktop dependency.*

---

### Agentic & MCP Server Integration

**Portfolio Sidekick** is designed with autonomous software agents in mind, offering low hidden state, strict typing, and high testability.

#### 1. Calling the Verification Engine Natively
Agents can programmatically execute the integrity check suite to assert correct local SQLite database behavior and quantitative scanner outputs:
```bash
python backend/verify_toolkit.py
```

#### 2. Querying Backend Endpoints via MCP HTTP Gateway (Dev Mode Only)
In development, MCP clients can query the loopback API with a session header:
```bash
TOKEN=$(curl -s http://127.0.0.1:8000/api/dev/session | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
curl -H "X-Sidekick-Local-Session: $TOKEN" http://127.0.0.1:8000/api/profiles
```
Production desktop builds do not expose HTTP.

---

## 4. Sample Walkthrough & Visuals

**Portfolio Sidekick** runs as a **standalone app per platform**: desktop via PyWebView + Python IPC, Android via Capacitor + native Robinhood plugin. Portfolio data is stored locally (SQLite on desktop, `localStorage` on Android). Robinhood sessions never leave the device they were created on.

Below is an authentic visual walkthrough of the real, running application:

### 📊 1. Multi-Profile Dashboard Overview
Exposes beautiful, real-time capital deployed summary cards, unrealized P&L gauges, asset allocation weights, and a unified scoring dial. Bootstraps a single, highly detailed active profile named **"Example"** pre-populated with realistic quantum and technology holdings (e.g. QBTS, RGTI, NVDA, AMD) to showcase the interface instantly:

![Dashboard Overview](assets/screenshot_dashboard.png)

---

### 🔒 2. Two-Phase Non-Blocking Local Sync
Allows secure, direct Robinhood connection synchronizing holdings natively. Your credentials remain isolated locally under your profile sessions. Username fields are fully anonymized (`example.user@domain.com`) and passwords are masked with standard anonymous placeholder dots:

![Robinhood Local Sync](assets/screenshot_login.png)

---

### 📈 3. Interactive Technical Coach Chart
Exposes custom financial charting rendered natively using responsive SVG shapes, featuring **interactive cursor crosshair guidelines**, **floating glassmorphism OHLC hover tooltips**, cost-basis lines ($212.49), SMA 50, Bollinger Bands, and glowing action markers on the price path:

![Interactive Coach Chart](assets/screenshot_coach.png)

---

### 🔮 4. Oracle Predictor & Cognitive Archetype
Allows you to submit Price Target predictions (e.g. "$X in Y days") to evaluate your market intuition. As SQLite/localStorage tracks your precision, the system processes your cognitive traits and issues a detailed **Cognitive Oracle Archetype Certificate** analyzing short-term and long-term percentage hit rates:

![Oracle Predictor Certificate](assets/screenshot_oracle.png)

---

### 🛡️ 5. Tactical Strategy & Bracket Planner
Exposes real-time rebalancing simulator calculators, single-sector concentration warning gauges (capping allocations at 25%), scale-out profit take brackets, and a dynamic **VIX-smoothed Market Regime Filter** that automatically tightens buy scoring rules under bearish cycles:

![Tactical Strategy Planner](assets/screenshot_strategy.png)

---

## 5. Acknowledgements & Credits

We stand on the shoulders of giants. This toolkit would not be possible without the incredible work of the open-source community:

* **Robinhood Integration**: A massive thank you to **Josh Smith** and all contributors of [robin-stocks](https://github.com/jmrosz/robin-stocks). Their fantastic Python library serves as the secure backbone of our connection interface, allowing safe, robust, and programmatic interactions with Robinhood.
* **Window Management**: Special thanks to the developers of [pywebview](https://pywebview.flowrl.com) for providing a lightweight, cross-platform Edge WebView2/WebKit wrapper to containerize our React UI into a desktop executable.
* **FastAPI Server**: Grateful to **Sebastián Ramírez** and the [FastAPI](https://fastapi.tiangolo.com) community for their blazing-fast, typed web gateway router.
* **React / Vite / Lucide**: Kudos to the core developers of [React](https://react.dev), [Vite](https://vite.dev), and [Lucide Icons](https://lucide.dev) for providing high-fidelity visual and micro-animation foundations that make this application premium and glassmorphic.

---

## 6. Project Directory Map

```text
StockToolkit/
├── .github/
│   └── workflows/
│       └── build.yml         # Matrix Release compilations (Win/Mac/Linux/Android)
├── assets/
│   ├── logo.png              # High-fidelity geometric Obsidian branding
│   ├── icon.ico              # Multi-resolution Windows app executable icon
│   ├── icon.icns             # Multi-resolution macOS app bundle icon
│   ├── icon.png              # High-resolution PNG logo wrapper
│   └── android/              # Responsive Android density launcher launcher icons
├── backend/
│   ├── requirements.txt      # Lightweight pure-python package list
│   ├── database.py           # SQLite local profile & database operations
│   ├── robinhood_client.py   # Two-phase non-blocking Robinhood authenticator
│   ├── session_vault.py      # Encrypted at-rest OAuth token storage
│   ├── desktop_bridge.py     # Production pywebview IPC (no HTTP)
│   ├── local_session.py      # Dev-mode loopback session middleware
│   ├── advisor.py            # Quantitative indicators and evolution loops
│   ├── generate_icons.py     # Pillow-driven icon conversion pipeline
│   ├── verify_toolkit.py     # Automated quantitative test & verification suite
│   └── main.py               # Uvicorn FastAPI interface entry point
├── frontend/
│   ├── capacitor.config.json # Mobile application mapping parameters
│   ├── package.json          # UI Node package parameters
│   └── src/
│       ├── index.css         # Custom responsive obsidian CSS queries
│       ├── App.jsx           # Main React UI Dashboard & SVG Charts
│       ├── main.jsx          # Vite initialization layout
│       ├── sidekickClient.js # Unified platform transport (IPC / Android native / dev HTTP)
│       ├── plugins/robinhood-session/  # Capacitor Robinhood plugin bridge
│       └── serverless/       # Offline local storage DB, advisor calculations, public quotes
│   └── native/android/       # Kotlin Robinhood auth plugin sources (injected at CI build)
└── PortfolioSidekick.spec     # PyInstaller single-file desktop compilation parameters
```
