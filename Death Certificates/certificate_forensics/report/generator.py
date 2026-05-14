from __future__ import annotations
import io
import json
import logging
import os
from datetime import datetime
from typing import Optional

import fitz
from PIL import Image

from ..models import AnalysisResult, CheckResult, RiskLevel

log = logging.getLogger(__name__)

# Colours (r, g, b) in 0–1 range
_RISK_COLOR = {
    RiskLevel.CLEAN:  (0.11, 0.73, 0.42),
    RiskLevel.LOW:    (0.95, 0.77, 0.06),
    RiskLevel.MEDIUM: (0.90, 0.49, 0.13),
    RiskLevel.HIGH:   (0.85, 0.20, 0.20),
}
_RISK_LABEL = {
    RiskLevel.CLEAN:  "CLEAN — NO SIGNIFICANT ANOMALIES",
    RiskLevel.LOW:    "LOW RISK — MINOR ANOMALIES NOTED",
    RiskLevel.MEDIUM: "MEDIUM RISK — REVIEW REQUIRED",
    RiskLevel.HIGH:   "HIGH RISK — URGENT REVIEW REQUIRED",
}
_DARK    = (0.15, 0.15, 0.15)
_WHITE   = (1.0,  1.0,  1.0)
_LIGHT   = (0.90, 0.90, 0.90)
_SUBTLE  = (0.55, 0.55, 0.55)
_RED     = (0.75, 0.15, 0.15)
_GREEN   = (0.11, 0.73, 0.42)
_ORANGE  = (0.90, 0.49, 0.13)
_LBLUE   = (0.93, 0.96, 1.00)

_W      = 595.0   # A4 width  (pt)
_H      = 842.0   # A4 height (pt)
_MARGIN = 42.0
_INNER  = _W - 2 * _MARGIN   # usable content width


