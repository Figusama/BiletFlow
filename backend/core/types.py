from enum import Enum

import sqlalchemy as sa


def text_enum(enum_cls: type[Enum]) -> sa.Enum:
    return sa.Enum(enum_cls, native_enum=False, create_constraint=False, length=64, values_callable=lambda e: [m.value for m in e])
