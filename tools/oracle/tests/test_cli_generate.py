"""`generate` y `regenerate` (FORMAT.md §8.1-§8.2), en directorios temporales."""

from __future__ import annotations

import json

import pytest

from cuotascasa_oracle import GENERATOR_VERSION, generator
from cuotascasa_oracle.cli import main

SEED = 20261004


def snapshot(directory):
    return {p.name: p.read_bytes() for p in sorted(directory.iterdir())}


def run(argv, capsys):
    code = main(argv)
    captured = capsys.readouterr()
    return code, captured.out, captured.err


def test_generate_writes_fixtures_and_manifest(tmp_path, capsys):
    out = tmp_path / "fx"
    code, stdout, stderr = run(
        ["generate", "--profile", "core", "--seed", str(SEED), "--out", str(out)], capsys
    )
    assert (code, stderr) == (0, "")
    files = snapshot(out)
    assert sorted(files) == [f"core-{n:04d}.json" for n in range(1, 16)] + ["manifest.json"]
    manifest = json.loads(files["manifest.json"])
    assert manifest == {
        "synthetic": True,
        "profiles": {"core": {"count": 15, "generatorVersion": GENERATOR_VERSION, "seed": SEED}},
    }


def test_generate_keeps_other_manifest_entries(tmp_path, capsys):
    out = tmp_path / "fx"
    out.mkdir()
    other = {
        "synthetic": True,
        "profiles": {"full": {"count": 40, "generatorVersion": 1, "seed": 3}},
    }
    (out / "manifest.json").write_text(json.dumps(other), encoding="utf-8")
    assert run(["generate", "--profile", "core", "--seed", "1", "--out", str(out)], capsys)[0] == 0
    manifest = json.loads((out / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["profiles"]["full"] == other["profiles"]["full"]
    assert manifest["profiles"]["core"]["seed"] == 1


@pytest.mark.parametrize(
    "argv",
    [
        ["generate", "--profile", "nope", "--seed", "1"],
        ["generate", "--profile", "core", "--seed", "-1"],
        ["generate", "--profile", "core", "--seed", "4294967296"],
        ["generate", "--profile", "core", "--seed", "x"],
        ["generate", "--profile", "core"],
    ],
)
def test_generate_usage_errors_exit_2(tmp_path, capsys, argv):
    code, out, err = run([*argv, "--out", str(tmp_path / "o")], capsys)
    assert (code, out, err) == (2, "", "error: usage\n")
    assert not (tmp_path / "o").exists()


def test_regenerate_reproduces_the_directory_byte_identically(tmp_path, capsys):
    out = tmp_path / "fx"
    run(["generate", "--profile", "core", "--seed", str(SEED), "--out", str(out)], capsys)
    before = snapshot(out)
    (out / "core-0003.json").write_text("{}\n", encoding="utf-8")
    (out / "core-0016.json").write_text("{}\n", encoding="utf-8")
    code, stdout, _ = run(["regenerate", "--manifest", str(out / "manifest.json")], capsys)
    assert (code, stdout) == (0, "")
    assert snapshot(out) == before


def test_regenerate_ignores_profiles_absent_from_the_manifest(tmp_path, capsys, monkeypatch):
    monkeypatch.setitem(
        generator.PROFILES,
        "testonly",
        generator.Profile("testonly", 1, lambda seed, index: {"synthetic": True}),
    )
    out = tmp_path / "fx"
    run(["generate", "--profile", "core", "--seed", "4", "--out", str(out)], capsys)
    run(["regenerate", "--manifest", str(out / "manifest.json")], capsys)
    assert not list(out.glob("testonly-*"))


def test_regenerate_reports_pending_and_leaves_that_profile_untouched(tmp_path, capsys):
    out = tmp_path / "fx"
    run(["generate", "--profile", "core", "--seed", str(SEED), "--out", str(out)], capsys)
    manifest_path = out / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["profiles"]["core"]["generatorVersion"] = GENERATOR_VERSION - 1
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    (out / "core-0001.json").write_text("{}\n", encoding="utf-8")
    before = snapshot(out)
    code, stdout, stderr = run(["regenerate", "--manifest", str(manifest_path)], capsys)
    assert (code, stdout, stderr) == (0, "regeneration pending: core\n", "")
    assert snapshot(out) == before


def test_regenerate_errors_exit_2_without_touching_anything(tmp_path, capsys):
    out = tmp_path / "fx"
    run(["generate", "--profile", "core", "--seed", "9", "--out", str(out)], capsys)
    manifest_path = out / "manifest.json"
    base = json.loads(manifest_path.read_text(encoding="utf-8"))
    (out / "core-0002.json").write_text("{}\n", encoding="utf-8")
    before = snapshot(out)
    ahead = json.loads(json.dumps(base))
    ahead["profiles"]["core"]["generatorVersion"] = GENERATOR_VERSION + 1
    unknown = json.loads(json.dumps(base))
    unknown["profiles"]["nope"] = {"count": 1, "generatorVersion": 1, "seed": 1}
    for broken in (ahead, unknown):
        manifest_path.write_text(json.dumps(broken), encoding="utf-8")
        before_manifest = manifest_path.read_bytes()
        code, stdout, stderr = run(["regenerate", "--manifest", str(manifest_path)], capsys)
        assert (code, stdout) == (2, "")
        assert stderr.startswith("error: ")
        assert (out / "core-0002.json").read_text(encoding="utf-8") == "{}\n"
        assert manifest_path.read_bytes() == before_manifest
    assert before  # el directorio tenía contenido


@pytest.mark.parametrize(
    "content", ["{not json", "[]", '"x"', '{"profiles": []}', '{"profiles": 3}']
)
def test_generate_with_a_bad_manifest_is_a_manifest_error(tmp_path, capsys, content):
    out = tmp_path / "fx"
    out.mkdir()
    (out / "manifest.json").write_text(content, encoding="utf-8")
    code, stdout, stderr = run(
        ["generate", "--profile", "core", "--seed", "1", "--out", str(out)], capsys
    )
    assert (code, stdout, stderr) == (2, "", "error: manifest\n")
    assert (out / "manifest.json").read_text(encoding="utf-8") == content
    assert not list(out.glob("core-*"))


@pytest.mark.parametrize(
    "entry",
    [
        {"count": 15, "generatorVersion": 1, "seed": True},
        {"count": 15, "generatorVersion": 1, "seed": -1},
        {"count": 15, "generatorVersion": 1, "seed": 4294967296},
        {"count": 15, "generatorVersion": 1, "seed": "7"},
        {"count": True, "generatorVersion": 1, "seed": 7},
        {"count": "15", "generatorVersion": 1, "seed": 7},
        {"count": 15, "generatorVersion": True, "seed": 7},
        {"count": 15, "generatorVersion": 1.0, "seed": 7},
        {"count": 15, "generatorVersion": 1},
        [],
    ],
)
def test_regenerate_validates_every_entry_before_writing(tmp_path, capsys, entry):
    out = tmp_path / "fx"
    out.mkdir()
    manifest = {"synthetic": True, "profiles": {"core": entry}}
    (out / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    code, stdout, stderr = run(["regenerate", "--manifest", str(out / "manifest.json")], capsys)
    assert (code, stdout, stderr) == (2, "", "error: manifest\n")
    assert [p.name for p in out.iterdir()] == ["manifest.json"]


def test_pruning_leaves_other_profiles_files_untouched(tmp_path, capsys):
    out = tmp_path / "fx"
    out.mkdir()
    (out / "full-0041.json").write_text("{}\n", encoding="utf-8")
    (out / "core-0016.json").write_text("{}\n", encoding="utf-8")
    assert run(["generate", "--profile", "core", "--seed", "1", "--out", str(out)], capsys)[0] == 0
    assert (out / "full-0041.json").read_text(encoding="utf-8") == "{}\n"
    assert not (out / "core-0016.json").exists()


def test_generator_money_uses_no_floats():
    import ast

    from helpers import ORACLE_DIR

    tree = ast.parse((ORACLE_DIR / "cuotascasa_oracle" / "generator.py").read_text("utf-8"))
    floats = [
        n for n in ast.walk(tree) if isinstance(n, ast.Constant) and isinstance(n.value, float)
    ]
    calls = [n for n in ast.walk(tree) if isinstance(n, ast.Name) and n.id == "float"]
    assert not floats and not calls
