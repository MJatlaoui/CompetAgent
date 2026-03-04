from typing import Protocol, runtime_checkable
from typing import TypedDict


class FeedItem(TypedDict):
    id: str
    competitor: str
    title: str
    url: str
    summary: str
    published: str


@runtime_checkable
class SourceAdapter(Protocol):
    def fetch(self, url: str, competitor: str, **kwargs) -> list[FeedItem]:
        ...
