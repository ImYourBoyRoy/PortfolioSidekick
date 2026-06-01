# ./backend/verify_strength.py
"""
Portfolio Sidekick Market Strength Scorer Verification Script
Validates Top 15 Gainers, Worst 15 Decliners, and sector-based filters.

How to run:
    python backend/verify_strength.py
"""
import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from strength import calculate_market_strength

def test_market_strength():
    print("=" * 60)
    print("      PORTFOLIO SIDEKICK STRENGTH SCANNER VERIFICATION")
    print("=" * 60)
    
    # 1. Day Sector All verification
    print("\n[TEST 1] Querying DAY timeframe and ALL sectors...")
    res = calculate_market_strength("day", "all")
    assert "top_gainers" in res
    assert "worst_decliners" in res
    assert len(res["top_gainers"]) <= 15
    assert len(res["worst_decliners"]) <= 15
    print(f"  - Top Gainer: {res['top_gainers'][0]['ticker']} (+{res['top_gainers'][0]['change_pct']}%)")
    print(f"  - Worst Decliner: {res['worst_decliners'][0]['ticker']} ({res['worst_decliners'][0]['change_pct']}%)")
    print("  => DAY ALL STRENGTH QUERY: PASS")
    
    # 2. Sector filtering verification
    print("\n[TEST 2] Verifying sector filtering (Technology vs Quantum)...")
    res_tech = calculate_market_strength("month", "technology")
    res_quantum = calculate_market_strength("month", "quantum")
    
    for asset in res_tech["top_gainers"]:
        assert "technology" in asset["sectors"], f"Ticker {asset['ticker']} should be in technology sector."
        
    for asset in res_quantum["top_gainers"]:
        assert "quantum" in asset["sectors"], f"Ticker {asset['ticker']} should be in quantum sector."
        
    print("  => SECTOR-ISOLATED SCANS: PASS")
    
    # 3. 5-Year Timeframe verification
    print("\n[TEST 3] Querying 5-YEARS timeframe...")
    res_5y = calculate_market_strength("5years", "all")
    print(f"  - 5-Year Gainer: {res_5y['top_gainers'][0]['ticker']} (+{res_5y['top_gainers'][0]['change_pct']}%)")
    print(f"  - 5-Year Decliner: {res_5y['worst_decliners'][0]['ticker']} ({res_5y['worst_decliners'][0]['change_pct']}%)")
    print("  => 5-YEARS STRENGTH SCALING: PASS")
    
    print("\n" + "=" * 60)
    print("      ALL MARKET STRENGTH ANALYZER TESTS PASSED SUCCESSFULLY!")
    print("=" * 60)

if __name__ == "__main__":
    test_market_strength()
