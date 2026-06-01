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
        
    print(f"[SUCCESS] Generated Android standard legacy icons at: {android_dir}")

    # 4. Android adaptive foreground icons
    android_foreground_sizes = {
        "icon-foreground-mdpi.png": (108, 108),
        "icon-foreground-hdpi.png": (162, 162),
        "icon-foreground-xhdpi.png": (216, 216),
        "icon-foreground-xxhdpi.png": (324, 324),
        "icon-foreground-xxxhdpi.png": (432, 432)
    }
    
    for name, size in android_foreground_sizes.items():
        size_path = os.path.join(android_dir, name)
        # Create a transparent canvas of the full size
        canvas = Image.new("RGBA", size, (0, 0, 0, 0))
        # Active logo size should be ~66% of the canvas to fit within safe-zone
        logo_w = int(size[0] * 0.66)
        logo_h = int(size[1] * 0.66)
        resized_logo = img.resize((logo_w, logo_h), Image.Resampling.LANCZOS)
        # Center the logo on the canvas
        offset_x = (size[0] - logo_w) // 2
        offset_y = (size[1] - logo_h) // 2
        canvas.paste(resized_logo, (offset_x, offset_y))
        canvas.save(size_path, format="PNG")
        
    print(f"[SUCCESS] Generated Android adaptive foreground icons at: {android_dir}")

if __name__ == "__main__":
    generate_assets()
