import re
from typing import Annotated

from pydantic import AfterValidator, Field


def normalize_kz_phone(value: str) -> str:
    digits = re.sub(r"\D", "", value)
    if len(digits) == 11 and digits[0] in "78":
        digits = digits[1:]
    if len(digits) != 10:
        raise ValueError("Phone must be a Kazakhstan number like +7 701 123 45 67")
    return "+7" + digits


Phone = Annotated[str, AfterValidator(normalize_kz_phone)]
FullName = Annotated[str, Field(min_length=1, max_length=200)]
