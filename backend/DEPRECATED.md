# Deprecated Python Backend

The Python FastAPI + `robin_stocks` + pywebview runtime is **deprecated** as of v1.7.0.

## Current architecture

| Concern | Location |
|---------|----------|
| UI | `frontend/src/App.jsx` |
| API routes | `frontend/src/serverless/apiRouter.js` |
| Robinhood auth | `frontend/src/serverless/robinhoodAuth*.js` |
| SQLite database | `frontend/src/serverless/db/` (sql.js + native persist) |
| Desktop shell | Tauri 2 (`frontend/src-tauri/`) |
| Android shell | Capacitor (`frontend/android/`) |

## Legacy files (retained for reference / verification scripts only)

- `main.py`, `desktop_bridge.py`, `robinhood_client.py` — not used in production builds
- `database.py` — schema reference; JS schema in `frontend/src/serverless/db/schema.js`
- `session_vault.py` — replaced by `RobinhoodSession` vault plugin

## Running legacy Python (optional)

```bash
pip install -r backend/requirements-legacy.txt
cd backend && python main.py
```

Do not use for new development.
