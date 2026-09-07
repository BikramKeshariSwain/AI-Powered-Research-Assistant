import uuid
import os
import jwt
import shutil
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pwdlib import PasswordHash
from pypdf import PdfReader
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from ai_service import generate_summary, generate_chat_response
from fastapi.responses import FileResponse

from database import get_db
from models import Chat, Document, Summary, User
from schemas import (
    ChatCreate,
    ChatResponse,
    DocumentCreate,
    DocumentResponse,
    GenerateSummaryRequest,
    GenerateSummaryResponse,
    SummaryCreate,
    SummaryRequest,
    SummaryResponse,
    SummaryResult,
    UserBase,
    UserCreate,
    UserResponse,
    LoginRequest,
    TokenResponse,
)

app = FastAPI()

password_hash = PasswordHash.recommended()
security = HTTPBearer()

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")

if not JWT_SECRET_KEY:
    raise ValueError("JWT_SECRET_KEY not found in .env")

def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> int:
    token = credentials.credentials

    try:
        payload = jwt.decode(
            token,
            JWT_SECRET_KEY,
            algorithms=["HS256"],
        )

        user_id = payload.get("sub")

        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token",
            )

        return int(user_id)

    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


UPLOAD_DIR = Path(__file__).resolve().parent.parent / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@app.get("/")
def root():
    return {"message": "AI-Powered Research & Insight Assistant API Running"}


@app.get("/example")
def example(db: Session = Depends(get_db)):
    return {"message": "Database session available"}


# ==========================================
# USER ENDPOINTS
# ==========================================

@app.get("/users", response_model=list[UserResponse])
def get_users(db: Session = Depends(get_db)):
    return db.scalars(select(User)).all()


@app.get("/users/{user_id}", response_model=UserResponse)
def get_user(user_id: int, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.id == user_id))

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    return user


@app.post(
    "/users",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_user(user_data: UserCreate, db: Session = Depends(get_db)):
    existing_user = db.scalar(
        select(User).where(User.email == user_data.email)
    )

    if existing_user is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists",
        )

    hashed_password = password_hash.hash(user_data.password)


    new_user = User(
    name=user_data.name,
    email=user_data.email,
    password_hash=hashed_password,
)

    db.add(new_user)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists",
        )

    db.refresh(new_user)
    return new_user

@app.post("/auth/login", response_model=TokenResponse)
def login(
    login_data: LoginRequest,
    db: Session = Depends(get_db),
):
    user = db.scalar(
        select(User).where(User.email == login_data.email)
    )

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    try:
        password_valid = password_hash.verify(
            login_data.password,
            user.password_hash,
        )
    except Exception:
        password_valid = False

    if not password_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    payload = {
        "sub": str(user.id),
        "email": user.email,
        "exp": datetime.now(timezone.utc) + timedelta(hours=2),
    }

    access_token = jwt.encode(
        payload,
        JWT_SECRET_KEY,
        algorithm="HS256",
    )

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
    )


@app.put("/users/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    user_data: UserBase,
    db: Session = Depends(get_db),
):
    user = db.scalar(select(User).where(User.id == user_id))

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    user.name = user_data.name
    user.email = user_data.email

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists",
        )

    db.refresh(user)
    return user


@app.delete("/users/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.id == user_id))

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    db.delete(user)
    db.commit()

    return {"message": "User deleted successfully"}


# ==========================================
# DOCUMENT ENDPOINTS
# ==========================================

@app.get("/documents", response_model=list[DocumentResponse])
def get_documents(
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    return db.scalars(
        select(Document).where(Document.user_id == current_user_id)
    ).all()


@app.get("/documents/{document_id}", response_model=DocumentResponse)
def get_document(
    document_id: int,
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    document = db.scalar(
        select(Document).where(Document.id == document_id)
    )

    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )

    if document.user_id != current_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only access your own documents",
        )

    return document

@app.get("/documents/{document_id}/file")
def open_document_file(
    document_id: int,
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    document = db.scalar(
        select(Document).where(Document.id == document_id)
    )

    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )

    if document.user_id != current_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only access your own documents",
        )

    file_path = Path(document.file_path)

    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="PDF file not found on server",
        )

    return FileResponse(
        path=file_path,
        media_type="application/pdf",
        filename=document.file_name,
    )


@app.post(
    "/documents",
    response_model=DocumentResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_document(
    document_data: DocumentCreate,
    db: Session = Depends(get_db),
):
    user = db.scalar(
        select(User).where(User.id == document_data.user_id)
    )

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    new_document = Document(**document_data.model_dump())

    db.add(new_document)
    db.commit()
    db.refresh(new_document)

    return new_document


@app.put("/documents/{document_id}", response_model=DocumentResponse)
def update_document(
    document_id: int,
    document_data: DocumentCreate,
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    document = db.scalar(
        select(Document).where(Document.id == document_id)
    )

    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )

    if document.user_id != current_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only update your own documents",
        )

    if document_data.user_id != current_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot assign the document to another user",
        )

    document.title = document_data.title
    document.file_name = document_data.file_name
    document.file_type = document_data.file_type
    document.file_path = document_data.file_path
    document.upload_status = document_data.upload_status

    db.commit()
    db.refresh(document)

    return document


