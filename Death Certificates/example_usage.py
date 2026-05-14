"""
Demonstrates direct Python import of the Certificate Forensic Analyzer.

For CLI usage, prefer:
    python -m certificate_forensics <certificate_file> [--help]
"""
import json
from certificate_forensics import CertificateForensicAnalyzer

analyzer = CertificateForensicAnalyzer()

# Analyse a certificate
result = analyzer.analyze("path/to/death_cert.pdf")

# Machine-readable result
print(json.dumps(result.to_dict(), indent=2, default=str))

# Generate PDF audit report
analyzer.save_report(result, "report.pdf")

# Access individual check results
for name, check in result.checks.items():
    if not check.skipped and check.penalty > 0:
        print(f"{name}: {check.penalty:.0%} penalty — {check.flags}")
