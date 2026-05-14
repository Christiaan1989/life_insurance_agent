from __future__ import annotations
import logging
from typing import List

import numpy as np
from PIL import Image

from ..models import CheckResult

log = logging.getLogger(__name__)

_BLOCK_SIZE = 64


def _laplacian(arr: np.ndarray) -> np.ndarray:
    """
    Laplacian high-pass filter via array slicing (pure numpy, no scipy).
    Kernel: [0,-1,0 / -1,4,-1 / 0,-1,0]
    """
    out = np.zeros_like(arr)
    out[1:-1, 1:-1] = (
        4 * arr[1:-1, 1:-1]
        - arr[:-2, 1:-1]
        - arr[2:, 1:-1]
        - arr[1:-1, :-2]
        - arr[1:-1, 2:]
    )
    return out


def analyze_noise_consistency(file_path: str) -> CheckResult:
    """
    Laplacian noise-level consistency check.

    A genuine scan has uniform noise across the page (consistent CCD sensor
    noise). Regions pasted from a different source or generated synthetically
    will have a statistically different noise variance, visible as a high
    coefficient of variation across 64×64 blocks of the Laplacian residual.

    This replaces the previous median-filter + block-hash approach, which
    generated false positives on documents with repetitive backgrounds and
    missed subtle region replacements.
    """
    result = CheckResult(name="noise_consistency", penalty=0.0, weight=0.15)

    try:
        img_gray = Image.open(file_path).convert("L")
    except Exception as exc:
        result.skipped = True
        result.skip_reason = str(exc)
        return result

    arr = np.array(img_gray, dtype=np.float32)
    h, w = arr.shape

    if h < _BLOCK_SIZE * 2 or w < _BLOCK_SIZE * 2:
        result.skipped = True
        result.skip_reason = "image_too_small_for_noise_analysis"
        return result

    noise = _laplacian(arr)

    variances: List[float] = []
    for y in range(0, h - _BLOCK_SIZE, _BLOCK_SIZE):
        for x in range(0, w - _BLOCK_SIZE, _BLOCK_SIZE):
            variances.append(float(np.var(noise[y : y + _BLOCK_SIZE, x : x + _BLOCK_SIZE])))

    variances_arr = np.array(variances)
    mean_var = float(np.mean(variances_arr)) + 1e-6
    noise_cv = float(np.std(variances_arr) / mean_var)

    # Fraction of blocks with near-zero noise variance — smooth/synthetic regions
    smooth_frac = float((variances_arr < 0.5).sum() / len(variances_arr))

    penalties: list[float] = []

    if noise_cv > 1.5:
        p = min(0.75, (noise_cv - 1.5) / 3.0)
        penalties.append(p)
        result.flags.append(f"noise_level_inconsistency_cv_{noise_cv:.2f}")

    if smooth_frac > 0.20:
        penalties.append(min(0.50, smooth_frac * 1.2))
        result.flags.append(f"synthetic_smooth_regions_{smooth_frac:.1%}")

    result.penalty = round(max(penalties, default=0.0), 4)
    result.detail = {
        "noise_cv": round(noise_cv, 3),
        "smooth_block_fraction": round(smooth_frac, 3),
        "block_count": len(variances),
        "mean_noise_variance": round(mean_var, 3),
    }
    return result
