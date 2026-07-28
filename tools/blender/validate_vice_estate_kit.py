"""Validate the exported VICE ESTATE 04 kit against the approved data.

    blender --background --python tools/blender/validate_vice_estate_kit.py
    python3 tools/blender/validate_vice_estate_kit.py        # also works without Blender

Checks that the layout, the manifest and the GLBs actually on disk agree. Exits non-zero
on any failure so it can gate CI.

This is the guard against the failure mode the architecture is designed to avoid: two
competing tables drifting apart. Every collider and asset must trace back to one id in one
document.
"""

from __future__ import annotations

import hashlib
import json
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from viceestate_common import (  # noqa: E402
    LAYOUT_PATH,
    MANIFEST_PATH,
    ROOT,
    load_layout,
    load_manifest,
    log,
)

GLB_MAGIC = 0x46546C67


class Report:
    def __init__(self) -> None:
        self.errors: list[str] = []
        self.warnings: list[str] = []

    def error(self, message: str) -> None:
        self.errors.append(message)

    def warn(self, message: str) -> None:
        self.warnings.append(message)

    def ok(self) -> bool:
        return not self.errors


def read_glb_header(path: Path) -> dict:
    """Parse just enough of the GLB container to prove it is a real, complete file."""
    with path.open("rb") as handle:
        header = handle.read(12)
        if len(header) < 12:
            raise ValueError("file is shorter than a GLB header")
        magic, version, total = struct.unpack("<III", header)
        if magic != GLB_MAGIC:
            raise ValueError("not a GLB (bad magic)")
        if version != 2:
            raise ValueError(f"unsupported glTF container version {version}")
        actual = path.stat().st_size
        if total != actual:
            raise ValueError(f"declared length {total} != file size {actual}")

        chunk_header = handle.read(8)
        chunk_len, chunk_type = struct.unpack("<II", chunk_header)
        if chunk_type != 0x4E4F534A:
            raise ValueError("first chunk is not JSON")
        document = json.loads(handle.read(chunk_len).decode("utf-8"))
    return document


def sha256_prefix(path: Path, length: int = 16) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()[:length]