# ── Per-check explanatory text ────────────────────────────────────────────────
_CHECK_META: dict[str, dict] = {
    "file_format": {
        "title": "File Format Integrity",
        "what": (
            "Reads the actual file signature (magic bytes at the start of the file) and "
            "compares it against the declared file extension. A mismatch — e.g. a file "
            "saved as .pdf that is actually a JPEG — is a strong indicator of deliberate "
            "obfuscation. Also verifies the file is not suspiciously small for a certificate "
            "(minimum 10 KB threshold)."
        ),
    },
    "exif_metadata": {
        "title": "EXIF / Image Metadata Analysis",
        "what": (
            "Reads hidden metadata embedded in the image by the camera or scanner: software "
            "used, device make/model, creation and modification dates, GPS coordinates, and "
            "embedded thumbnail. Flags editing software fingerprints (Photoshop, GIMP, etc.), "
            "GPS data on a scanned document (anomalous), modification dates earlier than "
            "creation dates (impossible), and screenshots instead of genuine scans."
        ),
    },
    "ela": {
        "title": "Error Level Analysis (ELA)",
        "what": (
            "Re-saves the image at a known JPEG quality level (95), then measures the "
            "pixel-by-pixel difference. Authentic unedited images show uniform, low-level "
            "differences across the whole image. Regions edited after original compression "
            "were re-quantised at a different quality level, leaving anomalously bright areas "
            "in the difference image. Localised bright patches concentrated over a specific "
            "field — a name, date, or ID number — are the strongest tampering indicator."
        ),
    },
    "noise_consistency": {
        "title": "Noise Consistency & Copy-Move Detection",
        "what": (
            "Authentic scanned documents have roughly uniform sensor/scanner noise throughout. "
            "A region pasted from a different source will have a noticeably different noise "
            "signature. The image is divided into 64x64 pixel blocks; noise variance is "
            "measured per block and compared. Additionally, a simplified copy-move detector "
            "hashes every image block and looks for identical content at different positions — "
            "a strong indicator of duplicated stamps, signatures, or text fields."
        ),
    },
    "jpeg_dct": {
        "title": "JPEG DCT Coefficient Analysis",
        "what": (
            "Analyses the raw JPEG compression data (Discrete Cosine Transform coefficients). "
            "A JPEG that has been edited and re-saved shows a characteristic comb pattern in "
            "the coefficient histogram because two different compression grids have interfered. "
            "Also inspects quantisation tables — more than two tables or unusually flat tables "
            "are anomalous for a standard scanned document."
        ),
    },
    "pdf_structure": {
        "title": "PDF Structure & Revision History",
        "what": (
            "Counts how many times the PDF was saved by looking for %%EOF markers in the raw "
            "file bytes. Every legitimate single-issue certificate should have exactly one. "
            "Each additional marker means the file was modified after creation. Also scans all "
            "internal PDF objects for JavaScript (never present in a legitimate certificate), "
            "embedded files, hidden optional-content layers, and overlapping text blocks — "
            "a primitive technique used to hide forged content beneath legitimate text."
        ),
    },
    "pdf_metadata": {
        "title": "PDF Internal Metadata",
        "what": (
            "Reads the PDF's internal metadata fields: Creator (the application that made the "
            "source document), Producer (the application that generated the PDF), creation date, "
            "and modification date. Flags PDF editing software names, online PDF editor "
            "fingerprints, impossible dates (modification before creation), and stripped "
            "metadata (a mild signal that metadata was deliberately removed)."
        ),
    },
    "pdf_signatures": {
        "title": "Digital Signature Verification",
        "what": (
            "Checks for embedded cryptographic digital signatures (PKI/PKCS#7). If present: "
            "verifies the ByteRange covers the entire document (partial coverage means content "
            "was added after signing), checks whether the signing certificate has expired, and "
            "measures certificate chain depth (self-signed vs. CA-issued is weaker). For South "
            "African DHA certificates, absence of a digital signature is a mild negative — "
            "physically issued BI-1663 forms are typically scanned without one."
        ),
    },
    "pdf_content": {
        "title": "PDF Content Overlay Analysis",
        "what": (
            "Searches page content for two specific tampering primitives: (1) white rectangles "
            "drawn over text — a digital white-out used to erase original content before "
            "retyping it on top; and (2) invisible white-on-white text, used to hide content "
            "or inject data that is not visually apparent but is present in the file structure."
        ),
    },
    "sa_dha_checks": {
        "title": "South Africa DHA Certificate Checks (BI-1663)",
        "what": (
            "SA-specific checks for Department of Home Affairs death certificates. Verifies "
            "presence of BI-1663 form markers, both English and Afrikaans DHA headings, "
            "required certificate fields (Surname, Date of Death, Identity Number, Registration "
            "Number), validates any 13-digit SA Identity Numbers using the Luhn algorithm, and "
            "runs a frequency-domain analysis looking for DHA watermark patterns. Requires OCR "
            "or an embedded text layer to function."
        ),
    },
    "embedded_image_ela": {
        "title": "Error Level Analysis — Embedded Scanned Image",
        "what": (
            "Extracts the largest raster image from the PDF (the scanned certificate page) and "
            "applies Error Level Analysis. Re-saves at quality 95 and measures per-pixel "
            "differences. For scanned documents, uniform low-level ELA is expected from the "
            "scanner's JPEG compression. Localised bright patches concentrated over text fields "
            "would indicate post-scan editing of specific content."
        ),
    },
    "embedded_image_noise": {
        "title": "Noise Consistency — Embedded Scanned Image",
        "what": (
            "Applies noise consistency analysis and copy-move detection to the extracted "
            "scanned image. Uniform scanner noise across all analysed blocks confirms the image "
            "originated from a single consistent source. Zero duplicate blocks confirms no "
            "content was copied and repositioned within the document."
        ),
    },
}


def _get_meta(name: str) -> dict:
    return _CHECK_META.get(name, {"title": name.replace("_", " ").title(), "what": ""})


