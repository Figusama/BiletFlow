import io
import logging
import uuid
from functools import lru_cache
from pathlib import Path

from fastapi import HTTPException, UploadFile, status
from PIL import Image, UnidentifiedImageError

from backend.core.config import MAX_IMAGE_BYTES, MEDIA_ROOT, MEDIA_URL, S3_ACCESS_KEY, S3_BUCKET, S3_ENDPOINT, S3_REGION, S3_SECRET_KEY

log = logging.getLogger("biletflow.media")

ALLOWED_FORMATS = {"JPEG": "jpg", "PNG": "png", "WEBP": "webp"}


def media_url(storage_key: str) -> str:
    return f"{MEDIA_URL}/{storage_key}"


@lru_cache
def s3_client():
    import boto3
    from botocore.config import Config
    return boto3.client("s3", endpoint_url=S3_ENDPOINT, aws_access_key_id=S3_ACCESS_KEY, aws_secret_access_key=S3_SECRET_KEY, region_name=S3_REGION,
                        config=Config(s3={"addressing_style": "path"}, connect_timeout=5, read_timeout=15, retries={"max_attempts": 2}))


def _store(storage_key: str, data: bytes, content_type: str) -> None:
    if S3_BUCKET:
        from botocore.exceptions import BotoCoreError, ClientError
        try:
            s3_client().put_object(Bucket=S3_BUCKET, Key=storage_key, Body=data, ContentType=content_type)
        except (BotoCoreError, ClientError):
            log.exception("image upload failed")
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Image storage is not available")
        return
    path = Path(MEDIA_ROOT) / storage_key
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def save_image(upload: UploadFile, folder: str) -> str:
    data = upload.file.read(MAX_IMAGE_BYTES + 1)
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, f"Image must be at most {MAX_IMAGE_BYTES // (1024 * 1024)} MB")
    try:
        with Image.open(io.BytesIO(data)) as image:
            image_format = image.format
            image.verify()
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, SyntaxError, ValueError):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "File is not a valid image")
    if image_format not in ALLOWED_FORMATS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Only JPEG, PNG and WEBP images are allowed")
    storage_key = f"{folder}/{uuid.uuid4().hex}.{ALLOWED_FORMATS[image_format]}"
    _store(storage_key, data, Image.MIME[image_format])
    return storage_key
