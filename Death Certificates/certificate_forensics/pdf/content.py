from __future__ import annotations
import io
import logging
from typing import Optional

import fitz
import numpy as np
from PIL import Image

from ..models import CheckResult

log = logging.getLogger(__name__)

# Minimum image area (px²) to bother extracting for ELA
_MIN_IMAGE_AREA = 50_000


def analyze_pdf_content(pdf_path: str) -> CheckResult:
    """
    Inspects page content for overlay attacks (text hidden under white boxes,
    transparent elements obscuring original content) and extracts the largest
    embedded raster image for downstream ELA/noise analysis.
    """
    result = CheckResult(name="pdf_content", penalty=0.0, weight=0.10)

    try:
        doc = fitz.open(pdf_path)
    except Exception as exc:
        result.skipped = True
        result.skip_reason = str(exc)
        return result

    penalties: list[float] = []
    overlay_pages: list[int] = []
    white_rect_pages: list[int] = []

    for page in doc:
        page_num = page.number + 1

        # ── White / opaque rectangles covering text ──────────────────────────
        # Drawings with fill=(1,1,1) or fill=(1,) over text blocks are a
        # common primitive tampering technique (white-out then re-type).
        try:
            drawings = page.get_drawings()
            text_blocks = [
                b["bbox"]
                for b in page.get_text("dict", flags=0)["blocks"]
                if b.get("type") == 0
            ]
            for d in drawings:
                if d.get("fill") in [(1, 1, 1), (1.0, 1.0, 1.0)]:
                    r = d.get("rect")
                    if r is None:
                        continue
                    for tb in text_blocks:
                        ox = min(r[2], tb[2]) - max(r[0], tb[0])
                        oy = min(r[3], tb[3]) - max(r[1], tb[1])
                        if ox > 10 and oy > 5:
                            white_rect_pages.append(page_num)
                            break
        except Exception:
            pass

        # ── Transparent / invisible text (white-on-white) ────────────────────
        try:
            for block in page.get_text("dict", flags=0)["blocks"]:
                if block.get("type") != 0:
                    continue
                for line in block.get("lines", []):
                    for span in line.get("spans", []):
                        color = span.get("color", 0)
                        # color is an int; 0xFFFFFF = white = invisible on white bg
                        if color == 0xFFFFFF or color == 16777215:
                            overlay_pages.append(page_num)
        except Exception:
            pass

    doc.close()

    if white_rect_pages:
        penalties.append(0.80)
        result.flags.append(f"white_rectangle_over_text_pages_{list(set(white_rect_pages))}")

    if overlay_pages:
        penalties.append(0.70)
        result.flags.append(f"invisible_white_text_pages_{list(set(overlay_pages))}")

    result.penalty = round(max(penalties, default=0.0), 4)
    result.detail = {
        "white_rect_overlay_pages": list(set(white_rect_pages)),
        "invisible_text_pages": list(set(overlay_pages)),
    }
    return result


def extract_largest_image(pdf_path: str) -> Optional[Image.Image]:
    """Return the largest raster image from the first page as a PIL Image."""
    try:
        doc = fitz.open(pdf_path)
        best: Optional[tuple[int, bytes, str]] = None  # (area, bytes, ext)

        for page in doc:
            for img_info in page.get_images(full=True):
                xref = img_info[0]
                try:
                    base = doc.extract_image(xref)
                    w, h = base["width"], base["height"]
                    if w * h < _MIN_IMAGE_AREA:
                        continue
                    if best is None or w * h > best[0]:
                        best = (w * h, base["image"], base["ext"])
                except Exception:
                    continue
            if best:
                break

        doc.close()

        if best:
            return Image.open(io.BytesIO(best[1])).convert("RGB")
    except Exception as exc:
        log.warning("Image extraction from PDF failed: %s", exc)

    return None
