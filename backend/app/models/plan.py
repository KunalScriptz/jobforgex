import uuid
from datetime import datetime
from sqlalchemy import String, Boolean, Integer, Numeric, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Plan(Base):
    __tablename__ = "plans"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    monthly_price_usd: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    annual_price_usd: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    job_track_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cover_letter_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    features: Mapped[dict] = mapped_column(JSONB, default=[])
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    geo_pricing: Mapped[list["GeoPricing"]] = relationship(back_populates="plan", cascade="all, delete-orphan")


class GeoPricing(Base):
    __tablename__ = "geo_pricing"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    plan_id: Mapped[str] = mapped_column(String, ForeignKey("plans.id", ondelete="CASCADE"), nullable=False, index=True)
    country_code: Mapped[str] = mapped_column(String, nullable=False)
    currency: Mapped[str] = mapped_column(String, nullable=False)
    currency_symbol: Mapped[str] = mapped_column(String, default="$")
    monthly_price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    annual_price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    razorpay_plan_id_monthly: Mapped[str | None] = mapped_column(String, nullable=True)
    razorpay_plan_id_annual: Mapped[str | None] = mapped_column(String, nullable=True)
    priority: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    plan: Mapped["Plan"] = relationship(back_populates="geo_pricing")