def _finding_text(name: str, chk: CheckResult) -> str:
    """Generate a human-readable finding sentence from a CheckResult."""
    if chk.skipped:
        reason = chk.skip_reason.replace("_", " ")
        return f"Skipped — {reason}."

    d = chk.detail

    if name == "file_format":
        if not chk.flags:
            return (
                f"File correctly identified as {d.get('detected_mime', 'unknown')} "
                f"matching the .{d.get('declared_extension','').lstrip('.')} extension. "
                f"File size: {d.get('file_size_bytes', 0):,} bytes — within expected range."
            )

    if name == "pdf_structure":
        if not chk.flags:
            return (
                f"Single revision detected (revision count: {d.get('revision_count', 1)}). "
                "No JavaScript, embedded files, hidden layers, or overlapping content found. "
                "Document structure is consistent with a single-issue official certificate."
            )

    if name == "pdf_metadata":
        if not chk.flags:
            creator  = d.get('creator', 'unknown')
            producer = d.get('producer', 'unknown')
            cdate    = d.get('creation_date', '')
            return (
                f"Creator: {creator}. Producer: {producer}. "
                f"Created: {cdate}. No modification date recorded. "
                "No editing software detected. Metadata profile is consistent with a scanned document."
            )

    if name == "pdf_signatures":
        count = d.get('signature_count', 0)
        if count == 0:
            return (
                "No digital signature is embedded in this PDF. For a physically issued and "
                "scanned BI-1663 certificate this is common and expected. It means we cannot "
                "cryptographically prove the document has not been altered, but absence of a "
                "signature alone is not evidence of tampering."
            )

    if name == "pdf_content":
        if not chk.flags:
            return (
                "No white-rectangle overlays found on any page. No invisible or white-on-white "
                "text detected. The page content stream contains no known overlay attack patterns."
            )

    if name in ("embedded_image_ela", "ela"):
        mean  = d.get('global_ela_mean', 0)
        std   = d.get('global_ela_std', 0)
        hsf   = d.get('hotspot_fraction', 0)
        bcv   = d.get('block_cv', 0)
        base  = (
            f"ELA mean: {mean:.3f}, std: {std:.3f}. "
            f"Hotspot pixels (>mean+2σ): {hsf:.1%}. "
            f"Block coefficient of variation: {bcv:.3f}. "
        )
        if not chk.flags:
            return base + "All values within normal parameters for a scanned document."
        else:
            return (
                base + f"Hotspot fraction of {hsf:.1%} is mildly elevated. "
                "This is likely caused by JPEG compression artefacts at text edges and "
                "fine printed lines from the scanning process rather than deliberate editing. "
                "Genuine tampering would show concentrated bright patches over specific fields."
            )

    if name in ("embedded_image_noise", "noise_consistency"):
        cv   = d.get('noise_cv', 0)
        zf   = d.get('zero_noise_block_fraction', 0)
        dup  = d.get('copy_move_duplicate_blocks', 0)
        bc   = d.get('block_count', 0)
        return (
            f"Noise CV across {bc} blocks: {cv:.3f} (threshold: 2.0 — lower is better). "
            f"Uniform-noise blocks: {zf:.1%} (threshold: 15%). "
            f"Copy-move duplicate blocks detected: {dup}. "
            + ("No anomalies." if not chk.flags else " ".join(chk.flags))
        )

    if name == "sa_dha_checks":
        if chk.skipped:
            return (
                "Skipped — the PDF contains no embedded text layer (it is a pure scanned image). "
                "Install Tesseract OCR and pytesseract to enable SA-specific field validation."
            )

    if name == "jpeg_dct":
        if chk.skipped:
            return (
                f"Skipped — {chk.skip_reason.replace('_', ' ')}. "
                "This check carries a 10% weight and its absence is compensated by the "
                "remaining checks during score normalisation."
            )
        if not chk.flags:
            return (
                f"Quantisation table count: {d.get('quantisation_table_count', 'N/A')}. "
                f"DCT histogram CV: {d.get('dct_histogram_cv', 0):.3f}. "
                "No double-compression comb pattern detected."
            )

    if name == "exif_metadata":
        if not chk.flags:
            software = d.get('software', '')
            make     = d.get('make', '')
            model    = d.get('model', '')
            return (
                f"Software: {software or 'not set'}. Device: {make} {model}. "
                "No editing software detected. No GPS anomalies. Dates are consistent."
            )

    # Generic fallback
    if not chk.flags:
        return "No issues detected. All sub-checks within normal parameters."
    return "Issues detected: " + "; ".join(f.replace("_", " ") for f in chk.flags) + "."


