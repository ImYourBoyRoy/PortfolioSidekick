# ./backend/generate_icons.py
"""
Portfolio Sidekick Icon Generator
Dynamically verifies Pillow installation and converts the generated high-resolution
PNG logo into multi-platform app assets: Windows (.ico), macOS (.icns fallback), 
and Android/Linux responsive sizes.

Created by: Roy Dawson IV
"""

import os
import sys
import subprocess

def ensure_pillow():
    try:
        from PIL import Image
        return True
    except ImportError:
        print("Pillow not found. Installing Pillow dynamically...")
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install", "Pillow"])
            return True
        except Exception as e:
            print(f"Failed to install Pillow: {e}")
            return False

def generate_assets():
    if not ensure_pillow():
        print("Cannot generate icons without Pillow.")
        return
        
    from PIL import Image
    
    # Establish paths portable next to execute
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    logo_path = os.path.join(base_dir, "assets", "logo.png")
    
    if not os.path.exists(logo_path):
        print(f"Error: High-res logo not found at {logo_path}")
        return
        
    img = Image.open(logo_path)
    
    # 1. Windows ICO generation (multi-resolution embedded)
    ico_path = os.path.join(base_dir, "assets", "icon.ico")
    icon_sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    img.save(ico_path, format="ICO", sizes=icon_sizes)
    print(f"[SUCCESS] Generated Windows app icon: {ico_path}")
    
    # 2. macOS ICNS generation (multi-resolution embedded)
    icns_path = os.path.join(base_dir, "assets", "icon.icns")
    try:
        img.save(icns_path, format="ICNS")
        print(f"[SUCCESS] Generated macOS app icon: {icns_path}")
    except Exception as e:
        print(f"[WARNING] Failed to generate macOS ICNS: {e}")
        
    # 3. Standard PNG high-res icon
    png_icon_path = os.path.join(base_dir, "assets", "icon.png")
    img.resize((512, 512), Image.Resampling.LANCZOS).save(png_icon_path, format="PNG")
    print(f"[SUCCESS] Generated standard high-res icon: {png_icon_path}")
    
    # 3. Android mipmap density icon set
    android_dir = os.path.join(base_dir, "assets", "android")
    os.makedirs(android_dir, exist_ok=True)
    
    android_sizes = {
        "icon-mdpi.png": (48, 48),
        "icon-hdpi.png": (72, 72),
        "icon-xhdpi.png": (96, 96),
        "icon-xxhdpi.png": (144, 144),
        "icon-xxxhdpi.png": (192, 192)
    }
    
    for name, size in android_sizes.items():
        size_path = os.path.join(android_dir, name)
        img.resize(size, Image.Resampling.LANCZOS).save(size_path, format="PNG")
        
    print(f"[SUCCESS] Generated Android responsive density icon deck at: {android_dir}")

if __name__ == "__main__":
    generate_assets()
