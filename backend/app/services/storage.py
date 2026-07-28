import io
import uuid
from datetime import timedelta
from minio import Minio
from minio.error import S3Error

from app.config import settings

_client: Minio | None = None


def get_minio_client() -> Minio:
    global _client
    if _client is None:
        _client = Minio(
            settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=settings.MINIO_SECURE,
        )
    return _client


async def upload_pdf(data: bytes, workspace_id: str, artifact_id: str) -> str:
    client = get_minio_client()
    bucket = settings.MINIO_BUCKET
    path = f"{workspace_id}/{artifact_id}.pdf"

    try:
        client.put_object(
            bucket,
            path,
            io.BytesIO(data),
            len(data),
            content_type="application/pdf",
        )
    except S3Error as e:
        raise RuntimeError(f"Storage upload failed: {e}")

    return path


async def get_pdf_url(path: str, filename: str, inline: bool = False) -> str:
    client = get_minio_client()
    bucket = settings.MINIO_BUCKET
    kwargs = {}
    if not inline:
        kwargs["response_headers"] = {"Content-Disposition": f'attachment; filename="{filename}"'}
    try:
        url = client.presigned_get_object(bucket, path, expires=timedelta(seconds=600), **kwargs)
        return url
    except S3Error as e:
        raise RuntimeError(f"Failed to generate URL: {e}")


async def delete_pdf(path: str) -> None:
    client = get_minio_client()
    bucket = settings.MINIO_BUCKET
    try:
        client.remove_object(bucket, path)
    except S3Error:
        pass
