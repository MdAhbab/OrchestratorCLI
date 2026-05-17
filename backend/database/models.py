"""
Pydantic models for IBM Bob Backend System.
Defines data models for all database entities and API request/response schemas.
"""

from pydantic import BaseModel, Field, EmailStr, field_validator, ConfigDict
from typing import Optional, List, Dict, Any, Literal
from datetime import datetime, timezone
from enum import Enum


def utc_now() -> datetime:
    """Return current UTC datetime with timezone info."""
    return datetime.now(timezone.utc)


# ============================================================================
# ENUMS
# ============================================================================

class ProviderType(str, Enum):
    """Provider types."""
    LLM = "llm"
    EMBEDDING = "embedding"
    TTS = "tts"
    STT = "stt"
    VISION = "vision"


class SessionStatus(str, Enum):
    """Session status types."""
    ACTIVE = "active"
    PAUSED = "paused"
    COMPLETED = "completed"
    ARCHIVED = "archived"


class SessionType(str, Enum):
    """Session types."""
    CHAT = "chat"
    TASK = "task"
    WORKFLOW = "workflow"


class MessageRole(str, Enum):
    """Message role types."""
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"
    FUNCTION = "function"
    TOOL = "tool"


class ContentType(str, Enum):
    """Content types for messages."""
    TEXT = "text"
    CODE = "code"
    IMAGE = "image"
    FILE = "file"
    ERROR = "error"


class ArtifactType(str, Enum):
    """Artifact types."""
    FILE = "file"
    CODE = "code"
    IMAGE = "image"
    DATA = "data"
    LOG = "log"
    OUTPUT = "output"


class RuntimeStatus(str, Enum):
    """CLI runtime status."""
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    KILLED = "killed"
    PAUSED = "paused"


class LogType(str, Enum):
    """CLI log types."""
    STDOUT = "stdout"
    STDERR = "stderr"
    SYSTEM = "system"


class RoutingStrategy(str, Enum):
    """Orchestrator routing strategies."""
    AUTO = "auto"
    MANUAL = "manual"
    ROUND_ROBIN = "round_robin"
    LEAST_COST = "least_cost"
    FASTEST = "fastest"


class EventType(str, Enum):
    """Analytics event types."""
    MESSAGE_SENT = "message_sent"
    MESSAGE_RECEIVED = "message_received"
    SESSION_CREATED = "session_created"
    SESSION_COMPLETED = "session_completed"
    FILE_UPLOADED = "file_uploaded"
    COMMAND_EXECUTED = "command_executed"
    ERROR_OCCURRED = "error_occurred"


class PreferenceType(str, Enum):
    """User preference value types."""
    STRING = "string"
    NUMBER = "number"
    BOOLEAN = "boolean"
    JSON = "json"


# ============================================================================
# BASE MODELS
# ============================================================================

class TimestampMixin(BaseModel):
    """Mixin for timestamp fields."""
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


# ============================================================================
# USER MODELS
# ============================================================================

class UserBase(BaseModel):
    """Base user model."""
    username: str = Field(..., min_length=3, max_length=50)
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
    is_active: bool = True


class UserCreate(UserBase):
    """Model for creating a user."""
    pass


class UserUpdate(BaseModel):
    """Model for updating a user."""
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
    is_active: Optional[bool] = None


class User(UserBase, TimestampMixin):
    """Complete user model."""
    id: int
    last_login_at: Optional[datetime] = None
    
    model_config = ConfigDict(from_attributes=True)


# ============================================================================
# WORKSPACE MODELS
# ============================================================================

class WorkspaceBase(BaseModel):
    """Base workspace model."""
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    path: str
    is_active: bool = True


class WorkspaceCreate(WorkspaceBase):
    """Model for creating a workspace."""
    user_id: int


class WorkspaceUpdate(BaseModel):
    """Model for updating a workspace."""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    is_active: Optional[bool] = None


class Workspace(WorkspaceBase, TimestampMixin):
    """Complete workspace model."""
    id: int
    user_id: int
    
    model_config = ConfigDict(from_attributes=True)


# ============================================================================
# PROVIDER MODELS
# ============================================================================

class ProviderBase(BaseModel):
    """Base provider model."""
    name: str = Field(..., min_length=1, max_length=50)
    display_name: str
    provider_type: ProviderType
    base_url: Optional[str] = None
    is_enabled: bool = True
    supports_streaming: bool = False
    supports_function_calling: bool = False
    max_tokens: Optional[int] = None
    default_model: Optional[str] = None
    config_schema: Optional[Dict[str, Any]] = None


