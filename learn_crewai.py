import os
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from crewai import Agent, Crew, Process, Task

load_dotenv()
load_dotenv(Path(__file__).parent / "ai_research_team" / ".env")

DEFAULT_MODEL = "gpt-4o-mini"
REPORT_FILE = "report.md"
MODEL = os.getenv("OPENAI_MODEL", DEFAULT_MODEL)


def require_api_key() -> None:
    # Local Ollama models ("ollama/qwen2.5:7b") need no OpenAI key.
    if not os.getenv("OPENAI_MODEL", DEFAULT_MODEL).startswith("ollama/") and not os.getenv("OPENAI_API_KEY"):
        raise RuntimeError("Missing OPENAI_API_KEY")


def build_agents(llm: Any = None, agent_llms: Mapping[str, Any] | None = None) -> dict[str, Agent]:
    """Create fresh instances of the three original agents.

    `llm` defaults to the OPENAI_MODEL setting. A model name (e.g. "gpt-4o-mini"
    or "ollama/qwen2.5:7b") or a CrewAI LLM object may be passed.
    `agent_llms` overrides it per agent, keyed by "researcher", "analyst", "writer".
    """
    llm = llm or os.getenv("OPENAI_MODEL", DEFAULT_MODEL)
    agent_llms = agent_llms or {}

    researcher = Agent(
        role = "Researcher",
        goal = "To identify important ideas, opportunities, and risks about {topic}",
        backstory = "You are a careful researcher who separates established facts from assumptions and identifies questions needing verification.",
        llm = agent_llms.get("researcher", llm),
        tools = [],
        verbose=True,
        allow_delegation=False,
    )

    analyst = Agent(
        role = "Business Analyst",
        goal = "Evaluate research findings and produce practical insights.",
        backstory = ("You are a business analyst who compares benefits, risks, "
                     "trade-offs, and implementation challenges."),
        llm = agent_llms.get("analyst", llm),
        tools = [],
        verbose=True,
        allow_delegation=False,
    )

    writer = Agent(
        role="Report Writer",
        goal="Produce a clear, structured, useful final report.",
        backstory=(
            "You write concise professional reports for readers who "
            "need actionable recommendations rather than jargon"
        ),
        llm=agent_llms.get("writer", llm),
        tools=[],
        verbose=True,
        allow_delegation=False,
    )

    return {"researcher": researcher, "analyst": analyst, "writer": writer}


def build_tasks(agents: dict[str, Agent], output_file: str = REPORT_FILE) -> dict[str, Task]:
    """Create fresh instances of the three original tasks, in execution order."""
    research_task = Task(
        description=(
            "Research the topic: {topic}\n\n"
            "Identify the main concepts, potential opportunities, risks, "
            "and unanswered questions. Do not invent statistics or "
            "pretend you have verified current facts."
        ),
        expected_output=(
            "A structured research brief covering key ideas, opportunities, "
            "risk, and uncertainties."
        ),
        agent = agents["researcher"],
    )

    analysis_task=Task(
        description=(
            "Evaluate the research brief for {topic}. Identify the strongest "
            "insights, practical implications, major trade-offs, and "
            "recommendations. Distinguish evidence from assumptions."
        ),
        expected_output=(
            "An analytical brief with prioritized insights, risks, "
            "and actionable recommendations."
        ),
        agent=agents["analyst"],
    )

    writing_task = Task(
        description=(
            "Using the preceding research and analysis, write a report about "
            "{topic}. Include an executive summary, opportunities, risks, "
            "recommendations, and item requiring further verifications. "
            "Keep the report clear and avoid unsupported factual claims."
        ),
        expected_output=(
            "A polished Markdown report suitable for a business reader"
        ),
        agent=agents["writer"],
        output_file=output_file,
    )

    return {"research": research_task, "analysis": analysis_task, "writing": writing_task}


def build_crew(
    llm: Any = None,
    output_file: str = REPORT_FILE,
    extra_agents: Sequence[Agent] = (),
    extra_tasks: Sequence[Task] = (),
    agent_llms: Mapping[str, Any] | None = None,
) -> Crew:
    """Build a fresh research crew.

    `extra_agents` / `extra_tasks` are appended after the original pipeline,
    so the original three tasks always run first and unchanged.
    """
    agents = build_agents(llm, agent_llms)
    tasks = build_tasks(agents, output_file=output_file)
    return Crew(
        agents=[*agents.values(), *extra_agents],
        tasks=[*tasks.values(), *extra_tasks],
        process=Process.sequential,
        verbose=True,
    )


_LEGACY_NAMES = {
    "researcher", "analyst", "writer",
    "research_task", "analysis_task", "writing_task",
    "research_crew",
}
_legacy: dict[str, Any] = {}


def __getattr__(name: str) -> Any:
    # Module-level objects from the original script, built on first access so
    # that importing this module never requires an API key.
    if name not in _LEGACY_NAMES:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    if not _legacy:
        require_api_key()
        crew = build_crew()
        _legacy.update(
            researcher=crew.agents[0], analyst=crew.agents[1], writer=crew.agents[2],
            research_task=crew.tasks[0], analysis_task=crew.tasks[1], writing_task=crew.tasks[2],
            research_crew=crew,
        )
    return _legacy[name]


if __name__ == "__main__":
    require_api_key()
    research_crew = build_crew()

    topic = input("What topic should the AI team research? ").strip()

    if not topic:
        raise ValueError("Please enter a topic.")
    
    result = research_crew.kickoff(inputs={"topic": topic})

    print("\n======= FINAL REPORT =======\n")
    print(result)
    print("\nReport saved to report.md")
