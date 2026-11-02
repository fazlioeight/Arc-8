"""Unit tests for the Amazon S3 document storage backend.

Validates:
1. Dispatcher resolving S3Backend when MEMBER360_STORAGE_BACKEND=s3.
2. S3 bucket name requirement validation.
3. Multi-tenant key partitioning and filename sanitization.
4. Tenant scope isolation (rejecting cross-tenant key access).
5. S3 upload, download, delete, presigned URL generation, and connectivity probe.
"""
from __future__ import annotations

import sys
from unittest.mock import MagicMock

# Ensure boto3 and botocore are mocked if not installed
if "boto3" not in sys.modules:
    mock_boto = MagicMock()
    mock_botocore = MagicMock()
    mock_config = MagicMock()
    mock_exceptions = MagicMock()

    class MockClientError(Exception):
        def __init__(self, response=None, operation_name=""):
            super().__init__(f"ClientError in {operation_name}: {response}")
            self.response = response or {}

    mock_exceptions.ClientError = MockClientError
    sys.modules["boto3"] = mock_boto
    sys.modules["botocore"] = mock_botocore
    sys.modules["botocore.config"] = mock_config
    sys.modules["botocore.exceptions"] = mock_exceptions

import pytest

from app.core.config import get_settings
from app.services import member360_storage
from app.services.member360_storage import DocumentStorageError, S3Backend


def test_get_document_backend_dispatches_s3(monkeypatch):
    """When MEMBER360_STORAGE_BACKEND=s3, dispatcher returns S3Backend."""
    settings = get_settings()
    monkeypatch.setattr(settings, "MEMBER360_STORAGE_BACKEND", "s3")
    monkeypatch.setattr(settings, "AWS_S3_BUCKET", "prominence-m360-documents")
    monkeypatch.setattr(settings, "AWS_REGION", "us-east-1")
    monkeypatch.setattr(settings, "AWS_S3_PREFIX", "m360/")

    # Mock boto3 so unit tests don't require AWS credentials
    mock_boto3 = MagicMock()
    mock_client = MagicMock()
    mock_boto3.client.return_value = mock_client
    monkeypatch.setattr("boto3.client", mock_boto3.client)

    member360_storage.reset_document_backend()
    try:
        backend = member360_storage.get_document_backend()
        assert isinstance(backend, S3Backend)
        assert backend.name == "s3"
        assert backend._bucket_name == "prominence-m360-documents"
        assert backend._region_name == "us-east-1"
    finally:
        member360_storage.reset_document_backend()
        monkeypatch.setattr(settings, "MEMBER360_STORAGE_BACKEND", "local")


def test_s3_backend_requires_bucket_name():
    """Initializing S3Backend without bucket name raises DocumentStorageError."""
    with pytest.raises(DocumentStorageError, match="AWS_S3_BUCKET is required"):
        S3Backend(bucket_name="")


def test_s3_object_key_generation(monkeypatch):
    """S3 keys follow {prefix}{safe_tenant}/m360/documents/{member_id}/{doc_id}_{filename}."""
    mock_client = MagicMock()
    monkeypatch.setattr("boto3.client", lambda **kwargs: mock_client)

    backend = S3Backend(
        bucket_name="test-bucket",
        prefix="prod/",
    )
    key = backend._object_key("prominencehealth", 42, 101, "eob_march_2026.pdf")
    assert key == "prod/prominencehealth/m360/documents/42/101_eob_march_2026.pdf"

    # Unsafe characters in filename are sanitized
    key2 = backend._object_key("tenant/unsafe!*", 99, 202, "../../bad path file?.png")
    assert ".." not in key2
    assert "bad_path_file_.png" in key2


@pytest.mark.asyncio
async def test_s3_write_and_read_mocked(monkeypatch):
    """S3 write executes put_object and read executes get_object."""
    mock_client = MagicMock()
    monkeypatch.setattr("boto3.client", lambda **kwargs: mock_client)

    backend = S3Backend(
        bucket_name="test-bucket",
        prefix="m360/",
        kms_key_id="arn:aws:kms:us-east-1:123456789012:key/test-key",
    )

    test_bytes = b"PDF-1.4 Mock EOB Content"
    key = await backend.write(
        tenant_key="prominencehealth",
        member_id=5,
        doc_id=12,
        file_name="sample.pdf",
        body=test_bytes,
    )

    assert key == "m360/prominencehealth/m360/documents/5/12_sample.pdf"
    mock_client.put_object.assert_called_once_with(
        Bucket="test-bucket",
        Key=key,
        Body=test_bytes,
        ServerSideEncryption="aws:kms",
        SSEKMSKeyId="arn:aws:kms:us-east-1:123456789012:key/test-key",
    )

    # Mock get_object response
    mock_body = MagicMock()
    mock_body.read.return_value = test_bytes
    mock_client.get_object.return_value = {"Body": mock_body}

    retrieved = await backend.read(tenant_key="prominencehealth", storage_path=key)
    assert retrieved == test_bytes


@pytest.mark.asyncio
async def test_s3_tenant_scope_isolation(monkeypatch):
    """S3Backend refuses to read, delete, or generate URLs for keys outside the tenant prefix."""
    mock_client = MagicMock()
    monkeypatch.setattr("boto3.client", lambda **kwargs: mock_client)

    backend = S3Backend(
        bucket_name="test-bucket",
        prefix="m360/",
    )

    alien_key = "m360/other_tenant/m360/documents/5/12_secret.pdf"

    # Refuse read
    with pytest.raises(DocumentStorageError, match="outside tenant scope"):
        await backend.read(tenant_key="prominencehealth", storage_path=alien_key)

    # Refuse presigned URL
    with pytest.raises(DocumentStorageError, match="outside tenant scope"):
        await backend.generate_presigned_url(tenant_key="prominencehealth", storage_path=alien_key)

    # Delete silently no-ops on out-of-scope key without calling boto3
    await backend.delete(tenant_key="prominencehealth", storage_path=alien_key)
    mock_client.delete_object.assert_not_called()


@pytest.mark.asyncio
async def test_s3_probe_mocked(monkeypatch):
    """probe() executes head_bucket and returns structured status."""
    mock_client = MagicMock()
    monkeypatch.setattr("boto3.client", lambda **kwargs: mock_client)

    backend = S3Backend(
        bucket_name="prominence-test-bucket",
        region_name="us-east-1",
    )

    # Success case
    mock_client.head_bucket.return_value = {}
    res = await backend.probe()
    assert res["ok"] is True
    assert res["backend"] == "s3"
    assert res["bucket"] == "prominence-test-bucket"

    # Failure case
    mock_client.head_bucket.side_effect = Exception("403 Forbidden")
    res_fail = await backend.probe()
    assert res_fail["ok"] is False
    assert "403 Forbidden" in res_fail["error"]
