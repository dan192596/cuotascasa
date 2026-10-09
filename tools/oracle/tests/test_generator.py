"""Perfil `core`: composición, determinismo, aislamiento de perfiles y rasgos."""

from __future__ import annotations

import hashlib
import json
from decimal import Decimal

import pytest

from cuotascasa_oracle import GENERATOR_VERSION, generator
from cuotascasa_oracle.fixture import dumps, has_last_row_trait, validate_fixture

SEED = 20261004


@pytest.fixture(scope="module")
def core_fixtures():
    return [generator.build_fixture("core", SEED, index) for index in range(1, 16)]


def test_core_profile_is_registered_with_fifteen_loans():
    assert generator.PROFILES["core"].count == 15


def test_subseed_follows_format_md():
    expected = int.from_bytes(hashlib.sha256(b"core:7:3").digest()[:8], "big")
    assert generator.subseed("core", 7, 3) == expected


def test_core_composition_matches_format_md(core_fixtures):
    terms = [f["inputs"]["terms"] for f in core_fixtures]
    assert [t["roundingProfile"] for t in terms].count("FHA_GT_V1") == 11
    assert [t["roundingProfile"] for t in terms].count("SIMPLE") == 4
    assert [t["paymentDay"] for t in terms].count("END_OF_MONTH") == 9
    assert [t["currency"] for t in terms].count("GTQ") == 12
    assert [t["currency"] for t in terms].count("USD") == 3
    leaps = [t for t in terms if t["firstDueDate"].startswith("2028-02-")]
    assert len(leaps) >= 3
    day_by_loan = {
        6: 15,
        7: 31,
        8: 30,
        10: 1,
        13: 28,
        14: 15,
    }
    for index, day in day_by_loan.items():
        assert terms[index - 1]["paymentDay"] == day
    for index in (1, 2, 3, 4, 5, 9, 11, 12, 15):
        assert terms[index - 1]["paymentDay"] == "END_OF_MONTH"
    # Seguros: FHA o ninguno; cargos F0/F1/F2 en el orden fijo.
    for index in (13, 15):
        assert terms[index - 1]["insuranceRates"] == []
    assert terms[0]["insuranceRates"] == ["0.01", "0.0026"]
    labels = {
        1: ["IUSI", "Seguro de daños"],
        2: ["IUSI"],
        3: [],
        7: ["IUSI"],
        14: [],
        15: ["IUSI", "Seguro de daños"],
    }
    for index, expected in labels.items():
        assert [c["label"] for c in terms[index - 1]["fixedCharges"]] == expected
    assert [f["loanIndex"] for f in core_fixtures] == list(range(1, 16))
    assert [f["id"] for f in core_fixtures][:2] == ["core-0001", "core-0002"]
    for fixture in core_fixtures:
        assert fixture["inputs"]["events"] == []
        assert fixture["features"] == ["core"]


def test_core_draws_follow_format_md_ranges(core_fixtures):
    grid = {f"{0.054 + 0.002 * n:.4f}" for n in range(23)}
    assert len(grid) == 23
    for fixture in core_fixtures:
        t = fixture["inputs"]["terms"]
        assert t["interestRate"] in grid
        assert t["termMonths"] % 12 == 0 and 60 <= t["termMonths"] <= 360
        principal = Decimal(t["principal"])
        if t["currency"] == "GTQ":
            assert Decimal("150000.00") <= principal <= Decimal("2500000.00")
        else:
            assert Decimal("20000.00") <= principal <= Decimal("330000.00")
        first = t["firstDueDate"]
        assert 2024 <= int(first[:4]) <= 2030
        month = int(first[5:7])
        year = int(first[:4])
        prev_year, prev_month = (year, month - 1) if month > 1 else (year - 1, 12)
        assert t["disbursementDate"] == f"{prev_year:04d}-{prev_month:02d}-01"
        for charge in t["fixedCharges"]:
            assert charge["effectiveFrom"] == first
            limit = {"GTQ": (25, 600), "USD": (3, 80)}[t["currency"]]
            if charge["label"] == "IUSI":
                assert limit[0] <= Decimal(charge["amount"]) <= limit[1]


def test_every_generated_fixture_passes_the_structural_validator(core_fixtures):
    for fixture in core_fixtures:
        assert fixture["synthetic"] is True
        assert fixture["generatorVersion"] == GENERATOR_VERSION
        validate_fixture(fixture)


