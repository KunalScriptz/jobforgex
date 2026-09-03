from pydantic import BaseModel
from typing import Optional


class AIGenerateRequest(BaseModel):
    job_id: str
    purpose: str  # resume_tailoring, cover_letter, resume_scoring, etc.


class DeepSeekRequest(BaseModel):
    prompt_name: str
    vars: dict[str, str | float | int]
    job_id: Optional[str] = None
    purpose: str = "custom"
    override_temperature: Optional[float] = None


class DeepSeekResult(BaseModel):
    content: str
    input_tokens: int
    output_tokens: int
    total_cost: float
    model_name: str
    cache_hit_tokens: int = 0


class ResumeEditRequest(BaseModel):
    latex_source: str
    question: str
    job_id: Optional[str] = None


class ResumeEditResult(BaseModel):
    answer: str
    updated_latex: Optional[str] = None
    page_count: int = 0


class AtsScoreRequest(BaseModel):
    job_id: str
    latex_source: str


class AtsScoreResult(BaseModel):
    base_score: int = 0
    job_match_score: int = 0
    matched_keywords: list[str] = []
    missing_keywords: list[str] = []
    format_checks: dict = {}
    summary: str = ""
    suggestions: list[str] = []


class BuilderSeedRequest(BaseModel):
    job_id: str


class BuilderSaveRequest(BaseModel):
    content: dict


class BuilderCore(BaseModel):
    content: dict
    latex_source: Optional[str] = None


class BuilderOut(BaseModel):
    content: dict
    latex_source: Optional[str] = None
    job_match: Optional[dict] = None
    score: Optional[dict] = None
    suggestions: Optional[dict] = None
