def identifier_checksum(value: str) -> bool:
    digits = [int(c) for c in value]
    for weights in (range(1, 12), (3, 4, 5, 6, 7, 8, 9, 10, 11, 1, 2)):
        control = sum(d * w for d, w in zip(digits, weights)) % 11
        if control != 10:
            return control == digits[11]
    return False


def iban_checksum(value: str) -> bool:
    return int("".join(str(int(c, 36)) for c in value[4:] + value[:4])) % 97 == 1


def verify(identifier: str, iban: str) -> dict[str, bool]:
    identifier_format = len(identifier) == 12 and identifier.isascii() and identifier.isdigit()
    iban_format = len(iban) == 20 and iban.isascii() and iban.isalnum() and iban.startswith("KZ") and iban[2:4].isdigit()
    return {"identifier_format": identifier_format, "identifier_checksum": identifier_format and identifier_checksum(identifier),
            "iban_format": iban_format, "iban_checksum": iban_format and iban_checksum(iban)}
