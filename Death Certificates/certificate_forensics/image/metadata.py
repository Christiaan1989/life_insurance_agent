from __future__ import annotations
import logging
from datetime import datetime
from typing import Optional

from ..models import CheckResult
from ..config import EXIFTOOL_CMD

log = logging.getLogger(__name__)

_EDITING_KEYWORDS = [
    "photoshop", "gimp", "paint", "lightroom", "affinity",
    "pixelmator", "inkscape", "illustrator", "corel", "krita",
    "snagit", "faststone", "irfanview", "image editor", "paint.net",
    "canva", "picsart", "fotor",
]

_DATE_FMT = "%Y:%m:%d %H:%M:%S"


def analyze_exif_metadata(file_path: str) -> CheckResult:
    result = CheckResult(name="exif_metadata", penalty=0.0, weight=0.15)

    try:
        import exiftool
        kwargs = {"executable": EXIFTOOL_CMD} if EXIFTOOL_CMD else {}
        with exiftool.ExifToolHelper(**kwargs) as et:
            meta = et.get_metadata(file_path)[0]
    except Exception as exc:
        log.warning("ExifTool unavailable: %s", exc)
        result.skipped = True
        result.skip_reason = str(exc)
        return result

    penalties: list[float] = []

    # --- editing software in Software / CreatorTool fields ---
    software = str(
        meta.get("EXIF:Software", meta.get("XMP:CreatorTool", ""))
    ).lower()
    if any(kw in software for kw in _EDITING_KEYWORDS):
        penalties.append(0.75)
        result.flags.append(f"editing_software_detected:{software.strip()}")

    # --- GPS coordinates on a scanned document are anomalous ---
    if "EXIF:GPSLatitude" in meta or "Composite:GPSPosition" in meta:
        penalties.append(0.45)
        result.flags.append("gps_data_present_on_scanned_document")

    # --- thumbnail vs main image aspect-ratio mismatch ---
    tw = meta.get("EXIF:ThumbnailImageWidth")
    th = meta.get("EXIF:ThumbnailImageLength")
    iw = meta.get("EXIF:ImageWidth") or meta.get("File:ImageWidth")
    ih = meta.get("EXIF:ImageHeight") or meta.get("File:ImageHeight")
    if tw and th and iw and ih:
        tar = int(tw) / max(int(th), 1)
        iar = int(iw) / max(int(ih), 1)
        if abs(tar - iar) > 0.30:
            penalties.append(0.60)
            result.flags.append("thumbnail_aspect_ratio_mismatch")

    # --- date anomalies ---
    create_raw = meta.get("EXIF:DateTimeOriginal") or meta.get("EXIF:CreateDate")
    modify_raw = meta.get("EXIF:ModifyDate")
    if create_raw and modify_raw:
        try:
            cd = datetime.strptime(str(create_raw), _DATE_FMT)
            md = datetime.strptime(str(modify_raw), _DATE_FMT)
            if md < cd:
                penalties.append(0.55)
                result.flags.append("modify_date_before_create_date")
            elif (md - cd).days > 365:
                penalties.append(0.20)
                result.flags.append(f"modified_{(md - cd).days}_days_after_creation")
        except ValueError:
            result.flags.append("exif_date_parse_failed")

    # --- screenshot / screen-capture fingerprint ---
    make = str(meta.get("EXIF:Make", "")).lower()
    model_str = str(meta.get("EXIF:Model", "")).lower()
    if any(kw in make + model_str + software for kw in ("screen", "screenshot", "grab")):
        penalties.append(0.55)
        result.flags.append("appears_to_be_screenshot_not_scan")

    result.detail = {
        "software": software,
        "make": make,
        "model": model_str,
        "create_date": str(create_raw),
        "modify_date": str(modify_raw),
    }
    result.penalty = max(penalties, default=0.0)
    return result
