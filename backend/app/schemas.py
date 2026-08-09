from pydantic import BaseModel, ConfigDict, Field
from typing import Optional


class RoomCreate(BaseModel):
    roomId: str = Field(alias="roomId")
    name: Optional[str] = None
    description: Optional[str] = None
    activityId: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)


class UserRegister(BaseModel):
    """报名 & 管理员手动添加共用模型"""
    name: str
    department: Optional[str] = None
    roomId: str = Field(alias="roomId")

    model_config = ConfigDict(populate_by_name=True)


class BatchUsersCreate(BaseModel):
    count: int
    startFrom: int = 1
    roomId: str = Field(alias="roomId")

    model_config = ConfigDict(populate_by_name=True)


class LotteryDraw(BaseModel):
    count: int = 1
    roomId: str = Field(alias="roomId")
    prizeName: Optional[str] = None
    preventDuplicateWinners: bool = True

    model_config = ConfigDict(populate_by_name=True)


class LotteryReset(BaseModel):
    roomId: str = Field(alias="roomId")

    model_config = ConfigDict(populate_by_name=True)


class WinnerOut(BaseModel):
    id: int
    name: str
    department: Optional[str] = None


class ActivityCreate(BaseModel):
    name: str
    description: Optional[str] = None


class ActivityUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
