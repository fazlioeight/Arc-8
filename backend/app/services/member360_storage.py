"""Member360 document storage abstraction.

A small pluggable interface so document uploads can target a local
filesystem for dev/test and onprem, and a managed object store (S3, Azure
Blob, GCS) in production without rewriting the service layer. Per-tenant
isolation is non-negotiable: every backend must partition writes by the
tenant key so two tenants can never read one another's files.

Path layout (local backend):

    {root}/{tenant_key}/m360/documents/{member_id}/{doc_id}_{safe_filename}

The same convention is reused as the *key* for S3-style backends once those
are wired in — a tenant either gets its own bucket or its own top-level
prefix; either way ``tenant_key`` is the first path segment.
"""
from __future__ import annotations

import asyncio
import os
import re
from pathlib import Path
from typing import Any, Optional, Protocol


class DocumentStorageError(RuntimeError):
    """Raised on storage backend failures. Routes translate this to 500."""


_UNSAFE_FILENAME_CHARS = re.compile(r"[^A-Za-z0-9._-]+")


def _sanitize_filename(name: str) -> str:
    """Reduce ``name`` to ASCII alnum/dot/dash/underscore and strip path
    separators. Empty input becomes ``"file"``.

    Defense against three things:
    1. Path traversal — strip directory separators by taking ``basename``.
    2. Embedded slashes / backslashes once we're past basename — collapse.
    3. Unicode / control chars that surprise downstream tools (CDNs,
       virus scanners) — collapse to underscore.
    """
    base = os.path.basename(name.strip()) or "file"
    cleaned = _UNSAFE_FILENAME_CHARS.sub("_", base).strip("._") or "file"
    # Cap length so we don't push past most filesystems' 255-byte limit
    # once the doc-id prefix is added.
    return cleaned[:128]


def sanitize_container_name(prefix: str, tenant_key: str, max_len: int = 63) -> str:
    """Build an Azure-blob-compatible container name from ``{prefix}{tenant_key}``.

    Azure container names: 3-63 chars, lowercase, ``[a-z0-9-]``, must start
    and end with alnum, no consecutive dashes. Extracted to module level so
    it can be unit-tested without instantiating the (SDK-dependent) backend.
    """
    safe = re.sub(r"[^a-z0-9-]+", "-", (prefix + tenant_key).lower())
    safe = re.sub(r"-{2,}", "-", safe).strip("-")
    if len(safe) < 3:
        safe = (safe + "tenant")[:3]
    return safe[:max_len].rstrip("-") or "tenant"


class DocumentBackend(Protocol):
    """Storage backend interface.

    All paths are *relative* keys (no leading slash). Backends are free to
    interpret the key as a filesystem path, an object key, etc. — the
    service layer never inspects the contents of ``storage_path``.
    """

    name: str

    async def write(
        self,
        *,
        tenant_key: str,
        member_id: int,
        doc_id: int,
        file_name: str,
        body: bytes,
    ) -> str:
        """Persist ``body`` and return the backend-specific key/path."""

    async def read(self, *, tenant_key: str, storage_path: str) -> bytes:
        """Read the bytes back. Raises ``DocumentStorageError`` on miss."""

    async def delete(self, *, tenant_key: str, storage_path: str) -> None:
        """Best-effort delete. Silently no-ops if the object is gone."""


