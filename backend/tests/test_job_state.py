"""The job status state machine (pure; the DB session is a stub)."""
import asyncio
from datetime import date, datetime, timedelta, timezone

import pytest

from app.models.job import Job, JobStatus
from app.services import job_state
from app.services.job_state import TransitionNotAllowed, can_transition, change_status, set_date_applied

NOW = datetime(2026, 10, 5, 9, 30, tzinfo=timezone.utc)


class StubDB:
    def __init__(self):
        self.added = []

    def add(self, obj):
        self.added.append(obj)

    async def flush(self):
        pass


def make_job(status="wishlist", **fields) -> Job:
    return Job(id=None, workspace_id=None, company="Acme", title="Engineer", status=status, **fields)


def move(job, to, actor="user", **kw):
    db = StubDB()
    event = asyncio.run(change_status(db, job, to, actor=actor, now=NOW, follow_up_days=7, **kw))
    return event, db


# --------------------------------------------------------------------------- user moves
def test_applying_stamps_dates_and_arms_a_follow_up():
    job = make_job()
    event, db = move(job, "applied")
    assert job.status == "applied"
    assert job.applied_at == NOW and job.date_applied == NOW.date()
    assert job.follow_up_at == date(2026, 10, 12)
    assert job.last_reply_at is None
    assert (event.from_status, event.to_status, event.actor, event.kind) == ("wishlist", "applied", "user", "status_changed")
    assert db.added == [event]


def test_unchanged_status_is_a_no_op():
    job = make_job("applied", applied_at=NOW, follow_up_at=date(2026, 10, 12))
    event, db = move(job, "applied")
    assert event is None and db.added == []


def test_a_reply_status_records_the_reply_and_rearms_the_follow_up():
    job = make_job("applied", applied_at=NOW - timedelta(days=3), follow_up_at=date(2026, 10, 9))
    move(job, "acknowledged")
    assert job.last_reply_at == NOW
    assert job.follow_up_at == date(2026, 10, 12)


def test_interview_is_stamped_once():
    job = make_job("screening", applied_at=NOW - timedelta(days=9))
    move(job, "interview")
    first = job.interview_at
    assert first == NOW
    move(job, "screening")
    later = NOW + timedelta(days=1)
    asyncio.run(change_status(StubDB(), job, "interview", now=later, follow_up_days=7))
    assert job.interview_at == first  # the original interview date is not overwritten


def test_jumping_straight_to_a_late_stage_still_counts_as_applied():
    job = make_job()
    move(job, "interview")
    assert job.applied_at == NOW and job.interview_at == NOW and job.last_reply_at == NOW


@pytest.mark.parametrize("terminal", ["offer", "negotiating", "rejected"])
def test_terminal_statuses_clear_the_follow_up(terminal):
    job = make_job("interview", applied_at=NOW, follow_up_at=date(2026, 10, 9))
    move(job, terminal)
    assert job.follow_up_at is None


def test_archiving_a_saved_job_as_rejected_is_not_an_employer_reply():
    job = make_job("wishlist")
    move(job, "rejected")
    assert job.status == "rejected"
    assert job.last_reply_at is None and job.applied_at is None


def test_a_rejection_after_applying_is_a_reply():
    job = make_job("applied", applied_at=NOW - timedelta(days=5))
    move(job, "rejected")
    assert job.last_reply_at == NOW


def test_moving_back_to_saved_unmarks_it_as_applied():
    job = make_job("applied", applied_at=NOW, date_applied=NOW.date(), follow_up_at=date(2026, 10, 12))
    move(job, "wishlist")
    assert job.applied_at is None and job.follow_up_at is None


def test_users_may_move_cards_in_any_direction():
    for a in job_state.ALL_STATUSES:
        for b in job_state.ALL_STATUSES:
            assert can_transition("user", a, b)
            assert can_transition("extension", a, b)


# --------------------------------------------------------------------------- automation
@pytest.mark.parametrize("actor", sorted(job_state.AUTOMATED_ACTORS))
def test_automation_moves_forward_only(actor):
    assert can_transition(actor, "applied", "acknowledged")
    assert can_transition(actor, "applied", "interview")
    assert can_transition(actor, "screening", "offer")
    assert not can_transition(actor, "interview", "screening")  # backwards
    assert not can_transition(actor, "interview", "applied")
    assert not can_transition(actor, "applied", "applied")       # nothing to do


@pytest.mark.parametrize("actor", sorted(job_state.AUTOMATED_ACTORS))
def test_automation_never_touches_saved_or_closed_cards_or_starts_negotiation(actor):
    for target in ("applied", "interview", "rejected"):
        assert not can_transition(actor, "wishlist", target)     # a person decides what was applied to
    for target in ("applied", "interview", "offer"):
        assert not can_transition(actor, "rejected", target)     # closed stays closed
    assert not can_transition(actor, "offer", "negotiating")     # only a person starts negotiating
    assert can_transition(actor, "interview", "rejected")        # but it may record a rejection


def test_a_blocked_automated_move_raises_and_changes_nothing():
    job = make_job("interview", applied_at=NOW)
    with pytest.raises(TransitionNotAllowed):
        move(job, "applied", actor="gmail")
    assert job.status == "interview"


def test_event_records_actor_confidence_and_reference():
    job = make_job("applied", applied_at=NOW)
    event, _ = move(job, "acknowledged", actor="gmail", confidence=0.93, ref_id="msg-1", meta={"why": "subject"})
    assert (event.actor, float(event.confidence), event.ref_id, event.meta) == ("gmail", 0.93, "msg-1", {"why": "subject"})


def test_unknown_status_or_actor_is_rejected():
    job = make_job()
    with pytest.raises(ValueError):
        move(job, "hired")
    with pytest.raises(ValueError):
        move(job, "applied", actor="martian")


def test_enum_members_and_strings_are_interchangeable():
    job = make_job()
    move(job, JobStatus.APPLIED)
    assert job.status == "applied" and type(job.status) is str


# --------------------------------------------------------------------------- date applied
def test_back_dating_an_application_moves_the_follow_up_with_it():
    job = make_job("applied", applied_at=NOW, date_applied=NOW.date(), follow_up_at=date(2026, 10, 12))
    set_date_applied(job, date(2026, 9, 20), follow_up_days=7)
    assert job.date_applied == date(2026, 9, 20)
    assert job.applied_at == datetime(2026, 9, 20, 12, tzinfo=timezone.utc)
    assert job.follow_up_at == date(2026, 9, 27)  # already overdue


def test_setting_a_date_on_a_saved_job_does_not_mark_it_applied():
    job = make_job("wishlist")
    set_date_applied(job, date(2026, 9, 20), follow_up_days=7)
    assert job.date_applied == date(2026, 9, 20)
    assert job.applied_at is None and job.follow_up_at is None
