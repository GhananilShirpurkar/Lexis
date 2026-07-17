import re
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.models.user import User

async def run_onboarding_migration(db: AsyncSession):
    """
    Data migration for existing users:
    - Auto-generates unique username from email local part
    - Sets onboarding_completed = True for pre-existing users
    """
    res = await db.execute(select(User).where((User.username == None) | (User.username == "")))
    users_to_migrate = res.scalars().all()
    
    if not users_to_migrate:
        return

    print(f"Running onboarding migration for {len(users_to_migrate)} existing users...")

    # Fetch all existing usernames for collision check
    all_users_res = await db.execute(select(User.username).where(User.username != None))
    existing_usernames = set(all_users_res.scalars().all())

    for user in users_to_migrate:
        email_prefix = user.email.split("@")[0] if user.email else "user"
        base_username = re.sub(r'[^a-zA-Z0-9_]', '_', email_prefix.lower()).strip('_')
        if len(base_username) < 3:
            base_username = f"user_{base_username}"
        base_username = base_username[:25] # Leave room for collision numbers

        candidate = base_username
        counter = 1
        while candidate in existing_usernames:
            candidate = f"{base_username}_{counter}"
            counter += 1

        user.username = candidate
        existing_usernames.add(candidate)

        if not user.display_name:
            user.display_name = candidate

        # Pre-existing users are marked as completed so their workflow is non-breaking
        user.onboarding_completed = True

    await db.commit()
    print("Onboarding migration completed successfully.")