class LocalFilesystemBackend:
    """Per-tenant directory tree on local disk.

    Each tenant gets ``{root}/{tenant_key}`` as its private prefix; the
    backend will refuse to read from a path that doesn't begin with that
    prefix, which protects against an attacker writing a doc row with a
    crafted ``storage_path`` pointing at another tenant's tree.
    """

    name = "local"

    def __init__(self, root: Path | str) -> None:
        self._root = Path(root).resolve()

    def _tenant_root(self, tenant_key: str) -> Path:
        # tenant_key comes from the auth layer and is already constrained to
        # a slug-shape by the tenant registry, but defense-in-depth: never
        # let a tenant_key escape its own directory.
        safe = re.sub(r"[^A-Za-z0-9._-]+", "_", tenant_key.strip()) or "unknown"
        return self._root / safe

    async def write(
        self,
        *,
        tenant_key: str,
        member_id: int,
        doc_id: int,
        file_name: str,
        body: bytes,
    ) -> str:
        safe = _sanitize_filename(file_name)
        rel = Path("m360") / "documents" / str(int(member_id)) / f"{int(doc_id)}_{safe}"
        full = self._tenant_root(tenant_key) / rel
        try:
            full.parent.mkdir(parents=True, exist_ok=True)
            full.write_bytes(body)
        except OSError as exc:
            raise DocumentStorageError(f"Failed to write document: {exc}") from exc
        return rel.as_posix()

    async def read(self, *, tenant_key: str, storage_path: str) -> bytes:
        tenant_root = self._tenant_root(tenant_key).resolve()
        target = (tenant_root / storage_path).resolve()
        # Reject paths that resolve outside the tenant's directory. The
        # ``is_relative_to`` check is the actual defense; the suffix check
        # in Python 3.9+ is just a clearer error.
        try:
            target.relative_to(tenant_root)
        except ValueError as exc:
            raise DocumentStorageError(
                f"Refusing to read path outside tenant root: {storage_path!r}"
            ) from exc
        try:
            return target.read_bytes()
        except FileNotFoundError as exc:
            raise DocumentStorageError(f"Document not found: {storage_path!r}") from exc
        except OSError as exc:
            raise DocumentStorageError(f"Failed to read document: {exc}") from exc

    async def delete(self, *, tenant_key: str, storage_path: str) -> None:
        tenant_root = self._tenant_root(tenant_key).resolve()
        target = (tenant_root / storage_path).resolve()
        try:
            target.relative_to(tenant_root)
        except ValueError:
            return
        try:
            target.unlink(missing_ok=True)
        except OSError:
            # Best-effort cleanup; surfacing this would mask the caller's
            # primary outcome (e.g. a DB delete that already succeeded).
            return


class AzureBlobBackend:
    """Azure Blob Storage backend, one container per tenant.

    Auth: ``DefaultAzureCredential`` — picks up the managed identity in Azure
    App Service / Container Apps, and falls back to ``az login`` / VS Code
    / env vars for local dev. No connection string or account key is read.

    Tenant isolation: each tenant gets its own container
    (``{prefix}{tenant_key}``, sanitized to Azure's container-name rules).
    The container is created lazily on first write per tenant so onboarding
    a new tenant doesn't require an out-of-band provisioning step.

    SDK imports happen inside ``__init__`` so the module is importable in
    environments that don't have ``azure-identity`` / ``azure-storage-blob``
    installed (e.g. minimal CI images that only run the local backend).
    """

    name = "azure"

    def __init__(self, account_name: str, container_prefix: str = "m360-") -> None:
        if not account_name:
            raise DocumentStorageError(
                "AZURE_STORAGE_ACCOUNT_NAME is required for the azure backend."
            )
        try:
            from azure.identity.aio import DefaultAzureCredential
            from azure.storage.blob.aio import BlobServiceClient
        except ImportError as exc:  # pragma: no cover - exercised in tests
            raise DocumentStorageError(
                "azure-identity and azure-storage-blob must be installed to use "
                "MEMBER360_STORAGE_BACKEND=azure. Add them to requirements.txt."
            ) from exc
        self._account_name = account_name
        self._prefix = container_prefix or ""
        self._credential = DefaultAzureCredential()
        self._client = BlobServiceClient(
            account_url=f"https://{account_name}.blob.core.windows.net",
            credential=self._credential,
        )
        # Containers we've already create_container'd this process — avoids
        # an extra round-trip per write after the first time.
        self._known_containers: set[str] = set()

    def _container_name(self, tenant_key: str) -> str:
        return sanitize_container_name(self._prefix, tenant_key)

    async def _ensure_container(self, container_name: str):
        client = self._client.get_container_client(container_name)
        if container_name in self._known_containers:
            return client
        # Lazy create. Idempotent: ResourceExistsError just means the
        # container already exists, which is the happy path after the first
        # upload per tenant. Re-raise any other error — a permissions
        # problem here shouldn't get silently swallowed.
        try:
            from azure.core.exceptions import ResourceExistsError
        except ImportError:  # pragma: no cover
            ResourceExistsError = Exception  # type: ignore[assignment]
        try:
            await client.create_container()
        except ResourceExistsError:
            pass
        self._known_containers.add(container_name)
        return client

    async def write(
        self,
        *,
        tenant_key: str,
        member_id: int,
        doc_id: int,
        file_name: str,
        body: bytes,
    ) -> str:
        safe = _sanitize_filename(file_name)
        blob_path = f"{int(member_id)}/{int(doc_id)}_{safe}"
        container = await self._ensure_container(self._container_name(tenant_key))
        try:
            await container.upload_blob(name=blob_path, data=body, overwrite=False)
        except Exception as exc:  # noqa: BLE001
            raise DocumentStorageError(f"Azure upload failed: {exc}") from exc
        return blob_path

    async def read(self, *, tenant_key: str, storage_path: str) -> bytes:
        container = self._client.get_container_client(self._container_name(tenant_key))
        try:
            downloader = await container.download_blob(storage_path)
            return await downloader.readall()
        except Exception as exc:  # noqa: BLE001
            raise DocumentStorageError(f"Azure download failed: {exc}") from exc

    async def delete(self, *, tenant_key: str, storage_path: str) -> None:
        container = self._client.get_container_client(self._container_name(tenant_key))
        try:
            await container.delete_blob(storage_path)
        except Exception:
            # Best-effort — see LocalFilesystemBackend.delete for rationale.
            return

    async def close(self) -> None:
        """Release SDK clients. Called from reset_document_backend so tests
        don't leak HTTP connections between scenarios."""
        try:
            await self._client.close()
            await self._credential.close()
        except Exception:
            pass

    async def probe(self) -> dict:
        """Verify the configured credential can talk to the storage account
        and surface *which* identity won the credential chain.

        Returns a structured dict that callers can log as JSON. Never raises
        — failures land in the ``error`` field so startup doesn't crash on
        a misconfigured Azure tenant.

        Identity is read from the access token's claims (decoded without
        signature verification — we trust the token because the SDK just
        successfully exchanged it for storage data). This lets us log
        whether the active identity is a managed identity, a service
        principal, or a human ``az login`` session.
        """
        result: dict = {
            "backend": self.name,
            "account": self._account_name,
            "ok": False,
            "identity": None,
            "identity_type": None,
            "account_kind": None,
            "sku_name": None,
            "error": None,
        }
        try:
            token = await self._credential.get_token("https://storage.azure.com/.default")
            result.update(_identity_summary_from_token(token.token))
        except Exception as exc:  # noqa: BLE001
            result["error"] = f"credential.get_token failed: {exc}"
            return result
        try:
            info = await self._client.get_account_information()
            # SDK returns a dict; tolerate either key shape.
            result["account_kind"] = info.get("account_kind") if isinstance(info, dict) else getattr(info, "account_kind", None)
            result["sku_name"] = info.get("sku_name") if isinstance(info, dict) else getattr(info, "sku_name", None)
            result["ok"] = True
        except Exception as exc:  # noqa: BLE001
            result["error"] = f"get_account_information failed: {exc}"
        return result


