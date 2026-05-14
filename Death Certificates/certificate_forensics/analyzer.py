from __future__ import annotations
import logging
import os
import tempfile
import time

from .models import AnalysisResult, CheckResult
from .scoring.scorer import collect_flags, compute_score

log = logging.getLogger(__name__)

_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".tiff", ".tif", ".bmp", ".gif", ".webp"}
_PDF_EXTENSIONS   = {".pdf"}


class CertificateForensicAnalyzer:
    """
    Analyses image and PDF files for signs of tampering.

    Usage::

        analyzer = CertificateForensicAnalyzer()
        result = analyzer.analyze("death_cert.pdf")

        # Machine-readable dict / JSON
        print(result.to_dict())

        # Human-readable PDF report
        analyzer.save_report(result, "report.pdf")

    Or via the CLI::

        python -m certificate_forensics death_cert.pdf
        python -m certificate_forensics death_cert.pdf --report report.pdf --quiet
    """

    def __init__(self, log_level: int = logging.WARNING) -> None:
        logging.basicConfig(level=log_level)

    # ─── Public API ──────────────────────────────────────────────────────────

    def analyze(self, file_path: str) -> AnalysisResult:
        t0 = time.perf_counter()
        ext = os.path.splitext(file_path)[1].lower()

        if ext in _PDF_EXTENSIONS:
            result = self._analyze_pdf(file_path)
        elif ext in _IMAGE_EXTENSIONS:
            result = self._analyze_image(file_path)
        else:
            result = self._analyze_by_mime(file_path)

        result.processing_ms = round((time.perf_counter() - t0) * 1000)
        return result

    def save_report(self, result: AnalysisResult, output_path: str) -> None:
        from .report.generator import generate_pdf_report
        generate_pdf_report(result, output_path)

    def analyze_and_save(self, file_path: str, report_path: str) -> AnalysisResult:
        result = self.analyze(file_path)
        self.save_report(result, report_path)
        return result

    # ─── Image pipeline ──────────────────────────────────────────────────────

    def _analyze_image(self, file_path: str, file_type: str = "") -> AnalysisResult:
        from .image.metadata      import analyze_exif_metadata
        from .image.ela           import perform_ela
        from .image.noise         import analyze_noise_consistency
        from .image.jpeg_analysis import analyze_jpeg_dct
        from .image.file_format   import check_file_format
        from .sa_checks           import run_sa_checks

        checks: dict[str, CheckResult] = {}

        checks["file_format"]       = check_file_format(file_path)
        checks["exif_metadata"]     = analyze_exif_metadata(file_path)
        ela_result, ela_heatmap     = perform_ela(file_path)
        checks["ela"]               = ela_result
        checks["noise_consistency"] = analyze_noise_consistency(file_path)
        checks["jpeg_dct"]          = analyze_jpeg_dct(file_path)
        checks["sa_dha_checks"]     = run_sa_checks(file_path)

        detected_type = (
            file_type
            or checks["file_format"].detail.get("detected_mime", "image/unknown")
        )

        score, risk, rec = compute_score(checks)
        return AnalysisResult(
            file_path      = file_path,
            file_type      = detected_type,
            overall_score  = score,
            risk_level     = risk,
            recommendation = rec,
            flags          = collect_flags(checks),
            checks         = checks,
            processing_ms  = 0,
            ela_heatmap    = ela_heatmap,
        )

    # ─── PDF pipeline ────────────────────────────────────────────────────────

    def _analyze_pdf(self, file_path: str) -> AnalysisResult:
        from .pdf.structure    import analyze_pdf_structure
        from .pdf.metadata     import analyze_pdf_metadata
        from .pdf.signatures   import verify_pdf_signatures
        from .pdf.content      import analyze_pdf_content, extract_largest_image
        from .image.ela        import perform_ela
        from .image.noise      import analyze_noise_consistency
        from .image.file_format import check_file_format
        from .sa_checks        import run_sa_checks

        checks: dict[str, CheckResult] = {}

        checks["file_format"]    = check_file_format(file_path)
        checks["pdf_structure"]  = analyze_pdf_structure(file_path)
        checks["pdf_metadata"]   = analyze_pdf_metadata(file_path)
        checks["pdf_signatures"] = verify_pdf_signatures(file_path)
        checks["pdf_content"]    = analyze_pdf_content(file_path)
        checks["sa_dha_checks"]  = run_sa_checks(file_path)

        ela_heatmap = None
        embedded_img = extract_largest_image(file_path)
        if embedded_img is not None:
            with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
                tmp_path = tmp.name
                embedded_img.save(tmp_path, format="JPEG", quality=97)
            try:
                ela_result, ela_heatmap        = perform_ela(tmp_path)
                noise_result                   = analyze_noise_consistency(tmp_path)
                ela_result.name   = "embedded_image_ela"
                noise_result.name = "embedded_image_noise"
                checks["embedded_image_ela"]   = ela_result
                checks["embedded_image_noise"] = noise_result
            finally:
                os.unlink(tmp_path)

        score, risk, rec = compute_score(checks)
        return AnalysisResult(
            file_path      = file_path,
            file_type      = "application/pdf",
            overall_score  = score,
            risk_level     = risk,
            recommendation = rec,
            flags          = collect_flags(checks),
            checks         = checks,
            processing_ms  = 0,
            ela_heatmap    = ela_heatmap,
        )

    # ─── Fallback ────────────────────────────────────────────────────────────

    def _analyze_by_mime(self, file_path: str) -> AnalysisResult:
        """Detect by MIME type when extension is unknown or missing."""
        try:
            import magic
            mime = magic.from_file(file_path, mime=True)
        except Exception:
            mime = ""

        if mime == "application/pdf":
            return self._analyze_pdf(file_path)
        elif mime.startswith("image/"):
            return self._analyze_image(file_path, file_type=mime)

        checks: dict[str, CheckResult] = {}
        from .image.file_format import check_file_format
        checks["file_format"] = check_file_format(file_path)
        checks["file_format"].flags.append("unrecognised_file_type")
        checks["file_format"].penalty = 0.50

        score, risk, rec = compute_score(checks)
        return AnalysisResult(
            file_path      = file_path,
            file_type      = mime or "unknown",
            overall_score  = score,
            risk_level     = risk,
            recommendation = rec,
            flags          = collect_flags(checks),
            checks         = checks,
            processing_ms  = 0,
        )
