"""Export the VICE ESTATE 04 kit to optimized GLBs.

    blender --background --python tools/blender/export_vice_estate_kit.py

Builds the kit (so the export never depends on a hand-saved .blend), then writes one GLB
per manifest asset into ``apps/web/public/assets/vice-estate/``.

The manifest is updated in place with derived metadata only — local-space bounds, a
content hash per GLB, and a ``contentVersion`` computed from all of them. Hand-authored
fields (paint reception, LODs, mobile fallbacks, notes) are never touched.

Because ``contentVersion`` is derived from the bytes, rebuilding an unchanged kit produces
an unchanged version, and any real change invalidates the client cache automatically.
"""

from __future__ import annotations

import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy  # noqa: E402
from viceestate_common import (  # noqa: E402
    EXPORT_DIR,
    blender_to_game,
    KIT_COLLECTION,
    MANIFEST_PATH,
    deselect_all,
    load_layout,
    load_manifest,
    log,
    script_args,
)

import build_vice_estate_kit as builder  # noqa: E402


def object_bounds(obj) -> dict:
    """Local-space bounding box, converted into game coordinates.

    Each corner is converted individually and the extremes taken afterwards: the mapping
    negates an axis, so taking min/max first would swap that axis's bounds.
    """
    converted = [blender_to_game(c[0], c[1], c[2]) for c in obj.bound_box]
    xs = [c[0] for c in converted]
    ys = [c[1] for c in converted]
    zs = [c[2] for c in converted]
    return {
        "min": [round(min(xs), 4), round(min(ys), 4), round(min(zs), 4)],
        "max": [round(max(xs), 4), round(max(ys), 4), round(max(zs), 4)],
    }


def export_object(obj, destination: Path) -> None:
    deselect_all()
    obj.hide_set(False)
    obj.hide_viewport = False
    obj.hide_render = False
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj

    destination.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(destination),
        export_format="GLB",
        use_selection=True,
        # Keep the kit lean: no cameras, lights or animation belong in a module.
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_apply=True,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
    )


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    layout = load_layout()
    manifest = load_manifest()

    # Rebuild from source so an export can never capture a stale hand-edited scene.
    builder.reset_scene()
    _kit, built = builder.build_kit(layout, manifest)

    kit_collection = bpy.data.collections.get(KIT_COLLECTION)
    if kit_collection is not None:
        kit_collection.hide_viewport = False
        kit_collection.hide_render = False

    EXPORT_DIR.mkdir(parents=True, exist_ok=True)

    # Every url the manifest can ask for, including LOD variants.
    wanted: dict[str, str] = {}
    for asset in manifest["assets"]:
        wanted[asset["id"]] = asset["url"]
        for lod in asset.get("lods", []):
            wanted[Path(lod["url"]).stem] = lod["url"]
        fallback = asset.get("mobileFallback")
        if fallback:
            wanted.setdefault(Path(fallback).stem, fallback)

    written: dict[str, dict] = {}
    for asset_id, url in sorted(wanted.items()):
        obj = built.get(asset_id)
        if obj is None:
            log(f"WARNING: manifest names '{asset_id}' but the kit has no such module")
            continue
        destination = Path(str(EXPORT_DIR.parent.parent)) / url.lstrip("/")
        export_object(obj, destination)
        written[asset_id] = {
            "url": url,
            "bounds": object_bounds(obj),
            "hash": sha256(destination)[:16],
            "bytes": destination.stat().st_size,
            "triangles": len(obj.data.loop_triangles) or len(obj.data.polygons),
        }
        log(f"exported {url}  ({written[asset_id]['bytes'] / 1024:.1f} KB)")

    if not written:
        log("ERROR: nothing was exported")
        sys.exit(1)

    # --- fold derived metadata back into the manifest ------------------------
    combined = hashlib.sha256()
    for asset_id in sorted(written):
        combined.update(asset_id.encode())
        combined.update(written[asset_id]["hash"].encode())
    content_version = f"kit-{combined.hexdigest()[:12]}"

    for asset in manifest["assets"]:
        record = written.get(asset["id"])
        if record is None:
            continue
        asset["bounds"] = record["bounds"]
        asset["hash"] = record["hash"]
        for lod in asset.get("lods", []):
            lod_record = written.get(Path(lod["url"]).stem)
            if lod_record is not None:
                lod["triangles"] = lod_record["triangles"]

    manifest["contentVersion"] = content_version
    manifest["generatedAt"] = datetime.now(timezone.utc).isoformat(timespec="seconds")

    with MANIFEST_PATH.open("w") as handle:
        json.dump(manifest, handle, indent=2)
        handle.write("\n")

    total = sum(r["bytes"] for r in written.values())
    log(f"wrote {len(written)} GLBs, {total / 1024:.1f} KB total")
    log(f"contentVersion = {content_version}")
    log(f"updated {MANIFEST_PATH.relative_to(MANIFEST_PATH.parents[4])}")


if __name__ == "__main__":
    main()
