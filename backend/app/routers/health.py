from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health")
async def health():
    return {"status": "healthy", "version": "1.0.0"}


@router.get("/health/ready")
async def readiness():
    return {"status": "ready"}


@router.get("/health/live")
async def liveness():
    return {"status": "alive"}
