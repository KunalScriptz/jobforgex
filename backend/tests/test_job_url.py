"""URL normalisation, hashing and source detection (pure; no database)."""
import pytest

from app.services import job_url
from app.services.job_url import content_hash, detect_source, normalize_url, url_hash


@pytest.mark.parametrize(
    "a, b",
    [
        # tracking noise, www, fragment, trailing slash and case never matter
        ("https://www.Example.com/jobs/123/?utm_source=x&utm_medium=y#apply", "example.com/jobs/123"),
        ("https://example.com/jobs/123?ref=abc&trk=foo", "https://example.com/jobs/123"),
        ("HTTP://EXAMPLE.COM//jobs//123/", "https://example.com/jobs/123"),
        # query order is irrelevant, identifying params are kept
        ("https://example.com/job?id=5&lang=en", "https://example.com/job?lang=en&id=5"),
        # LinkedIn: slug, locale subdomain and search-pane URLs all collapse to the job id
        ("https://www.linkedin.com/jobs/view/senior-engineer-at-acme-3812345678?trackingId=zzz", "https://linkedin.com/jobs/view/3812345678/"),
        ("https://in.linkedin.com/jobs/view/3812345678", "https://linkedin.com/jobs/view/3812345678"),
        ("https://www.linkedin.com/jobs/search/?currentJobId=3812345678&keywords=python", "https://linkedin.com/jobs/view/3812345678"),
        # Indeed: only the job key identifies the posting
        ("https://in.indeed.com/viewjob?jk=abc123&from=serp&vjs=3", "https://in.indeed.com/rc/clk?jk=abc123"),
        # ATS hosts: the path is the identity, the whole query is noise
        ("https://boards.greenhouse.io/acme/jobs/42?gh_src=foo&utm_campaign=x", "https://boards.greenhouse.io/acme/jobs/42"),
    ],
)
def test_same_posting_hashes_the_same(a, b):
    assert url_hash(a) == url_hash(b) is not None


@pytest.mark.parametrize(
    "a, b",
    [
        ("https://example.com/jobs/123", "https://example.com/jobs/124"),
        ("https://example.com/job?id=5", "https://example.com/job?id=6"),
        ("https://in.indeed.com/viewjob?jk=abc123", "https://in.indeed.com/viewjob?jk=abc124"),
        ("https://www.linkedin.com/jobs/view/3812345678", "https://www.linkedin.com/jobs/view/3812345679"),
        # same path on different hosts is a different job
        ("https://a.example.com/jobs/1", "https://b.example.com/jobs/1"),
        # Greenhouse's gh_jid on a company careers page identifies the job
        ("https://careers.acme.com/open?gh_jid=111", "https://careers.acme.com/open?gh_jid=222"),
    ],
)
def test_different_postings_are_never_merged(a, b):
    assert url_hash(a) != url_hash(b)


@pytest.mark.parametrize("raw", [None, "", "   ", "javascript:alert(1)", "mailto:a@b.co", "chrome://extensions", "not a url", "http://localhost/x"])
def test_unusable_urls_have_no_hash(raw):
    assert normalize_url(raw) is None
    assert url_hash(raw) is None


def test_hash_is_a_64_char_hex_digest():
    h = url_hash("https://example.com/jobs/1")
    assert len(h) == 64 and int(h, 16) >= 0


@pytest.mark.parametrize(
    "url, expected",
    [
        (None, "manual"),
        ("", "manual"),
        ("https://www.linkedin.com/jobs/view/3812345678", "linkedin"),
        ("https://in.indeed.com/viewjob?jk=abc", "indeed"),
        ("https://uk.indeed.com/viewjob?jk=abc", "indeed"),
        ("https://www.glassdoor.co.in/job-listing/x", "glassdoor"),
        ("https://my.jobstreet.com/job/123", "jobstreet"),
        ("https://www.jobstreet.com.my/en/job/123", "jobstreet"),
        ("https://www.naukri.com/job-listings-x", "naukri"),
        ("https://boards.greenhouse.io/acme/jobs/42", "greenhouse"),
        ("https://jobs.lever.co/acme/abc", "lever"),
        ("https://jobs.ashbyhq.com/acme/abc", "ashby"),
        ("https://acme.wd5.myworkdayjobs.com/en-US/careers/job/x", "workday"),
        ("https://wellfound.com/jobs/1", "wellfound"),
        ("https://careers.acme.com/open/1", "web"),
        ("https://acme.com/careers", "web"),
    ],
)
def test_source_is_detected_from_the_url(url, expected):
    assert detect_source(url) == expected


def test_source_hint_is_only_trusted_for_known_boards():
    plain = "https://careers.acme.com/open/1"
    assert detect_source(plain, "linkedin") == "linkedin"
    assert detect_source(plain, "  Indeed ") == "indeed"
    assert detect_source(plain, "careers.acme.com") == "web"        # arbitrary hostname: ignored
    assert detect_source(plain, "<script>") == "web"
    assert detect_source(plain, "manual") == "web"                  # can't claim to be manual
    # ...and the URL always wins over the hint
    assert detect_source("https://www.linkedin.com/jobs/view/3812345678", "indeed") == "linkedin"
    assert detect_source(None, "linkedin") == "manual"


def test_content_hash_ignores_case_punctuation_and_secondary_location():
    a = content_hash("Acme, Inc.", "Senior Python Engineer", "Bengaluru, Karnataka, India")
    b = content_hash("acme inc", "senior  python engineer!", "bengaluru")
    assert a == b
    assert a != content_hash("Acme Inc", "Senior Python Engineer", "Mumbai")
    assert a != content_hash("Acme Inc", "Staff Python Engineer", "Bengaluru")


def test_known_sources_include_everything_detect_can_return():
    for url in ("https://www.linkedin.com/jobs/view/3812345678", "https://in.indeed.com/x", "https://jobs.lever.co/a/b"):
        assert detect_source(url) in job_url.KNOWN_SOURCES
