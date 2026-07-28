"""Shared helpers for the VICE ESTATE 04 Blender pipeline.

Every script in this directory is designed to run headless:

    blender --background --python tools/blender/<script>.py -- [args]

The approved layout and asset manifest under ``packages/shared/src/arenas`` are the single
source of truth. Nothing here invents geometry positions: if a module is not in the
manifest, or a placement is not in the layout, it does not get built.
"""

from __future__ import annotations

import json
import math
import os
import sys
from pathlib import Path

try:
    import bpy
except ImportError:  # pragma: no cover - allows linting outside Blender
    bpy = None  # type: ignore

# --- repository layout -------------------------------------------------------

def repo_root() -> Path:
    """Walk up from this file to the workspace root (the directory with pnpm-workspace.yaml)."""
    here = Path(__file__).resolve()
    for candidate in [here, *here.parents]:
        if (candidate / "pnpm-workspace.yaml").exists():
            return candidate
    # Fall back to two levels up: tools/blender/ -> repo root.
    return here.parents[2]


ROOT = repo_root()
ARENA_DIR = ROOT / "packages" / "shared" / "src" / "arenas"
LAYOUT_PATH = ARENA_DIR / "vice-estate-04.layout.json"
MANIFEST_PATH = ARENA_DIR / "vice-estate-04.assets.json"
EXPORT_DIR = ROOT / "apps" / "web" / "public" / "assets" / "vice-estate"
BLEND_DIR = ROOT / "assets-source" / "blender" / "vice-estate"
REFERENCE_DIR = ROOT / "docs" / "references"
RENDER_DIR = ROOT / "docs" / "references" / "renders"
ART_DIR = ROOT / "docs" / "art" / "vice-estate"

REFERENCE_ESTATE = REFERENCE_DIR / "vice-estate-master.png"
REFERENCE_LOADING = REFERENCE_DIR / "loading-screen-master.png"
REFERENCE_SKYLINE = REFERENCE_DIR / "miami-skyline-master.png"

# The reference masters are 1672x941. The review render matches this exactly so the overlay
# is a per-pixel comparison rather than a resampled approximation.
REFERENCE_WIDTH = 1672
REFERENCE_HEIGHT = 941


def load_layout() -> dict:
    with LAYOUT_PATH.open() as handle:
        return json.load(handle)


def load_manifest() -> dict:
    with MANIFEST_PATH.open() as handle:
        return json.load(handle)


def script_args() -> list[str]:
    """Arguments after the ``--`` separator Blender uses to hand off to the script."""
    if "--" not in sys.argv:
        return []
    return sys.argv[sys.argv.index("--") + 1 :]


def log(message: str) -> None:
    print(f"[vice-estate] {message}", flush=True)


# --- scene helpers -----------------------------------------------------------

KIT_COLLECTION = "VICE_ESTATE_KIT"
LAYOUT_COLLECTION = "VICE_ESTATE_LAYOUT"
SCENERY_COLLECTION = "VICE_ESTATE_SCENERY"