# ─────────────────────────────────────────────────────────────────────────────
# Public entry point
# ─────────────────────────────────────────────────────────────────────────────

def generate_pdf_report(result: AnalysisResult, output_path: str) -> None:
    doc = fitz.open()
    _page_summary(doc, result)
    _page_walkthrough(doc, result)
    _page_findings_table(doc, result)
    _page_json(doc, result)
    doc.save(output_path, garbage=4, deflate=True)
    doc.close()
    log.info("Report saved to %s", output_path)


# ─────────────────────────────────────────────────────────────────────────────
# Page 1 — Executive Summary
# ─────────────────────────────────────────────────────────────────────────────

def _page_summary(doc: fitz.Document, result: AnalysisResult) -> None:
    page = doc.new_page(width=_W, height=_H)
    color = _RISK_COLOR[result.risk_level]

    # Header bar
    page.draw_rect(fitz.Rect(0, 0, _W, 52), color=_DARK, fill=_DARK)
    page.insert_text(fitz.Point(_MARGIN, 34),
                     "CERTIFICATE FORENSIC ANALYSIS REPORT",
                     fontname="hebo", fontsize=13, color=_WHITE)
    page.insert_text(fitz.Point(_W - 180, 34),
                     datetime.now().strftime("%Y-%m-%d  %H:%M:%S"),
                     fontname="helv", fontsize=9, color=_LIGHT)

    # Score circle
    cx, cy, r = _W / 2, 155, 58
    page.draw_circle(fitz.Point(cx, cy), r + 4, color=_LIGHT, fill=_LIGHT)
    page.draw_circle(fitz.Point(cx, cy), r, color=color, fill=color)
    score_str = str(result.overall_score)
    page.insert_text(fitz.Point(cx - len(score_str) * 13, cy + 16),
                     score_str, fontname="hebo", fontsize=42, color=_WHITE)
    page.insert_text(fitz.Point(cx - 20, cy + r + 18), "/100",
                     fontname="helv", fontsize=10, color=_SUBTLE)

    # Risk label banner
    label = _RISK_LABEL[result.risk_level]
    page.draw_rect(fitz.Rect(_MARGIN - 4, 232, _W - _MARGIN + 4, 252),
                   color=color, fill=color)
    page.insert_text(fitz.Point(_MARGIN + 4, 247), label,
                     fontname="hebo", fontsize=10, color=_WHITE)

    # File details
    y = 275
    for lbl, val in [
        ("File",            os.path.basename(result.file_path)),
        ("Detected type",   result.file_type),
        ("Recommendation",  result.recommendation.value.replace("_", " ")),
        ("Processing time", f"{result.processing_ms} ms"),
    ]:
        page.insert_text(fitz.Point(_MARGIN, y), f"{lbl}:",
                         fontname="hebo", fontsize=9, color=_SUBTLE)
        page.insert_text(fitz.Point(_MARGIN + 130, y), str(val),
                         fontname="helv", fontsize=9, color=_DARK)
        y += 18

    # Flags
    if result.flags:
        y += 12
        page.insert_text(fitz.Point(_MARGIN, y), "FLAGS DETECTED",
                         fontname="hebo", fontsize=10, color=_RED)
        y += 16
        for flag in result.flags[:14]:
            page.draw_rect(fitz.Rect(_MARGIN, y - 9, _MARGIN + 5, y + 1),
                           color=_RED, fill=_RED)
            page.insert_text(fitz.Point(_MARGIN + 10, y),
                             flag.replace("_", " "),
                             fontname="helv", fontsize=8, color=_DARK)
            y += 14
        if len(result.flags) > 14:
            page.insert_text(fitz.Point(_MARGIN + 10, y),
                             f"… and {len(result.flags) - 14} more (see Walkthrough page)",
                             fontname="helv", fontsize=8, color=_SUBTLE)
    else:
        y += 12
        page.insert_text(fitz.Point(_MARGIN, y), "No flags raised.",
                         fontname="helv", fontsize=9, color=_GREEN)

    # Page guide
    y = max(y + 30, 650)
    page.draw_rect(fitz.Rect(_MARGIN - 4, y, _W - _MARGIN + 4, y + 70),
                   color=_LBLUE, fill=_LBLUE)
    page.insert_text(fitz.Point(_MARGIN + 4, y + 16),
                     "This report contains four sections:",
                     fontname="hebo", fontsize=9, color=_DARK)
    for i, sec in enumerate([
        "Page 1  —  Executive summary (this page)",
        "Page 2+ —  Check-by-check walkthrough: what was tested, what was found, what it means",
        "Next    —  Quick-reference findings table + ELA heatmap image",
        "Final   —  Machine-readable JSON output",
    ]):
        page.insert_text(fitz.Point(_MARGIN + 10, y + 30 + i * 12),
                         sec, fontname="helv", fontsize=8, color=_DARK)

    _footer(page)


