import io
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile, status
from PIL import Image, UnidentifiedImageError

from backend.core.config import MAX_IMAGE_BYTES, MEDIA_ROOT, MEDIA_URL

ALLOWED_FORMATS = {"JPEG": "jpg", "PNG": "png", "WEBP": "webp"}


def media_url(storage_key: str) -> str:
    return f"{MEDIA_URL}/{storage_key}"


def save_image(upload: UploadFile, folder: str) -> str:
    data = upload.file.read(MAX_IMAGE_BYTES + 1)
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, f"Image must be at most {MAX_IMAGE_BYTES // (1024 * 1024)} MB")
    try:
        with Image.open(io.BytesIO(data)) as image:
            image_format = image.format
            image.verify()
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, SyntaxError, ValueError):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "File is not a valid image")
    if image_format not in ALLOWED_FORMATS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Only JPEG, PNG and WEBP images are allowed")
    storage_key = f"{folder}/{uuid.uuid4().hex}.{ALLOWED_FORMATS[image_format]}"
    path = Path(MEDIA_ROOT) / storage_key
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return storage_key
