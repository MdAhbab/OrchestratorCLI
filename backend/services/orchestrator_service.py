"""
Orchestrator service for IBM Bob Backend System.
Handles task dispatch, routing, provider selection, and failover logic.
"""

import logging
import sqlite3
import re
from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime
from contextlib import contextmanager
from dataclasses import dataclass

from backend.database.models import (
    RoutingStrategy,
    ProviderType,
)
from backend.config import settings
from .provider_service import get_provider_service, QuotaStatus
from .analytics_service import get_analytics_service

logger = logging.getLogger(__name__)


@dataclass
class Subtask:
    """Represents a decomposed subtask."""
    task_id: str
    description: str
    task_type: str
    priority: int
    dependencies: List[str]
    estimated_tokens: int


@dataclass
class DispatchResult:
    """Result of task dispatch."""
    session_id: int
    selected_provider_id: int
    provider_name: str
    routing_strategy: str
    routing_reason: str
    confidence_score: int
    subtasks: List[Subtask]
    fallback_provider_id: Optional[int] = None


class OrchestratorService:
    """
    Service for orchestrating AI provider selection and task routing.
    Implements intelligent routing strategies and failover logic.
    """
    
    def __init__(self, db_path: Optional[str] = None):
        """
        Initialize the orchestrator service.
        
        Args:
            db_path: Path to the SQLite database. Uses config default if None.
        """
        self.db_path = db_path or str(settings.database_path)
        self.provider_service = get_provider_service(db_path)
        self.analytics_service = get_analytics_service(db_path)
        
        # Task type patterns for classification
        self.task_patterns = {
            'code_generation': [
                r'\b(write|create|generate|implement|code|function|class|script)\b',
                r'\b(python|javascript|typescript|java|c\+\+|rust|go)\b'
            ],
            'code_review': [
                r'\b(review|analyze|check|inspect|audit|refactor)\b.*\b(code|function|class)\b'
            ],
            'documentation': [
                r'\b(document|explain|describe|comment|readme)\b'
            ],
            'debugging': [
                r'\b(debug|fix|error|bug|issue|problem)\b'
            ],
            'data_analysis': [
                r'\b(analyze|process|transform|parse|extract)\b.*\b(data|csv|json|xml)\b'
            ],
            'conversation': [
                r'\b(what|how|why|when|where|who|explain|tell me)\b'
            ]
        }
        
        logger.info("OrchestratorService initialized")
    
    @contextmanager
    def _get_connection(self):
        """Get a database connection with proper error handling."""
        conn = None
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            yield conn
            conn.commit()
        except Exception as e:
            if conn:
                conn.rollback()
            logger.error(f"Database error in OrchestratorService: {e}")
            raise
        finally:
            if conn:
                conn.close()
    
    def _classify_task(self, prompt: str) -> str:
        """
        Classify task type based on prompt content.
        
        Args:
            prompt: User prompt
            
        Returns:
            Task type string
        """
        prompt_lower = prompt.lower()
        
        for task_type, patterns in self.task_patterns.items():
            for pattern in patterns:
                if re.search(pattern, prompt_lower):
                    return task_type
        
        return 'conversation'
    
    def _estimate_tokens(self, prompt: str) -> int:
        """
        Estimate token count for a prompt.
        Simple estimation: ~4 characters per token.
        
        Args:
            prompt: User prompt
            
        Returns:
            Estimated token count
        """
        return len(prompt) // 4 + 100  # Add buffer for response
    
    async def decompose_task(self, prompt: str) -> List[Subtask]:
        """
        Decompose a complex task into subtasks.
        
        Args:
            prompt: User prompt
            
        Returns:
            List of Subtask objects
        """
        try:
            task_type = self._classify_task(prompt)
            estimated_tokens = self._estimate_tokens(prompt)
            
            # For simple tasks, return single subtask
            if estimated_tokens < 1000 and task_type == 'conversation':
                return [Subtask(
                    task_id="task_1",
                    description=prompt,
                    task_type=task_type,
                    priority=1,
                    dependencies=[],
                    estimated_tokens=estimated_tokens
                )]
            
            # For complex tasks, decompose based on type
            subtasks = []
            
            if task_type == 'code_generation':
                # Decompose into planning, implementation, testing
                subtasks = [
                    Subtask(
                        task_id="task_1",
                        description="Plan code structure and approach",
                        task_type="planning",
                        priority=1,
                        dependencies=[],
                        estimated_tokens=estimated_tokens // 3
                    ),
                    Subtask(
                        task_id="task_2",
                        description="Implement code",
                        task_type="code_generation",
                        priority=2,
                        dependencies=["task_1"],
                        estimated_tokens=estimated_tokens // 2
                    ),
                    Subtask(
                        task_id="task_3",
                        description="Add tests and documentation",
                        task_type="documentation",
                        priority=3,
                        dependencies=["task_2"],
                        estimated_tokens=estimated_tokens // 4
                    )
                ]
            elif task_type == 'debugging':
                # Decompose into analysis, fix, verification
                subtasks = [
                    Subtask(
                        task_id="task_1",
                        description="Analyze error and identify root cause",
                        task_type="code_review",
                        priority=1,
                        dependencies=[],
                        estimated_tokens=estimated_tokens // 2
                    ),
                    Subtask(
                        task_id="task_2",
                        description="Implement fix",
                        task_type="code_generation",
                        priority=2,
                        dependencies=["task_1"],
                        estimated_tokens=estimated_tokens // 2
                    )
                ]
            else:
                # Default: single task
                subtasks = [Subtask(
                    task_id="task_1",
                    description=prompt,
                    task_type=task_type,
                    priority=1,
                    dependencies=[],
                    estimated_tokens=estimated_tokens
                )]
            
            logger.debug(f"Decomposed task into {len(subtasks)} subtasks")
            return subtasks
            
        except Exception as e:
            logger.error(f"Failed to decompose task: {e}")
            raise
    
    async def calculate_confidence(
        self,
        task_type: str,
        provider_id: int,
        provider_info: Dict[str, Any]
    ) -> int:
        """
        Calculate confidence score for provider matching (0-100).
        
        Args:
            task_type: Type of task
            provider_id: Provider ID
            provider_info: Provider information dictionary
            
        Returns:
            Confidence score (0-100)
        """
        try:
            confidence = 50  # Base confidence
            
            # Adjust based on provider type
            provider_type = provider_info.get('provider_type', '')
            
            if provider_type == 'llm':
                confidence += 20
            
            # Adjust based on provider capabilities
            if provider_info.get('supports_function_calling'):
                if task_type in ['code_generation', 'debugging', 'data_analysis']:
                    confidence += 15
            
            if provider_info.get('supports_streaming'):
                confidence += 5
            
            # Adjust based on quota availability
            quota_remaining = provider_info.get('quota_remaining')
            if quota_remaining is not None:
                if quota_remaining > 1000:
                    confidence += 10
                elif quota_remaining > 100:
                    confidence += 5
                elif quota_remaining < 10:
                    confidence -= 20
            
            # Get historical performance
            try:
                analytics = await self.analytics_service.get_provider_analytics(provider_id)
                
                # Adjust based on success rate
                if analytics.success_rate > 95:
                    confidence += 10
                elif analytics.success_rate > 90:
                    confidence += 5
                elif analytics.success_rate < 80:
                    confidence -= 10
                
                # Adjust based on latency
                if analytics.avg_latency_ms and analytics.avg_latency_ms < 1000:
                    confidence += 5
                elif analytics.avg_latency_ms and analytics.avg_latency_ms > 5000:
                    confidence -= 5
                    
            except Exception as e:
                logger.debug(f"Could not get analytics for provider {provider_id}: {e}")
            
            # Ensure confidence is in valid range
            confidence = max(0, min(100, confidence))
            
            return confidence
            
        except Exception as e:
            logger.error(f"Failed to calculate confidence: {e}")
            return 50  # Return neutral confidence on error
    
    async def select_provider(
        self,
        task_type: str,
        available_providers: List[Dict[str, Any]],
        routing_strategy: RoutingStrategy = RoutingStrategy.AUTO
    ) -> Tuple[Dict[str, Any], str]:
        """
        Select the best provider for a task.
        
        Args:
            task_type: Type of task
            available_providers: List of available provider dictionaries
            routing_strategy: Routing strategy to use
            
        Returns:
            Tuple of (selected provider dict, routing reason)
        """
        try:
            if not available_providers:
                raise ValueError("No available providers")
            
            # AUTO strategy: intelligent selection based on confidence
            if routing_strategy == RoutingStrategy.AUTO:
                # Calculate confidence for each provider
                provider_scores = []
                for provider in available_providers:
                    confidence = await self.calculate_confidence(
                        task_type,
                        provider['provider_id'],
                        provider
                    )
                    provider_scores.append((provider, confidence))
                
                # Sort by confidence (descending)
                provider_scores.sort(key=lambda x: x[1], reverse=True)
                
                selected = provider_scores[0][0]
                confidence = provider_scores[0][1]
                reason = f"Auto-selected based on confidence score: {confidence}"
                
                logger.info(f"Selected provider {selected['display_name']} with confidence {confidence}")
                return selected, reason
            
            # ROUND_ROBIN strategy: rotate through providers
            elif routing_strategy == RoutingStrategy.ROUND_ROBIN:
                # Get last used provider from database
                with self._get_connection() as conn:
                    cursor = conn.cursor()
                    cursor.execute("""
                        SELECT selected_provider_id
                        FROM routing_history
                        ORDER BY created_at DESC
                        LIMIT 1
                    """)
                    row = cursor.fetchone()
                    last_provider_id = row['selected_provider_id'] if row else None
                
                # Find next provider
                if last_provider_id:
                    # Find index of last provider
                    last_index = -1
                    for i, p in enumerate(available_providers):
                        if p['provider_id'] == last_provider_id:
                            last_index = i
                            break
                    
                    # Select next provider (wrap around)
                    next_index = (last_index + 1) % len(available_providers)
                    selected = available_providers[next_index]
                else:
                    selected = available_providers[0]
                
                reason = "Round-robin rotation"
                return selected, reason
            
            # LEAST_COST strategy: select cheapest provider
            elif routing_strategy == RoutingStrategy.LEAST_COST:
                # Sort by cost (we'd need cost per token data)
                # For now, use a simple heuristic based on provider name
                cost_priority = {
                    'ollama': 1,  # Local, free
                    'google': 2,  # Generally cheaper
                    'openai': 3,
                    'anthropic': 4
                }
                
                def get_cost_priority(provider):
                    name = provider['name'].lower()
                    for key, priority in cost_priority.items():
                        if key in name:
                            return priority
                    return 5
                
                selected = min(available_providers, key=get_cost_priority)
                reason = "Selected for lowest cost"
                return selected, reason
            
            # FASTEST strategy: select fastest provider
            elif routing_strategy == RoutingStrategy.FASTEST:
                # Get average latency for each provider
                provider_latencies = []
                for provider in available_providers:
                    try:
                        analytics = await self.analytics_service.get_provider_analytics(
                            provider['provider_id']
                        )
                        latency = analytics.avg_latency_ms or 9999
                    except:
                        latency = 9999
                    
                    provider_latencies.append((provider, latency))
                
                # Sort by latency (ascending)
                provider_latencies.sort(key=lambda x: x[1])
                
                selected = provider_latencies[0][0]
                reason = f"Selected for fastest response (avg: {provider_latencies[0][1]}ms)"
                return selected, reason
            
            # MANUAL strategy: use first available (should be pre-selected)
            else:
                selected = available_providers[0]
                reason = "Manual selection"
                return selected, reason
                
        except Exception as e:
            logger.error(f"Failed to select provider: {e}")
            raise
    
    async def handle_failover(
        self,
        task_type: str,
        failed_provider_id: int,
        available_providers: List[Dict[str, Any]]
    ) -> Optional[Dict[str, Any]]:
        """
        Handle failover when a provider fails.
        
        Args:
            task_type: Type of task
            failed_provider_id: ID of provider that failed
            available_providers: List of available providers
            
        Returns:
            Fallback provider dict or None if no fallback available
        """
        try:
            # Filter out the failed provider
            fallback_providers = [
                p for p in available_providers
                if p['provider_id'] != failed_provider_id
            ]
            
            if not fallback_providers:
                logger.warning("No fallback providers available")
                return None
            
            # Select fallback using AUTO strategy
            fallback, reason = await self.select_provider(
                task_type,
                fallback_providers,
                RoutingStrategy.AUTO
            )
            
            logger.info(f"Failover to provider {fallback['display_name']}: {reason}")
            return fallback
            
        except Exception as e:
            logger.error(f"Failed to handle failover: {e}")
            return None
    
    async def dispatch_task(
        self,
        prompt: str,
        session_id: int,
        user_id: int,
        routing_strategy: Optional[RoutingStrategy] = None,
        preferred_provider_id: Optional[int] = None
    ) -> DispatchResult:
        """
        Dispatch a task to the appropriate provider.
        
        Args:
            prompt: User prompt
            session_id: Session ID
            user_id: User ID
            routing_strategy: Optional routing strategy override
            preferred_provider_id: Optional preferred provider ID
            
        Returns:
            DispatchResult object
        """
        try:
            # Get user's orchestrator config
            strategy = routing_strategy or RoutingStrategy.AUTO
            
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT * FROM orchestrator_config
                    WHERE user_id = ? AND is_active = 1
                    ORDER BY created_at DESC
                    LIMIT 1
                """, (user_id,))
                
                config_row = cursor.fetchone()
                if config_row:
                    strategy = RoutingStrategy(config_row['routing_strategy'])
            
            # Decompose task
            subtasks = await self.decompose_task(prompt)
            task_type = subtasks[0].task_type if subtasks else 'conversation'
            
            # Get available providers
            available_providers = await self.provider_service.get_available_providers(
                user_id,
                ProviderType.LLM
            )
            
            if not available_providers:
                raise ValueError("No available providers for user")
            
            # If preferred provider specified and available, use it
            if preferred_provider_id:
                preferred = next(
                    (p for p in available_providers if p['provider_id'] == preferred_provider_id),
                    None
                )
                if preferred:
                    selected_provider = preferred
                    routing_reason = "User-specified provider"
                else:
                    # Fallback to strategy if preferred not available
                    selected_provider, routing_reason = await self.select_provider(
                        task_type,
                        available_providers,
                        strategy
                    )
            else:
                # Select provider based on strategy
                selected_provider, routing_reason = await self.select_provider(
                    task_type,
                    available_providers,
                    strategy
                )
            
            # Calculate confidence
            confidence_score = await self.calculate_confidence(
                task_type,
                selected_provider['provider_id'],
                selected_provider
            )
            
            # Identify fallback provider
            fallback_provider_id = None
            if len(available_providers) > 1:
                fallback_candidates = [
                    p for p in available_providers
                    if p['provider_id'] != selected_provider['provider_id']
                ]
                if fallback_candidates:
                    fallback, _ = await self.select_provider(
                        task_type,
                        fallback_candidates,
                        RoutingStrategy.AUTO
                    )
                    fallback_provider_id = fallback['provider_id']
            
            # Track routing decision
            await self.analytics_service.track_routing(
                session_id=session_id,
                selected_provider_id=selected_provider['provider_id'],
                routing_strategy=strategy.value,
                routing_reason=routing_reason
            )
            
            result = DispatchResult(
                session_id=session_id,
                selected_provider_id=selected_provider['provider_id'],
                provider_name=selected_provider['display_name'],
                routing_strategy=strategy.value,
                routing_reason=routing_reason,
                confidence_score=confidence_score,
                subtasks=subtasks,
                fallback_provider_id=fallback_provider_id
            )
            
            logger.info(
                f"Dispatched task to {result.provider_name} "
                f"(confidence: {confidence_score}, strategy: {strategy.value})"
            )
            
            return result
            
        except Exception as e:
            logger.error(f"Failed to dispatch task: {e}")
            raise


# Global singleton instance
_orchestrator_service: Optional[OrchestratorService] = None


def get_orchestrator_service(db_path: Optional[str] = None) -> OrchestratorService:
    """
    Get the global orchestrator service instance.
    
    Args:
        db_path: Optional database path. Only used on first call.
        
    Returns:
        OrchestratorService instance
    """
    global _orchestrator_service
    if _orchestrator_service is None:
        _orchestrator_service = OrchestratorService(db_path)
    return _orchestrator_service


# Made with Bob