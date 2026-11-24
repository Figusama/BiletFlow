import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, func, ForeignKey, UniqueConstraint
from sqlalchemy.dialects import postgresql as pg
from sqlmodel import SQLModel, Field

class venues(SQLModel, table=True):
    __tablename__ = "venues"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()))
    name: str = Field(sa_column=Column(pg.VARCHAR, nullable=False))
    address: str = Field(sa_column=Column(pg.TEXT, nullable=False))
    city: str = Field(sa_column=Column(pg.VARCHAR, nullable=False, index=True))
    timezone: str = Field(sa_column=Column(pg.VARCHAR, nullable=False))
    max_capacity: int = Field(sa_column=Column(pg.INTEGER, nullable=False))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now()))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=lambda: datetime.now(timezone.utc)))

class venue_layouts(SQLModel, table=True):
    __tablename__ = "venue_layouts"
    __table_args__ = (UniqueConstraint("venue_id", "name", "version", name="uq_venue_layout_version"),)
    id: uuid.UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()))
    venue_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("venues.id", ondelete="CASCADE"), nullable=False, index=True))
    name: str = Field(sa_column=Column(pg.VARCHAR, nullable=False))
    version: int = Field(default=1, sa_column=Column(pg.INTEGER, nullable=False, server_default="1"))
    is_active: bool = Field(default=True, sa_column=Column(pg.BOOLEAN, nullable=False, server_default="true"))

class venue_sections(SQLModel, table=True):
    __tablename__ = "venue_sections"
    __table_args__ = (UniqueConstraint("layout_id", "name", name="uq_layout_section_name"),)
    id: uuid.UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()))
    layout_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("venue_layouts.id", ondelete="CASCADE"), nullable=False, index=True))
    name: str = Field(sa_column=Column(pg.VARCHAR, nullable=False))

class venue_rows(SQLModel, table=True):
    __tablename__ = "venue_rows"
    __table_args__ = (UniqueConstraint("section_id", "label", name="uq_section_row_label"),)
    id: uuid.UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()))
    section_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("venue_sections.id", ondelete="CASCADE"), nullable=False, index=True))
    label: str = Field(sa_column=Column(pg.VARCHAR, nullable=False))

class venue_seats(SQLModel, table=True):
    __tablename__ = "venue_seats"
    __table_args__ = (UniqueConstraint("row_id", "seat_number", name="uq_row_seat_number"),)
    id: uuid.UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()))
    row_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("venue_rows.id", ondelete="CASCADE"), nullable=False, index=True))
    seat_number: str = Field(sa_column=Column(pg.VARCHAR, nullable=False))
    is_accessible: bool = Field(default=False, sa_column=Column(pg.BOOLEAN, nullable=False, server_default="false"))