class ProviderCreate(ProviderBase):
    """Model for creating a provider."""
    pass


class ProviderUpdate(BaseModel):
    """Model for updating a provider."""
    display_name: Optional[str] = None
    base_url: Optional[str] = None
    is_enabled: Optional[bool] = None
    supports_streaming: Optional[bool] = None
    supports_function_calling: Optional[bool] = None
    max_tokens: Optional[int] = None
    default_model: Optional[str] = None
    config_schema: Optional[Dict[str, Any]] = None


class Provider(ProviderBase, TimestampMixin):
    """Complete provider model."""
    id: int
    
    model_config = ConfigDict(from_attributes=True)


# ============================================================================
# PROVIDER CREDENTIALS MODELS
# ============================================================================

class ProviderCredentialBase(BaseModel):
    """Base provider credential model."""
    credential_name: str
    api_key: str = Field(..., min_length=1)
    api_secret: Optional[str] = None
    additional_config: Optional[Dict[str, Any]] = None
    is_active: bool = True
    quota_limit: Optional[int] = None


class ProviderCredentialCreate(ProviderCredentialBase):
    """Model for creating provider credentials."""
    user_id: int
    provider_id: int


class ProviderCredentialUpdate(BaseModel):
    """Model for updating provider credentials."""
    api_key: Optional[str] = Field(None, min_length=1)
    api_secret: Optional[str] = None
    additional_config: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None
    quota_limit: Optional[int] = None


class ProviderCredential(ProviderCredentialBase, TimestampMixin):
    """Complete provider credential model."""
    id: int
    user_id: int
    provider_id: int
    quota_used: int = 0
    quota_reset_at: Optional[datetime] = None
    
    model_config = ConfigDict(from_attributes=True)


# ============================================================================
# SESSION MODELS
# ============================================================================

class SessionBase(BaseModel):
    """Base session model."""
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    status: SessionStatus = SessionStatus.ACTIVE
    session_type: SessionType = SessionType.CHAT
    metadata: Optional[Dict[str, Any]] = None


class SessionCreate(SessionBase):
    """Model for creating a session."""
    user_id: int
    workspace_id: Optional[int] = None


class SessionUpdate(BaseModel):
    """Model for updating a session."""
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    status: Optional[SessionStatus] = None
    metadata: Optional[Dict[str, Any]] = None


class Session(SessionBase, TimestampMixin):
    """Complete session model."""
    id: int
    user_id: int
    workspace_id: Optional[int] = None
    completed_at: Optional[datetime] = None
    
    model_config = ConfigDict(from_attributes=True)


# ============================================================================
# SESSION AGENT MODELS
# ============================================================================

class SessionAgentBase(BaseModel):
    """Base session agent model."""
    agent_name: str
    agent_role: Optional[str] = None
    model_name: Optional[str] = None
    tokens_used: int = 0
    cost_estimate: float = 0.0


class SessionAgentCreate(SessionAgentBase):
    """Model for creating a session agent."""
    session_id: int
    provider_id: Optional[int] = None


class SessionAgent(SessionAgentBase):
    """Complete session agent model."""
    id: int
    session_id: int
    provider_id: Optional[int] = None
    joined_at: datetime = Field(default_factory=utc_now)
    
    model_config = ConfigDict(from_attributes=True)


# ============================================================================
# MESSAGE MODELS
# ============================================================================

class MessageBase(BaseModel):
    """Base message model."""
    role: MessageRole
    content: str
    content_type: ContentType = ContentType.TEXT
    agent_name: Optional[str] = None
    model_name: Optional[str] = None
    tokens_used: int = 0
    metadata: Optional[Dict[str, Any]] = None


class MessageCreate(MessageBase):
    """Model for creating a message."""
    session_id: int
    parent_message_id: Optional[int] = None
    provider_id: Optional[int] = None


class MessageUpdate(BaseModel):
    """Model for updating a message."""
    content: Optional[str] = None
    is_edited: Optional[bool] = None
    is_deleted: Optional[bool] = None


class Message(MessageBase, TimestampMixin):
    """Complete message model."""
    id: int
    session_id: int
    parent_message_id: Optional[int] = None
    provider_id: Optional[int] = None
    is_edited: bool = False
    is_deleted: bool = False
    
    model_config = ConfigDict(from_attributes=True)


# ============================================================================
# SESSION ARTIFACT MODELS
# ============================================================================

