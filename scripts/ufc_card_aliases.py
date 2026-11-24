"""Shared card-name aliases: map a card's name key to the UFC stats name key."""
from __future__ import annotations

import json
from pathlib import Path

_FILE = Path(__file__).resolve().parents[1] / "data" / "ufc-card-name-aliases.json"


def load_aliases() -> dict:
    try:
        return json.loads(_FILE.read_text()).get("aliases", {})
    except FileNotFoundError:
        return {}


def with_aliases(names: dict) -> dict:
    """Return names (key -> slug) plus alias keys that resolve to the same slug."""
    out = dict(names)
    for alias, target in load_aliases().items():
        if alias not in out and target in names:
            out[alias] = names[target]
    return out
