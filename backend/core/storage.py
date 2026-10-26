import uuid
from pathlib import Path

from fastapi import UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from core.config import settings
from core.errors import AppError

_IMAGE_SIGNATURES = {
    "jpg": (b"\xff\xd8\xff",),
    "png": (b"\x89PNG\r\n\x1a\n",),
}


class ImageRead(BaseModel):
    id: uuid.UUID
    url: str
    position: int


def media_root() -> Path:
    return Path(settings.media_root)


def file_url(storage_key: str) -> str:
    return f"{settings.media_url.rstrip('/')}/{storage_key}"


def _detect_image_ext(data: bytes) -> str | None:
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    for ext, signatures in _IMAGE_SIGNATURES.items():
        if data.startswith(signatures):
            return ext
    return None


def _write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


async def save_image(upload: UploadFile, namespace: str) -> str:
    data = await upload.read(settings.max_image_bytes + 1)
    if len(data) > settings.max_image_bytes:
        raise AppError(413, "IMAGE_TOO_LARGE", f"Image must be at most {settings.max_image_bytes // 1024 // 1024} MB")
    ext = _detect_image_ext(data)
    if ext is None:
        raise AppError(415, "UNSUPPORTED_IMAGE", "Only JPEG, PNG and WebP images are allowed")

    storage_key = f"{namespace}/{uuid.uuid4().hex}.{ext}"
    await run_in_threadpool(_write, media_root() / storage_key, data)
    return storage_key
