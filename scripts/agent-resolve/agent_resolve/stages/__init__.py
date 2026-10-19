"""
Pipeline stages (`agent_resolve.stages`).
"""

from __future__ import annotations

from agent_resolve.stages.stage_0_diagnose import stage_0_diagnose
from agent_resolve.stages.stage_1_plan import stage_1_plan
from agent_resolve.stages.stage_2_red import stage_2_red
from agent_resolve.stages.stage_3_green import stage_3_green

__all__: list[str] = [
    "stage_0_diagnose",
    "stage_1_plan",
    "stage_2_red",
    "stage_3_green",
]
