"""Admin CRUD + lifecycle endpoints for surveys ("enkäter")."""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Response, status

from app.auth import CurrentUser
from app.dal.postgres_repository import PostgresRepository
from app.dependencies import get_repository, require_admin, require_editor
from app.schemas.survey import (
    REPORT_SLOTS,
    SurveyCreate,
    SurveyLaunchRequest,
    SurveyRead,
    SurveyStatus,
    SurveySummary,
    SurveyUpdate,
)
from app.schemas.survey_logic import (
    questions_differ_beyond_reports,
    validate_branch_targets,
    validate_report_definitions,
)
from app.schemas.published_report import PublishedReportSummary, PublishReportRequest
from app.schemas.survey_response import ManualRecipientAdd, RecipientAssign, SurveyResponseSummary
from app.services.survey_export import build_responses_csv, export_filename
from app.services.survey_report import available_reports, compile_report, report_questions

router = APIRouter(prefix="/surveys", tags=["surveys"])


def _get_pg_repo() -> PostgresRepository:
    repo = get_repository()
    if not isinstance(repo, PostgresRepository):
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Enkäter kräver PostgreSQL-backend",
        )
    return repo


async def _get_survey_or_404(repo: PostgresRepository, survey_id: UUID):
    row = await repo.get_survey(survey_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Enkäten hittades inte")
    return row


def _validate_report_number(number: int) -> None:
    if number not in REPORT_SLOTS:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Rapporten finns inte — giltiga nummer är {REPORT_SLOTS[0]}–{REPORT_SLOTS[-1]}",
        )


def _reject_random_kind(survey) -> None:
    if survey.kind == "random_system":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Slumpenkäter väljer mottagare automatiskt vid inloggning",
        )


@router.get("", response_model=list[SurveySummary])
async def list_surveys(
    status_filter: SurveyStatus | None = Query(None, alias="status"),
    _user: CurrentUser = Depends(require_editor),
) -> list[SurveySummary]:
    repo = _get_pg_repo()
    rows = await repo.list_surveys(status=status_filter)
    return [SurveySummary.model_validate(r) for r in rows]


@router.post("", response_model=SurveyRead, status_code=status.HTTP_201_CREATED)
async def create_survey(
    data: SurveyCreate,
    user: CurrentUser = Depends(require_editor),
) -> SurveyRead:
    repo = _get_pg_repo()
    questions = [q.model_dump() for q in data.questions]
    reports = [r.model_dump() for r in data.reports]
    try:
        validate_branch_targets(questions)
        validate_report_definitions(questions, reports, REPORT_SLOTS)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    row = await repo.create_survey(
        title=data.title,
        description=data.description,
        kind=data.kind,
        target_node_type=data.target_node_type,
        target_attribute_key=data.target_attribute_key,
        questions=questions,
        reports=reports,
        allow_multiple_responses=data.allow_multiple_responses,
        due_date=data.due_date,
        include_decommissioned=data.include_decommissioned,
        created_by=user.email or user.name or None,
    )
    return SurveyRead.model_validate(row)


