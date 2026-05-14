from __future__ import annotations
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional


class RiskLevel(str, Enum):
    CLEAN = "CLEAN"
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class Recommendation(str, Enum):
    PASS = "PASS"
    PASS_WITH_NOTE = "PASS_WITH_NOTE"
    FLAG_FOR_REVIEW = "FLAG_FOR_REVIEW"
    FLAG_URGENT = "FLAG_URGENT"


@dataclass
class CheckResult:
    name: str
    penalty: float          # 0.0 = clean  →  1.0 = definitive tamper indicator
    weight: float           # relative importance; re-normalised across non-skipped checks
    flags: List[str] = field(default_factory=list)
    detail: Dict[str, Any] = field(default_factory=dict)
    skipped: bool = False
    skip_reason: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "penalty": round(self.penalty, 4),
            "weight": self.weight,
            "flags": self.flags,
            "detail": self.detail,
            "skipped": self.skipped,
            "skip_reason": self.skip_reason,
        }


@dataclass
class AnalysisResult:
    file_path: str
    file_type: str
    overall_score: int              # 0–100; 100 = no anomalies
    risk_level: RiskLevel
    recommendation: Recommendation
    flags: List[str]
    checks: Dict[str, CheckResult]
    processing_ms: int
    ela_heatmap: Optional[object] = None   # PIL Image when available

    def to_dict(self) -> Dict[str, Any]:
        return {
            "file_path": self.file_path,
            "file_type": self.file_type,
            "overall_score": self.overall_score,
            "risk_level": self.risk_level.value,
            "recommendation": self.recommendation.value,
            "flags": self.flags,
            "checks": {k: v.to_dict() for k, v in self.checks.items()},
            "processing_ms": self.processing_ms,
        }
