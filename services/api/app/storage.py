from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, UploadFile


MAX_SERVICE_FILE_SIZE = 10 * 1024 * 1024
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}


def save_service_upload(root: Path, service_id: str, upload: UploadFile, kind: str) -> tuple[str, str]:
    if not upload.filename:
        raise HTTPException(status_code=422, detail="El archivo no tiene nombre")
    if kind == "image" and upload.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=415, detail="La imagen debe ser JPEG, PNG o WebP")

    content = upload.file.read(MAX_SERVICE_FILE_SIZE + 1)
    if len(content) > MAX_SERVICE_FILE_SIZE:
        raise HTTPException(status_code=413, detail="El archivo supera el límite de 10 MB")

    original_name = Path(upload.filename).name
    suffix = Path(original_name).suffix.lower() or ".bin"
    key = f"services/{service_id}/{kind}-{uuid4().hex}{suffix}"
    target = root / key
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(content)
    return key, original_name


def delete_storage_key(root: Path, key: str | None) -> None:
    if not key:
        return
    target = (root / key).resolve()
    storage_root = root.resolve()
    if storage_root not in target.parents:
        return
    target.unlink(missing_ok=True)


def public_file_url(key: str | None) -> str | None:
    return f"/media/{key}" if key else None
