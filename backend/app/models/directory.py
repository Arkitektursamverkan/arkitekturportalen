"""ORM model for people read from the Entra ID directory (ea_directory_people).

A nightly copy of who works in the organisation and in which department, read from
Microsoft Graph with the app's own credentials. It is what gives the app a
complete list of departments – ea_users only knows those who have signed in.
Being listed here gives no access to anything: accounts and roles stay in
ea_users.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class DirectoryPersonORM(Base):
    __tablename__ = "ea_directory_people"

    entra_oid: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    department: Mapped[str | None] = mapped_column(String(255), nullable=True)
    synced_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (Index("ix_ea_directory_people_department", "department"),)


class DirectoryHiddenDepartmentORM(Base):
    """A department an admin has hidden from the lists people pick from –
    e.g. service accounts and external consultants. Kept by name, apart from
    the people, so it survives every sync."""

    __tablename__ = "ea_directory_hidden_departments"

    name: Mapped[str] = mapped_column(String(255), primary_key=True)
