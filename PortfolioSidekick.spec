# -*- mode: python ; coding: utf-8 -*-
# DEPRECATED: Replaced by Tauri 2 builds (frontend/src-tauri). Do not use for v1.7.0+.
import sys
import os

# Select proper icon based on operating system
if sys.platform == 'darwin':
    icon_path = 'assets/icon.icns'
elif sys.platform == 'win32':
    icon_path = 'assets/icon.ico'
else:
    icon_path = 'assets/icon.png'

a = Analysis(
    ['backend/main.py'],  # Cross-platform forward slashes for universal compatibility
    pathex=[],
    binaries=[],
    datas=[('frontend/dist', 'frontend/dist')],
    hiddenimports=[
        'robin_stocks',
        'robin_stocks.robinhood',
        'robin_stocks.robinhood.helper',
        'robin_stocks.robinhood.urls',
        'robin_stocks.robinhood.authentication',
        'cryptography',
        'cryptography.fernet',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='PortfolioSidekick',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=icon_path,
)

# If compiling on macOS, package the single-file executable into a native .app bundle
if sys.platform == 'darwin':
    app = BUNDLE(
        exe,
        name='PortfolioSidekick.app',
        icon=icon_path,
        bundle_identifier='com.imyourboyroy.portfoliosidekick',
        info_plist={
            'CFBundleShortVersionString': '1.1.0',
            'CFBundleVersion': '1.1.0',
            'NSPrincipalClass': 'NSApplication',
            'NSHighResolutionCapable': True,
        }
    )
