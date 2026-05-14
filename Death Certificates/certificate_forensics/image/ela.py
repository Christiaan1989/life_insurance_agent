from __future__ import annotations
import io
import logging
from typing import Optional, Tuple

import numpy as np
from PIL import Image, ImageChops

from ..models import CheckResult

log = logging.getLogger(__name__)

_ELA_QUALITY = 95
_AMPLIFY = 15          # visual scale factor for the heatmap
_BLOCK_SIZE = 32       # pixels per block for local variance analysis


def perform_ela(file_path: str) -> Tuple[CheckResult, Optional[Image.Image]]:
    """
    Error Level Analysis: re-save at a known JPEG quality and measure per-pixel
    difference.  Regions edited after the original compression show anomalously
    high residuals because they were re-quantised from a different quality level.

    Returns (CheckResult, heatmap_PIL_Image_or_None).
    """
    result = CheckResult(name="ela", penalty=0.0, weight=0.25)

    try:
        original = Image.open(file_path).convert("RGB")
    except Exception as exc:
        result.skipped = True
        result.skip_reason = str(exc)
        return result, None

    # Re-save at known quality — PNG originals are lossless so ELA is less
    # discriminative; we still run it but note the reduced reliability.
    is_lossless = file_path.lower().endswith((".png", ".bmp", ".tiff", ".tif"))
    if is_lossless:
        result.flags.append("ela_reduced_reliability_lossless_source")

    buf = io.BytesIO()
    original.save(buf, format="JPEG", quality=_ELA_QUALITY)
    buf.seek(0)
    recompressed = Image.open(buf).convert("RGB")

    diff = ImageChops.difference(original, recompressed)
    diff_arr = np.array(diff, dtype=np.float32)        # H × W × 3

    # Amplify for heatmap visualisation
    heatmap_arr = np.clip(diff_arr * _AMPLIFY, 0, 255).astype(np.uint8)
    heatmap = Image.fromarray(heatmap_arr)

    # Per-pixel magnitude
    magnitude = np.sqrt(np.sum(diff_arr ** 2, axis=2))   # H × W

    g_mean = float(magnitude.mean())
    g_std = float(magnitude.std())
    if g_std < 1e-6:
        result.detail = {"global_ela_mean": g_mean, "note": "uniform_image"}
        return result, heatmap

    # Fraction of pixels that are statistical outliers (> mean + 2σ)
    hotspot_frac = float((magnitude > g_mean + 2 * g_std).sum() / magnitude.size)

    # Block-level coefficient of variation — localised bright patches are
    # stronger evidence than uniformly elevated ELA across the whole image.
    h, w = magnitude.shape
    block_means: list[float] = []
    for y in range(0, h - _BLOCK_SIZE, _BLOCK_SIZE):
        for x in range(0, w - _BLOCK_SIZE, _BLOCK_SIZE):
            block_means.append(float(magnitude[y:y + _BLOCK_SIZE, x:x + _BLOCK_SIZE].mean()))

    bm = np.array(block_means) if block_means else np.array([g_mean])
    block_cv = float(np.std(bm) / (np.mean(bm) + 1e-6))

    # Combined penalty: hotspot prevalence + block non-uniformity
    penalty = min(1.0, hotspot_frac * 4.0 * 0.5 + min(block_cv / 2.5, 1.0) * 0.5)

    if penalty > 0.35:
        result.flags.append("high_ela_variance_detected")
    if hotspot_frac > 0.04:
        result.flags.append(f"ela_hotspots_{hotspot_frac:.1%}_of_pixels")

    result.penalty = round(penalty, 4)
    result.detail = {
        "global_ela_mean": round(g_mean, 3),
        "global_ela_std": round(g_std, 3),
        "hotspot_fraction": round(hotspot_frac, 4),
        "block_cv": round(block_cv, 3),
    }
    return result, heatmap
