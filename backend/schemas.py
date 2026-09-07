from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class UserBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    email: str = Field(..., min_length=1, max_length=255)


class UserCreate(UserBase):
    password: str = Field(..., min_length=8, max_length=255)


class UserResponse(UserBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DocumentBase(BaseModel):
    user_id: int
    title: str = Field(..., min_length=1, max_length=255)
    file_name: str = Field(..., min_length=1, max_length=255)
    file_type: str | None = Field(default=None, max_length=50)
    file_path: str | None = Field(default=None, max_length=500)
    upload_status: str = Field(default="uploaded", max_length=50)


class DocumentCreate(DocumentBase):
    pass


class DocumentResponse(DocumentBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SummaryBase(BaseModel):
    document_id: int
    summary_text: str = Field(..., min_length=1)
    key_insights: str | None = None


class SummaryCreate(SummaryBase):
    pass


class SummaryResponse(SummaryBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ChatBase(BaseModel):
    user_id: int
    document_id: int | None = None
    user_message: str = Field(..., min_length=1)
    conversation_id: str | None = None


class ChatCreate(ChatBase):
    pass


class ChatResponse(ChatBase):
    id: int
    assistant_response: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class SummaryRequest(BaseModel):
    text: str


class SummaryResult(BaseModel):
    summary: str

class GenerateSummaryRequest(BaseModel):
    document_id: int
    text: str


class GenerateSummaryResponse(BaseModel):
    document_id: int
    summary_text: str
    key_insights: str

class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str