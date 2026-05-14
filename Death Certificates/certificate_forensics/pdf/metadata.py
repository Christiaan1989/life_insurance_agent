from __future__ import annotations
import logging
from datetime import datetime, timezone

import fitz

from ..models import CheckResult

log = logging.getLogger(__name__)

_EDITING_KEYWORDS = [
    "photoshop", "gimp", "inkscape", "illustrator", "affinity",
    "pdf-xchange", "foxit phantom", "nitro", "master pdf",
    "pdfescape", "smallpdf", "ilovepdf", "sejda", "pdf24",
]

# Software legitimately used by SA government document systems
_LEGITIMATE_PRODUCERS = [
    "itext", "reportlab", "jasper", "oracle", "sap", "home affairs",
    "department of home", "dha", "sita", "state information",
    "microsoft word", "libreoffice",     # acceptable for some certificates
]


def _parse_pdf_date(d: str) -> datetime | None:
    """Parse PyMuPDF date string  D:YYYYMMDDHHmmSS[±HH'mm']"""
    if not d:
        return None
    try:
        s = d.lstrip("D:").replace("'", "")
        # Truncate to 14 digits (YYYYMMDDHHmmSS)
        s = s[:14]
        return datetime.strptime(s, "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def analyze_pdf_metadata(pdf_path: str) -> CheckResult:
    result = CheckResult(name="pdf_metadata", penalty=0.0, weight=0.10)

    try:
        doc = fitz.open(pdf_path)
        meta = doc.metadata
        doc.close()
    except Exception as exc:
        result.skipped = True
        result.skip_reason = str(exc)
        return result

    penalties: list[float] = []

    creator = str(meta.get("creator", "")).lower()
    producer = str(meta.get("producer", "")).lower()

    # ── Editing software in creator / producer ───────────────────────────────
    for kw in _EDITING_KEYWORDS:
        if kw in creator or kw in producer:
            if not any(leg in producer + creator for leg in _LEGITIMATE_PRODUCERS):
                penalties.append(0.55)
                result.flags.append(f"pdf_editing_software_in_metadata:{kw}")
                break

    # ── Date consistency ─────────────────────────────────────────────────────
    cd = _parse_pdf_date(meta.get("creationDate", ""))
    md = _parse_pdf_date(meta.get("modDate", ""))

    if cd and md:
        if md < cd:
            penalties.append(0.65)
            result.flags.append("pdf_moddate_before_creationdate")
        elif (md - cd).days > 730:
            penalties.append(0.15)
            result.flags.append(f"pdf_modified_{(md - cd).days}_days_after_creation")

    # ── Stripped metadata is a mild signal ───────────────────────────────────
    if not creator and not producer:
        penalties.append(0.10)
        result.flags.append("pdf_metadata_stripped")

    result.penalty = round(max(penalties, default=0.0), 4)
    result.detail = {
        "creator": creator,
        "producer": producer,
        "creation_date": meta.get("creationDate", ""),
        "mod_date": meta.get("modDate", ""),
    }
    return result