def validate(report: Report) -> None:
    layout = load_layout()
    manifest = load_manifest()

    # --- manifest ids and urls -------------------------------------------------
    asset_ids: set[str] = set()
    for asset in manifest["assets"]:
        asset_id = asset.get("id")
        if not asset_id:
            report.error("an asset has no id")
            continue
        if asset_id in asset_ids:
            report.error(f"duplicate asset id '{asset_id}'")
        asset_ids.add(asset_id)
        if not str(asset.get("url", "")).endswith(".glb"):
            report.error(f"asset '{asset_id}' url is not a .glb")
        if "paintReceiver" not in asset:
            report.error(f"asset '{asset_id}' does not declare paintReceiver")
        if asset.get("decorative") and asset.get("paintReceiver"):
            report.error(f"asset '{asset_id}' is decorative but receives paint")

    # --- every referenced url exists, parses and matches its recorded hash -----
    urls: dict[str, str] = {}
    for asset in manifest["assets"]:
        urls[asset["url"]] = asset["id"]
        for lod in asset.get("lods", []):
            urls[lod["url"]] = f"{asset['id']} lod{lod['level']}"
        if asset.get("mobileFallback"):
            urls[asset["mobileFallback"]] = f"{asset['id']} mobile"

    web_root = ROOT / "apps" / "web" / "public"
    total_bytes = 0
    for url, owner in sorted(urls.items()):
        path = web_root / url.lstrip("/")
        if not path.exists():
            report.error(f"{owner}: missing GLB at {url}")
            continue
        total_bytes += path.stat().st_size
        try:
            document = read_glb_header(path)
        except Exception as exc:  # noqa: BLE001 - surface the real reason
            report.error(f"{owner}: {url} is not a valid GLB — {exc}")
            continue
        if not document.get("meshes"):
            report.warn(f"{owner}: {url} contains no meshes")

    for asset in manifest["assets"]:
        recorded = asset.get("hash")
        path = web_root / asset["url"].lstrip("/")
        if recorded and path.exists():
            actual = sha256_prefix(path)
            if actual != recorded:
                report.error(
                    f"asset '{asset['id']}' hash mismatch: manifest {recorded}, file {actual}. "
                    "Re-run export_vice_estate_kit.py."
                )

    if not manifest.get("contentVersion"):
        report.error("manifest has no contentVersion — GLB caching cannot be invalidated")

    # --- layout integrity -------------------------------------------------------
    placement_ids: set[str] = set()
    all_ids: dict[str, str] = {}

    def claim(identifier: str, where: str) -> None:
        if identifier in all_ids:
            report.error(f"duplicate id '{identifier}' in {where} (also in {all_ids[identifier]})")
        else:
            all_ids[identifier] = where

    for placement in layout["placements"]:
        claim(placement["id"], "placements")
        placement_ids.add(placement["id"])
        if placement["asset"] not in asset_ids:
            report.error(
                f"placement '{placement['id']}' references unknown asset '{placement['asset']}'"
            )

    inaccessible = {p["id"] for p in layout["placements"] if p.get("inaccessible")}

    for collider in layout["colliders"]:
        claim(collider["id"], "colliders")
        owner = collider.get("placement")
        if owner and owner not in placement_ids:
            report.error(f"collider '{collider['id']}' references unknown placement '{owner}'")
        if owner and owner in inaccessible:
            report.error(
                f"collider '{collider['id']}' belongs to inaccessible scenery '{owner}'. "
                "Scenery must never be collidable."
            )
        if collider.get("height", 0) <= 0:
            report.error(f"collider '{collider['id']}' has a non-positive height")

    for team in ("cyan", "magenta"):
        spawns = layout["spawns"].get(team, [])
        if not spawns:
            report.error(f"no {team} spawns")
        for spawn in spawns:
            claim(spawn["id"], f"spawns.{team}")

    for anchor in layout["navAnchors"]:
        claim(anchor["id"], "navAnchors")
    for pickup in layout["pickups"]:
        claim(pickup["id"], "pickups")
    for surface in layout["paintableSurfaces"]:
        claim(surface["id"], "paintableSurfaces")
    for zone in layout["scenicZones"]:
        claim(zone["id"], "scenicZones")
        if not zone.get("reason"):
            report.error(f"scenic zone '{zone['id']}' has no stated reason")

    # --- flat-world guarantee ---------------------------------------------------
    for placement in layout["placements"]:
        y = placement["transform"]["position"][1]
        if y > 0.5 and not placement.get("inaccessible"):
            report.error(
                f"placement '{placement['id']}' is raised to y={y} but is not marked "
                "inaccessible — gameplay must stay on one ground level"
            )

    # --- reference lock ---------------------------------------------------------
    if layout["status"] == "gate-a-approved" and not layout.get("referenceLocked"):
        report.error("layout claims Gate A approval without referenceLocked")
    if layout["status"] != "gate-a-approved":
        report.warn(
            "layout is still PROVISIONAL — proportions and reviewCamera are not "
            "camera-matched and must not be treated as final art"
        )

    log(f"{len(manifest['assets'])} assets, {len(urls)} GLB urls, {total_bytes / 1024:.1f} KB total")
    log(f"{len(layout['placements'])} placements, {len(layout['colliders'])} colliders")


def main() -> None:
    report = Report()
    try:
        validate(report)
    except Exception as exc:  # noqa: BLE001
        report.error(f"validation crashed: {exc}")

    for warning in report.warnings:
        log(f"WARN  {warning}")
    for error in report.errors:
        log(f"FAIL  {error}")

    if report.ok():
        log("kit validation PASSED")
        sys.exit(0)
    log(f"kit validation FAILED with {len(report.errors)} error(s)")
    sys.exit(1)


if __name__ == "__main__":
    main()