def test_validator_rejects_tampering(core_fixtures):
    import copy

    base = core_fixtures[0]
    for mutate in (
        lambda f: f.update(synthetic=False),
        lambda f: f.update(id="core-0002"),
        lambda f: f["expected"]["rows"][0].update(total="1.00"),
        lambda f: f["expected"]["rows"].pop(),
        lambda f: f["traits"].reverse(),
        lambda f: f["inputs"]["terms"].update(principal=1000),
        lambda f: f.update(extra=1),
    ):
        broken = copy.deepcopy(base)
        mutate(broken)
        with pytest.raises(ValueError):
            validate_fixture(broken)


def test_serialization_is_stable_sorted_utf8(core_fixtures):
    text = dumps(core_fixtures[0])
    assert text.endswith("}\n") and not text.endswith("\n\n")
    assert text == json.dumps(json.loads(text), ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    assert "Seguro de daños" in text  # ensure_ascii=False


def test_same_seed_is_byte_identical_and_other_seed_differs(tmp_path):
    a, b, c = tmp_path / "a", tmp_path / "b", tmp_path / "c"
    generator.generate("core", SEED, a)
    generator.generate("core", SEED, b)
    generator.generate("core", SEED + 1, c)
    names = sorted(p.name for p in a.iterdir())
    assert names == sorted(p.name for p in b.iterdir())
    assert names == [f"core-{n:04d}.json" for n in range(1, 16)] + ["manifest.json"]
    for name in names:
        assert (a / name).read_bytes() == (b / name).read_bytes()
    assert (a / "core-0001.json").read_bytes() != (c / "core-0001.json").read_bytes()


def _fake_profile(name):
    def build(seed, index):
        return {
            "synthetic": True,
            "id": f"{name}-{index:04d}",
            "draw": generator.rng(name, seed, index).random(),
        }

    return generator.Profile(name=name, count=2, build=build)


def test_core_output_is_unchanged_by_generating_another_profile(tmp_path, monkeypatch):
    monkeypatch.setitem(generator.PROFILES, "testonly", _fake_profile("testonly"))
    alone = tmp_path / "alone"
    shared = tmp_path / "shared"
    generator.generate("core", SEED, alone)
    generator.generate("testonly", SEED, shared)
    generator.generate("core", SEED, shared)
    assert (shared / "testonly-0001.json").exists()
    for index in range(1, 16):
        name = f"core-{index:04d}.json"
        assert (alone / name).read_bytes() == (shared / name).read_bytes()
    manifest = json.loads((shared / "manifest.json").read_text(encoding="utf-8"))
    assert set(manifest["profiles"]) == {"core", "testonly"}


def test_generate_merges_manifest_and_prunes_stale_files(tmp_path, monkeypatch):
    out = tmp_path / "out"
    out.mkdir()
    (out / "manifest.json").write_text(
        dumps(
            {
                "synthetic": True,
                "profiles": {"full": {"count": 40, "generatorVersion": 1, "seed": 9}},
            }
        ),
        encoding="utf-8",
    )
    (out / "core-0016.json").write_text("{}\n", encoding="utf-8")
    generator.generate("core", SEED, out)
    manifest = json.loads((out / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["synthetic"] is True
    assert manifest["profiles"]["full"] == {"count": 40, "generatorVersion": 1, "seed": 9}
    assert manifest["profiles"]["core"] == {
        "count": 15,
        "generatorVersion": GENERATOR_VERSION,
        "seed": SEED,
    }
    assert not (out / "core-0016.json").exists()
    assert (out / "manifest.json").read_text(encoding="utf-8") == dumps(manifest)


def _row(level, fixed, total):
    return {"level": level, "fixedCharges": fixed, "total": total}


def test_last_row_trait_rule():
    # Igual a level + cargos fijos y plazo completo: sin rasgo.
    assert not has_last_row_trait([_row("100.00", "10.00", "110.00")], 1)
    # El total difiere de level + cargos fijos.
    assert has_last_row_trait([_row("100.00", "10.00", "109.99")], 1)
    # Liquida antes del plazo, aunque el total coincida.
    assert has_last_row_trait([_row("100.00", "10.00", "110.00")], 2)


def test_last_row_trait_iff_rule_over_many_seeds():
    seen = set()
    for seed in range(40):
        for index in range(1, 16):
            fixture = generator.build_fixture("core", seed, index)
            last = fixture["expected"]["rows"][-1]
            rule = (
                Decimal(last["total"]) != Decimal(last["level"]) + Decimal(last["fixedCharges"])
                or len(fixture["expected"]["rows"]) < fixture["inputs"]["terms"]["termMonths"]
            )
            assert ("lastRow" in fixture["traits"]) == rule
            seen.add(rule)
    assert True in seen
