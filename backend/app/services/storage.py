import io
import uuid
from datetime import timedelta
from minio import Minio
from minio.error import S3Error

from app.config import settings

_internal_client: Minio | None = None
_public_client: Minio | None = None


def _get_internal() -> Minio:
    global _internal_client
    if _internal_client is None:
        _internal_client = Minio(
            settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=settings.MINIO_SECURE,
        )
    return _internal_client


def _get_public() -> Minio:
    global _public_client
    if _public_client is None:
        public_endpoint = settings.MINIO_PUBLIC_ENDPOINT or settings.MINIO_ENDPOINT
        _public_client = Minio(
            public_endpoint,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=settings.MINIO_SECURE,
        )
    return _public_client


async def upload_pdf(data: bytes, workspace_id: str, artifact_id: str) -> str:
    client = _get_internal()
    bucket = settings.MINIO_BUCKET
    path = f"{workspace_id}/{artifact_id}.pdf"
    try:
        client.put_object(bucket, path, io.BytesIO(data), len(data), content_type="application/pdf")
    except S3Error as e:
        raise RuntimeError(f"Storage upload failed: {e}")
    return path


async def get_pdf_url(path: str, filename: str, inline: bool = False) -> str:
    client = _get_internal()
    bucket = settings.MINIO_BUCKET
    kwargs = {}
    if not inline:
        kwargs["response_headers"] = {"Content-Disposition": f'attachment; filename="{filename}"'}
    try:
        url = client.presigned_get_object(bucket, path, expires=timedelta(seconds=600), **kwargs)
    except S3Error as e:
        raise RuntimeError(f"Failed to generate URL: {e}")

    public_endpoint = settings.MINIO_PUBLIC_ENDPOINT or settings.MINIO_ENDPOINT
    internal_endpoint = settings.MINIO_ENDPOINT
    if public_endpoint != internal_endpoint:
        url = url.replace(internal_endpoint, public_endpoint)
    return url


async def delete_pdf(path: str) -> None:
    client = _get_internal()
    bucket = settings.MINIO_BUCKET
    try:
        client.remove_object(bucket, path)
    except S3Error:
        pass