def _identity_summary_from_token(jwt_token: str) -> dict:
    """Extract the claims that identify *who* the credential is, without
    verifying the signature. The token came back from Entra ID via the SDK
    we already trust; we're reading it for logging, not authorization.

    Returns ``{identity, identity_type, tenant_id}`` where ``identity`` is
    a human-readable label (``upn`` for users, ``appid`` for apps, falling
    back to ``oid``) and ``identity_type`` is one of:
      - ``"user"``        (someone az-logged-in or VS Code)
      - ``"service_principal"`` / ``"managed_identity"`` (apps)
      - ``"unknown"``     (claims didn't match expected shape)
    """
    import base64
    import json

    try:
        # JWT shape: header.payload.signature
        _, payload_b64, _ = jwt_token.split(".")
        # Base64 url-decode; pad to a multiple of 4.
        padded = payload_b64 + "=" * (-len(payload_b64) % 4)
        claims = json.loads(base64.urlsafe_b64decode(padded).decode("utf-8"))
    except Exception:
        return {"identity": None, "identity_type": "unknown", "tenant_id": None}

    idtyp = claims.get("idtyp")  # "user" or "app" on v2 tokens
    upn = claims.get("upn") or claims.get("preferred_username")
    appid = claims.get("appid") or claims.get("azp")
    oid = claims.get("oid")
    tid = claims.get("tid")

    if idtyp == "user" or upn:
        return {"identity": upn or oid, "identity_type": "user", "tenant_id": tid}
    if idtyp == "app" or appid:
        # Heuristic: managed identities have ``xms_mirid`` set to the ARM
        # resource id of the identity. Service principals don't.
        is_mi = bool(claims.get("xms_mirid")) or bool(claims.get("xms_az_rid"))
        return {
            "identity": appid or oid,
            "identity_type": "managed_identity" if is_mi else "service_principal",
            "tenant_id": tid,
        }
    return {"identity": oid, "identity_type": "unknown", "tenant_id": tid}


