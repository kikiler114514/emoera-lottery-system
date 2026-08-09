from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from .config import settings

DATABASE_URL = (
    f"mysql+pymysql://{settings.MYSQL_USER}:{settings.MYSQL_PASSWORD}"
    f"@{settings.MYSQL_HOST}:{settings.MYSQL_PORT}/{settings.MYSQL_DATABASE}?charset=utf8mb4"
)

engine = create_engine(
    DATABASE_URL,
    pool_size=5,
    max_overflow=10,
    pool_pre_ping=True,
    pool_recycle=3600,
    future=True,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _ensure_rooms_activity_id(engine) -> None:
    """自愈：模型已为 Room 定义 activity_id（FK -> activities.id），
    但早期建出的 rooms 表没有该列，create_all 不会给已存在的表加列，
    导致所有活动相关查询报 `Unknown column 'r.activity_id'`。
    这里在启动时检测并补列 + 外键，保证存量库与新建库都能用。"""
    with engine.connect() as conn:
        col = conn.execute(text("SHOW COLUMNS FROM rooms LIKE 'activity_id'")).first()
        if col is not None:
            return  # 已有该列，无需处理
        conn.execute(text(
            "ALTER TABLE rooms "
            "ADD COLUMN activity_id INT NULL, "
            "ADD CONSTRAINT fk_rooms_activity "
            "FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE SET NULL"
        ))
        conn.commit()
        print("Migrated: added rooms.activity_id column")


def _ensure_creator_columns(engine) -> None:
    """自愈：给 rooms/activities 表补充 creator_id / creator_name / last_used_at 列。"""
    patches = {
        "rooms": [
            ("creator_id", "VARCHAR(100) NOT NULL DEFAULT ''"),
            ("creator_name", "VARCHAR(100) NOT NULL DEFAULT ''"),
            ("last_used_at", "TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP"),
        ],
        "activities": [
            ("creator_id", "VARCHAR(100) NOT NULL DEFAULT ''"),
            ("creator_name", "VARCHAR(100) NOT NULL DEFAULT ''"),
            ("last_used_at", "TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP"),
        ],
    }
    with engine.connect() as conn:
        for table, columns in patches.items():
            for col_name, col_def in columns:
                existing = conn.execute(
                    text(f"SHOW COLUMNS FROM {table} LIKE :col"),
                    {"col": col_name},
                ).first()
                if existing is None:
                    conn.execute(text(
                        f"ALTER TABLE {table} ADD COLUMN {col_name} {col_def}"
                    ))
                    print(f"Migrated: added {table}.{col_name}")
        conn.commit()


def init_database():
    """建表（与 Node 版 schema 保持一致），并补齐存量库的 schema drift。"""
    from . import models  # noqa: F401 确保模型已注册

    Base.metadata.create_all(bind=engine)
    _ensure_rooms_activity_id(engine)
    _ensure_creator_columns(engine)
    print("Database initialized successfully")


def reset_database():
    from . import models  # noqa: F401

    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    print("Database reset successfully")
