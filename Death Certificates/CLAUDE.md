# Death Certificate Forensic Analyzer

A forensic analysis library for South African DHA death certificates (form BI-1663). Detects image manipulation, PDF tampering, and metadata anomalies. Produces a 0–100 risk score, a JSON result, and an optional PDF audit report.

This tool is intended for integration into an automated death claims processing pipeline. It operates fully offline — no external API calls.

## Architecture

```
certificate_forensics/
  __init__.py          — public API (CertificateForensicAnalyzer, AnalysisResult, …)
  __main__.py          — CLI entry point (python -m certificate_forensics)
  analyzer.py          — pipeline orchestration
  config.py            — ExifTool auto-detection
  models.py            — CheckResult, AnalysisResult, RiskLevel, Recommendation
  sa_checks.py         — SA-specific checks stub (see note below)
  scoring/scorer.py    — weighted penalty aggregation → 0–100 score
  image/
    ela.py             — Error Level Analysis (re-compression hotspot detection)
    noise.py           — Laplacian noise consistency (compositing detection)
    jpeg_analysis.py   — JPEG double-compression via quantization tables + ghost detection
    metadata.py        — EXIF metadata analysis (editing software, date anomalies)
    file_format.py     — file signature / MIME type validation
  pdf/
    structure.py       — revision history (%%EOF count), suspicious PDF objects
    metadata.py        — PDF creator/producer, date anomalies
    signatures.py      — digital signature coverage and certificate validation
    content.py         — white overlays, invisible text, embedded image extraction
  report/generator.py  — multi-page PDF audit report (uses PyMuPDF)
```

## Usage

### As a Python library (direct import)

```python
from certificate_forensics import CertificateForensicAnalyzer

analyzer = CertificateForensicAnalyzer()
result = analyzer.analyze("death_cert.pdf")

print(result.overall_score)       # int 0–100
print(result.risk_level.value)    # "CLEAN" | "LOW" | "MEDIUM" | "HIGH"
print(result.recommendation.value)# "PASS" | "PASS_WITH_NOTE" | "FLAG_FOR_REVIEW" | "FLAG_URGENT"
print(result.to_dict())           # full JSON-serialisable dict

analyzer.save_report(result, "audit_report.pdf")
```

### As a CLI subprocess

```bash
python -m certificate_forensics death_cert.pdf
python -m certificate_forensics cert.jpg --report audit.pdf --quiet
python -m certificate_forensics cert.pdf --no-report --json-out result.json
```

**Exit codes:** `0` = CLEAN/LOW risk, `1` = MEDIUM/HIGH risk, `2` = error.

## Checks and weights

| Check | Type | Weight | Key signals |
|-------|------|--------|-------------|
| `file_format` | Both | 0.05 | MIME mismatch, undersized file |
| `exif_metadata` | Image | 0.15 | Editing software fingerprint, GPS on scan, date anomalies |
| `ela` | Image | 0.25 | Re-compression hotspots (primary tampering signal) |
| `noise_consistency` | Image | 0.15 | Laplacian noise variance non-uniformity across blocks |
| `jpeg_dct` | JPEG | 0.10 | Quantization table anomalies, JPEG ghost double-compression |
| `pdf_structure` | PDF | 0.15 | Multiple %%EOF revisions, JavaScript, overlapping text |
| `pdf_metadata` | PDF | 0.10 | Editing software in producer field, impossible dates |
| `pdf_signatures` | PDF | 0.20 | Valid sig = bonus (−0.15); modified after signing = 0.80 penalty |
| `pdf_content` | PDF | 0.10 | White overlays, invisible text |
| `sa_dha_checks` | Both | 0.10 | Currently skipped — see note below |
| `embedded_image_ela` | PDF | 0.25 | ELA on largest raster extracted from PDF |
| `embedded_image_noise` | PDF | 0.15 | Noise analysis on extracted raster |

## Risk score brackets

| Score | Risk level | Recommendation |
|-------|-----------|----------------|
| 85–100 | CLEAN | PASS |
| 65–84 | LOW | PASS_WITH_NOTE |
| 40–64 | MEDIUM | FLAG_FOR_REVIEW |
| 0–39 | HIGH | FLAG_URGENT |

