"""
Analytics service for IBM Bob Backend System.
Handles usage tracking, metrics calculation, and reporting.
"""

import logging
import sqlite3
from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime, timedelta
from contextlib import contextmanager

from backend.database.models import (
    UsageAnalytics,
    UsageAnalyticsCreate,
    EventType,
    RoutingHistory,
    RoutingHistoryCreate,
)
from backend.config import settings

logger = logging.getLogger(__name__)


class UsageStats:
    """Usage statistics container."""
    
    def __init__(
        self,
        total_sessions: int,
        total_messages: int,
        total_tokens: int,
        total_cost: float,
        providers_used: Dict[str, int],
        time_period: str
    ):
        self.total_sessions = total_sessions
        self.total_messages = total_messages
        self.total_tokens = total_tokens
        self.total_cost = total_cost
        self.providers_used = providers_used
        self.time_period = time_period


class ProviderAnalytics:
    """Provider performance analytics."""
    
    def __init__(
        self,
        provider_id: int,
        provider_name: str,
        total_requests: int,
        total_tokens: int,
        total_cost: float,
        avg_latency_ms: Optional[float],
        success_rate: float,
        error_count: int
    ):
        self.provider_id = provider_id
        self.provider_name = provider_name
        self.total_requests = total_requests
        self.total_tokens = total_tokens
        self.total_cost = total_cost
        self.avg_latency_ms = avg_latency_ms
        self.success_rate = success_rate
        self.error_count = error_count


class SpendPoint:
    """Cost tracking data point."""
    
    def __init__(self, date: str, cost: float, tokens: int):
        self.date = date
        self.cost = cost
        self.tokens = tokens


