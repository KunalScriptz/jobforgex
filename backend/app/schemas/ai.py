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
    ats_score: int = 0
    keyword_match: float = 0.0
    matched_keywords: list[str] = []
    missing_keywords: list[str] = []
    format_checks: dict = {}
    summary: str = ""
    suggestions: list[str] = []


class BuilderSeedRequest(BaseModel):
    job_id: str


class BuilderContentUpdate(BaseModel):
    content: dict
    builder_resume_id: str


class BuilderAction(BaseModel):
    builder_resume_id: str
    action: str  # analyze_job_match, analyze_score, generate_suggestions
