"""
Database package for IBM Bob Backend System.
Provides database initialization, models, and utilities.
"""

from .init_db import DatabaseInitializer, init_database
from .models import (
    # Enums
    ProviderType,
    SessionStatus,
    SessionType,
    MessageRole,
    ContentType,
    ArtifactType,
    RuntimeStatus,
    LogType,
    RoutingStrategy,
    EventType,
    PreferenceType,
    
    # User models
    User,
    UserCreate,
    UserUpdate,
    
    # Workspace models
    Workspace,
    WorkspaceCreate,
    WorkspaceUpdate,
    
    # Provider models
    Provider,
    ProviderCreate,
    ProviderUpdate,
    ProviderCredential,
    ProviderCredentialCreate,
    ProviderCredentialUpdate,
    
    # Session models
    Session,
    SessionCreate,
    SessionUpdate,
    SessionAgent,
    SessionAgentCreate,
    
    # Message models
    Message,
    MessageCreate,
    MessageUpdate,
    
    # Artifact models
    SessionArtifact,
    SessionArtifactCreate,
    
    # CLI models
    CLIRuntime,
    CLIRuntimeCreate,
    CLIRuntimeUpdate,
    CLILog,
    CLILogCreate,
    
    # Context file models
    ContextFile,
    ContextFileCreate,
    
    # Orchestrator models
    OrchestratorConfig,
    OrchestratorConfigCreate,
    OrchestratorConfigUpdate,
    RoutingHistory,
    RoutingHistoryCreate,
    
    # Preference models
    UserPreference,
    UserPreferenceCreate,
    UserPreferenceUpdate,
    
    # Analytics models
    UsageAnalytics,
    UsageAnalyticsCreate,
    
    # API models
    ChatRequest,
    ChatResponse,
    SessionListResponse,
    MessageListResponse,
    ProviderListResponse,
    AnalyticsResponse,
    HealthCheckResponse,
    ErrorResponse,
)

__all__ = [
    # Initialization
    "DatabaseInitializer",
    "init_database",
    
    # Enums
    "ProviderType",
    "SessionStatus",
    "SessionType",
    "MessageRole",
    "ContentType",
    "ArtifactType",
    "RuntimeStatus",
    "LogType",
    "RoutingStrategy",
    "EventType",
    "PreferenceType",
    
    # User models
    "User",
    "UserCreate",
    "UserUpdate",
    
    # Workspace models
    "Workspace",
    "WorkspaceCreate",
    "WorkspaceUpdate",
    
    # Provider models
    "Provider",
    "ProviderCreate",
    "ProviderUpdate",
    "ProviderCredential",
    "ProviderCredentialCreate",
    "ProviderCredentialUpdate",
    
    # Session models
    "Session",
    "SessionCreate",
    "SessionUpdate",
    "SessionAgent",
    "SessionAgentCreate",
    
    # Message models
    "Message",
    "MessageCreate",
    "MessageUpdate",
    
    # Artifact models
    "SessionArtifact",
    "SessionArtifactCreate",
    
    # CLI models
    "CLIRuntime",
    "CLIRuntimeCreate",
    "CLIRuntimeUpdate",
    "CLILog",
    "CLILogCreate",
    
    # Context file models
    "ContextFile",
    "ContextFileCreate",
    
    # Orchestrator models
    "OrchestratorConfig",
    "OrchestratorConfigCreate",
    "OrchestratorConfigUpdate",
    "RoutingHistory",
    "RoutingHistoryCreate",
    
    # Preference models
    "UserPreference",
    "UserPreferenceCreate",
    "UserPreferenceUpdate",
    
    # Analytics models
    "UsageAnalytics",
    "UsageAnalyticsCreate",
    
    # API models
    "ChatRequest",
    "ChatResponse",
    "SessionListResponse",
    "MessageListResponse",
    "ProviderListResponse",
    "AnalyticsResponse",
    "HealthCheckResponse",
    "ErrorResponse",
]

__version__ = "1.0.0"

# Made with Bob
