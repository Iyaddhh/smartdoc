from uuid import UUID
from pydantic import BaseModel, Field

class RenameRequest(BaseModel):
    custom_name: str = Field(min_length=1, max_length=255, pattern=r"^[^/\\]+$")

class BatchRequest(BaseModel):
    ids: list[UUID] = Field(min_length=1, max_length=100)
