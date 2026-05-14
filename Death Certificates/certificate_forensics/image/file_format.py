from __future__ import annotations
import os
import logging

from ..models import CheckResult

log = logging.getLogger(__name__)

_EXPECTED_MIME: dict[str, list[str]] = {
    ".jpg":  ["image/jpeg"],
    ".jpeg": ["image/jpeg"],
    ".png":  ["image/png"],
    ".tiff": ["image/tiff"],
    ".tif":  ["image/tiff"],
    ".bmp":  ["image/bmp", "image/x-bmp", "image/x-ms-bmp"],
    ".gif":  ["image/gif"],
    ".webp": ["image/webp"],
    ".pdf":  ["application/pdf"],
}

# Certificates should be at least this size — anything smaller is suspicious.
_MIN_CERT_BYTES = 10_240   # 10 KB


def _detect_mime_fallback(file_path: str) -> str:
    """Small signature-based fallback for demo environments without libmagic."""
    with open(file_path, "rb") as f:
        header = f.read(16)
    if header.startswith(b"%PDF"):
        return "application/pdf"
    if header.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if header.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if header.startswith((b"II*\x00", b"MM\x00*")):
        return "image/tiff"
    if header.startswith(b"GIF87a") or header.startswith(b"GIF89a"):
        return "image/gif"
    if header.startswith(b"BM"):
        return "image/bmp"
    if header.startswith(b"RIFF") and header[8:12] == b"WEBP":
        return "image/webp"
    return "application/octet-stream"


def check_file_format(file_path: str) -> CheckResult:
    result = CheckResult(name="file_format", penalty=0.0, weight=0.05)

    magic_error = ""
    try:
        import magic
        detected_mime: str = magic.from_file(file_path, mime=True)
    except Exception as exc:
        detected_mime = _detect_mime_fallback(file_path)
        result.flags.append("mime_detected_with_signature_fallback")
        magic_error = str(exc)

    penalties: list[float] = []
    ext = os.path.splitext(file_path)[1].lower()
    expected = _EXPECTED_MIME.get(ext, [])

    if expected and detected_mime not in expected:
        penalties.append(0.85)
        result.flags.append(
            f"mime_mismatch_extension_{ext}_detected_as_{detected_mime}"
        )

    file_size = os.path.getsize(file_path)
    if file_size < _MIN_CERT_BYTES:
        penalties.append(0.35)
        result.flags.append(f"file_too_small_{file_size}_bytes")

    result.detail = {
        "detected_mime": detected_mime,
        "declared_extension": ext,
        "file_size_bytes": file_size,
    }
    if magic_error:
        result.detail["magic_error"] = magic_error
    result.penalty = max(penalties, default=0.0)
    return result
