import uuid
from typing import Any
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

async def assert_owns(user_id: uuid.UUID | str, resource: Any, db: AsyncSession = None) -> None:
    """
    Validates ownership of a resource.
    - If the resource is None (missing record), raises HTTP 404 Not Found.
    - If the resource's user_id does not match the provided user_id, raises HTTP 403 Forbidden.
    """
    if resource is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": {
                    "code": "RESOURCE_NOT_FOUND",
                    "message": "The requested resource was not found."
                }
            }
        )

    # Validate ownership
    res_user_id = getattr(resource, "user_id", None)
    if res_user_id is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": {
                    "code": "OWNERSHIP_CHECK_FAILED",
                    "message": "The resource does not possess a valid owner attribute."
                }
            }
        )

    if str(res_user_id) != str(user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": {
                    "code": "FORBIDDEN",
                    "message": "You do not have permission to access this resource."
                }
            }
        )
