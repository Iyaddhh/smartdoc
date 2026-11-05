import pytest

from app.core.page_ranges import parse_page_ranges


@pytest.mark.parametrize("expression,expected", [
    ("1", [0]), ("1-3,5", [0, 1, 2, 4]),
    (" 2 - 4 , 2,1 ", [0, 1, 2, 3]),
])
def test_valid_page_selection(expression, expected):
    assert parse_page_ranges(expression, 5) == expected


@pytest.mark.parametrize("expression", ["", "0", "1-6", "4-2", "1,bad", "1,", "-1", "1-2-3"])
def test_invalid_page_selection_is_rejected_as_a_whole(expression):
    with pytest.raises(ValueError, match="tidak valid"):
        parse_page_ranges(expression, 5)
