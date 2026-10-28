import pytest

from app.services.result_service import clean_markdown, extract_sources, split_sections
from app.tools.builtin_tools import FetchWebpageTool, safe_eval


def test_split_sections_uses_real_headings():
    title, sections = split_sections("# Title\n\nIntro text\n\n## Risks\n- a\n\n---\n\n## Next steps\n1. b")
    assert title == "Title"
    assert [(s.title, s.kind) for s in sections] == [
        ("Overview", "intro"), ("Risks", "risks"), ("Next steps", "recommendations")]
    assert sections[1].markdown == "- a"


def test_plain_text_becomes_single_section():
    title, sections = split_sections("Just some text without headings.")
    assert title is None and len(sections) == 1 and sections[0].title == "Report"


def test_headings_inside_code_blocks_ignored():
    _, sections = split_sections("## A\n```\n## not a heading\n```\n## B\nx")
    assert [s.title for s in sections] == ["A", "B"]


def test_clean_markdown_strips_wrapping_fence():
    assert clean_markdown("```markdown\n# Hi\n```") == "# Hi"
    assert clean_markdown("# Hi") == "# Hi"


def test_extract_sources_only_real_links():
    srcs = extract_sources(["See [Doc](https://a.com/x). Also https://b.org/y, done."])
    assert [(s.label, s.url) for s in srcs] == [("Doc", "https://a.com/x"), ("https://b.org/y", "https://b.org/y")]
    assert extract_sources(["no links here"]) == []


def test_calculator_is_safe():
    assert safe_eval("(1200 * 0.05) / 12") == 5.0
    for bad in ("__import__('os')", "a + 1", "2 ** 1000", "[1,2]"):
        with pytest.raises(Exception):
            safe_eval(bad)


@pytest.mark.parametrize("url", ["http://localhost:8000/api", "http://127.0.0.1/", "file:///etc/passwd",
                                 "http://169.254.169.254/latest/meta-data"])
def test_fetch_tool_blocks_local_targets(url):
    assert FetchWebpageTool()._run(url).startswith("Error")
