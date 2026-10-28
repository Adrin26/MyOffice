"""Guards that the refactor of learn_crewai.py preserved the original workflow."""
import importlib

import pytest
from crewai import Agent, Process, Task

import learn_crewai


def test_import_does_not_require_api_key(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    importlib.reload(learn_crewai)


def test_legacy_globals_require_api_key(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    mod = importlib.reload(learn_crewai)
    with pytest.raises(RuntimeError, match="OPENAI_API_KEY"):
        _ = mod.research_crew


def test_crew_structure_matches_original():
    crew = learn_crewai.build_crew(llm="gpt-4o-mini")
    assert crew.process == Process.sequential
    assert [a.role for a in crew.agents] == ["Researcher", "Business Analyst", "Report Writer"]
    assert [t.agent.role for t in crew.tasks] == ["Researcher", "Business Analyst", "Report Writer"]
    for agent in crew.agents:
        assert agent.allow_delegation is False
        assert agent.tools == []
    assert crew.tasks[2].output_file == "report.md"
    assert crew.tasks[0].output_file is None and crew.tasks[1].output_file is None


def test_prompt_text_preserved_with_spacing_fixes():
    agents = learn_crewai.build_agents(llm="gpt-4o-mini")
    tasks = learn_crewai.build_tasks(agents)
    assert agents["researcher"].goal == "To identify important ideas, opportunities, and risks about {topic}"
    assert "readers who need actionable" in agents["writer"].backstory
    assert tasks["research"].expected_output.endswith("opportunities, risk, and uncertainties.")
    assert "strongest insights, practical implications, major trade-offs, and recommendations." in tasks["analysis"].description
    assert tasks["writing"].description.startswith("Using the preceding research and analysis, write a report about {topic}.")


def test_default_model_from_env(monkeypatch):
    monkeypatch.setenv("OPENAI_MODEL", "gpt-4.1-mini")
    agents = learn_crewai.build_agents()
    assert agents["writer"].llm.model == "gpt-4.1-mini"


def test_per_agent_models():
    agents = learn_crewai.build_agents(llm="gpt-4o-mini", agent_llms={"researcher": "ollama/qwen2.5:7b"})
    assert agents["researcher"].llm.model == "qwen2.5:7b"
    assert agents["researcher"].llm.provider == "ollama"
    assert agents["analyst"].llm.model == "gpt-4o-mini"


def test_extras_are_appended_after_original_pipeline():
    extra_agent = Agent(role="Extra", goal="Extra goal", backstory="Extra story", llm="gpt-4o-mini")
    extra_task = Task(description="Extra {topic}", expected_output="x", agent=extra_agent)
    crew = learn_crewai.build_crew(llm="gpt-4o-mini", extra_agents=[extra_agent], extra_tasks=[extra_task])
    assert [t.agent.role for t in crew.tasks] == ["Researcher", "Business Analyst", "Report Writer", "Extra"]


def test_each_build_returns_fresh_objects():
    a, b = learn_crewai.build_crew(llm="gpt-4o-mini"), learn_crewai.build_crew(llm="gpt-4o-mini")
    assert a is not b and a.tasks[0] is not b.tasks[0] and a.agents[0] is not b.agents[0]
