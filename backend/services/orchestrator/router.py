"""Provider selection, prioritization, fallback, and retry."""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple, Any

from ..providers.base import (
    ChatMessage,
    CompletionRequest,
    CompletionResult,
    LLMProvider,
    ProviderConfig,
    ProviderHealth,
    ProviderHealthStatus,
)
from ..providers.registry import ProviderRegistry, get_provider_registry

logger = logging.getLogger(__name__)

# Per-user round-robin cursor for ROUTING_STRATEGY=round_robin
_rr_index: Dict[int, int] = {}

# In-memory cache for provider health statuses (A-MED-01)
_provider_health_cache: Dict[str, ProviderHealthStatus] = {}


@dataclass
class RoutingDecision:
    provider_id: str
    model: str
    reason: str
    attempts: int = 1
    fallbacks_used: List[str] = field(default_factory=list)
    routing_strategy: str = "auto"


class ProviderRouter:
    """
    Selects LLM providers by priority, runs health-aware fallback chains,
    and applies retry with exponential backoff.
    """

    def __init__(
        self,
        registry: Optional[ProviderRegistry] = None,
        max_retries: int = 3,
        retry_base_delay: float = 0.5,
    ) -> None:
        self.registry = registry or get_provider_registry()
        self.max_retries = max_retries
        self.retry_base_delay = retry_base_delay

    async def health_check_all(
        self, configs: List[ProviderConfig]
    ) -> List[ProviderHealth]:
        tasks = []
        for cfg in configs:
            impl = self.registry.get(cfg.provider_id)
            if impl:
                tasks.append(impl.health_check(cfg))
        if not tasks:
            return []
        results = await asyncio.gather(*tasks)
        for h in results:
            _provider_health_cache[h.provider_id] = h.status
        return results

    def order_configs(
        self,
        configs: List[ProviderConfig],
        routing_strategy: str = "auto",
        user_id: int = 0,
        preferred_provider_id: Optional[str] = None,
    ) -> List[ProviderConfig]:
        """Order enabled configs per orchestrator routing strategy (CRIT-005)."""
        enabled = [
            c
            for c in configs
            if c.enabled and (c.api_key or (c.extra or {}).get("oauth"))
        ]
        if preferred_provider_id:
            preferred = [c for c in enabled if c.provider_id == preferred_provider_id]
            if preferred:
                rest = [c for c in enabled if c.provider_id != preferred_provider_id]
                enabled = preferred + rest

        strategy = (routing_strategy or "auto").lower().replace("-", "_")
        
        # Filter out exhausted configs
        valid_configs = [
            c for c in enabled
            if (c.extra or {}).get("quota_status") != "exhausted"
        ]

        available = [
            c for c in valid_configs
            if _provider_health_cache.get(c.provider_id) != ProviderHealthStatus.UNAVAILABLE
        ]
        unavailable = [
            c for c in valid_configs
            if _provider_health_cache.get(c.provider_id) == ProviderHealthStatus.UNAVAILABLE
        ]

        is_warn = lambda c: 1 if (c.extra or {}).get("quota_status") == "warn" else 0

        if strategy in ("least_cost", "least-cost"):
            ordered_available = sorted(available, key=lambda c: (is_warn(c), c.cost_per_1k_tokens, c.priority))
        elif strategy in ("fastest", "fast"):
            latencies = {
                c.provider_id: float((c.extra or {}).get("latency_ms", c.priority * 100))
                for c in available
            }
            ordered_available = sorted(available, key=lambda c: (is_warn(c), latencies.get(c.provider_id, 9999), c.priority))
        elif strategy in ("round_robin", "round-robin"):
            normal_available = [c for c in available if (c.extra or {}).get("quota_status") != "warn"]
            warn_available = [c for c in available if (c.extra or {}).get("quota_status") == "warn"]
            if not normal_available:
                ordered_available = []
            else:
                idx = _rr_index.get(user_id, 0) % len(normal_available)
                _rr_index[user_id] = idx + 1
                ordered_available = normal_available[idx:] + normal_available[:idx]
            ordered_available = ordered_available + sorted(warn_available, key=lambda c: c.priority)
        else:
            ordered_available = sorted(available, key=lambda c: (is_warn(c), c.priority))

        return ordered_available + sorted(unavailable, key=lambda c: (is_warn(c), c.priority))

    async def complete_with_fallback(
        self,
        configs: List[ProviderConfig],
        messages: List[ChatMessage],
        model: Optional[str] = None,
        temperature: float = 0.2,
        max_tokens: int = 4096,
        routing_strategy: str = "auto",
        user_id: int = 0,
        preferred_provider_id: Optional[str] = None,
        db: Optional[Any] = None,
    ) -> Tuple[CompletionResult, RoutingDecision]:
        ordered = self.order_configs(
            configs,
            routing_strategy=routing_strategy,
            user_id=user_id,
            preferred_provider_id=preferred_provider_id,
        )

        if not ordered:
            # Check if there were enabled configs that got filtered out due to quota limits
            enabled_configs = [
                c for c in configs
                if c.enabled and (c.api_key or (c.extra or {}).get("oauth"))
            ]
            if enabled_configs:
                from backend.utils.exceptions import QuotaExceededError
                raise QuotaExceededError(
                    "All configured LLM providers have exceeded their quota limits."
                )

        fallbacks: List[str] = []
        last_error: Optional[Exception] = None

        for cfg in ordered:
            impl = self.registry.get(cfg.provider_id)
            if not impl or not impl.is_configured(cfg):
                continue

            for attempt in range(1, self.max_retries + 1):
                try:
                    result = await impl.complete(
                        cfg,
                        CompletionRequest(
                            messages=messages,
                            model=model or cfg.default_model,
                            temperature=temperature,
                            max_tokens=max_tokens,
                        ),
                    )
                    _provider_health_cache[cfg.provider_id] = ProviderHealthStatus.HEALTHY
                    
                    if db and user_id:
                        provider_db_id = cfg.extra.get("provider_db_id")
                        if provider_db_id:
                            from backend.services.quota_service import record_usage
                            await record_usage(
                                db,
                                provider_db_id=provider_db_id,
                                user_id=user_id,
                                tokens=result.tokens_used,
                                requests=1,
                            )

                    return result, RoutingDecision(
                        provider_id=cfg.provider_id,
                        model=result.model,
                        reason=f"primary after {len(fallbacks)} fallback(s)"
                        if fallbacks
                        else "primary provider",
                        attempts=attempt,
                        fallbacks_used=fallbacks,
                        routing_strategy=routing_strategy,
                    )
                except Exception as e:
                    last_error = e
                    logger.warning(
                        "Provider %s attempt %s failed: %s",
                        cfg.provider_id,
                        attempt,
                        e,
                        exc_info=True,
                    )
                    if attempt < self.max_retries:
                        await asyncio.sleep(self.retry_base_delay * attempt)
                    else:
                        _provider_health_cache[cfg.provider_id] = ProviderHealthStatus.UNAVAILABLE

            fallbacks.append(cfg.provider_id)

        raise RuntimeError(
            f"All configured LLM providers failed. Last error: {last_error}"
        )
