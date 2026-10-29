import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.security import create_access_token

TEST_USER_ID = "1223bef8-242e-4e79-b4ff-4db9e450e1fa"
TEST_USERNAME = "smartdoc_test"


@pytest.fixture(autouse=True)
def reset_rate_limits():
    """Keep each test independent while preserving rate-limit assertions within it."""
    from app.core.limiter import limiter
    limiter.reset()
    yield
    limiter.reset()

@pytest.fixture
def auth_token() -> str:
    """Generate valid JWT Bearer token for test user."""
    return create_access_token({
        "sub": TEST_USER_ID,
        "username": TEST_USERNAME,
        "role": "admin",
        "ver": 0,
    })

@pytest.fixture
def auth_headers(auth_token: str) -> dict:
    """Authorization headers for authenticated HTTP requests."""
    return {"Authorization": f"Bearer {auth_token}"}

@pytest_asyncio.fixture
async def auth_client(auth_headers: dict):
    """Httpx AsyncClient with pre-configured auth headers."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", headers=auth_headers) as client:
        yield client

@pytest_asyncio.fixture(autouse=True)
async def cleanup_db_connections():
    """Ensure all pool connections are closed within the test's event loop."""
    yield
    from app.db.base import engine
    await engine.dispose()
