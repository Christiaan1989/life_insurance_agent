from __future__ import annotations
import logging
import re

import fitz   # PyMuPDF

from ..models import CheckResult

log = logging.getLogger(__name__)


def analyze_pdf_structure(pdf_path: str) -> CheckResult:
    """
    Checks PDF revision / incremental-update history and detects suspicious
    low-level object types (JavaScript, embedded files, overlapping content).

    Every legitimate single-issue certificate should have exactly one %%EOF.
    A second %%EOF means the file was modified after initial creation; more
    than two is strongly suspicious for a government-issued certificate.
    An exception: a signing operation done by DHA software typically adds one
    legitimate incremental update — so 2 revisions is a mild, not severe, flag.
    """
    result = CheckResult(name="pdf_structure", penalty=0.0, weight=0.15)

    try:
        with open(pdf_path, "rb") as f:
            raw = f.read()
    except Exception as exc:
        result.skipped = True
        result.skip_reason = str(exc)
        return result

    penalties: list[float] = []

    # ── Incremental updates ──────────────────────────────────────────────────
    eof_count = raw.count(b"%%EOF")
    if eof_count > 1:
        revisions = eof_count
        if revisions == 2:
            penalties.append(0.20)          # possibly just a signing step
        elif revisions == 3:
            penalties.append(0.50)
        else:
            penalties.append(min(0.85, 0.50 + (revisions - 3) * 0.10))
        result.flags.append(f"incremental_updates_detected_{revisions}_revisions")

    # ── PyMuPDF object-level inspection ──────────────────────────────────────
    try:
        doc = fitz.open(pdf_path)
    except Exception as exc:
        result.skipped = True
        result.skip_reason = str(exc)
        return result

    has_js = False
    has_embedded = False
    overlay_pages: list[int] = []

    for xref in range(1, doc.xref_length()):
        try:
            obj_str = doc.xref_object(xref, compressed=False)
        except Exception:
            continue

        if "/JavaScript" in obj_str or "/JS" in obj_str:
            has_js = True

        if "/EmbeddedFile" in obj_str:
            has_embedded = True

    # Check for hidden optional-content layers
    try:
        ocgs = doc.get_ocgs()
        has_layers = bool(ocgs)
    except Exception:
        has_layers = False

    # Check for significantly overlapping text blocks per page
    for page in doc:
        try:
            blocks = page.get_text("dict", flags=0)["blocks"]
            text_rects = [b["bbox"] for b in blocks if b.get("type") == 0]
            flagged = False
            for i, r1 in enumerate(text_rects):
                for r2 in text_rects[i + 1:]:
                    ox = min(r1[2], r2[2]) - max(r1[0], r2[0])
                    oy = min(r1[3], r2[3]) - max(r1[1], r2[1])
                    if ox > 15 and oy > 8:
                        overlay_pages.append(page.number + 1)
                        flagged = True
                        break
                if flagged:
                    break
        except Exception:
            pass

    doc.close()

    if has_js:
        penalties.append(0.75)
        result.flags.append("javascript_present_in_pdf")

    if has_embedded:
        penalties.append(0.45)
        result.flags.append("embedded_files_present")

    if has_layers:
        penalties.append(0.35)
        result.flags.append("optional_content_layers_detected")

    if overlay_pages:
        penalties.append(0.55)
        result.flags.append(f"overlapping_text_blocks_pages_{overlay_pages}")

    result.penalty = round(max(penalties, default=0.0), 4)
    result.detail = {
        "revision_count": eof_count,
        "has_javascript": has_js,
        "has_embedded_files": has_embedded,
        "has_hidden_layers": has_layers,
        "overlay_pages": overlay_pages,
    }
    return result
