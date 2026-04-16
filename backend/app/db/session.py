from sqlmodel import Session, create_engine

from app.core.config import get_settings

settings = get_settings()
database_url = settings.database_url
connect_args = {"check_same_thread": False} if database_url.startswith("sqlite") else {}
engine = create_engine(database_url, echo=False, connect_args=connect_args)


def get_session():
    with Session(engine) as session:
        yield session
