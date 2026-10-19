"""Branch walking for conditional question flow — incl. multi-select answers."""
from app.schemas.survey_logic import END_SURVEY, compute_visible_question_ids

QUESTIONS = [
    {
        "id": "q1",
        "type": "multiple_choice",
        "label": "Vilka områden berörs?",
        "options": ["Ekonomi", "HR", "IT"],
        "allow_multiple": True,
        "branches": [
            {"op": "eq", "value": "Ekonomi", "goto": "q_ekonomi"},
            {"op": "eq", "value": "HR", "goto": "q_hr"},
        ],
        "default_goto": "q_slut",
    },
    {"id": "q_ekonomi", "type": "text", "label": "Ekonomifråga", "default_goto": "q_slut"},
    {"id": "q_hr", "type": "text", "label": "HR-fråga", "default_goto": "q_slut"},
    {"id": "q_slut", "type": "text", "label": "Avslutande fråga", "default_goto": END_SURVEY},
]


def test_unanswered_branching_question_stops_walk():
    visible, ended = compute_visible_question_ids(QUESTIONS, {})
    assert visible == ["q1"]
    assert ended is False


def test_multiselect_answer_containing_option_follows_its_branch():
    visible, ended = compute_visible_question_ids(QUESTIONS, {"q1": ["HR"]})
    assert visible == ["q1", "q_hr", "q_slut"]
    assert ended is True


def test_multiselect_first_matching_rule_wins():
    visible, _ = compute_visible_question_ids(QUESTIONS, {"q1": ["HR", "Ekonomi"]})
    assert visible == ["q1", "q_ekonomi", "q_slut"]


def test_multiselect_no_matching_rule_uses_default_goto():
    visible, ended = compute_visible_question_ids(QUESTIONS, {"q1": ["IT"]})
    assert visible == ["q1", "q_slut"]
    assert ended is True


def test_single_select_list_answer_matches_eq_rule():
    # Single-select multiple_choice answers are stored as one-element lists.
    visible, _ = compute_visible_question_ids(QUESTIONS, {"q1": ["Ekonomi"]})
    assert visible == ["q1", "q_ekonomi", "q_slut"]
