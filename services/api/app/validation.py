import re


DNI_LETTERS = "TRWAGMYFPDXBNJZSQVHLCKE"


def normalize_spanish_person_id(value: str) -> str:
    """Return a normalized DNI/NIE or raise ValueError when its control letter is invalid."""
    normalized = re.sub(r"[\s-]+", "", value or "").upper()
    if re.fullmatch(r"\d{8}[A-Z]", normalized):
        number = int(normalized[:8])
        expected_letter = DNI_LETTERS[number % 23]
    elif re.fullmatch(r"[XYZ]\d{7}[A-Z]", normalized):
        prefix_value = {"X": "0", "Y": "1", "Z": "2"}[normalized[0]]
        number = int(prefix_value + normalized[1:8])
        expected_letter = DNI_LETTERS[number % 23]
    else:
        raise ValueError("El DNI/NIE debe tener un formato válido")

    if normalized[-1] != expected_letter:
        raise ValueError("La letra de control del DNI/NIE no es válida")
    return normalized
