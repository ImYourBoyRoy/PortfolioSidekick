# ./recreate_git_repo.py
"""
Portfolio Sidekick Git Re-creation Script
Deletes the old StockToolkit remote repository (if token permits), creates a new private
PortfolioSidekick repository on GitHub, recreates the local git history cleanly, and pushes main.

Run: python recreate_git_repo.py
Inputs: .env configuration with GITHUB_TOKEN
Outputs: Fresh local git history and pushed main branch + release tag v1.3.0
Assumptions: git CLI is available on local machine.
"""

import os
import sys
import shutil
import subprocess
import urllib.request
import urllib.error
import json

def get_token():
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if not os.path.exists(env_path):
        print("[ERROR] .env file not found!")
        sys.exit(1)
    with open(env_path, "r") as f:
        for line in f:
            if line.startswith("GITHUB_TOKEN="):
                return line.split("=")[1].strip()
    print("[ERROR] GITHUB_TOKEN not found in .env!")
    sys.exit(1)

def github_api_call(url, token, method="GET", data=None):
    headers = {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "PortfolioSidekick-Agent"
    }
    
    req_data = None
    if data:
        req_data = json.dumps(data).encode("utf-8")
        headers["Content-Type"] = "application/json"
        
    req = urllib.request.Request(url, headers=headers, method=method, data=req_data)
    try:
        with urllib.request.urlopen(req) as res:
            if res.status in [200, 201, 204]:
                content = res.read().decode("utf-8")
                return True, json.loads(content) if content else {}
    except urllib.error.HTTPError as e:
        err_content = e.read().decode("utf-8")
        print(f"[API ERROR] {method} {url} returned status {e.code}: {err_content}")
        return False, err_content
    except Exception as e:
        print(f"[ERROR] API request failed: {e}")
        return False, str(e)

def main():
    token = get_token()
    username = "ImYourBoyRoy"
    old_repo = "StockToolkit"
    new_repo = "PortfolioSidekick"
    
    print(f"1. Attempting to delete remote GitHub repository {username}/{old_repo}...")
    delete_url = f"https://api.github.com/repos/{username}/{old_repo}"
    success, resp = github_api_call(delete_url, token, method="DELETE")
    if success:
        print(f"  => Remote repository {old_repo} deleted successfully!")
    else:
        print(f"  => Could not delete remote repository via API (likely insufficient token scope or repo doesn't exist). Please delete it manually in GitHub settings if needed.")
        
    print(f"2. Creating new private remote GitHub repository {username}/{new_repo}...")
    create_url = "https://api.github.com/user/repos"
    create_data = {
        "name": new_repo,
        "private": True,
        "description": "Local Privacy-Preserved Companion for Robinhood"
    }
    success, resp = github_api_call(create_url, token, method="POST", data=create_data)
    if success:
        print(f"  => Remote repository {new_repo} created successfully!")
    else:
        print(f"  => Failed to create remote repository! Error: {resp}")
        sys.exit(1)
        
    workspace = os.path.dirname(os.path.abspath(__file__))
    git_dir = os.path.join(workspace, ".git")
    
    print("3. Destroying local Git history...")
    if os.path.exists(git_dir):
        def on_rm_error(func, path, exc_info):
            import stat
            os.chmod(path, stat.S_IWRITE)
            func(path)
        shutil.rmtree(git_dir, onerror=on_rm_error)
        print("  => Local .git folder removed successfully.")
        
    print("4. Initializing fresh local Git repository...")
    subprocess.run(["git", "init"], cwd=workspace, check=True)
    subprocess.run(["git", "branch", "-M", "main"], cwd=workspace, check=True)
    
    subprocess.run(["git", "config", "user.name", "Roy Dawson IV"], cwd=workspace, check=True)
    subprocess.run(["git", "config", "user.email", "Roy.Dawson.IV@gmail.com"], cwd=workspace, check=True)
    
    remote_url = f"https://{token}@github.com/{username}/{new_repo}.git"
    subprocess.run(["git", "remote", "add", "origin", remote_url], cwd=workspace, check=True)
    print(f"  => Fresh repository initialized and remote set to {new_repo}.")
    
    print("5. Committing all local files...")
    subprocess.run(["git", "add", "."], cwd=workspace, check=True)
    subprocess.run(["git", "commit", "-m", "feat: initial commit for Portfolio Sidekick re-branding"], cwd=workspace, check=True)
    
    print("6. Pushing to GitHub main branch...")
    subprocess.run(["git", "push", "-u", "origin", "main", "--force"], cwd=workspace, check=True)
    print("  => Main branch pushed successfully!")
    
    print("7. Creating and pushing release tag v1.3.0...")
    subprocess.run(["git", "tag", "v1.3.0"], cwd=workspace, check=True)
    subprocess.run(["git", "push", "origin", "v1.3.0"], cwd=workspace, check=True)
    print("  => Release tag v1.3.0 pushed successfully to trigger CI/CD builds!")
    
    print("\n[SUCCESS] Git repository fully re-created and published under PortfolioSidekick!")

if __name__ == "__main__":
    main()
