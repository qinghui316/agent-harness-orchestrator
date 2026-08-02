#!/usr/bin/env python3
# ECL-HARNESS-CONNECTOR
"""Attach or detach this worktree's shared project Harness Skill links."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
from pathlib import Path


SKILL_NAME = "agent-harness-orchestrator-a6ad344cbe4e-harness"
PROJECT_ID = "agent-harness-orchestrator-a6ad344cbe4e"


def git(*args: str, cwd: Path) -> str:
    result = subprocess.run(
        ["git", "-C", str(cwd), *args],
        text=True,
        encoding="utf-8",
        errors="replace",
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "git command failed")
    return result.stdout.strip()


def is_link_like(path: Path) -> bool:
    is_junction = getattr(os.path, "isjunction", None)
    return path.is_symlink() or bool(is_junction and is_junction(path))


def path_exists(path: Path) -> bool:
    return os.path.lexists(path)


def normalized(path: Path) -> str:
    return os.path.normcase(os.path.abspath(path))


def same_target(path: Path, target: Path) -> bool:
    try:
        return normalized(path.resolve(strict=True)) == normalized(target.resolve(strict=True))
    except OSError:
        return False


def reject_linked_ancestors(root: Path, path: Path) -> None:
    root = Path(os.path.abspath(root))
    parent = Path(os.path.abspath(path.parent))
    try:
        relative = parent.relative_to(root)
    except ValueError as exc:
        raise RuntimeError(f"Skill path escapes this worktree: {path}") from exc
    current = root
    for part in relative.parts:
        current = current / part
        if path_exists(current) and is_link_like(current):
            raise RuntimeError(f"Skill path must not traverse a link or junction: {current}")
        if path_exists(current) and not current.is_dir():
            raise RuntimeError(f"Skill path parent must be a directory: {current}")


def link_directory(root: Path, path: Path, target: Path) -> str:
    if normalized(path) == normalized(target):
        return "physical"
    reject_linked_ancestors(root, path)
    if path_exists(path):
        if is_link_like(path) and same_target(path, target):
            return "existing"
        raise RuntimeError(f"Skill path collision: {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    if os.name == "nt":
        result = subprocess.run(
            ["cmd", "/c", "mklink", "/J", str(path), str(target)],
            text=True,
            encoding="utf-8",
            errors="replace",
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
        if result.returncode != 0:
            raise RuntimeError(result.stderr.strip() or f"could not create junction {path}")
    else:
        path.symlink_to(os.path.relpath(target, path.parent), target_is_directory=True)
    return "attached"


def remove_link(path: Path) -> None:
    if os.name == "nt" and not path.is_symlink():
        os.rmdir(path)
    else:
        path.unlink()


def resolve_project() -> tuple[Path, Path]:
    current = Path.cwd().resolve()
    root = Path(git("rev-parse", "--show-toplevel", cwd=current)).resolve()
    common_raw = Path(git("rev-parse", "--git-common-dir", cwd=root))
    common = common_raw.resolve() if common_raw.is_absolute() else (root / common_raw).resolve()
    worktrees = git("worktree", "list", "--porcelain", cwd=root).splitlines()
    primary_line = next((line for line in worktrees if line.startswith("worktree ")), None)
    if common.name == ".git":
        primary = common.parent.resolve()
    elif primary_line:
        primary = Path(primary_line.removeprefix("worktree ").strip()).resolve()
    else:
        raise RuntimeError("could not resolve the primary worktree")
    return root, primary


def validate_canonical(primary: Path) -> Path:
    canonical = primary / ".agents" / "skills" / SKILL_NAME
    reject_linked_ancestors(primary, canonical)
    if not path_exists(canonical) or not canonical.is_dir():
        raise RuntimeError(f"canonical project Harness is missing: {canonical}")
    if is_link_like(canonical):
        raise RuntimeError(f"canonical project Harness must be physical: {canonical}")
    if not (canonical / "SKILL.md").is_file():
        raise RuntimeError(f"canonical project Harness is missing: {canonical}")
    manifest = json.loads((canonical / "state" / "manifest.json").read_text(encoding="utf-8"))
    if manifest.get("project_id") != PROJECT_ID or manifest.get("skill_name") != SKILL_NAME:
        raise RuntimeError("canonical project Harness manifest does not match this Git project")
    return canonical


def attach(root: Path, canonical: Path, links: dict[str, Path]) -> dict[str, dict[str, str]]:
    result: dict[str, dict[str, str]] = {}
    created: list[Path] = []
    try:
        for name, path in links.items():
            status = link_directory(root, path, canonical)
            result[name] = {"path": str(path), "status": status}
            if status == "attached":
                created.append(path)
    except Exception:
        for path in reversed(created):
            try:
                remove_link(path)
            except OSError:
                pass
        raise
    return result


def detach(
    root: Path,
    primary: Path,
    canonical: Path,
    links: dict[str, Path],
) -> dict[str, dict[str, str]]:
    if normalized(root) == normalized(primary):
        raise RuntimeError("the primary worktree hosts the physical project Harness and cannot be detached")
    result: dict[str, dict[str, str]] = {}
    for name, path in links.items():
        reject_linked_ancestors(root, path)
        if not path_exists(path):
            result[name] = {"path": str(path), "status": "missing"}
        elif not is_link_like(path):
            raise RuntimeError(f"refusing to detach an unmanaged physical Skill path: {path}")
        elif not same_target(path, canonical):
            raise RuntimeError(f"refusing to detach a Skill link with the wrong target: {path}")
        else:
            result[name] = {"path": str(path), "status": "detached"}

    removed: list[Path] = []
    try:
        for name, path in links.items():
            if result[name]["status"] != "detached":
                continue
            remove_link(path)
            removed.append(path)
    except Exception as error:
        rollback_errors = []
        for path in reversed(removed):
            try:
                link_directory(root, path, canonical)
            except Exception as rollback_error:
                rollback_errors.append(f"{path}: {rollback_error}")
        detail = f"; rollback failed for {', '.join(rollback_errors)}" if rollback_errors else ""
        raise RuntimeError(f"could not detach all shared Harness links: {error}{detail}") from error
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--detach", action="store_true")
    args = parser.parse_args()
    root, primary = resolve_project()
    canonical = validate_canonical(primary)
    links = {
        "codex": root / ".agents" / "skills" / SKILL_NAME,
        "claude": root / ".claude" / "skills" / SKILL_NAME,
    }
    result = detach(root, primary, canonical, links) if args.detach else attach(root, canonical, links)
    print(json.dumps({
        "ok": True,
        "action": "detached" if args.detach else "attached",
        "skill": str(canonical),
        "links": result,
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