@app.delete("/documents/{document_id}")
def delete_document(
    document_id: int,
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    document = db.scalar(
        select(Document).where(Document.id == document_id)
    )

    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )

    if document.user_id != current_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only delete your own documents",
        )

    db.delete(document)
    db.commit()

    return {
        "message": "Document deleted successfully"
    }


# ==========================================
# SUMMARY ENDPOINTS
# ==========================================

@app.get("/summaries", response_model=list[SummaryResponse])
def get_summaries(
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    return db.scalars(
        select(Summary)
        .join(Document, Summary.document_id == Document.id)
        .where(Document.user_id == current_user_id)
    ).all()

@app.get("/summaries/{summary_id}", response_model=SummaryResponse)
def get_summary(
    summary_id: int,
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    summary = db.scalar(
        select(Summary).where(Summary.id == summary_id)
    )

    if summary is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Summary not found",
        )

    document = db.scalar(
        select(Document).where(
            Document.id == summary.document_id
        )
    )

    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )

    if document.user_id != current_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only access your own summaries",
        )

    return summary


@app.post(
    "/summaries",
    response_model=SummaryResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_summary(
    summary_data: SummaryCreate,
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    document = db.scalar(
        select(Document).where(
            Document.id == summary_data.document_id
        )
    )

    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )

    if document.user_id != current_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only create summaries for your own documents",
        )

    new_summary = Summary(
        document_id=summary_data.document_id,
        summary_text=summary_data.summary_text,
        key_insights=summary_data.key_insights,
    )

    db.add(new_summary)
    db.commit()
    db.refresh(new_summary)

    return new_summary


@app.put("/summaries/{summary_id}", response_model=SummaryResponse)
def update_summary(
    summary_id: int,
    summary_data: SummaryCreate,
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    summary = db.scalar(
        select(Summary).where(Summary.id == summary_id)
    )

    if summary is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Summary not found",
        )

    existing_document = db.scalar(
        select(Document).where(
            Document.id == summary.document_id
        )
    )

    if existing_document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )

    if existing_document.user_id != current_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only update your own summaries",
        )

    new_document = db.scalar(
        select(Document).where(
            Document.id == summary_data.document_id
        )
    )

    if new_document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )

    if new_document.user_id != current_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only assign summaries to your own documents",
        )

    summary.document_id = summary_data.document_id
    summary.summary_text = summary_data.summary_text
    summary.key_insights = summary_data.key_insights

    db.commit()
    db.refresh(summary)

    return summary


@app.delete("/summaries/{summary_id}")
def delete_summary(
    summary_id: int,
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    summary = db.scalar(
        select(Summary).where(Summary.id == summary_id)
    )

    if summary is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Summary not found",
        )

    document = db.scalar(
        select(Document).where(
            Document.id == summary.document_id
        )
    )

    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )

    if document.user_id != current_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only delete your own summaries",
        )

    db.delete(summary)
    db.commit()

    return {
        "message": "Summary deleted successfully"
    }


@app.post(
    "/generate-summary",
    response_model=SummaryResult,
)
def generate_ai_summary(
    request: SummaryRequest,
):
    summary = generate_summary(request.text)

    return SummaryResult(summary=summary)


@app.post(
    "/generate-summary-and-save",
    response_model=SummaryResponse,
    status_code=status.HTTP_201_CREATED,
)
def generate_summary_and_save(
    request: GenerateSummaryRequest,
    db: Session = Depends(get_db),
):
    document = db.scalar(
        select(Document).where(
            Document.id == request.document_id
        )
    )

    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )

    summary_text = generate_summary(request.text)

    key_insights = (
        "Automatically generated summary from extracted document text."
    )

    new_summary = Summary(
        document_id=request.document_id,
        summary_text=summary_text,
        key_insights=key_insights,
    )

    db.add(new_summary)
    db.commit()
    db.refresh(new_summary)

    return new_summary


# ==========================================
# CHAT ENDPOINTS
# ==========================================

@app.get("/chats", response_model=list[ChatResponse])
def get_chats(
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    return db.scalars(
        select(Chat).where(Chat.user_id == current_user_id)
    ).all()

@app.get("/chats/{chat_id}", response_model=ChatResponse)
def get_chat(
    chat_id: int,
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    chat = db.scalar(
        select(Chat).where(Chat.id == chat_id)
    )

    if chat is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chat not found",
        )

    if chat.user_id != current_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only access your own chats",
        )

    return chat