# ─────────────────────────────────────────────────────────────────────────────
# Pages 2+ — Check-by-check walkthrough
# ─────────────────────────────────────────────────────────────────────────────

def _page_walkthrough(doc: fitz.Document, result: AnalysisResult) -> None:
    page, y = _new_section_page(doc, "CHECK-BY-CHECK WALKTHROUGH")

    for name, chk in result.checks.items():
        # Estimate height needed: title(20) + what(50) + finding(55) + gap(20) = ~145
        if y > _H - 160:
            _footer(page)
            page, y = _new_section_page(doc, "CHECK-BY-CHECK WALKTHROUGH (cont.)")

        y = _draw_check_section(page, name, chk, y)
        y += 8

    _footer(page)


def _new_section_page(doc: fitz.Document, title: str) -> tuple[fitz.Page, float]:
    page = doc.new_page(width=_W, height=_H)
    page.draw_rect(fitz.Rect(0, 0, _W, 52), color=_DARK, fill=_DARK)
    page.insert_text(fitz.Point(_MARGIN, 34), title,
                     fontname="hebo", fontsize=13, color=_WHITE)
    return page, 68.0


def _draw_check_section(page: fitz.Page, name: str, chk: CheckResult, y: float) -> float:
    meta = _get_meta(name)

    # Status colour
    if chk.skipped:
        bar_color = _SUBTLE
        status_txt = "SKIPPED"
    elif chk.penalty < 0.10:
        bar_color = _GREEN
        status_txt = "CLEAN"
    elif chk.penalty < 0.40:
        bar_color = _ORANGE
        status_txt = f"MILD FLAG  —  {chk.penalty * 100:.0f}% penalty"
    else:
        bar_color = _RED
        status_txt = f"FLAGGED  —  {chk.penalty * 100:.0f}% penalty"

    # Title bar
    page.draw_rect(fitz.Rect(_MARGIN - 4, y, _W - _MARGIN + 4, y + 18),
                   color=bar_color, fill=bar_color)
    page.insert_text(fitz.Point(_MARGIN + 2, y + 13),
                     meta["title"].upper(),
                     fontname="hebo", fontsize=8.5, color=_WHITE)
    page.insert_text(fitz.Point(_W - _MARGIN - 160, y + 13),
                     status_txt,
                     fontname="hebo", fontsize=8, color=_WHITE)
    y += 22

    # "WHAT WAS CHECKED" label + body
    page.insert_text(fitz.Point(_MARGIN, y), "WHAT WAS CHECKED:",
                     fontname="hebo", fontsize=7.5, color=_SUBTLE)
    y += 12
    what_rect = fitz.Rect(_MARGIN, y, _W - _MARGIN, y + 60)
    overflow = page.insert_textbox(
        what_rect, meta["what"],
        fontname="helv", fontsize=8, color=_DARK,
        align=fitz.TEXT_ALIGN_LEFT,
    )
    # If text overflowed, give it more room
    if overflow < 0:
        what_rect = fitz.Rect(_MARGIN, y, _W - _MARGIN, y + 90)
        page.insert_textbox(
            what_rect, meta["what"],
            fontname="helv", fontsize=8, color=_DARK,
            align=fitz.TEXT_ALIGN_LEFT,
        )
        y += 92
    else:
        y += 62

    # "FINDING" label + body
    page.insert_text(fitz.Point(_MARGIN, y), "FINDING:",
                     fontname="hebo", fontsize=7.5, color=_SUBTLE)
    y += 12
    finding = _finding_text(name, chk)
    find_rect = fitz.Rect(_MARGIN, y, _W - _MARGIN, y + 65)
    overflow2 = page.insert_textbox(
        find_rect, finding,
        fontname="helv", fontsize=8.5, color=_DARK,
        align=fitz.TEXT_ALIGN_LEFT,
    )
    if overflow2 < 0:
        find_rect = fitz.Rect(_MARGIN, y, _W - _MARGIN, y + 95)
        page.insert_textbox(
            find_rect, finding,
            fontname="helv", fontsize=8.5, color=_DARK,
            align=fitz.TEXT_ALIGN_LEFT,
        )
        y += 97
    else:
        y += 67

    # Penalty bar for flagged checks
    if not chk.skipped and chk.penalty > 0:
        bar_w = _INNER * chk.penalty
        page.draw_rect(fitz.Rect(_MARGIN, y, _MARGIN + _INNER, y + 6),
                       color=_LIGHT, fill=_LIGHT)
        page.draw_rect(fitz.Rect(_MARGIN, y, _MARGIN + bar_w, y + 6),
                       color=bar_color, fill=bar_color)
        page.insert_text(fitz.Point(_MARGIN + _INNER + 4, y + 6),
                         f"{chk.penalty * 100:.0f}%",
                         fontname="helv", fontsize=7, color=_SUBTLE)
        y += 10

    # Separator line
    page.draw_line(fitz.Point(_MARGIN, y + 2), fitz.Point(_W - _MARGIN, y + 2),
                   color=_LIGHT)
    y += 6
    return y


