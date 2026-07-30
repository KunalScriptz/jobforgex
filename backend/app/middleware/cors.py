import re
from starlette.middleware.cors import CORSMiddleware


class WildcardCORSMiddleware(CORSMiddleware):
    def __init__(self, app, **kwargs):
        origin_strs = kwargs.pop("allow_origins", [])
        self._wildcards = []
        literals = []
        for o in origin_strs:
            if "*" in o:
                self._wildcards.append(re.compile(re.escape(o).replace(r"\*", r".*")))
            else:
                literals.append(o)
        super().__init__(app, allow_origins=literals, **kwargs)

    def is_allowed_origin(self, origin: str) -> bool:
        if super().is_allowed_origin(origin):
            return True
        for pat in self._wildcards:
            if pat.fullmatch(origin or ""):
                return True
        return False
