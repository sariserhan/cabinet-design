#!/usr/bin/env python3
"""Fail when a number in the documentation drifts from the code.

A repository whose rule is to state only what was actually run cannot
afford a README that says 252 tests when 298 run: the number is the exact
kind of claim that rots quietly. These were corrected by hand once before
and drifted again within a month, so the correction is now a check.

The counts come from the runners rather than from counting `test(` in the
files, because tests declared in a loop - approval.test.ts makes ten from
one line - make static counting wrong by exactly the amount nobody
notices. Browser tests are counted statically; Playwright is far too slow
to run for a number, and its specs declare one test per call.

The limits are checked the other way round: the constant in the source is
the truth, and the sentence in the documentation has to agree with it. On
the day this was written all five already did - the counts were the only
thing that had rotted - which is the argument for checking them now,
while they are right, rather than after someone notices they are not.
"""
import os
import pathlib
import re
import shutil
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent


def node() -> str:
    """The node that is running this, not the one a PATH might offer.

    A git hook can have almost nothing on its PATH - `npx` certainly was
    not there when this failed on a push - so the runners are started
    through the interpreter npm already told us about, by their files
    rather than by their names.
    """
    return os.environ.get("npm_node_execpath") or shutil.which("node") or "node"


COLOUR = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")


def run(command: list[str]) -> str:
    done = subprocess.run(
        command,
        cwd=ROOT,
        capture_output=True,
        text=True,
        # A pre-push hook is handed the pushed refs on stdin; nothing here
        # wants to read them, and a runner that tries would hang.
        stdin=subprocess.DEVNULL,
        env={**os.environ, "NO_COLOR": "1", "FORCE_COLOR": "0"},
    )
    # And strip what colours through anyway. This is the whole of why the
    # check failed on a push and passed everywhere else: in a hook's
    # environment vitest printed `Tests` and `31 passed` with escape
    # sequences between them, and a pattern that reads the two as
    # neighbours saw nothing at all.
    return COLOUR.sub("", done.stdout + done.stderr)


def core_count() -> int:
    out = run(
        [
            node(),
            "node_modules/tsx/dist/cli.mjs",
            "--test",
            *[str(p) for p in sorted((ROOT / "tests/core").glob("*.test.ts"))],
        ]
    )
    found = re.search(r"^.\s*tests (\d+)$", out, re.M)
    if not found:
        sys.exit(
            "FAIL: could not read a test total from the core runner.\n"
            + out[-800:]
        )
    return int(found.group(1))


def backend_count() -> int:
    out = run([node(), "node_modules/vitest/vitest.mjs", "run"])
    found = re.search(r"Tests\s+(\d+) passed", out)
    if not found:
        sys.exit("FAIL: could not read a test total from vitest.\n" + out[-800:])
    return int(found.group(1))


def browser_count() -> int:
    return sum(
        len(re.findall(r"^test\(", path.read_text(), re.M))
        for path in sorted((ROOT / "tests/e2e").glob("*.spec.ts"))
    )


# Every place that states a current count, and the pattern that finds it.
# Historical records - "validation for this update" and the like - are
# deliberately not listed: they say what ran that day and are still true.
CLAIMS = [
    ("README.md", r"covers (\d+) semantic tests", "core"),
    ("README.md", r"(\d+) backend ownership", "backend"),
    ("README.md", r"(\d+) browser tests", "browser"),
    (".github/workflows/ci.yml", r"(\d+) semantic tests", "core"),
    (".github/workflows/ci.yml", r"(\d+) backend tests", "backend"),
    ("docs/kitchen-studio.md", r"(\d+) core tests", "core"),
    ("docs/kitchen-studio.md", r"(\d+) backend tests", "backend"),
    ("docs/catalog-status.md", r"(\d+) core behavior tests", "core"),
    ("docs/catalog-status.md", r"(\d+) backend/provider contract tests", "backend"),
]


# A limit stated in prose, the constant that decides it, and where each
# lives. The constant is the truth; the sentence has to keep up.
LIMITS = [
    ("MAX_DESIGN_ITEMS", r"MAX_DESIGN_ITEMS = (\d+)", "src/designer/model.ts",
     [("docs/kitchen-studio.md", r"support up to (\d+) items")]),
    ("design size", r"length > (\d+)", "src/designer/model.ts",
     [("docs/kitchen-studio.md", r"overall (\d+) KB design limit")]),
    ("MAX_SAVED_DESIGNS", r"MAX_SAVED_DESIGNS = (\d+)", "src/designer/design-store.ts",
     [("docs/kitchen-studio.md", r"named copies, up to (\d+),")]),
    ("FRONT_DETAIL_BUDGET", r"FRONT_DETAIL_BUDGET = (\d+)", "src/designer/model.ts",
     [("docs/kitchen-studio.md", r"Above (\d+) items the 3D view")]),
]


def limit_problems() -> list[str]:
    wrong = []
    for label, pattern, source, claims in LIMITS:
        text = (ROOT / source).read_text()
        found = re.search(pattern, text)
        if not found:
            wrong.append(f"{source}: {label} no longer matches /{pattern}/")
            continue
        value = int(found.group(1))
        # A byte limit is written in the documentation as kilobytes.
        shown = value // 1000 if value >= 10000 else value
        for name, claim in claims:
            said = re.search(claim, (ROOT / name).read_text())
            if not said:
                wrong.append(f"{name}: nothing matches /{claim}/, so {label} cannot be checked")
            elif int(said.group(1)) != shown:
                wrong.append(f"{name}: says {said.group(1)} for {label}; the code says {shown}")
    return wrong


def main() -> None:
    actual = {
        "core": core_count(),
        "backend": backend_count(),
        "browser": browser_count(),
    }
    wrong = limit_problems()
    for name, pattern, kind in CLAIMS:
        path = ROOT / name
        text = path.read_text()
        found = re.search(pattern, text)
        if not found:
            wrong.append(f"{name}: nothing matches /{pattern}/, so its count cannot be checked")
            continue
        said = int(found.group(1))
        if said != actual[kind]:
            wrong.append(f"{name}: says {said} {kind} tests; {actual[kind]} run")
    if wrong:
        print("FAIL: the documentation and the code disagree.")
        for line in wrong:
            print("  " + line)
        sys.exit(1)
    print(
        f"PASS: {actual['core']} core, {actual['backend']} backend and "
        f"{actual['browser']} browser tests, and every documented count and "
        f"limit agrees with the code."
    )


if __name__ == "__main__":
    main()
