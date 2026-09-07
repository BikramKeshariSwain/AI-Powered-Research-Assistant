from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# MySQL database connection settings.
DATABASE_NAME = "research_assistant_db"
DATABASE_USER = "root"
DATABASE_PASSWORD = "bikram@2004"
DATABASE_HOST = "localhost"
DATABASE_PORT = 3306

# SQLAlchemy database URL using the PyMySQL driver.
DATABASE_URL = "mysql+pymysql://root:bikram%402004@localhost:3306/research_assistant_db"

# SQLAlchemy engine manages the connection pool to the MySQL database.
engine = create_engine(DATABASE_URL, pool_pre_ping=True)

# SessionLocal creates database session objects for queries and transactions.
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base is the parent class that SQLAlchemy models will inherit from.
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()