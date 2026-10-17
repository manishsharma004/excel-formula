"""Host errors (spec §10). Spreadsheet errors are values, not exceptions."""


class EvaluationError(Exception):
    def __init__(self, kind: str, message: str) -> None:
        super().__init__(message)
        self.kind = kind


def host(kind: str, message: str) -> None:
    raise EvaluationError(kind, message)