class S3Backend:
    """Amazon S3 document storage backend.

    Auth: Standard AWS credential chain (IAM Task Role on ECS Fargate in prod;
    AWS_ACCESS_KEY_ID / ~/.aws/credentials / SSO for local dev). No credentials
    are hard-coded in the application.

    Tenant isolation: S3 keys are strictly prefixed with:
        {optional_prefix}{safe_tenant_key}/m360/documents/{member_id}/{doc_id}_{safe_filename}
    Reads, deletes, and URL generation assert that the requested key matches the
    tenant's prefix, preventing any cross-tenant data access.

    HIPAA Security: Uploads enforce Server-Side Encryption (SSE-S3 AES256 by
    default, or SSE-KMS when AWS_S3_KMS_KEY_ID is specified).
    """

    name = "s3"

    def __init__(
        self,
        bucket_name: str,
        region_name: str = "us-east-1",
        prefix: str = "m360/",
        kms_key_id: Optional[str] = None,
        endpoint_url: Optional[str] = None,
    ) -> None:
        if not bucket_name:
            raise DocumentStorageError("AWS_S3_BUCKET is required for the s3 backend.")
        try:
            import boto3
            from botocore.config import Config
            from botocore.exceptions import ClientError
        except ImportError as exc:  # pragma: no cover
            raise DocumentStorageError(
                "boto3 must be installed to use MEMBER360_STORAGE_BACKEND=s3. "
                "Add it to requirements.txt."
            ) from exc

        self._bucket_name = bucket_name
        self._region_name = region_name or "us-east-1"
        self._prefix = prefix.strip("/") + "/" if prefix and prefix.strip("/") else ""
        self._kms_key_id = kms_key_id
        self._endpoint_url = endpoint_url
        self._client_error_cls = ClientError

        client_kwargs: dict[str, Any] = {
            "service_name": "s3",
            "region_name": self._region_name,
            "config": Config(signature_version="s3v4", retries={"max_attempts": 3, "mode": "standard"}),
        }
        if endpoint_url:
            client_kwargs["endpoint_url"] = endpoint_url

        self._client = boto3.client(**client_kwargs)

    def _safe_tenant(self, tenant_key: str) -> str:
        return re.sub(r"[^A-Za-z0-9._-]+", "_", tenant_key.strip()) or "unknown"

    def _tenant_prefix(self, tenant_key: str) -> str:
        safe_tenant = self._safe_tenant(tenant_key)
        return f"{self._prefix}{safe_tenant}/m360/documents/"

    def _object_key(self, tenant_key: str, member_id: int, doc_id: int, file_name: str) -> str:
        safe_name = _sanitize_filename(file_name)
        prefix = self._tenant_prefix(tenant_key)
        return f"{prefix}{int(member_id)}/{int(doc_id)}_{safe_name}"

    def _validate_tenant_scope(self, tenant_key: str, storage_path: str) -> None:
        expected_prefix = self._tenant_prefix(tenant_key)
        fallback_prefix = f"{self._safe_tenant(tenant_key)}/m360/documents/"
        if not storage_path.startswith(expected_prefix) and not storage_path.startswith(fallback_prefix):
            raise DocumentStorageError(
                f"Refusing to access S3 key outside tenant scope: {storage_path!r}"
            )

    async def write(
        self,
        *,
        tenant_key: str,
        member_id: int,
        doc_id: int,
        file_name: str,
        body: bytes,
    ) -> str:
        key = self._object_key(tenant_key, member_id, doc_id, file_name)
        extra_args: dict[str, Any] = {}
        if self._kms_key_id:
            extra_args["ServerSideEncryption"] = "aws:kms"
            extra_args["SSEKMSKeyId"] = self._kms_key_id
        else:
            extra_args["ServerSideEncryption"] = "AES256"

        def _sync_put() -> None:
            self._client.put_object(
                Bucket=self._bucket_name,
                Key=key,
                Body=body,
                **extra_args,
            )

        try:
            await asyncio.to_thread(_sync_put)
        except Exception as exc:  # noqa: BLE001
            raise DocumentStorageError(f"S3 upload failed: {exc}") from exc
        return key

    async def read(self, *, tenant_key: str, storage_path: str) -> bytes:
        self._validate_tenant_scope(tenant_key, storage_path)

        def _sync_get() -> bytes:
            try:
                response = self._client.get_object(
                    Bucket=self._bucket_name,
                    Key=storage_path,
                )
                return response["Body"].read()
            except self._client_error_cls as client_err:
                code = client_err.response.get("Error", {}).get("Code")
                if code in {"NoSuchKey", "404"}:
                    raise DocumentStorageError(f"Document not found in S3: {storage_path!r}") from client_err
                raise

        try:
            return await asyncio.to_thread(_sync_get)
        except DocumentStorageError:
            raise
        except Exception as exc:  # noqa: BLE001
            raise DocumentStorageError(f"S3 download failed: {exc}") from exc

    async def delete(self, *, tenant_key: str, storage_path: str) -> None:
        try:
            self._validate_tenant_scope(tenant_key, storage_path)
        except DocumentStorageError:
            return

        def _sync_delete() -> None:
            self._client.delete_object(
                Bucket=self._bucket_name,
                Key=storage_path,
            )

        try:
            await asyncio.to_thread(_sync_delete)
        except Exception:
            return

    async def generate_presigned_url(
        self,
        *,
        tenant_key: str,
        storage_path: str,
        expires_in: int = 300,
    ) -> str:
        self._validate_tenant_scope(tenant_key, storage_path)

        def _sync_gen() -> str:
            return self._client.generate_presigned_url(
                "get_object",
                Params={"Bucket": self._bucket_name, "Key": storage_path},
                ExpiresIn=expires_in,
            )

        try:
            return await asyncio.to_thread(_sync_gen)
        except Exception as exc:  # noqa: BLE001
            raise DocumentStorageError(f"Failed to generate presigned S3 URL: {exc}") from exc

    async def close(self) -> None:
        pass

    async def probe(self) -> dict:
        result: dict = {
            "backend": self.name,
            "bucket": self._bucket_name,
            "region": self._region_name,
            "ok": False,
            "error": None,
        }

        def _sync_head() -> None:
            self._client.head_bucket(Bucket=self._bucket_name)

        try:
            await asyncio.to_thread(_sync_head)
            result["ok"] = True
        except Exception as exc:  # noqa: BLE001
            result["error"] = f"head_bucket failed: {exc}"
        return result


