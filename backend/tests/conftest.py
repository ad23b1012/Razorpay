"""
Test isolation: point the suite at its own throwaway SQLite file.

This must run before any `app.*` import, because `app.config.settings` is
instantiated at import time. pytest loads conftest first, so setting the
environment here is enough. Without it the suite would read and write the
developer's razoragent.db and leak state between runs.
"""
import os
import pathlib

TEST_DB_PATH = pathlib.Path(__file__).parent / "test_razoragent.db"

os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{TEST_DB_PATH}"
os.environ["SUPABASE_DATABASE_URL"] = ""
os.environ["RAZORPAY_MOCK_MODE"] = "true"

if TEST_DB_PATH.exists():
    TEST_DB_PATH.unlink()
