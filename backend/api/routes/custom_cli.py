"""
Custom CLI API routes.

Read + write + delete user-defined CLI commands through the same `/cli`
prefix the rest of the app uses. Mounted at `/api/cli/custom` by `main.py`.

Auth: this endpoint is local-only (single-user desktop) and uses
`get_current_user_id` purely so the dependency graph is consistent with
the rest of the app.
"""

from __future__ import annotations

import logging
from typing import List, Optional

import aiosqlite
from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field

from backend.api.dependencies import get_current_user_id, get_db
from backend.services.custom_cli_service import (
    CustomCli as CustomCliRecord,
    CustomCliError,
    delete_custom_cli_async,
    get_custom_cli_async,
    list_custom_clis_async,
    register_custom_cli_async,
)

router = APIRouter(prefix="/cli/custom", tags=["custom_cli"])
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------


class CustomCliOut(BaseModel):
    slug: str
    display_name: str
    command: str
    args_template: str
    description: Optional[str] = None
    enabled: bool
    created_at: str
    updated_at: str


class CustomCliRegister(BaseModel):
    slug: str = Field(..., min_length=2, max_length=63)
    display_name: str = Field(..., min_length=1, max_length=80)
    command: str = Field(..., min_length=1)
    args_template: Optional[str] = None
    description: Optional[str] = Field(default=None, max_length=500)
    enabled: bool = True


class CustomCliListOut(BaseModel):
    clis: List[CustomCliOut]


def _to_out(row: CustomCliRecord) -> CustomCliOut:
    return CustomCliOut(**row.to_dict())


def _bad_request(exc: CustomCliError) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail=str(exc),
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("", response_model=CustomCliListOut)
async def list_registered_clis(
    db: aiosqlite.Connection = Depends(get_db),
    _user_id: int = Depends(get_current_user_id),
) -> CustomCliListOut:
    """Return all user-registered CLIs (newest first)."""
    rows = await list_custom_clis_async(db)
    return CustomCliListOut(clis=[_to_out(r) for r in rows])


@router.post("", response_model=CustomCliOut, status_code=status.HTTP_201_CREATED)
async def register_cli(
    body: CustomCliRegister,
    db: aiosqlite.Connection = Depends(get_db),
    _user_id: int = Depends(get_current_user_id),
) -> CustomCliOut:
    """Register or update a custom CLI by slug."""
    try:
        row = await register_custom_cli_async(
            db,
            slug=body.slug,
            display_name=body.display_name,
            command=body.command,
            args_template=body.args_template,
            description=body.description,
            enabled=body.enabled,
        )
    except CustomCliError as exc:
        raise _bad_request(exc) from exc
    return _to_out(row)


@router.get("/{slug}", response_model=CustomCliOut)
async def fetch_cli(
    slug: str,
    db: aiosqlite.Connection = Depends(get_db),
    _user_id: int = Depends(get_current_user_id),
) -> CustomCliOut:
    """Fetch a single custom CLI by slug."""
    try:
        row = await get_custom_cli_async(db, slug)
    except CustomCliError as exc:
        raise _bad_request(exc) from exc
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown custom CLI slug: {slug}",
        )
    return _to_out(row)


@router.delete(
    "/{slug}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
async def remove_cli(
    slug: str,
    db: aiosqlite.Connection = Depends(get_db),
    _user_id: int = Depends(get_current_user_id),
) -> Response:
    """Delete a custom CLI by slug. 204 on success, 404 if missing."""
    try:
        removed = await delete_custom_cli_async(db, slug)
    except CustomCliError as exc:
        raise _bad_request(exc) from exc
    if not removed:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown custom CLI slug: {slug}",
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