_BACKEND_SINGLETON: DocumentBackend | None = None


def get_document_backend() -> DocumentBackend:
    """Resolve the backend named in settings. Cached per-process.

    Tests reset this via ``reset_document_backend`` so a settings override
    picks up cleanly between scenarios.
    """
    global _BACKEND_SINGLETON
    if _BACKEND_SINGLETON is not None:
        return _BACKEND_SINGLETON

    from ..core.config import get_settings

    settings = get_settings()
    name = (settings.MEMBER360_STORAGE_BACKEND or "local").strip().lower()
    if name == "local":
        _BACKEND_SINGLETON = LocalFilesystemBackend(settings.MEMBER360_STORAGE_ROOT)
        return _BACKEND_SINGLETON
    if name == "s3":
        _BACKEND_SINGLETON = S3Backend(
            bucket_name=settings.AWS_S3_BUCKET or "",
            region_name=settings.AWS_REGION or "us-east-1",
            prefix=settings.AWS_S3_PREFIX or "m360/",
            kms_key_id=settings.AWS_S3_KMS_KEY_ID,
            endpoint_url=settings.AWS_S3_ENDPOINT_URL,
        )
        return _BACKEND_SINGLETON
    if name == "azure":
        _BACKEND_SINGLETON = AzureBlobBackend(
            account_name=settings.AZURE_STORAGE_ACCOUNT_NAME or "",
            container_prefix=settings.AZURE_STORAGE_CONTAINER_PREFIX or "m360-",
        )
        return _BACKEND_SINGLETON
    if name in {"gcs"}:
        raise DocumentStorageError(
            f"Storage backend {name!r} is reserved but not yet implemented. "
            "Use 'local', 's3', or 'azure'."
        )
    raise DocumentStorageError(f"Unknown storage backend {name!r}")


def reset_document_backend() -> None:
    """Clear the cached backend instance — for tests that mutate settings.

    If the cached backend exposes an async ``close()`` (the Azure backend
    does) we attempt to drain it on a best-effort basis so SDK connections
    don't leak. Sync callers can't await here, so the cleanup is fire-and-
    forget — production code recreates the singleton anyway.
    """
    global _BACKEND_SINGLETON
    backend = _BACKEND_SINGLETON
    _BACKEND_SINGLETON = None
    closer = getattr(backend, "close", None)
    if closer is None:
        return
    try:
        import asyncio
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.ensure_future(closer())
        else:
            loop.run_until_complete(closer())
    except Exception:
        pass
