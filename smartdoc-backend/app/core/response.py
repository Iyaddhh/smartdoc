from typing import Any, Optional
from fastapi.responses import JSONResponse
from pydantic import BaseModel

class APIResponse(BaseModel):
    success: bool
    data: Optional[Any] = None
    message: str
    error: Optional[str] = None

def ok_response(data: Any = None, message: str = "Success", status_code: int = 200) -> JSONResponse:
    payload = APIResponse(
        success=True,
        data=data,
        message=message,
        error=None
    ).model_dump()
    return JSONResponse(content=payload, status_code=status_code)

def fail_response(message: str = "Operation failed", error: Optional[str] = None, status_code: int = 400) -> JSONResponse:
    payload = APIResponse(
        success=False,
        data=None,
        message=message,
        error=error or message
    ).model_dump()
    return JSONResponse(content=payload, status_code=status_code)