@router.get("/{survey_id}", response_model=SurveyRead)
async def get_survey(
    survey_id: UUID,
    _user: CurrentUser = Depends(require_editor),
) -> SurveyRead:
    repo = _get_pg_repo()
    row = await repo.get_survey(survey_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Enkäten hittades inte")
    return SurveyRead.model_validate(row)


@router.patch("/{survey_id}", response_model=SurveyRead)
async def update_survey(
    survey_id: UUID,
    data: SurveyUpdate,
    user: CurrentUser = Depends(require_editor),
) -> SurveyRead:
    repo = _get_pg_repo()
    existing = await repo.get_survey(survey_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Enkäten hittades inte")

    target_changed = (
        (data.target_node_type is not None and data.target_node_type != existing.target_node_type)
        or (data.target_attribute_key is not None and data.target_attribute_key != existing.target_attribute_key)
    )
    if target_changed and existing.status != "draft":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mål (objekttyp/attribut) kan bara ändras medan enkäten är ett utkast",
        )

    # Questions may keep being edited after launch/partial-launch — only lock
    # them once someone has actually answered, so early test-recipients don't
    # freeze the question set while it's still being refined. Report tags are
    # exempt: they describe how answers are read afterwards, not what was
    # asked, so they stay editable on a survey that is already collecting.
    incoming_questions = (
        [q.model_dump() for q in data.questions] if data.questions is not None else None
    )
    if incoming_questions is not None and await repo.survey_has_submitted_responses(survey_id):
        if questions_differ_beyond_reports(existing.questions or [], incoming_questions):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Frågor kan inte längre ändras eftersom svar redan har skickats in",
            )

    incoming_reports = (
        [r.model_dump() for r in data.reports] if data.reports is not None else None
    )
    if incoming_questions is not None or incoming_reports is not None:
        questions_for_check = (
            incoming_questions if incoming_questions is not None else (existing.questions or [])
        )
        reports_for_check = (
            incoming_reports if incoming_reports is not None else (existing.reports or [])
        )
        try:
            if incoming_questions is not None:
                validate_branch_targets(incoming_questions)
            validate_report_definitions(questions_for_check, reports_for_check, REPORT_SLOTS)
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    row = await repo.update_survey(
        survey_id,
        title=data.title,
        description=data.description,
        target_node_type=data.target_node_type,
        target_attribute_key=data.target_attribute_key,
        questions=incoming_questions,
        reports=incoming_reports,
        status=data.status,
        allow_multiple_responses=data.allow_multiple_responses,
        due_date=data.due_date,
        set_due_date="due_date" in data.model_fields_set,
        include_decommissioned=data.include_decommissioned,
        updated_by=user.email or user.name or None,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Enkäten hittades inte")
    return SurveyRead.model_validate(row)


@router.delete("/{survey_id}")
async def delete_survey(
    survey_id: UUID,
    _user: CurrentUser = Depends(require_admin),
) -> Response:
    """Admin-only: deleting a survey cascades to every answer it collected."""
    repo = _get_pg_repo()
    if not await repo.delete_survey(survey_id):
        raise HTTPException(status_code=404, detail="Enkäten hittades inte")
    return Response(status_code=204)


@router.post("/{survey_id}/resolve-recipients", response_model=list[SurveyResponseSummary])
async def resolve_recipients(
    survey_id: UUID,
    _user: CurrentUser = Depends(require_editor),
) -> list[SurveyResponseSummary]:
    repo = _get_pg_repo()
    survey = await _get_survey_or_404(repo, survey_id)
    _reject_random_kind(survey)
    await repo.resolve_survey_recipients(survey_id)
    rows = await repo.list_survey_responses(survey_id=survey_id)
    return [SurveyResponseSummary.model_validate(r) for r in rows]


@router.post("/{survey_id}/responses/manual", response_model=SurveyResponseSummary, status_code=status.HTTP_201_CREATED)
async def add_manual_recipient(
    survey_id: UUID,
    data: ManualRecipientAdd,
    _user: CurrentUser = Depends(require_editor),
) -> SurveyResponseSummary:
    """Add a recipient directly — optionally mapped to a specific object
    (e.g. a process), or with no object at all for a general send-out."""
    repo = _get_pg_repo()
    survey = await _get_survey_or_404(repo, survey_id)
    _reject_random_kind(survey)
    row = await repo.add_manual_survey_response(survey_id, data.user_id, data.node_id)
    rows = await repo.list_survey_responses(survey_id=survey_id)
    match = next((r for r in rows if r["id"] == row.id), None)
    if match is None:
        raise HTTPException(status_code=404, detail="Svaret hittades inte")
    return SurveyResponseSummary.model_validate(match)


@router.get("/{survey_id}/responses", response_model=list[SurveyResponseSummary])
async def list_survey_responses(
    survey_id: UUID,
    _user: CurrentUser = Depends(require_editor),
) -> list[SurveyResponseSummary]:
    repo = _get_pg_repo()
    rows = await repo.list_survey_responses(survey_id=survey_id)
    return [SurveyResponseSummary.model_validate(r) for r in rows]


@router.get("/{survey_id}/responses/export")
async def export_survey_responses(
    survey_id: UUID,
    _user: CurrentUser = Depends(require_editor),
) -> Response:
    """Download the answered responses as a spreadsheet-friendly CSV."""
    repo = _get_pg_repo()
    survey = await _get_survey_or_404(repo, survey_id)
    rows = await repo.list_survey_responses(survey_id=survey_id)

    # Unanswered slots carry no data — exporting them would just be noise.
    answered = [r for r in rows if r["status"] in ("submitted", "reviewed")]
    epoch = datetime.min.replace(tzinfo=timezone.utc)
    answered.sort(key=lambda r: ((r.get("node_name") or "").lower(), r.get("submitted_at") or epoch))

    node_names = await _node_names_for(repo, survey.questions or [])
    csv_text = build_responses_csv(survey, answered, node_names)
    filename = export_filename(survey.title, datetime.now(timezone.utc))
    return Response(
        # BOM so Excel reads it as UTF-8 rather than latin-1.
        content=("\ufeff" + csv_text).encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


async def _node_names_for(repo: PostgresRepository, questions: list[dict]) -> dict[str, str]:
    """Node id → name, but only when a question actually stores node ids."""
    if not any(q.get("type") == "system_picker" for q in questions):
        return {}
    return {str(n.id): n.name for n in await repo.list_nodes(limit=100_000)}


@router.get("/{survey_id}/reports")
async def list_survey_reports(
    survey_id: UUID,
    _user: CurrentUser = Depends(require_editor),
) -> list[dict]:
    """Report slots in use on this survey, with how many answers each covers."""
    repo = _get_pg_repo()
    survey = await _get_survey_or_404(repo, survey_id)
    rows = await repo.list_survey_responses(survey_id=survey_id)
    return available_reports(survey, rows)


@router.get("/{survey_id}/reports/{number}")
async def get_survey_report(
    survey_id: UUID,
    number: int,
    _user: CurrentUser = Depends(require_editor),
) -> dict:
    repo = _get_pg_repo()
    survey = await _get_survey_or_404(repo, survey_id)
    _validate_report_number(number)
    rows = await repo.list_survey_responses(survey_id=survey_id)
    node_names = await _node_names_for(repo, report_questions(survey, number))
    return compile_report(survey, rows, node_names, number)


@router.post(
    "/{survey_id}/reports/{number}/publish",
    response_model=PublishedReportSummary,
    status_code=status.HTTP_201_CREATED,
)
async def publish_survey_report(
    survey_id: UUID,
    number: int,
    data: PublishReportRequest | None = Body(default=None),
    user: CurrentUser = Depends(require_editor),
) -> PublishedReportSummary:
    """Freeze the report as it looks right now and list it under "Rapporter".

    Publishing the same report again adds a new edition rather than replacing
    the old one — the point of a published report is that it keeps saying what
    it said on its date, even as more answers arrive.
    """
    from app.api.v1.published_reports import to_summary

    repo = _get_pg_repo()
    survey = await _get_survey_or_404(repo, survey_id)
    _validate_report_number(number)
    rows = await repo.list_survey_responses(survey_id=survey_id)
    node_names = await _node_names_for(repo, report_questions(survey, number))
    report = compile_report(survey, rows, node_names, number)

    published = await repo.create_published_report(
        survey_id=survey_id,
        survey_title=survey.title,
        report_number=number,
        name=((data.name if data else None) or "").strip() or report["name"],
        payload=report,
        published_by=user.email or user.name or None,
    )
    return PublishedReportSummary(**to_summary(published))


@router.get("/{survey_id}/reports/{number}/export")
async def export_survey_report(
    survey_id: UUID,
    number: int,
    format: str = Query("csv", pattern="^(csv|pdf)$"),
    _user: CurrentUser = Depends(require_editor),
) -> Response:
    """Download one report as CSV or PDF."""
    repo = _get_pg_repo()
    survey = await _get_survey_or_404(repo, survey_id)
    _validate_report_number(number)
    questions = report_questions(survey, number)
    rows = await repo.list_survey_responses(survey_id=survey_id)
    node_names = await _node_names_for(repo, questions)
    report = compile_report(survey, rows, node_names, number)
    now = datetime.now(timezone.utc)
    stem = f"{survey.title} {report['name']}"

    if format == "pdf":
        from app.services.pdf.renderer import render_survey_report_pdf

        return Response(
            content=render_survey_report_pdf(report),
            media_type="application/pdf",
            headers={
                "Content-Disposition":
                    f'attachment; filename="{export_filename(stem, now, prefix="rapport", extension="pdf")}"',
            },
        )

    matching_ids = {r["response_id"] for r in report["rows"]}
    matching = [r for r in rows if str(r["id"]) in matching_ids]
    matching.sort(key=lambda r: (r.get("node_name") or "").lower())
    csv_text = build_responses_csv(
        survey, matching, node_names, questions=questions, anonymous=report["anonymous"]
    )
    return Response(
        content=("\ufeff" + csv_text).encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition":
                f'attachment; filename="{export_filename(stem, now, prefix="rapport")}"',
        },
    )


@router.patch("/{survey_id}/responses/{response_id}/assign", response_model=SurveyResponseSummary)
async def assign_response_recipient(
    survey_id: UUID,
    response_id: UUID,
    data: RecipientAssign,
    _user: CurrentUser = Depends(require_editor),
) -> SurveyResponseSummary:
    repo = _get_pg_repo()
    row = await repo.assign_survey_response_user(response_id, data.user_id)
    if row is None or row.survey_id != survey_id:
        raise HTTPException(status_code=404, detail="Svaret hittades inte")
    rows = await repo.list_survey_responses(survey_id=survey_id)
    match = next((r for r in rows if r["id"] == response_id), None)
    if match is None:
        raise HTTPException(status_code=404, detail="Svaret hittades inte")
    return SurveyResponseSummary.model_validate(match)


@router.patch("/{survey_id}/responses/{response_id}/review", response_model=SurveyResponseSummary)
async def review_response(
    survey_id: UUID,
    response_id: UUID,
    user: CurrentUser = Depends(require_editor),
) -> SurveyResponseSummary:
    repo = _get_pg_repo()
    try:
        row = await repo.review_survey_response(response_id, reviewed_by=user.email or user.name or None)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    if row is None or row.survey_id != survey_id:
        raise HTTPException(status_code=404, detail="Svaret hittades inte")
    rows = await repo.list_survey_responses(survey_id=survey_id)
    match = next((r for r in rows if r["id"] == response_id), None)
    if match is None:
        raise HTTPException(status_code=404, detail="Svaret hittades inte")
    return SurveyResponseSummary.model_validate(match)


@router.delete("/{survey_id}/responses/{response_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_response(
    survey_id: UUID,
    response_id: UUID,
    _user: CurrentUser = Depends(require_editor),
) -> Response:
    repo = _get_pg_repo()
    rows = await repo.list_survey_responses(survey_id=survey_id)
    if not any(r["id"] == response_id for r in rows):
        raise HTTPException(status_code=404, detail="Svaret hittades inte")
    await repo.delete_survey_response(response_id)
    return Response(status_code=204)


@router.post("/{survey_id}/launch")
async def launch_survey(
    survey_id: UUID,
    data: SurveyLaunchRequest | None = Body(default=None),
    _user: CurrentUser = Depends(require_editor),
) -> dict[str, int]:
    repo = _get_pg_repo()
    survey = await _get_survey_or_404(repo, survey_id)
    _reject_random_kind(survey)
    if survey.status == "paused":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Enkäten är pausad — återuppta den innan du lanserar till fler mottagare",
        )
    response_ids = data.response_ids if data else None
    try:
        return await repo.launch_survey(survey_id, response_ids=response_ids)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/{survey_id}/close", response_model=SurveyRead)
async def close_survey(
    survey_id: UUID,
    _user: CurrentUser = Depends(require_editor),
) -> SurveyRead:
    repo = _get_pg_repo()
    row = await repo.close_survey(survey_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Enkäten hittades inte")
    return SurveyRead.model_validate(row)
