from __future__ import annotations
"""
South Africa–specific heuristics for DHA death certificates (form BI-1663).

NOTE: The OCR-based text checks (BI-1663 form markers, mandatory field presence,
13-digit SA ID Luhn validation) and the DHA watermark frequency-domain check have
been removed from this module.

Reason: Tesseract OCR is not reliable enough for scanned DHA certificates, which
exhibit variable scan quality, stamps overlaying text, handwritten fields, and
complex multi-column layouts. These checks produced false negatives on genuine
certificates.

Recommended replacement: a vision-capable LLM (e.g. Claude Vision API) can
understand document structure semantically, handle scan quality variation, extract
fields even with overlays, and validate the SA ID number reliably. The 13-digit
Luhn checksum should be applied to the ID number extracted by the LLM, not by OCR.

The DHA watermark check requires calibration against real DHA certificate samples
before it can produce reliable signal; it has been removed until that data is
available.
"""
from .models import CheckResult


def run_sa_checks(file_path: str, extracted_text: str = "") -> CheckResult:
    result = CheckResult(name="sa_dha_checks", penalty=0.0, weight=0.10)
    result.skipped = True
    result.skip_reason = "pending_llm_vision_integration"
    return result