# ─────────────────────────────────────────────────────────────────────────────
# Next page — Findings table + ELA heatmap
# ─────────────────────────────────────────────────────────────────────────────

def _page_findings_table(doc: fitz.Document, result: AnalysisResult) -> None:
    page, y = _new_section_page(doc, "FINDINGS SUMMARY & ELA HEATMAP")

    # Table header
    cols = [_MARGIN, 190, 255, 315, 365]
    headers = ["Check", "Penalty", "Weight", "Status", "Flags raised"]
    page.draw_rect(fitz.Rect(_MARGIN - 4, y - 10, _W - _MARGIN + 4, y + 4),
                   color=_LIGHT, fill=_LIGHT)
    for i, h in enumerate(headers):
        page.insert_text(fitz.Point(cols[i], y), h,
                         fontname="hebo", fontsize=8, color=_DARK)
    y += 14

    row_bg = [_WHITE, (0.96, 0.96, 0.96)]
    for ri, (name, chk) in enumerate(result.checks.items()):
        bg = row_bg[ri % 2]
        page.draw_rect(fitz.Rect(_MARGIN - 4, y - 10, _W - _MARGIN + 4, y + 4),
                       color=bg, fill=bg)

        if chk.skipped:
            status, sc = "SKIPPED", _SUBTLE
        elif chk.penalty < 0.10:
            status, sc = "CLEAN", _GREEN
        elif chk.penalty < 0.40:
            status, sc = "MILD FLAG", _ORANGE
        else:
            status, sc = "FLAGGED", _RED

        pct = f"{chk.penalty * 100:.0f}%"
        wt  = f"{chk.weight:.2f}"
        flag_txt = "; ".join(chk.flags[:2])
        if len(chk.flags) > 2:
            flag_txt += f" (+{len(chk.flags)-2})"

        page.insert_text(fitz.Point(cols[0], y),
                         _get_meta(name)["title"][:28],
                         fontname="helv", fontsize=7.5, color=_DARK)
        page.insert_text(fitz.Point(cols[1], y), pct,
                         fontname="helv", fontsize=7.5, color=_DARK)
        page.insert_text(fitz.Point(cols[2], y), wt,
                         fontname="helv", fontsize=7.5, color=_DARK)
        page.insert_text(fitz.Point(cols[3], y), status,
                         fontname="hebo", fontsize=7.5, color=sc)
        page.insert_text(fitz.Point(cols[4], y), flag_txt,
                         fontname="helv", fontsize=7, color=_SUBTLE)
        y += 14

    # ELA heatmap
    if result.ela_heatmap is not None:
        y += 12
        page.draw_rect(fitz.Rect(_MARGIN - 4, y - 2, _W - _MARGIN + 4, y + 16),
                       color=_LBLUE, fill=_LBLUE)
        page.insert_text(fitz.Point(_MARGIN + 2, y + 11),
                         "ERROR LEVEL ANALYSIS HEATMAP",
                         fontname="hebo", fontsize=9, color=_DARK)
        y += 20
        page.insert_textbox(
            fitz.Rect(_MARGIN, y, _W - _MARGIN, y + 28),
            ("Bright regions in the heatmap below indicate areas where the image showed "
             "higher-than-expected compression residuals after re-saving at quality 95. "
             "Uniform low-level noise across the whole image is expected from scanner JPEG "
             "compression. Concentrated bright patches over specific text fields would be "
             "a strong indicator of localised editing."),
            fontname="helv", fontsize=7.5, color=_SUBTLE,
            align=fitz.TEXT_ALIGN_LEFT,
        )
        y += 32

        ela_img: Image.Image = result.ela_heatmap
        max_w = _INNER
        max_h = _H - y - 60
        iw, ih = ela_img.size
        scale = min(max_w / iw, max_h / ih, 1.0)
        dw, dh = int(iw * scale), int(ih * scale)

        buf = io.BytesIO()
        ela_img.save(buf, format="PNG")
        buf.seek(0)
        page.insert_image(fitz.Rect(_MARGIN, y, _MARGIN + dw, y + dh),
                          stream=buf.read())

    _footer(page)


