from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    ForeignKey,
    TIMESTAMP,
    func,
    Index,
)
from sqlalchemy.orm import relationship
from .database import Base

_TABLE_ARGS = {"mysql_charset": "utf8mb4", "mysql_engine": "InnoDB"}


class Activity(Base):
    __tablename__ = "activities"

    id = Column(Integer, primary_key=True, autoincrement=True)
    activity_id = Column(String(50), nullable=False, unique=True)
    name = Column(String(200), nullable=False)
    description = Column(Text)
    creator_id = Column(String(100), nullable=False, default="")
    creator_name = Column(String(100), nullable=False, default="")
    last_used_at = Column(TIMESTAMP, server_default=func.current_timestamp())
    created_at = Column(TIMESTAMP, server_default=func.current_timestamp())
    updated_at = Column(
        TIMESTAMP,
        server_default=func.current_timestamp(),
        onupdate=func.current_timestamp(),
    )

    rooms = relationship("Room", back_populates="activity")

    __table_args__ = (
        Index("idx_activity_id", "activity_id"),
        Index("idx_activity_created", "created_at"),
        Index("idx_activity_creator", "creator_id"),
        _TABLE_ARGS,
    )


class Room(Base):
    __tablename__ = "rooms"

    id = Column(Integer, primary_key=True, autoincrement=True)
    room_id = Column(String(50), nullable=False, unique=True)
    name = Column(String(200), nullable=False)
    description = Column(Text)
    activity_id = Column(
        Integer, ForeignKey("activities.id", ondelete="SET NULL"), nullable=True
    )
    creator_id = Column(String(100), nullable=False, default="")
    creator_name = Column(String(100), nullable=False, default="")
    created_at = Column(TIMESTAMP, server_default=func.current_timestamp())
    updated_at = Column(
        TIMESTAMP,
        server_default=func.current_timestamp(),
        onupdate=func.current_timestamp(),
    )
    last_used_at = Column(TIMESTAMP, server_default=func.current_timestamp())
    total_users = Column(Integer, default=0)
    current_winners = Column(Integer, default=0)

    activity = relationship("Activity", back_populates="rooms")

    __table_args__ = (
        Index("idx_room_id", "room_id"),
        Index("idx_created_at", "created_at"),
        Index("idx_room_creator", "creator_id"),
        Index("idx_last_used", "last_used_at"),
        _TABLE_ARGS,
    )


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    room_id = Column(
        Integer, ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False
    )
    name = Column(String(100), nullable=False)
    department = Column(String(100))
    created_at = Column(TIMESTAMP, server_default=func.current_timestamp())

    __table_args__ = (
        Index("idx_room_id", "room_id"),
        Index("idx_name", "name"),
        Index("idx_created_at", "created_at"),
        _TABLE_ARGS,
    )


class LotteryWinner(Base):
    __tablename__ = "lottery_winners"

    id = Column(Integer, primary_key=True, autoincrement=True)
    room_id = Column(
        Integer, ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False
    )
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    round_number = Column(Integer, nullable=False)
    won_at = Column(TIMESTAMP, server_default=func.current_timestamp())
    prize_name = Column(String(200))

    __table_args__ = (
        Index("idx_room_id", "room_id"),
        Index("idx_round", "round_number"),
        Index("idx_won_at", "won_at"),
        _TABLE_ARGS,
    )
