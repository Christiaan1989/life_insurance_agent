from __future__ import annotations
"""
Auto-detects external tool binaries (ExifTool) at import time.
Checks PATH first, then common Windows install locations, then the project folder.
"""
import os
import shutil
from pathlib import Path

# ── ExifTool ──────────────────────────────────────────────────────────────────
_EXIFTOOL_CANDIDATES = [
    str(Path(__file__).parent.parent / "exiftool.exe"),
    str(Path(__file__).parent.parent / "exiftool"),
    r"C:\Windows\exiftool.exe",
    "/usr/bin/exiftool",
    "/usr/local/bin/exiftool",
    "/opt/homebrew/bin/exiftool",
]

def _find_exiftool() -> str | None:
    found = shutil.which("exiftool") or shutil.which("exiftool.exe")
    if found:
        return found
    for c in _EXIFTOOL_CANDIDATES:
        if os.path.isfile(c):
            return c
    return None

EXIFTOOL_CMD: str | None = _find_exiftool()