@app.post(
    "/chats",
    response_model=ChatResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_chat(
    chat_data: ChatCreate,
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    # Make sure the request belongs to the logged-in user
    if chat_data.user_id != current_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only create chats for your own account",
        )

    user = db.scalar(
        select(User).where(User.id == current_user_id)
    )

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    if chat_data.document_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Document ID is required",
        )

    document = db.scalar(
        select(Document).where(
            Document.id == chat_data.document_id
        )
    )

    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )

    if document.user_id != current_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only chat with your own documents",
        )

    if not document.extracted_text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No extracted text found for this document",
        )

    ai_response = generate_chat_response(
        document.extracted_text,
        chat_data.user_message,
    )

    # Use the existing conversation ID,
    # or create a new one for a brand-new conversation.
    conversation_id = (
        chat_data.conversation_id
        if chat_data.conversation_id
        else str(uuid.uuid4())
    )

    new_chat = Chat(
        conversation_id=conversation_id,
        user_id=current_user_id,
        document_id=chat_data.document_id,
        user_message=chat_data.user_message,
        assistant_response=ai_response,
    )

    db.add(new_chat)
    db.commit()
    db.refresh(new_chat)

    return new_chat



@app.put("/chats/{chat_id}", response_model=ChatResponse)
def update_chat(
    chat_id: int,
    chat_data: ChatCreate,
    db: Session = Depends(get_db),
):
    chat = db.scalar(
        select(Chat).where(Chat.id == chat_id)
    )

    if chat is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chat not found",
        )

    user = db.scalar(
        select(User).where(User.id == chat_data.user_id)
    )

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    if chat_data.document_id is not None:
        document = db.scalar(
            select(Document).where(
                Document.id == chat_data.document_id
            )
        )

        if document is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Document not found",
            )

    chat.user_id = chat_data.user_id
    chat.document_id = chat_data.document_id
    chat.user_message = chat_data.user_message

    db.commit()
    db.refresh(chat)

    return chat


@app.delete("/chats/{chat_id}")
def delete_chat(
    chat_id: int,
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    chat = db.scalar(
        select(Chat).where(Chat.id == chat_id)
    )

    if chat is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chat not found",
        )

    if chat.user_id != current_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only delete your own chats",
        )

    db.delete(chat)
    db.commit()

    return {
        "message": "Chat deleted successfully"
    }


# ==========================================
# STATIC FILE & UPLOAD MANAGEMENT
# ==========================================

@app.post("/upload")
def upload_file(file: UploadFile = File(...)):
    filename = Path(file.filename or "").name

    if not filename or filename in {".", ".."}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A valid filename is required",
        )

    file_path = UPLOAD_DIR / filename

    with file_path.open("wb") as destination:
        shutil.copyfileobj(file.file, destination)

    return {
        "filename": filename,
        "file_path": str(file_path),
    }


@app.get("/uploads")
def get_uploaded_files():
    return [
        {
            "filename": file_path.name,
            "file_size": file_path.stat().st_size,
            "file_path": str(file_path),
        }
        for file_path in sorted(UPLOAD_DIR.iterdir())
        if file_path.is_file()
    ]


@app.post("/extract-text")
def extract_text(file: UploadFile = File(...)):
    if not (file.filename or "").endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only PDF files are allowed",
        )

    reader = PdfReader(file.file)

    text = ""

    for page in reader.pages:
        text += page.extract_text() or ""

    return {
        "filename": file.filename,
        "text": text,
    }


@app.post("/upload-and-summarize")
def upload_and_summarize(
    title: str,
    file: UploadFile = File(...),
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    user = db.scalar(
        select(User).where(User.id == current_user_id)
    )

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    filename = Path(file.filename or "").name

    if not filename or filename in {".", ".."}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A valid filename is required",
        )

    if not filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only PDF files are allowed",
        )

    file_path = UPLOAD_DIR / filename

    with file_path.open("wb") as destination:
        shutil.copyfileobj(file.file, destination)

    new_document = Document(
        user_id=current_user_id,
        title=title,
        file_name=filename,
        file_type=file.content_type,
        file_path=str(file_path),
        upload_status="uploaded",
    )

    db.add(new_document)
    db.commit()
    db.refresh(new_document)

    reader = PdfReader(str(file_path))

    text = ""

    for page in reader.pages:
        text += page.extract_text() or ""

    if not text.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not extract text from this PDF",
        )

    new_document.extracted_text = text

    db.commit()
    db.refresh(new_document)

    summary_text = generate_summary(text)

    new_summary = Summary(
        document_id=new_document.id,
        summary_text=summary_text,
        key_insights="Automatically generated summary.",
    )

    db.add(new_summary)
    db.commit()
    db.refresh(new_summary)

    return {
        "document_id": new_document.id,
        "summary_id": new_summary.id,
        "filename": filename,
        "summary": new_summary.summary_text,
    }