def reset_scene() -> None:
    """Start from an empty scene so a rebuild is byte-for-byte reproducible."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0


def ensure_collection(name: str) -> "bpy.types.Collection":
    existing = bpy.data.collections.get(name)
    if existing is not None:
        return existing
    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    return collection


def link_only(obj: "bpy.types.Object", collection: "bpy.types.Collection") -> None:
    for other in list(obj.users_collection):
        other.objects.unlink(obj)
    collection.objects.link(obj)


# --- materials ---------------------------------------------------------------
# Vice League After Dark: graphite and smoked navy dominant, cream concrete and brushed
# metal for surfaces, cyan/magenta only as team accents, orange only on the roofs.

# Golden Hour reference palette: glossy, saturated, expensive. The darker "After Dark"
# values belong to the Neon Night preset, not to this canonical art-review view.
MATERIALS = {
    # (base_color RGBA, roughness, metallic)
    "villa_white": ((0.90, 0.90, 0.89, 1.0), 0.24, 0.0),
    "panel_white": ((0.84, 0.85, 0.86, 1.0), 0.30, 0.0),
    "roof_orange": ((0.98, 0.42, 0.02, 1.0), 0.16, 0.0),
    "vinyl_black": ((0.022, 0.024, 0.028, 1.0), 0.20, 0.0),
    "graphite": ((0.10, 0.11, 0.13, 1.0), 0.40, 0.0),
    "chrome": ((0.95, 0.96, 0.97, 1.0), 0.06, 1.0),
    "chrome_dark": ((0.42, 0.44, 0.48, 1.0), 0.05, 1.0),
    "glass_aqua": ((0.24, 0.62, 0.66, 1.0), 0.03, 0.15),
    "terrazzo": ((0.86, 0.85, 0.83, 1.0), 0.42, 0.0),
    "turf": ((0.40, 0.62, 0.12, 1.0), 0.86, 0.0),
    "neon_cyan": ((0.10, 0.86, 1.00, 1.0), 0.22, 0.0),
    "neon_magenta": ((1.00, 0.10, 0.62, 1.0), 0.22, 0.0),
    "paint_cyan": ((0.09, 0.66, 0.98, 1.0), 0.14, 0.0),
    "paint_magenta": ((0.98, 0.06, 0.60, 1.0), 0.14, 0.0),
    "water": ((0.06, 0.62, 0.66, 1.0), 0.04, 0.0),
    "foliage": ((0.16, 0.42, 0.12, 1.0), 0.72, 0.0),
    "trunk": ((0.36, 0.28, 0.18, 1.0), 0.80, 0.0),
    # Pale and warm, close to the sky it sits against. EEVEE applies no atmospheric
    # perspective of its own, so the haze that makes the skyline read as distant has to
    # be baked into the albedo — a mid-grey here renders as a hard slab of towers.
    "skyline": ((0.86, 0.74, 0.76, 1.0), 0.95, 0.0),
    "lamp": ((1.00, 0.99, 0.94, 1.0), 0.20, 0.0),
}

# Aliases kept so existing builder calls keep resolving.
MATERIALS["concrete"] = MATERIALS["villa_white"]
MATERIALS["smoked_glass"] = MATERIALS["glass_aqua"]
MATERIALS["cyan"] = MATERIALS["neon_cyan"]
MATERIALS["magenta"] = MATERIALS["neon_magenta"]

EMISSIVE = {"cyan", "magenta", "neon_cyan", "neon_magenta", "lamp"}


def get_material(name: str) -> "bpy.types.Material":
    material = bpy.data.materials.get(name)
    if material is not None:
        return material
    base_color, roughness, metallic = MATERIALS[name]
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    if bsdf is not None:
        bsdf.inputs["Base Color"].default_value = base_color
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
        if name in EMISSIVE:
            # Team light strips read as underlighting at dusk.
            if "Emission Color" in bsdf.inputs:
                bsdf.inputs["Emission Color"].default_value = base_color
                bsdf.inputs["Emission Strength"].default_value = 6.0 if name == "lamp" else 3.2
        if name in ("smoked_glass", "glass_aqua"):
            if "Alpha" in bsdf.inputs:
                bsdf.inputs["Alpha"].default_value = 0.45
            material.blend_method = "BLEND" if hasattr(material, "blend_method") else material.blend_method
    return material


# --- primitive builders ------------------------------------------------------


def add_box(name, size, location=(0, 0, 0), rotation=(0, 0, 0), material="concrete"):
    """Axis-aligned box specified by full size, with its base on `location.z`."""
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (size[0], size[1], size[2])
    obj.data.materials.append(get_material(material))
    return obj


def add_cylinder(name, radius, depth, location=(0, 0, 0), rotation=(0, 0, 0),
                 material="concrete", vertices=24):
    bpy.ops.mesh.primitive_cylinder_add(
        radius=radius, depth=depth, location=location, rotation=rotation, vertices=vertices
    )
    obj = bpy.context.active_object
    obj.name = name
    obj.data.materials.append(get_material(material))
    return obj


def add_sphere(name, radius, location=(0, 0, 0), scale=(1, 1, 1), material="concrete", segments=20):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, location=location, segments=segments,
                                         ring_count=max(6, segments // 2))
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    obj.data.materials.append(get_material(material))
    return obj


def add_cone(name, radius, depth, location=(0, 0, 0), rotation=(0, 0, 0), material="concrete"):
    bpy.ops.mesh.primitive_cone_add(
        radius1=radius, depth=depth, location=location, rotation=rotation, vertices=18
    )
    obj = bpy.context.active_object
    obj.name = name
    obj.data.materials.append(get_material(material))
    return obj


def apply_transforms(obj) -> None:
    """Bake rotation and scale into mesh data.

    Primitives are created at unit size and then scaled at the object level, which leaves
    ``bound_box`` reporting pre-scale coordinates and pushes a non-identity transform into
    the exported glTF node. Baking here keeps module meshes in true local metres, so the
    manifest's bounds are real and the placement transform from the layout is the only
    transform the runtime applies.
    """
    deselect_all()
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.select_set(False)


def join_as(name: str, objects: list, collection) -> "bpy.types.Object":
    """Join a list of parts into one module object, origin at the world origin."""
    for obj in objects:
        apply_transforms(obj)
    deselect_all()
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    if len(objects) > 1:
        bpy.ops.object.join()
    merged = bpy.context.active_object
    merged.name = name
    merged.data.name = f"{name}_mesh"
    # Origin at world zero keeps placement transforms in the layout authoritative.
    bpy.context.scene.cursor.location = (0.0, 0.0, 0.0)
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    link_only(merged, collection)
    bpy.ops.object.select_all(action="DESELECT")
    return merged


def deselect_all() -> None:
    if bpy.context.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")


# --- coordinate conversion ---------------------------------------------------
# The game runs in three.js coordinates: right-handed, +X right, +Y up, -Z forward (north).
# Blender is right-handed, +X right, +Z up, -Y forward.
#
# The conversion MUST preserve handedness. The naive swap (x, y, z) -> (x, z, y) is a
# reflection with determinant -1: it mirrors the whole estate left-to-right, which would
# make every Blender render disagree with the in-game view and quietly corrupt a camera
# match. The correct mapping negates one axis.


def game_to_blender(x: float, y: float, z: float) -> tuple[float, float, float]:
    """Game (Y-up, -Z forward) -> Blender (Z-up, -Y forward). Determinant +1."""
    return (x, -z, y)


def blender_to_game(bx: float, by: float, bz: float) -> tuple[float, float, float]:
    """Inverse of :func:`game_to_blender`."""
    return (bx, bz, -by)


def game_scale_to_blender(sx: float, sy: float, sz: float) -> tuple[float, float, float]:
    """Scale is unsigned: swap the axes to match, but never negate."""
    return (sx, sz, sy)


def game_yaw_to_blender(rotation_y: float) -> float:
    """Yaw about game +Y maps directly to yaw about Blender +Z under the mapping above.

    Game yaw takes +X toward -Z; Blender yaw takes +X toward +Y; and game -Z maps to
    Blender +Y. The rotation therefore carries over unchanged.
    """
    return rotation_y


def placement_matrix(placement: dict):
    px, py, pz = placement["transform"]["position"]
    return game_to_blender(px, py, pz), game_yaw_to_blender(placement["transform"]["rotationY"])
