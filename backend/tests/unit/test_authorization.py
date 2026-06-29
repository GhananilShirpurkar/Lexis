from hypothesis import given, strategies as st
from app.storage.r2_client import upload_file

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
