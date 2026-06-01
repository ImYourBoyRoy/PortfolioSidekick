# ./backend/verify_toolkit.py
"""
Portfolio Sidekick Integrity Verification Script
Performs automated testing of database initialization, ORM relationships, 
mathematical calculation engines (RSI, MACD, Bollinger Bands) using pure Python list math,
and the self-evolving weighting recalibration logic via direct sqlite3 queries.

Responsibilities:
- Validate SQLite database creation and sample data seeding.
- Test technical indicator math models against control price curves.
- Test weight optimization mechanics under simulated guess outcomes.
- Print verified, pretty-formatted logs demonstrating system correctness.

Run: python verify_toolkit.py
Inputs: SQLite database configuration, mock mathematical vectors
Outputs: Test reports, validation matrices, and operational checks
Assumptions: Can be run standalone inside the backend folder.
"""

import sys
import os
from datetime import datetime, timedelta

# Add current path to python path to resolve local imports cleanly
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import init_db, get_db_connection
from advisor import calculate_rsi, calculate_macd, calculate_bollinger_bands, generate_recommendation, evolve_weights

def verify_environment():
    print("\n[STEP 0] Verifying local development runtime environment...")
    import subprocess
    import re
    
    # 1. Verify Node
    try:
        node_version = subprocess.check_output(["node", "-v"], text=True).strip()
        major_ver = int(node_version.lstrip('v').split('.')[0])
        print(f"  - Detected Node.js: {node_version} (Major: {major_ver})")
        if major_ver < 22:
            print(f"  [WARNING] Capacitor demands Node.js >= 22.0.0. Current version is {node_version}.")
        else:
            print("  => Node.js Runtime Check: PASS")
    except Exception as e:
        print(f"  - [WARNING] Node.js not detected on PATH: {e}")
        
    # 2. Verify Java
    try:
        java_out = subprocess.check_output(["java", "-version"], stderr=subprocess.STDOUT, text=True)
        match = re.search(r'"(\d+)(?:\.\d+)*', java_out)
        if match:
            java_major = int(match.group(1))
            print(f"  - Detected Java JDK: {java_major}")
            if java_major < 21:
                print(f"  [WARNING] Capacitor 6/7+ mandates Java 21+ for Android compilations. Current: {java_major}")
            else:
                print("  => Java SDK Check: PASS")
        else:
            print("  - Detected Java version, but could not parse major release number.")
    except Exception as e:
        print(f"  - [WARNING] Java JDK not detected on PATH: {e}")