## SA-specific checks (sa_dha_checks)

The BI-1663 form marker checks, mandatory field detection, and 13-digit SA ID
Luhn validation have been removed from the local analysis pipeline. Tesseract
OCR was not reliable enough on scanned DHA certificates (variable quality,
stamps overlaying text, handwritten fields).

**Recommended approach:** call a vision-capable LLM (e.g. Claude Vision API)
as a separate step in the pipeline. The LLM should:
- Confirm BI-1663 form markers are present
- Extract key fields (surname, date of death, ID number, registration number)
- Validate the 13-digit SA ID number using the Luhn algorithm
- Note any visible inconsistencies in the document layout

The `run_sa_checks()` function in `sa_checks.py` is retained as a stub and
returns a skipped result so it does not affect the score. It serves as the
integration point when LLM-based checks are added.

## Dependencies

Install with: `pip install -r requirements.txt`

- `Pillow` — image processing (ELA, noise, JPEG analysis)
- `numpy` — numerical computation
- `PyMuPDF` (fitz) — PDF parsing and report generation
- `pyexiftool` — EXIF metadata extraction (requires ExifTool binary)
- `python-magic-bin` — file type detection (Windows)
- `cryptography` — PKCS#7 certificate parsing

**ExifTool binary:** Place `exiftool.exe` in the project root, or install it
system-wide. Download from https://exiftool.org. The library auto-detects it;
EXIF metadata checks are skipped gracefully if not found.

**Note on jpegio:** jpegio was evaluated for DCT coefficient histogram analysis
but fails to build on Windows. Double-compression detection is implemented
instead using Pillow's quantization table access and JPEG ghost detection —
both pure Python with no compilation required.

## Adding to an automated pipeline

### Primary integration: `analyze_bytes` (bytes in, dict out)

Designed for agents that receive uploaded documents in memory rather than as files.
No console output, no file I/O, no side effects — just bytes in and a plain dict out.

```python
from certificate_forensics import analyze_bytes

# result is a plain dict — no custom types
result = analyze_bytes(file_bytes, "death_cert.pdf")

print(result["score"])    # int 0–100
print(result["verdict"])  # "CLEAN" | "SUSPICIOUS" | "LIKELY_FRAUD"
print(result["flags"])    # list of dicts: [{check, penalty, flags}, ...]
print(result["metadata"]) # {filename, file_type, processing_ms}
```

**Verdict mapping:**

| Score | Verdict |
|-------|---------|
| 85–100 | `CLEAN` |
| 40–84 | `SUSPICIOUS` |
| 0–39 | `LIKELY_FRAUD` |

`SUSPICIOUS` covers both LOW and MEDIUM risk — the score and flags provide the
detail needed to decide whether to auto-approve or queue for human review.

**Error behaviour:** raises `ValueError` for bad input (empty bytes, missing
extension) and `RuntimeError` if the analysis engine fails. Both include a
descriptive message.

### PDF audit report (separate, for human review)

The `analyze_bytes` function does not generate a PDF report. To produce one
alongside the automated result:

```python
from certificate_forensics import analyze_bytes, CertificateForensicAnalyzer
import tempfile, os

# Save bytes to a temporary file, analyse, then generate report
with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
    tmp.write(file_bytes)
    tmp_path = tmp.name

try:
    analyzer = CertificateForensicAnalyzer()
    full_result = analyzer.analyze(tmp_path)
    analyzer.save_report(full_result, "audit_report.pdf")
finally:
    os.unlink(tmp_path)
```

### CLI subprocess integration

```python
import subprocess, json

proc = subprocess.run(
    ["python", "-m", "certificate_forensics", cert_path,
     "--no-report", "--quiet", "--json-out", json_path],
    capture_output=True,
)
# exit code: 0 = CLEAN/LOW, 1 = MEDIUM/HIGH, 2 = error
with open(json_path) as f:
    forensics = json.load(f)
```