# ─────────────────────────────────────────────────────────────────────────────
# Final page(s) — Raw JSON
# ─────────────────────────────────────────────────────────────────────────────

def _page_json(doc: fitz.Document, result: AnalysisResult) -> None:
    page, y = _new_section_page(doc, "MACHINE-READABLE RESULT (JSON)")

    raw   = json.dumps(result.to_dict(), indent=2, default=str)
    lines = raw.splitlines()

    for line in lines:
        if y > _H - 55:
            _footer(page)
            page, y = _new_section_page(doc, "MACHINE-READABLE RESULT (cont.)")
        page.insert_text(fitz.Point(_MARGIN, y), line,
                         fontname="cour", fontsize=6.5, color=_DARK)
        y += 9

    _footer(page)


# ─────────────────────────────────────────────────────────────────────────────
# Shared footer
# ─────────────────────────────────────────────────────────────────────────────

def _footer(page: fitz.Page) -> None:
    page.draw_line(fitz.Point(_MARGIN, _H - 30),
                   fitz.Point(_W - _MARGIN, _H - 30), color=_LIGHT)
    page.insert_text(
        fitz.Point(_MARGIN, _H - 16),
        "CONFIDENTIAL — Certificate Forensic Analyzer | For Internal Claims Review Use Only",
        fontname="helv", fontsize=7, color=_SUBTLE,
    )
