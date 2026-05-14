from .analyzer import CertificateForensicAnalyzer
from .models import AnalysisResult, RiskLevel, Recommendation

__version__ = "1.1.0"
__all__ = [
    "CertificateForensicAnalyzer",
    "AnalysisResult",
    "RiskLevel",
    "Recommendation",
    "analyze_bytes",
]

_VERDICT_MAP = {
    RiskLevel.CLEAN:  "CLEAN",
    RiskLevel.LOW:    "SUSPICIOUS",
    RiskLevel.MEDIUM: "SUSPICIOUS",
    RiskLevel.HIGH:   "LIKELY_FRAUD",
}


def analyze_bytes(data: bytes, filename: str) -> dict:
    """
    Analyse a death certificate supplied as raw bytes.

    Designed for automated pipeline integration where documents arrive in
    memory rather than as files on disk.

    Args:
        data:     Raw file bytes (PDF, JPG, PNG, TIFF, …).
        filename: Original filename — used to determine the file type.
                  Must include a recognised extension (.pdf, .jpg, .png, …).

    Returns:
        {
            "score":    int,        # 0–100; higher = cleaner / less suspicious
            "verdict":  str,        # "CLEAN" | "SUSPICIOUS" | "LIKELY_FRAUD"
            "flags":    list[dict], # checks that fired, each with penalty + detail
            "metadata": dict,       # file_type, processing_ms, filename
        }

    Raises:
        ValueError:   Empty data or unrecognised file extension.
        RuntimeError: Analysis engine failure (wraps the original exception).

    Example::

        with open("cert.pdf", "rb") as f:
            result = analyze_bytes(f.read(), "cert.pdf")

        print(result["score"])    # 92
        print(result["verdict"])  # "CLEAN"
    """
    import logging
    import os
    import tempfile

    if not data:
        raise ValueError("data is empty")

    ext = os.path.splitext(filename)[1].lower()
    if not ext:
        raise ValueError(
            f"Cannot determine file type from filename {filename!r}. "
            "Include the file extension (e.g. 'cert.pdf', 'cert.jpg')."
        )

    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        tmp.write(data)
        tmp_path = tmp.name

    try:
        analyzer = CertificateForensicAnalyzer(log_level=logging.ERROR)
        result = analyzer.analyze(tmp_path)
    except Exception as exc:
        raise RuntimeError(f"Forensic analysis failed for {filename!r}: {exc}") from exc
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass

    # Checks that fired a penalty (skipped and clean checks are excluded)
    fired_flags = [
        {
            "check":   name,
            "penalty": round(chk.penalty, 4),
            "flags":   chk.flags,
        }
        for name, chk in result.checks.items()
        if not chk.skipped and chk.penalty > 0
    ]

    # Checks that contributed an authenticity bonus (e.g. valid digital signature)
    authenticity_signals = [
        {"check": name, "detail": chk.detail}
        for name, chk in result.checks.items()
        if not chk.skipped and chk.penalty < 0
    ]

    return {
        "score":   result.overall_score,
        "verdict": _VERDICT_MAP[result.risk_level],
        "flags":   fired_flags,
        "metadata": {
            "filename":              filename,
            "file_type":             result.file_type,
            "processing_ms":         result.processing_ms,
            **({"authenticity_signals": authenticity_signals} if authenticity_signals else {}),
        },
    }
