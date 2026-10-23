"""Request bodies for the HTTP API."""
import re

from pydantic import BaseModel, Field, field_validator

from app import config


class HuntRequest(BaseModel):
    budget: float = Field(config.DEFAULT_BUDGET, gt=0, le=5000)
    platform: str = "both"
    diet: str = config.DEFAULT_DIET
    address: str = config.DEFAULT_ADDRESS
    queries: str = config.DEFAULT_QUERIES
    max_carts: int = Field(6, ge=1, le=15)
    extra_items: int = Field(2, ge=0, le=3)   # extra items the agent may add to reach an offer's minimum order

    @field_validator("platform")
    @classmethod
    def known_platform(cls, value: str) -> str:
        if value != "both" and value not in config.PLATFORMS:
            raise ValueError(f"platform must be 'both' or one of: {', '.join(config.PLATFORMS)}")
        return value


class FeedbackRequest(BaseModel):
    key: str
    favorite: bool | None = None
    rating: int | None = Field(None, ge=0, le=5)
    note: str | None = Field(None, max_length=500)


class WatchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=80)
    max_price: float = Field(gt=0)


class ProfileRequest(BaseModel):
    """The local user. The mobile number is stored as 10 digits; it is not verified by OTP."""
    name: str = Field(min_length=1, max_length=40)
    mobile: str

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        value = " ".join(value.split())
        if not value:
            raise ValueError("Enter your name.")
        return value

    @field_validator("mobile")
    @classmethod
    def clean_mobile(cls, value: str) -> str:
        digits = re.sub(r"[\s\-()]", "", value)
        digits = digits.removeprefix("+91").removeprefix("91") if len(re.sub(r"\D", "", digits)) > 10 else digits
        if not re.fullmatch(r"[6-9]\d{9}", digits):
            raise ValueError("Enter a 10-digit Indian mobile number starting with 6, 7, 8 or 9.")
        return digits
