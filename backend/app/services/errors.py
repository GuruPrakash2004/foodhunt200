"""Turn nested exception groups (from asyncio TaskGroups) into readable one-line causes."""


def leaves(error: BaseException) -> list[BaseException]:
    if isinstance(error, BaseExceptionGroup):
        return [leaf for sub in error.exceptions for leaf in leaves(sub)]
    return [error]


def describe(error: BaseException) -> str:
    """e.g. 'ClientError: 429 RESOURCE_EXHAUSTED ...' instead of 'unhandled errors in a TaskGroup (1 sub-exception)'."""
    seen: list[str] = []
    for leaf in leaves(error):
        text = f"{type(leaf).__name__}: {str(leaf)[:300]}".rstrip(": ")
        if text not in seen:
            seen.append(text)
    return " | ".join(seen)