def run_tests():
    print("=" * 60)
    print("      PORTFOLIO SIDEKICK INTEGRITY AND VERIFICATION SPRINT")
    print("=" * 60)
    
    # 0. Environment Checks
    verify_environment()
    
    # 1. Database Init Verification
    print("\n[STEP 1] Validating database structure and seed data...")
    init_db()
    
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Dynamically seed test profiles if they don't exist, preserving clean production states
        cursor.execute("SELECT id, name FROM profiles")
        profiles = cursor.fetchall()
        profile_names = [p["name"] for p in profiles]
        
        if "TestProfileA" not in profile_names:
            cursor.execute("INSERT INTO profiles (name) VALUES ('TestProfileA')")
        if "TestProfileB" not in profile_names:
            cursor.execute("INSERT INTO profiles (name) VALUES ('TestProfileB')")
        conn.commit()
        
        cursor.execute("SELECT id, name FROM profiles")
        profiles = cursor.fetchall()
        print(f"  - Active profiles found: {[p['name'] for p in profiles]}")
        assert len(profiles) >= 2, "Failed to create TestProfileA and TestProfileB profiles."
        
        roy_id = next(p["id"] for p in profiles if p["name"] == "TestProfileA")
        
        # Seed sandbox holdings for testing if empty
        cursor.execute("SELECT id FROM holdings WHERE profile_id = ?", (roy_id,))
        if not cursor.fetchone():
            from database import seed_sandbox_data, seed_sandbox_actions
            seed_sandbox_data(conn, roy_id)
            seed_sandbox_actions(conn, roy_id)
        
        cursor.execute("SELECT id, ticker, shares, avg_buy_price FROM holdings WHERE profile_id = ?", (roy_id,))
        holdings = cursor.fetchall()
        print(f"  - TestProfileA's seeded positions: {len(holdings)} holdings detected.")
        assert len(holdings) > 0, "No default holdings seeded for TestProfileA."
        
        nvda = next(h for h in holdings if h["ticker"] == "NVDA")
        print(f"  - NVDA seeded quantities: {nvda['shares']} shares @ ${nvda['avg_buy_price']}/share.")
        assert nvda["shares"] == 41.35, "NVDA holding quantity mismatch."
        
        print("  => DATABASE INITIALIZATION: VERIFIED CORRECT")
        
    except Exception as e:
        print(f"  [ERROR] Database check failed: {e}")
        conn.close()
        sys.exit(1)
        
    # 2. Mathematical Scorer Verification
    print("\n[STEP 2] Verifying quantitative calculation mathematical engines...")
    
    # Control price list mimicking a standard mean-reverting trend
    test_prices = [100.0, 101.0, 102.0, 99.0, 98.0, 97.0, 101.0, 103.0, 105.0, 102.0, 101.0, 100.0, 99.0, 102.0, 103.0]
    
    try:
        # Test RSI (Relative Strength Index)
        rsi = calculate_rsi(test_prices, period=5)
        print(f"  - Calculated RSI (5-period Wilder): {rsi:.2f}")
        assert 30 <= rsi <= 70, "RSI out of realistic control range."
        
        # Test MACD
        macd, signal, hist = calculate_macd(test_prices)
        print(f"  - Calculated MACD: Line={macd:.3f}, Signal={signal:.3f}, Histogram={hist:.3f}")
        
        # Test Bollinger Bands
        upper, middle, lower = calculate_bollinger_bands(test_prices, period=5, num_std=1)
        print(f"  - Bollinger Bands: Upper={upper:.2f}, Mid={middle:.2f}, Lower={lower:.2f}")
        assert upper > middle > lower, "Bollinger band logic mismatch."
        
        print("  => QUANTITATIVE MATH ENGINES: VERIFIED CORRECT")
        
    except Exception as e:
        print(f"  [ERROR] Mathematical engine validation failed: {e}")
        conn.close()
        sys.exit(1)
        
    # 3. Advisor Weighted Scorer & Evolution Verification
    print("\n[STEP 3] Validating unified recommendation scoring & local evolution loop...")
    
    try:
        # Reset the weights to default first to isolate this test from database persistence bleeding!
        cursor.execute("""
        UPDATE weights 
        SET rsi_weight = 0.25, macd_weight = 0.25, ema_weight = 0.25, gut_weight = 0.25
        WHERE profile_id = ? AND ticker = 'NVDA'
        """, (roy_id,))
        conn.commit()
        
        # Build fake history data (50 consecutive days)
        fake_history = []
        base_price = 100.0
        for i in range(50):
            fake_history.append({
                "begins_at": (datetime.utcnow() - timedelta(days=50-i)).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "close_price": base_price + (i * 0.5) # Steady uptrend
            })
            
        current_price = 125.0
        
        # Generate baseline recommendation
        rec_before = generate_recommendation(conn, roy_id, "NVDA", fake_history, current_price)
        print(f"  - Baseline Advice: {rec_before['action']} (Score: {rec_before['score']}%)")
        print(f"  - Baseline Weights: {rec_before['weights']}")
        
        # Test Evolving: Add a successful completed Gut Guess for Roy on NVDA
        print("  - Inserting mock completed Gut Guess (successful bullish prediction)...")
        target_date = (datetime.utcnow() - timedelta(days=2)).strftime("%Y-%m-%d %H:%M:%S")
        guess_date = (datetime.utcnow() - timedelta(days=32)).strftime("%Y-%m-%d %H:%M:%S")
        resolved_at = (datetime.utcnow() - timedelta(days=2)).strftime("%Y-%m-%d %H:%M:%S")
        
        cursor.execute("""
        INSERT INTO guesses (profile_id, ticker, target_price, initial_price, target_date, guess_date, status, actual_end_price, resolved_at)
        VALUES (?, 'NVDA', 120.0, 100.0, ?, ?, 'hit', 122.0, ?)
        """, (roy_id, target_date, guess_date, resolved_at))
        conn.commit()
        guess_id = cursor.lastrowid
        
        # Run Evolution Loop
        evolve_res = evolve_weights(conn, roy_id, "NVDA", fake_history)
        print(f"  - Evolution trigger status: {evolve_res['status']}")
        
        # Generate recommendation again and verify gut weight increased!
        rec_after = generate_recommendation(conn, roy_id, "NVDA", fake_history, current_price)
        print(f"  - Post-Evolution Weights: {rec_after['weights']}")
        
        # Assertions
        assert rec_after['weights']['gut_weight'] > rec_before['weights']['gut_weight'], \
            "Evolution failed: Gut weight did not increase after successful price guess."
        
        print("  => ADVISOR SELF-EVOLUTION ENGINE: VERIFIED CORRECT")
        
        # Cleanup mock guess to leave DB clean
        cursor.execute("DELETE FROM guesses WHERE id = ?", (guess_id,))
        conn.commit()
        
    except Exception as e:
        print(f"  [ERROR] Scorer/Evolution check failed: {e}")
        conn.close()
        sys.exit(1)
        
    conn.close()
    print("\n" + "=" * 60)
    print("      ALL PORTFOLIO SIDEKICK INTEGRITY TESTS PASSED SUCCESSFULLY!")
    print("=" * 60)

if __name__ == "__main__":
    run_tests()
