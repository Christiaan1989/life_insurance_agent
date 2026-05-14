"""
CLI entry point for the Certificate Forensic Analyzer.

Usage:
    python -m certificate_forensics <certificate> [options]

Examples:
    python -m certificate_forensics death_cert.pdf
    python -m certificate_forensics cert.jpg --report audit.pdf
    python -m certificate_forensics cert.pdf --no-report --quiet

Exit codes:
    0  CLEAN or LOW risk  (PASS / PASS_WITH_NOTE)
    1  MEDIUM or HIGH risk (FLAG_FOR_REVIEW / FLAG_URGENT)
    2  Error (file not found, unsupported format)
"""
from __future__ import annotations
import argparse
import io
import json
import os
import sys

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

from certificate_forensics import CertificateForensicAnalyzer, Recommendation

_SEP_H = "=" * 58
_SEP_L = "-" * 58


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="python -m certificate_forensics",
        description="Forensic analysis of South African DHA death certificates",
    )
    parser.add_argument(
        "certificate",
        help="Path to the certificate file (PDF, JPG, PNG, TIFF, …)",
    )
    parser.add_argument(
        "--report", "-r",
        metavar="PATH",
        default=None,
        help="Output path for the PDF report (default: <certificate>_forensic_report.pdf)",
    )
    parser.add_argument(
        "--json-out", "-j",
        metavar="PATH",
        default=None,
        help="Output path for JSON results (default: <certificate>.forensics.json)",
    )
    parser.add_argument(
        "--no-report",
        action="store_true",
        help="Skip generating the PDF audit report",
    )
    parser.add_argument(
        "--quiet", "-q",
        action="store_true",
        help="Suppress console output (JSON is always written)",
    )
    args = parser.parse_args()

    cert_path = args.certificate
    if not os.path.exists(cert_path):
        print(f"Error: file not found: {cert_path}", file=sys.stderr)
        sys.exit(2)

    report_path = args.report   or (cert_path + "_forensic_report.pdf")
    json_path   = args.json_out or (cert_path + ".forensics.json")

    analyzer = CertificateForensicAnalyzer()
    result   = analyzer.analyze(cert_path)

    if not args.quiet:
        print(f"\n{_SEP_H}")
        print(f"  FILE           : {os.path.basename(cert_path)}")
        print(f"  SCORE          : {result.overall_score} / 100")
        print(f"  RISK LEVEL     : {result.risk_level.value}")
        print(f"  RECOMMENDATION : {result.recommendation.value}")
        print(f"  PROCESSING     : {result.processing_ms} ms")
        print(_SEP_L)
        if result.flags:
            print("  FLAGS:")
            for flag in result.flags:
                print(f"    * {flag}")
        else:
            print("  No anomalies detected.")
        print(_SEP_L)
        print("  CHECK BREAKDOWN:")
        for name, chk in result.checks.items():
            if chk.skipped:
                status = f"SKIP  ({chk.skip_reason})"
            elif chk.penalty < 0:
                status = f"BONUS  {abs(chk.penalty) * 100:.0f}%"
            else:
                status = f"{chk.penalty * 100:4.0f}% penalty"
            print(f"    {name:<32} {status}")
        print(_SEP_H)
        print()

    with open(json_path, "w", encoding="utf-8") as fh:
        json.dump(result.to_dict(), fh, indent=2, default=str)
    if not args.quiet:
        print(f"JSON   -> {json_path}")

    if not args.no_report:
        analyzer.save_report(result, report_path)
        if not args.quiet:
            print(f"Report -> {report_path}")

    high_risk = result.recommendation in (
        Recommendation.FLAG_FOR_REVIEW,
        Recommendation.FLAG_URGENT,
    )
    sys.exit(1 if high_risk else 0)


if __name__ == "__main__":
    main()
