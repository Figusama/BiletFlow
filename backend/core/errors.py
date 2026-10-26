from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class AppError(Exception):
    def __init__(self, status_code: int, code: str, detail: str, extra: dict[str, Any] | None = None):
        self.status_code = status_code
        self.code = code
        self.detail = detail
        self.extra = extra or {}


def not_implemented() -> AppError:
    return AppError(501, "NOT_IMPLEMENTED", "Not implemented yet")


def not_found(what: str) -> AppError:
    return AppError(404, "NOT_FOUND", f"{what} not found")


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def handle_app_error(request: Request, exc: AppError):
        return JSONResponse(
            status_code=exc.status_code, content={"detail": exc.detail, "code": exc.code, **exc.extra}
        )
