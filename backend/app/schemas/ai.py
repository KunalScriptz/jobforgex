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


class BuilderSeedRequest(BaseModel):
    job_id: str


class BuilderContentUpdate(BaseModel):
    content: dict
    builder_resume_id: str


class BuilderAction(BaseModel):
    builder_resume_id: str
    action: str  # analyze_job_match, analyze_score, generate_suggestions
