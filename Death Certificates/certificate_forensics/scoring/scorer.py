from __future__ import annotations
from typing import Dict

from ..models import AnalysisResult, CheckResult, Recommendation, RiskLevel


def compute_score(checks: Dict[str, CheckResult]) -> tuple[int, RiskLevel, Recommendation]:
    """
    Weighted average of per-check penalties, normalised over non-skipped checks.
    Returns (score_0_to_100, risk_level, recommendation).
    """
    total_weight = 0.0
    weighted_penalty = 0.0

    for check in checks.values():
        if check.skipped:
            continue
        total_weight += check.weight
        weighted_penalty += check.penalty * check.weight

    if total_weight == 0:
        return 50, RiskLevel.MEDIUM, Recommendation.FLAG_FOR_REVIEW

    normalised = weighted_penalty / total_weight          # 0.0 – 1.0
    score = max(0, min(100, round((1.0 - normalised) * 100)))

    if score >= 85:
        risk = RiskLevel.CLEAN
        rec = Recommendation.PASS
    elif score >= 65:
        risk = RiskLevel.LOW
        rec = Recommendation.PASS_WITH_NOTE
    elif score >= 40:
        risk = RiskLevel.MEDIUM
        rec = Recommendation.FLAG_FOR_REVIEW
    else:
        risk = RiskLevel.HIGH
        rec = Recommendation.FLAG_URGENT

    return score, risk, rec


def collect_flags(checks: Dict[str, CheckResult]) -> list[str]:
    flags: list[str] = []
    for check in checks.values():
        flags.extend(check.flags)
    return flags
