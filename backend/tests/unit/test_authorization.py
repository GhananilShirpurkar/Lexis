import pytest
import uuid
from fastapi import HTTPException
from hypothesis import given, strategies as st
from app.storage.r2_client import upload_file
from app.auth.ownership import assert_owns

@given(
    user_id=st.uuids(),
    doc_id=st.uuids(),
    filename=st.text(min_size=1, max_size=100).filter(lambda s: "\x00" not in s)
)
def test_property_r2_key_namespace_prefix(user_id, doc_id, filename):
    """
    Property 17: R2 storage keys are prefixed with the owning user's ID
    such that files belonging to different users are stored under distinct key namespaces.
    """
    key = upload_file(
        user_id=user_id,
        doc_id=doc_id,
        filename=filename,
        data=b"dummy-content"
    )
    
    # Assert key starts with str(user_id) prefix
    assert key.startswith(f"{user_id}/")

@given(
    user_id_1=st.uuids(),
    user_id_2=st.uuids(),
    doc_id_1=st.uuids(),
    doc_id_2=st.uuids(),
    filename_1=st.text(min_size=1, max_size=100).filter(lambda s: "\x00" not in s),
    filename_2=st.text(min_size=1, max_size=100).filter(lambda s: "\x00" not in s)
)
def test_property_r2_key_namespace_isolation(user_id_1, user_id_2, doc_id_1, doc_id_2, filename_1, filename_2):
    """
    Property 17: Keys generated for distinct users never overlap/collide.
    """
    if user_id_1 == user_id_2:
        return
        
    key_1 = upload_file(user_id=user_id_1, doc_id=doc_id_1, filename=filename_1, data=b"data")
    key_2 = upload_file(user_id=user_id_2, doc_id=doc_id_2, filename=filename_2, data=b"data")
    
    # Assert namespace prefixing isolates the two keys completely
    prefix_1 = f"{user_id_1}/"
    prefix_2 = f"{user_id_2}/"
    
    assert not key_1.startswith(prefix_2)
    assert not key_2.startswith(prefix_1)


# =====================================================================
# Property 16: Tenant Isolation & assert_owns Property Tests
# =====================================================================

class MockResource:
    def __init__(self, user_id):
        self.user_id = user_id

@pytest.mark.asyncio
async def test_assert_owns_missing_resource():
    """Verify that assert_owns raises 404 Not Found if resource is None."""
    user_id = uuid.uuid4()
    with pytest.raises(HTTPException) as exc_info:
        await assert_owns(user_id, None)
    
    assert exc_info.value.status_code == 404
    assert exc_info.value.detail["code"] == "RESOURCE_NOT_FOUND"

@given(
    user_id=st.uuids()
)
@pytest.mark.asyncio
async def test_assert_owns_matching_owner(user_id):
    """Verify that assert_owns succeeds (does not raise) if user_id matches resource owner."""
    resource = MockResource(user_id)
    # This should execute without throwing any exception
    await assert_owns(user_id, resource)

@given(
    user_id_1=st.uuids(),
    user_id_2=st.uuids()
)
@pytest.mark.asyncio
async def test_assert_owns_mismatch_owner(user_id_1, user_id_2):
    """Property 16: Verify that assert_owns raises 403 Forbidden if user_ids mismatch."""
    if user_id_1 == user_id_2:
        return

    resource = MockResource(user_id_1)
    with pytest.raises(HTTPException) as exc_info:
        await assert_owns(user_id_2, resource)
    
    assert exc_info.value.status_code == 403
    assert exc_info.value.detail["code"] == "FORBIDDEN"
