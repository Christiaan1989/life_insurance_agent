from __future__ import annotations
import io
import logging

import numpy as np
from PIL import Image

from ..models import CheckResult

log = logging.getLogger(__name__)

# Quality levels to test during ghost detection
_GHOST_QUALITIES = [50, 60, 70, 80, 90]

# Libjpeg standard luminance quantization table (quality=50, scale=100)
# Used to estimate quality from an image's embedded quantization table.
_LUMA_BASE = np.array([
    16, 11, 10, 16, 24, 40, 51, 61,
    12, 12, 14, 19, 26, 58, 60, 55,
    14, 13, 16, 24, 40, 57, 69, 56,
    14, 17, 22, 29, 51, 87, 80, 62,
    18, 22, 37, 56, 68,109,103, 77,
    24, 35, 55, 64, 81,104,113, 92,
    49, 64, 78, 87,103,121,120,101,
    72, 92, 95, 98,112,100,103, 99,
], dtype=np.float32)


def _estimate_quality(table: list[int]) -> int:
    """Estimate JPEG quality 1–100 from a luminance quantization table."""
    arr = np.array(table[:64], dtype=np.float32)
    # Solve for the libjpeg scale factor that best fits this table
    # quality >= 50 → scale = (100 - quality) * 2
    # quality <  50 → scale = 5000 / quality
    # quantized = max(1, round(base * scale / 100))
    # We use the ratio of the actual table to the base table to back out scale.
    with np.errstate(divide="ignore", invalid="ignore"):
        ratios = arr / _LUMA_BASE
    ratios = ratios[_LUMA_BASE > 1]   # ignore DC-area coefficients already at 1
    if len(ratios) == 0:
        return 95
    scale = float(np.median(ratios)) * 100
    if scale <= 0:
        return 100
    if scale <= 100:
        quality = round(100 - scale / 2)
    else:
        quality = round(5000 / scale)
    return int(max(1, min(100, quality)))


def _jpeg_ghost(file_path: str) -> dict[int, float]:
    """
    JPEG ghost detection: re-saves the image at several quality levels and
    measures the mean-squared error vs the original.

    When a JPEG has already been compressed at quality Q, re-compressing at Q
    produces minimal additional distortion (the data is already quantized to
    that grid). The quality level with the lowest MSE is the 'ghost quality' —
    the likely original compression quality.
    """
    try:
        original = np.array(Image.open(file_path).convert("RGB"), dtype=np.float32)
    except Exception:
        return {}

    ghost: dict[int, float] = {}
    for q in _GHOST_QUALITIES:
        buf = io.BytesIO()
        Image.fromarray(original.astype(np.uint8)).save(buf, format="JPEG", quality=q)
        buf.seek(0)
        recompressed = np.array(Image.open(buf).convert("RGB"), dtype=np.float32)
        ghost[q] = float(np.mean((original - recompressed) ** 2))
    return ghost


def analyze_jpeg_dct(file_path: str) -> CheckResult:
    """
    JPEG double-compression detection using quantization table analysis and
    JPEG ghost detection.

    Both methods are implemented with pure Pillow + numpy — no C-extension
    libraries required. (jpegio was evaluated but fails to build on Windows
    due to C compilation requirements.)

    Double-compression arises when a certificate image is edited and re-saved:
    the first save applies quality Q1 quantization, the edit introduces new
    data, and the second save applies Q2. The resulting file carries fingerprints
    of both quantization passes.
    """
    result = CheckResult(name="jpeg_dct", penalty=0.0, weight=0.10)

    if not file_path.lower().endswith((".jpg", ".jpeg")):
        result.skipped = True
        result.skip_reason = "not_a_jpeg_file"
        return result

    try:
        img = Image.open(file_path)
    except Exception as exc:
        result.skipped = True
        result.skip_reason = str(exc)
        return result

    penalties: list[float] = []

    # ── Quantization table analysis ──────────────────────────────────────────
    qtables: dict = getattr(img, "quantization", {})
    n_tables = len(qtables)
    table_quality = None

    if not qtables:
        result.flags.append("no_quantization_tables_found")
    else:
        luma = qtables.get(0) or next(iter(qtables.values()))
        table_quality = _estimate_quality(luma)
        result.detail["estimated_table_quality"] = table_quality

        if n_tables > 2:
            penalties.append(min(0.40, 0.15 * (n_tables - 2)))
            result.flags.append(f"unusual_quantization_table_count_{n_tables}")

        # All-ones table: near-lossless re-save that wipes original quality signal
        arr = np.array(luma[:64])
        ones_ratio = float((arr == 1).sum() / 64)
        result.detail["luma_table_ones_ratio"] = round(ones_ratio, 3)
        if ones_ratio > 0.70 and table_quality >= 95:
            penalties.append(0.20)
            result.flags.append("near_lossless_resave_detected")

    # ── JPEG ghost detection ─────────────────────────────────────────────────
    ghost_mse = _jpeg_ghost(file_path)
    if ghost_mse:
        ghost_quality = min(ghost_mse, key=ghost_mse.get)
        result.detail["ghost_quality"] = ghost_quality
        result.detail["ghost_mse"] = {str(k): round(v, 3) for k, v in ghost_mse.items()}

        # Significant gap between ghost quality and table quality suggests
        # the image was originally saved at a lower quality and then re-saved
        if table_quality is not None:
            gap = table_quality - ghost_quality
            result.detail["quality_gap"] = gap
            if gap >= 25:
                p = min(0.65, gap / 100)
                penalties.append(p)
                result.flags.append(
                    f"double_compression_suspected_table_{table_quality}_ghost_{ghost_quality}"
                )

    result.detail["quantization_table_count"] = n_tables
    result.penalty = round(max(penalties, default=0.0), 4)
    return result