class SessionArtifactBase(BaseModel):
    """Base session artifact model."""
    artifact_type: ArtifactType
    name: str
    path: Optional[str] = None
    content: Optional[str] = None
    mime_type: Optional[str] = None
    size_bytes: Optional[int] = None
    metadata: Optional[Dict[str, Any]] = None


class SessionArtifactCreate(SessionArtifactBase):
    """Model for creating a session artifact."""
    session_id: int
    message_id: Optional[int] = None


class SessionArtifact(SessionArtifactBase):
    """Complete session artifact model."""
    id: int
    session_id: int
    message_id: Optional[int] = None
    created_at: datetime = Field(default_factory=utc_now)
    
    model_config = ConfigDict(from_attributes=True)


# ============================================================================
# CLI RUNTIME MODELS
# ============================================================================

class CLIRuntimeBase(BaseModel):
    """Base CLI runtime model."""
    process_id: Optional[int] = None
    command: str
    working_directory: str
    status: RuntimeStatus = RuntimeStatus.RUNNING
    exit_code: Optional[int] = None


class CLIRuntimeCreate(CLIRuntimeBase):
    """Model for creating a CLI runtime."""
    session_id: Optional[int] = None
    provider_id: Optional[int] = None


class CLIRuntimeUpdate(BaseModel):
    """Model for updating a CLI runtime."""
    status: Optional[RuntimeStatus] = None
    exit_code: Optional[int] = None


class CLIRuntime(CLIRuntimeBase):
    """Complete CLI runtime model."""
    id: int
    session_id: Optional[int] = None
    provider_id: Optional[int] = None
    started_at: datetime = Field(default_factory=utc_now)
    completed_at: Optional[datetime] = None
    
    model_config = ConfigDict(from_attributes=True)


# ============================================================================
# CLI LOG MODELS
# ============================================================================

class CLILogBase(BaseModel):
    """Base CLI log model."""
    log_type: LogType
    content: str
    line_number: Optional[int] = None


class CLILogCreate(CLILogBase):
    """Model for creating a CLI log."""
    runtime_id: int


class CLILog(CLILogBase):
    """Complete CLI log model."""
    id: int
    runtime_id: int
    timestamp: datetime = Field(default_factory=utc_now)
    
    model_config = ConfigDict(from_attributes=True)


# ============================================================================
# CONTEXT FILE MODELS
# ============================================================================

class ContextFileBase(BaseModel):
    """Base context file model."""
    filename: str
    original_path: Optional[str] = None
    stored_path: str
    file_type: Optional[str] = None
    mime_type: Optional[str] = None
    size_bytes: int
    content_hash: Optional[str] = None
    is_indexed: bool = False
    embedding_id: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class ContextFileCreate(ContextFileBase):
    """Model for creating a context file."""
    session_id: int
    user_id: int


class ContextFile(ContextFileBase):
    """Complete context file model."""
    id: int
    session_id: int
    user_id: int
    uploaded_at: datetime = Field(default_factory=utc_now)
    
    model_config = ConfigDict(from_attributes=True)


# ============================================================================
# ORCHESTRATOR CONFIG MODELS
# ============================================================================

class OrchestratorConfigBase(BaseModel):
    """Base orchestrator config model."""
    config_name: str
    routing_strategy: RoutingStrategy = RoutingStrategy.AUTO
    max_retries: int = Field(default=3, ge=0, le=10)
    timeout_seconds: int = Field(default=30, ge=1, le=300)
    enable_caching: bool = True
    enable_streaming: bool = True
    config_data: Optional[Dict[str, Any]] = None
    is_active: bool = True


class OrchestratorConfigCreate(OrchestratorConfigBase):
    """Model for creating orchestrator config."""
    user_id: int
    default_provider_id: Optional[int] = None
    fallback_provider_id: Optional[int] = None


class OrchestratorConfigUpdate(BaseModel):
    """Model for updating orchestrator config."""
    routing_strategy: Optional[RoutingStrategy] = None
    default_provider_id: Optional[int] = None
    fallback_provider_id: Optional[int] = None
    max_retries: Optional[int] = Field(None, ge=0, le=10)
    timeout_seconds: Optional[int] = Field(None, ge=1, le=300)
    enable_caching: Optional[bool] = None
    enable_streaming: Optional[bool] = None
    config_data: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None


class OrchestratorConfig(OrchestratorConfigBase, TimestampMixin):
    """Complete orchestrator config model."""
    id: int
    user_id: int
    default_provider_id: Optional[int] = None
    fallback_provider_id: Optional[int] = None
    
    model_config = ConfigDict(from_attributes=True)


