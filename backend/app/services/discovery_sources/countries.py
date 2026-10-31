"""Countries JobSpy's Indeed / Glassdoor scrapers accept as `country_indeed`.

Kept as a static list so the API never imports JobSpy (and pandas) just to validate a form.
`tests/test_discovery.py` fails if this drifts from the installed JobSpy.
"""

COUNTRIES: tuple[str, ...] = (
    "argentina", "australia", "austria", "bahrain", "belgium", "brazil", "canada", "chile", "china",
    "colombia", "costa rica", "czech republic", "denmark", "ecuador", "egypt", "finland", "france",
    "germany", "greece", "hong kong", "hungary", "india", "indonesia", "ireland", "israel", "italy",
    "japan", "kuwait", "luxembourg", "malaysia", "mexico", "morocco", "netherlands", "new zealand",
    "nigeria", "norway", "oman", "pakistan", "panama", "peru", "philippines", "poland", "portugal",
    "qatar", "romania", "saudi arabia", "singapore", "south africa", "south korea", "spain", "sweden",
    "switzerland", "taiwan", "thailand", "türkiye", "ukraine", "united arab emirates", "uk", "usa",
    "uruguay", "venezuela", "vietnam",
)

# Spellings people type that JobSpy also accepts; normalised to the canonical name above.
ALIASES = {
    "czechia": "czech republic",
    "turkey": "türkiye",
    "uae": "united arab emirates",
    "united kingdom": "uk",
    "us": "usa",
    "united states": "usa",
}


def normalize_country(value: str | None) -> str | None:
    """Canonical country name, or None for blank. Raises ValueError for one JobSpy can't use."""
    name = (value or "").strip().lower()
    if not name:
        return None
    name = ALIASES.get(name, name)
    if name not in COUNTRIES:
        raise ValueError(f"Unsupported country: {value!r}")
    return name
