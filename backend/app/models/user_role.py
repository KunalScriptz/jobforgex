import uuid
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

import enum


class AppRole(str, enum.Enum):
    ADMIN = "admin"
    USER = "user"


class UserRole(Base):
    __tablename__ = "user_roles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, unique=True, index=True)
    role: Mapped[AppRole] = mapped_column(SAEnum(AppRole, name="app_role", create_type=False), default=AppRole.USER)

    user: Mapped["User"] = relationship(back_populates="user_roles")