class AnalyticsService:
    """
    Service for usage tracking and analytics.
    Handles metrics calculation, reporting, and performance analytics.
    """
    
    def __init__(self, db_path: Optional[str] = None):
        """
        Initialize the analytics service.
        
        Args:
            db_path: Path to the SQLite database. Uses config default if None.
        """
        self.db_path = db_path or str(settings.database_path)
        logger.info("AnalyticsService initialized")
    
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
            logger.error(f"Database error in AnalyticsService: {e}")
            raise
        finally:
            if conn:
                conn.close()
    
    async def track_usage(
        self,
        user_id: int,
        event_type: EventType,
        session_id: Optional[int] = None,
        provider_id: Optional[int] = None,
        tokens_used: int = 0,
        cost_estimate: float = 0.0,
        latency_ms: Optional[int] = None,
        event_category: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> None:
        """
        Track a usage event.
        
        Args:
            user_id: User ID
            event_type: Type of event
            session_id: Optional session ID
            provider_id: Optional provider ID
            tokens_used: Number of tokens used
            cost_estimate: Estimated cost
            latency_ms: Optional latency in milliseconds
            event_category: Optional event category
            metadata: Optional metadata
        """
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                
                now = datetime.utcnow().isoformat()
                
                cursor.execute("""
                    INSERT INTO usage_analytics (
                        user_id, session_id, provider_id, event_type, event_category,
                        tokens_used, cost_estimate, latency_ms, metadata, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    user_id,
                    session_id,
                    provider_id,
                    event_type.value,
                    event_category,
                    tokens_used,
                    cost_estimate,
                    latency_ms,
                    str(metadata) if metadata else None,
                    now
                ))
                
                logger.debug(f"Tracked {event_type.value} event for user {user_id}")
                
        except Exception as e:
            logger.error(f"Failed to track usage: {e}")
            raise
    
    async def get_usage_stats(
        self,
        user_id: int,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> UsageStats:
        """
        Get usage statistics for a user.
        
        Args:
            user_id: User ID
            start_date: Optional start date filter
            end_date: Optional end date filter
            
        Returns:
            UsageStats object
        """
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                
                # Build date filter
                date_filter = ""
                params: List[Any] = [user_id]
                
                if start_date:
                    date_filter += " AND ua.created_at >= ?"
                    params.append(start_date.isoformat())
                
                if end_date:
                    date_filter += " AND ua.created_at <= ?"
                    params.append(end_date.isoformat())
                
                # Get session count
                cursor.execute(f"""
                    SELECT COUNT(DISTINCT session_id) as count
                    FROM usage_analytics ua
                    WHERE user_id = ? {date_filter}
                    AND session_id IS NOT NULL
                """, params)
                total_sessions = cursor.fetchone()['count']
                
                # Get message count
                cursor.execute(f"""
                    SELECT COUNT(*) as count
                    FROM usage_analytics ua
                    WHERE user_id = ? {date_filter}
                    AND event_type IN (?, ?)
                """, params + [EventType.MESSAGE_SENT.value, EventType.MESSAGE_RECEIVED.value])
                total_messages = cursor.fetchone()['count']
                
                # Get token and cost totals
                cursor.execute(f"""
                    SELECT 
                        SUM(tokens_used) as total_tokens,
                        SUM(cost_estimate) as total_cost
                    FROM usage_analytics ua
                    WHERE user_id = ? {date_filter}
                """, params)
                row = cursor.fetchone()
                total_tokens = row['total_tokens'] or 0
                total_cost = row['total_cost'] or 0.0
                
                # Get provider usage
                cursor.execute(f"""
                    SELECT 
                        p.display_name,
                        COUNT(*) as count
                    FROM usage_analytics ua
                    JOIN providers p ON ua.provider_id = p.id
                    WHERE ua.user_id = ? {date_filter}
                    AND ua.provider_id IS NOT NULL
                    GROUP BY p.display_name
                    ORDER BY count DESC
                """, params)
                
                providers_used = {}
                for row in cursor.fetchall():
                    providers_used[row['display_name']] = row['count']
                
                # Determine time period
                time_period = "all_time"
                if start_date and end_date:
                    days = (end_date - start_date).days
                    time_period = f"{days}_days"
                elif start_date:
                    time_period = f"since_{start_date.strftime('%Y-%m-%d')}"
                
                return UsageStats(
                    total_sessions=total_sessions,
                    total_messages=total_messages,
                    total_tokens=total_tokens,
                    total_cost=total_cost,
                    providers_used=providers_used,
                    time_period=time_period
                )
                
        except Exception as e:
            logger.error(f"Failed to get usage stats: {e}")
            raise
    
    async def get_routing_history(
        self,
        session_id: int,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """
        Get routing history for a session.
        
        Args:
            session_id: Session ID
            limit: Maximum number of records
            
        Returns:
            List of routing history records
        """
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                
                cursor.execute("""
                    SELECT 
                        rh.*,
                        p.display_name as provider_name,
                        p.provider_type
                    FROM routing_history rh
                    JOIN providers p ON rh.selected_provider_id = p.id
                    WHERE rh.session_id = ?
                    ORDER BY rh.created_at DESC
                    LIMIT ?
                """, (session_id, limit))
                
                history = []
                for row in cursor.fetchall():
                    history.append({
                        'id': row['id'],
                        'session_id': row['session_id'],
                        'message_id': row['message_id'],
                        'provider_id': row['selected_provider_id'],
                        'provider_name': row['provider_name'],
                        'provider_type': row['provider_type'],
                        'routing_strategy': row['routing_strategy'],
                        'routing_reason': row['routing_reason'],
                        'latency_ms': row['latency_ms'],
                        'tokens_used': row['tokens_used'],
                        'cost_estimate': row['cost_estimate'],
                        'was_fallback': bool(row['was_fallback']),
                        'error_message': row['error_message'],
                        'created_at': row['created_at']
                    })
                
                logger.debug(f"Retrieved {len(history)} routing records for session {session_id}")
                return history
                
        except Exception as e:
            logger.error(f"Failed to get routing history: {e}")
            raise
    
    async def track_routing(
        self,
        session_id: int,
        selected_provider_id: int,
        routing_strategy: str,
        routing_reason: Optional[str] = None,
        message_id: Optional[int] = None,
        orchestrator_config_id: Optional[int] = None,
        latency_ms: Optional[int] = None,
        tokens_used: Optional[int] = None,
        cost_estimate: Optional[float] = None,
        was_fallback: bool = False,
        error_message: Optional[str] = None
    ) -> None:
        """
        Track a routing decision.
        
        Args:
            session_id: Session ID
            selected_provider_id: Selected provider ID
            routing_strategy: Strategy used for routing
            routing_reason: Optional reason for selection
            message_id: Optional message ID
            orchestrator_config_id: Optional orchestrator config ID
            latency_ms: Optional latency
            tokens_used: Optional tokens used
            cost_estimate: Optional cost estimate
            was_fallback: Whether this was a fallback selection
            error_message: Optional error message
        """
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                
                now = datetime.utcnow().isoformat()
                
                cursor.execute("""
                    INSERT INTO routing_history (
                        session_id, message_id, orchestrator_config_id, selected_provider_id,
                        routing_strategy, routing_reason, latency_ms, tokens_used,
                        cost_estimate, was_fallback, error_message, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    session_id,
                    message_id,
                    orchestrator_config_id,
                    selected_provider_id,
                    routing_strategy,
                    routing_reason,
                    latency_ms,
                    tokens_used,
                    cost_estimate,
                    1 if was_fallback else 0,
                    error_message,
                    now
                ))
                
                logger.debug(f"Tracked routing for session {session_id}: {routing_strategy}")
                
        except Exception as e:
            logger.error(f"Failed to track routing: {e}")
            raise
    
    async def get_provider_analytics(
        self,
        provider_id: int,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> ProviderAnalytics:
        """
        Get performance analytics for a provider.
        
        Args:
            provider_id: Provider ID
            start_date: Optional start date filter
            end_date: Optional end date filter
            
        Returns:
            ProviderAnalytics object
        """
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                
                # Get provider name
                cursor.execute("SELECT display_name FROM providers WHERE id = ?", (provider_id,))
                row = cursor.fetchone()
                if not row:
                    raise ValueError(f"Provider {provider_id} not found")
                provider_name = row['display_name']
                
                # Build date filter
                date_filter = ""
                params: List[Any] = [provider_id]
                
                if start_date:
                    date_filter += " AND created_at >= ?"
                    params.append(start_date.isoformat())
                
                if end_date:
                    date_filter += " AND created_at <= ?"
                    params.append(end_date.isoformat())
                
                # Get routing statistics
                cursor.execute(f"""
                    SELECT 
                        COUNT(*) as total_requests,
                        SUM(tokens_used) as total_tokens,
                        SUM(cost_estimate) as total_cost,
                        AVG(latency_ms) as avg_latency,
                        SUM(CASE WHEN error_message IS NULL THEN 1 ELSE 0 END) as success_count,
                        SUM(CASE WHEN error_message IS NOT NULL THEN 1 ELSE 0 END) as error_count
                    FROM routing_history
                    WHERE selected_provider_id = ? {date_filter}
                """, params)
                
                row = cursor.fetchone()
                total_requests = row['total_requests'] or 0
                total_tokens = row['total_tokens'] or 0
                total_cost = row['total_cost'] or 0.0
                avg_latency = row['avg_latency']
                success_count = row['success_count'] or 0
                error_count = row['error_count'] or 0
                
                # Calculate success rate
                success_rate = 0.0
                if total_requests > 0:
                    success_rate = (success_count / total_requests) * 100
                
                return ProviderAnalytics(
                    provider_id=provider_id,
                    provider_name=provider_name,
                    total_requests=total_requests,
                    total_tokens=total_tokens,
                    total_cost=total_cost,
                    avg_latency_ms=avg_latency,
                    success_rate=success_rate,
                    error_count=error_count
                )
                
        except Exception as e:
            logger.error(f"Failed to get provider analytics: {e}")
            raise
    
    async def calculate_spend_history(
        self,
        user_id: int,
        days: int = 30
    ) -> List[SpendPoint]:
        """
        Calculate daily spend history for a user.
        
        Args:
            user_id: User ID
            days: Number of days to include
            
        Returns:
            List of SpendPoint objects
        """
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                
                start_date = datetime.utcnow() - timedelta(days=days)
                
                cursor.execute("""
                    SELECT 
                        DATE(created_at) as date,
                        SUM(cost_estimate) as daily_cost,
                        SUM(tokens_used) as daily_tokens
                    FROM usage_analytics
                    WHERE user_id = ?
                    AND created_at >= ?
                    GROUP BY DATE(created_at)
                    ORDER BY date ASC
                """, (user_id, start_date.isoformat()))
                
                spend_history = []
                for row in cursor.fetchall():
                    spend_history.append(SpendPoint(
                        date=row['date'],
                        cost=row['daily_cost'] or 0.0,
                        tokens=row['daily_tokens'] or 0
                    ))
                
                logger.debug(f"Calculated {len(spend_history)} days of spend history for user {user_id}")
                return spend_history
                
        except Exception as e:
            logger.error(f"Failed to calculate spend history: {e}")
            raise
    
    async def get_top_providers(
        self,
        user_id: int,
        limit: int = 5,
        days: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """
        Get top providers by usage for a user.
        
        Args:
            user_id: User ID
            limit: Maximum number of providers to return
            days: Optional number of days to look back
            
        Returns:
            List of provider usage dictionaries
        """
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                
                date_filter = ""
                params: List[Any] = [user_id]
                
                if days:
                    start_date = datetime.utcnow() - timedelta(days=days)
                    date_filter = " AND ua.created_at >= ?"
                    params.append(start_date.isoformat())
                
                cursor.execute(f"""
                    SELECT 
                        p.id,
                        p.display_name,
                        p.provider_type,
                        COUNT(*) as request_count,
                        SUM(ua.tokens_used) as total_tokens,
                        SUM(ua.cost_estimate) as total_cost
                    FROM usage_analytics ua
                    JOIN providers p ON ua.provider_id = p.id
                    WHERE ua.user_id = ? {date_filter}
                    AND ua.provider_id IS NOT NULL
                    GROUP BY p.id, p.display_name, p.provider_type
                    ORDER BY request_count DESC
                    LIMIT ?
                """, params + [limit])
                
                top_providers = []
                for row in cursor.fetchall():
                    top_providers.append({
                        'provider_id': row['id'],
                        'provider_name': row['display_name'],
                        'provider_type': row['provider_type'],
                        'request_count': row['request_count'],
                        'total_tokens': row['total_tokens'] or 0,
                        'total_cost': row['total_cost'] or 0.0
                    })
                
                logger.debug(f"Retrieved top {len(top_providers)} providers for user {user_id}")
                return top_providers
                
        except Exception as e:
            logger.error(f"Failed to get top providers: {e}")
            raise
    
    async def get_session_analytics(self, session_id: int) -> Dict[str, Any]:
        """
        Get comprehensive analytics for a session.
        
        Args:
            session_id: Session ID
            
        Returns:
            Dictionary with session analytics
        """
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                
                # Get usage analytics
                cursor.execute("""
                    SELECT 
                        COUNT(*) as event_count,
                        SUM(tokens_used) as total_tokens,
                        SUM(cost_estimate) as total_cost,
                        AVG(latency_ms) as avg_latency
                    FROM usage_analytics
                    WHERE session_id = ?
                """, (session_id,))
                
                row = cursor.fetchone()
                event_count = row['event_count'] or 0
                total_tokens = row['total_tokens'] or 0
                total_cost = row['total_cost'] or 0.0
                avg_latency = row['avg_latency']
                
                # Get routing statistics
                cursor.execute("""
                    SELECT 
                        COUNT(*) as routing_count,
                        SUM(CASE WHEN was_fallback = 1 THEN 1 ELSE 0 END) as fallback_count,
                        COUNT(DISTINCT selected_provider_id) as providers_used
                    FROM routing_history
                    WHERE session_id = ?
                """, (session_id,))
                
                row = cursor.fetchone()
                routing_count = row['routing_count'] or 0
                fallback_count = row['fallback_count'] or 0
                providers_used = row['providers_used'] or 0
                
                return {
                    'session_id': session_id,
                    'event_count': event_count,
                    'total_tokens': total_tokens,
                    'total_cost': total_cost,
                    'avg_latency_ms': avg_latency,
                    'routing_count': routing_count,
                    'fallback_count': fallback_count,
                    'providers_used': providers_used
                }
                
        except Exception as e:
            logger.error(f"Failed to get session analytics: {e}")
            raise


# Global singleton instance
_analytics_service: Optional[AnalyticsService] = None


def get_analytics_service(db_path: Optional[str] = None) -> AnalyticsService:
    """
    Get the global analytics service instance.
    
    Args:
        db_path: Optional database path. Only used on first call.
        
    Returns:
        AnalyticsService instance
    """
    global _analytics_service
    if _analytics_service is None:
        _analytics_service = AnalyticsService(db_path)
    return _analytics_service


# Made with Bob