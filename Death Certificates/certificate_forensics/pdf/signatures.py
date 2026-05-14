from __future__ import annotations
import logging
import re
from datetime import datetime, timezone
from typing import Any

import fitz

from ..models import CheckResult

log = logging.getLogger(__name__)


def verify_pdf_signatures(pdf_path: str) -> CheckResult:
    """
    Checks for digital signatures in the PDF.

    Scoring rationale for this check:
      • No signature   → neutral (0.0).  Most DHA certificates are scanned
        images wrapped in a PDF — a missing signature is expected and is not
        evidence of forgery.
      • Valid signature with full document coverage → authenticity bonus
        (negative penalty).  A cryptographically valid signature that covers
        the entire document is strong evidence of integrity and is very hard
        to forge.
      • Document modified after signing → high penalty (0.80).  The byte-range
        does not cover the whole file, meaning content was added post-signing.
      • Other failures (parse error, expired cert, self-signed) → moderate
        penalties reflecting reduced but non-zero trust.

    Limitation: full RSA/ECDSA digest verification requires pyhanko or a
    dedicated PDF signing library.  This check covers structural and
    certificate-level integrity — sufficient for a first-pass signal.
    """
    result = CheckResult(name="pdf_signatures", penalty=0.0, weight=0.20)

    try:
        doc = fitz.open(pdf_path)
    except Exception as exc:
        result.skipped = True
        result.skip_reason = str(exc)
        return result

    sigflags = doc.get_sigflags()   # -1 = no sigs; 1 or 3 = signed

    if sigflags == -1:
        doc.close()
        result.penalty = 0.0
        result.detail = {"signature_count": 0, "note": "unsigned_expected_for_scanned_docs"}
        return result

    # Collect all signature widgets
    sig_widgets: list[dict[str, Any]] = []
    for page in doc:
        try:
            for widget in page.widgets():
                if widget.field_type == fitz.PDF_WIDGET_TYPE_SIGNATURE:
                    sig_widgets.append({
                        "page": page.number + 1,
                        "xref": widget.xref,
                        "field_name": widget.field_name,
                    })
        except Exception:
            pass
    doc.close()

    if not sig_widgets:
        result.penalty = 0.0
        result.flags.append("sigflags_set_but_no_sig_widgets_found")
        result.detail = {"signature_count": 0, "sigflags": sigflags}
        return result

    penalties: list[float] = []
    valid_full_coverage_count = 0
    sig_reports: list[dict[str, Any]] = []

    with open(pdf_path, "rb") as f:
        raw_pdf = f.read()
    file_size = len(raw_pdf)

    for sw in sig_widgets:
        report = _inspect_signature(raw_pdf, file_size, sw)
        sig_reports.append(report)

        modified_after_sign = report.get("coverage_error", False)
        cert_expired        = report.get("cert_expired", False)
        parse_error         = report.get("parse_error")
        chain_depth         = report.get("chain_depth", 1)

        if modified_after_sign:
            penalties.append(0.80)
            result.flags.append(f"document_modified_after_signing_{sw['field_name']}")
        elif parse_error:
            penalties.append(0.60)
            result.flags.append(f"signature_parse_failed_{sw['field_name']}")
        elif cert_expired:
            penalties.append(0.80)
            result.flags.append(f"signing_certificate_expired_{sw['field_name']}")
        elif chain_depth < 2:
            # Self-signed — some trust, but no verified CA chain
            penalties.append(0.20)
            result.flags.append(f"self_signed_certificate_{sw['field_name']}")
        else:
            # Valid signature with full coverage and a CA chain
            valid_full_coverage_count += 1
            result.flags.append(f"valid_signature_present_{sw['field_name']}")

    if valid_full_coverage_count > 0 and not penalties:
        # Strong authenticity signal — award a bonus (negative penalty)
        result.penalty = -0.15
        result.detail["authenticity_bonus"] = "valid_digital_signature_full_coverage"
    else:
        result.penalty = round(max(penalties, default=0.0), 4)

    result.detail.update({
        "signature_count": len(sig_widgets),
        "sigflags": sigflags,
        "valid_signatures": valid_full_coverage_count,
        "signatures": sig_reports,
    })
    return result


def _inspect_signature(raw: bytes, file_size: int, sw: dict) -> dict[str, Any]:
    report: dict[str, Any] = {
        "field_name": sw.get("field_name"),
        "page": sw.get("page"),
    }

    try:
        br_match = re.search(rb"/ByteRange\s*\[\s*([\d\s]+)\]", raw)
        if not br_match:
            report["parse_error"] = "no_byterange_found"
            return report

        br = [int(x) for x in br_match.group(1).split()]
        if len(br) != 4:
            report["parse_error"] = "invalid_byterange"
            return report

        end_of_signed = br[2] + br[3]
        report["byterange"] = br
        report["coverage_error"] = end_of_signed < file_size - 128

        contents_match = re.search(rb"/Contents\s*<([0-9a-fA-F\s]+)>", raw)
        if not contents_match:
            report["parse_error"] = "no_contents_hex_found"
            return report

        pkcs7_hex = contents_match.group(1).replace(b" ", b"").replace(b"\n", b"")
        pkcs7_der = bytes.fromhex(pkcs7_hex.decode("ascii"))
        report["pkcs7_size_bytes"] = len(pkcs7_der)

        _add_cert_info(pkcs7_der, report)

    except Exception as exc:
        report["parse_error"] = str(exc)

    return report


def _add_cert_info(pkcs7_der: bytes, report: dict) -> None:
    try:
        from cryptography.hazmat.primitives.serialization.pkcs7 import (
            load_der_pkcs7_certificates,
        )
        certs = load_der_pkcs7_certificates(pkcs7_der)
    except Exception as exc:
        report["parse_error"] = f"cryptography_load_failed:{exc}"
        return

    if not certs:
        report["chain_depth"] = 0
        return

    report["chain_depth"] = len(certs)
    signing_cert = certs[0]

    report["cert_subject"] = signing_cert.subject.rfc4514_string()
    report["cert_issuer"]  = signing_cert.issuer.rfc4514_string()

    try:
        not_after = signing_cert.not_valid_after_utc
    except AttributeError:
        not_after = signing_cert.not_valid_after.replace(tzinfo=timezone.utc)

    report["cert_expiry"]  = not_after.isoformat()
    report["cert_expired"] = datetime.now(timezone.utc) > not_after