# ============================================================================
# ROUTING HISTORY MODELS
# ============================================================================

class RoutingHistoryBase(BaseModel):
    """Base routing history model."""
    routing_reason: Optional[str] = None
    routing_strategy: str
    latency_ms: Optional[int] = None
    tokens_used: Optional[int] = None
    cost_estimate: Optional[float] = None
    was_fallback: bool = False
    error_message: Optional[str] = None


class RoutingHistoryCreate(RoutingHistoryBase):
    """Model for creating routing history."""
    session_id: int
    message_id: Optional[int] = None
    orchestrator_config_id: Optional[int] = None
    selected_provider_id: int


class RoutingHistory(RoutingHistoryBase):
    """Complete routing history model."""
    id: int
    session_id: int
    message_id: Optional[int] = None
    orchestrator_config_id: Optional[int] = None
    selected_provider_id: int
    created_at: datetime = Field(default_factory=utc_now)
    
    model_config = ConfigDict(from_attributes=True)


# ============================================================================
# USER PREFERENCE MODELS
# ============================================================================

class UserPreferenceBase(BaseModel):
    """Base user preference model."""
    preference_key: str
    preference_value: str
    preference_type: PreferenceType = PreferenceType.STRING
    category: Optional[str] = None


class UserPreferenceCreate(UserPreferenceBase):
    """Model for creating a user preference."""
    user_id: int


class UserPreferenceUpdate(BaseModel):
    """Model for updating a user preference."""
    preference_value: str
    preference_type: Optional[PreferenceType] = None


class UserPreference(UserPreferenceBase, TimestampMixin):
    """Complete user preference model."""
    id: int
    user_id: int
    
    model_config = ConfigDict(from_attributes=True)


# ============================================================================
# USAGE ANALYTICS MODELS
# ============================================================================

class UsageAnalyticsBase(BaseModel):
    """Base usage analytics model."""
    event_type: EventType
    event_category: Optional[str] = None
    tokens_used: int = 0
    cost_estimate: float = 0.0
    latency_ms: Optional[int] = None
    metadata: Optional[Dict[str, Any]] = None


class UsageAnalyticsCreate(UsageAnalyticsBase):
    """Model for creating usage analytics."""
    user_id: int
    session_id: Optional[int] = None
    provider_id: Optional[int] = None


class UsageAnalytics(UsageAnalyticsBase):
    """Complete usage analytics model."""
    id: int
    user_id: int
    session_id: Optional[int] = None
    provider_id: Optional[int] = None
    created_at: datetime = Field(default_factory=utc_now)
    
    model_config = ConfigDict(from_attributes=True)


# ============================================================================
# API REQUEST/RESPONSE MODELS
# ============================================================================

class ChatRequest(BaseModel):
    """Request model for chat endpoint."""
    session_id: Optional[int] = None
    message: str = Field(..., min_length=1)
    provider_id: Optional[int] = None
    model_name: Optional[str] = None
    stream: bool = True
    context_files: Optional[List[int]] = None
    metadata: Optional[Dict[str, Any]] = None


class ChatResponse(BaseModel):
    """Response model for chat endpoint."""
    session_id: int
    message_id: int
    content: str
    role: MessageRole
    agent_name: Optional[str] = None
    tokens_used: int = 0
    metadata: Optional[Dict[str, Any]] = None


class SessionListResponse(BaseModel):
    """Response model for session list."""
    sessions: List[Session]
    total: int
    page: int
    page_size: int


class MessageListResponse(BaseModel):
    """Response model for message list."""
    messages: List[Message]
    total: int
    session_id: int


class ProviderListResponse(BaseModel):
    """Response model for provider list."""
    providers: List[Provider]
    total: int


class AnalyticsResponse(BaseModel):
    """Response model for analytics."""
    total_sessions: int
    total_messages: int
    total_tokens: int
    total_cost: float
    providers_used: Dict[str, int]
    time_period: str


class HealthCheckResponse(BaseModel):
    """Response model for health check."""
    status: Literal["healthy", "unhealthy"]
    database: Literal["connected", "disconnected"]
    version: str
    timestamp: datetime = Field(default_factory=utc_now)


class ErrorResponse(BaseModel):
    """Response model for errors."""
    error: str
    detail: Optional[str] = None
    code: Optional[str] = None
    timestamp: datetime = Field(default_factory=utc_now)

# Made with Bob
