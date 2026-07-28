"""Landmark-based camera comparison for the VICE ESTATE 04 review render.

This replaces the darkest-pixel occupancy score, which was a bad optimisation target: it
rewarded moving the camera closer regardless of whether the composition matched, and it
ranked an obviously wrong view above a good one.

Here, a fixed set of large unambiguous structures — perimeter corners, villa roof corners,
the fountain, the orb, the bridge — is annotated once on the reference master and paired
with a point in game space. Projecting those points through the review camera gives a
per-anchor pixel error, which is a direct measure of whether the camera reproduces the
reference composition.

Deliberately excluded: paint, players, palm fronds, shadows and small props. They move,
they are occluded, and fitting a camera to them produces noise.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np

from viceestate_common import ART_DIR, game_to_blender

LANDMARK_PATH = ART_DIR / "reference-landmarks.json"

# Distance used to stand in for "infinitely far away" when projecting the horizon. Far
# enough that the residual dip below true horizontal is a small fraction of a pixel.
HORIZON_RANGE = 500_000.0


def load_landmarks() -> dict:
    with LANDMARK_PATH.open() as handle:
        return json.load(handle)


def project(scene, camera, world_point, width: int, height: int):
    """Project a game-space point to pixel coordinates, origin top-left.

    Returns ``(x, y, in_front)``. ``in_front`` is False when the point is behind the
    camera, where the projected coordinate is meaningless and must not be scored.
    """
    from bpy_extras.object_utils import world_to_camera_view
    from mathutils import Vector

    ndc = world_to_camera_view(scene, camera, Vector(game_to_blender(*world_point)))
    return ndc.x * width, (1.0 - ndc.y) * height, ndc.z > 0.0


def evaluate(scene, camera, width: int, height: int) -> dict:
    data = load_landmarks()
    diagonal = math.hypot(width, height)
    cam_height = camera.matrix_world.translation.z

    results = []
    for anchor in data["anchors"]:
        if anchor.get("horizon"):
            # A point at camera height and effectively infinite range lands exactly on the
            # true horizon, whatever the pitch and lens.
            world = (0.0, cam_height, -HORIZON_RANGE)
        else:
            world = anchor["world"]
        px, py, in_front = project(scene, camera, world, width, height)
        ref_x = anchor["image"][0] * width
        ref_y = anchor["image"][1] * height
        error = math.hypot(px - ref_x, py - ref_y)
        results.append({
            "id": anchor["id"],
            "kind": anchor.get("kind", "structural"),
            "reference": (ref_x, ref_y),
            "projected": (px, py),
            "error": error,
            "percent": 100.0 * error / diagonal,
            "in_front": in_front,
            "in_frame": in_front and 0 <= px < width and 0 <= py < height,
        })

    structural = [r for r in results if r["kind"] == "structural"]
    errors = np.array([r["percent"] for r in structural]) if structural else np.zeros(1)
    return {
        "anchors": results,
        "diagonal": diagonal,
        "mean": float(errors.mean()),
        "median": float(np.median(errors)),
        "max": float(errors.max()),
        "acceptance": data["acceptance"],
    }


# --- reporting ---------------------------------------------------------------


def gate_status(summary: dict) -> tuple[bool, list[str]]:
    limits = summary["acceptance"]
    failures: list[str] = []
    for r in summary["anchors"]:
        if r["kind"] != "structural":
            continue
        if not r["in_frame"]:
            failures.append(f"{r['id']} is not visible in frame")
            continue
        if r["id"] == "fountain-center":
            limit = limits["fountainMaxPercentOfDiagonal"]
        elif "roof" in r["id"]:
            limit = limits["villaRoofMaxPercentOfDiagonal"]
        elif "perimeter" in r["id"]:
            limit = limits["perimeterMaxPercentOfDiagonal"]
        else:
            limit = limits["structuralMeanMaxPercentOfDiagonal"]
        if r["percent"] > limit:
            failures.append(f"{r['id']} {r['percent']:.1f}% > {limit:.1f}% limit")
    if summary["mean"] > limits["structuralMeanMaxPercentOfDiagonal"]:
        failures.append(
            f"structural mean {summary['mean']:.1f}% > "
            f"{limits['structuralMeanMaxPercentOfDiagonal']:.1f}% limit"
        )
    return not failures, failures


def write_report(summary: dict, out_path: Path) -> None:
    passed, failures = gate_status(summary)
    lines = [
        "# VICE ESTATE 04 — landmark camera fit",
        "",
        "Structural anchors projected through the review camera and compared with their",
        "annotated position on the estate master. Errors are in pixels and as a percentage",
        f"of the {summary['diagonal']:.0f} px image diagonal.",
        "",
        f"**Gate A camera: {'PASS' if passed else 'FAIL'}**",
        "",
        "| Anchor | Kind | Reference (px) | Projected (px) | Error (px) | % diag | In frame |",
        "|---|---|---|---|---|---|---|",
    ]
    for r in sorted(summary["anchors"], key=lambda a: -a["percent"]):
        rx, ry = r["reference"]
        px, py = r["projected"]
        lines.append(
            f"| {r['id']} | {r['kind']} | {rx:.0f}, {ry:.0f} | {px:.0f}, {py:.0f} | "
            f"{r['error']:.0f} | {r['percent']:.1f}% | {'yes' if r['in_frame'] else 'NO'} |"
        )
    lines += [
        "",
        f"Structural mean **{summary['mean']:.2f}%**, median {summary['median']:.2f}%, "
        f"max {summary['max']:.2f}%.",
        "",
    ]
    if failures:
        lines.append("Failing criteria:")
        lines.append("")
        for failure in failures:
            lines.append(f"- {failure}")
        lines.append("")
    out_path.write_text("\n".join(lines) + "\n")


# --- debug sheet -------------------------------------------------------------


def _disc(pixels: np.ndarray, cx: float, cy: float, radius: int, colour) -> None:
    h, w = pixels.shape[:2]
    x0, x1 = max(0, int(cx - radius)), min(w, int(cx + radius) + 1)
    y0, y1 = max(0, int(cy - radius)), min(h, int(cy + radius) + 1)
    if x0 >= x1 or y0 >= y1:
        return
    ys, xs = np.mgrid[y0:y1, x0:x1]
    inside = (xs - cx) ** 2 + (ys - cy) ** 2 <= radius * radius
    pixels[y0:y1, x0:x1][inside] = colour


def _ring(pixels: np.ndarray, cx: float, cy: float, radius: int, colour, thickness: int = 3):
    h, w = pixels.shape[:2]
    x0, x1 = max(0, int(cx - radius)), min(w, int(cx + radius) + 1)
    y0, y1 = max(0, int(cy - radius)), min(h, int(cy + radius) + 1)
    if x0 >= x1 or y0 >= y1:
        return
    ys, xs = np.mgrid[y0:y1, x0:x1]
    d2 = (xs - cx) ** 2 + (ys - cy) ** 2
    band = (d2 <= radius * radius) & (d2 >= (radius - thickness) ** 2)
    pixels[y0:y1, x0:x1][band] = colour


def _line(pixels: np.ndarray, x0: float, y0: float, x1: float, y1: float, colour) -> None:
    steps = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
    if steps <= 1:
        return
    xs = np.linspace(x0, x1, steps).astype(int)
    ys = np.linspace(y0, y1, steps).astype(int)
    h, w = pixels.shape[:2]
    keep = (xs >= 0) & (xs < w) & (ys >= 0) & (ys < h)
    pixels[ys[keep], xs[keep]] = colour


# Reference anchors in cyan-white rings, projected scene anchors as solid orange discs,
# joined by a line whose length is the error being measured.
REF_COLOUR = (0.10, 0.90, 1.00, 1.0)
PROJ_COLOUR = (1.00, 0.42, 0.10, 1.0)
LINK_COLOUR = (1.00, 1.00, 1.00, 1.0)


def build_debug_sheet(base_rgba: np.ndarray, summary: dict, out_path: Path, save) -> None:
    """`base_rgba` is top-down HxWx4; `save` writes bottom-up, as Blender expects."""
    sheet = base_rgba.copy()
    for r in summary["anchors"]:
        rx, ry = r["reference"]
        px, py = r["projected"]
        if r["in_front"]:
            _line(sheet, rx, ry, px, py, LINK_COLOUR)
            _disc(sheet, px, py, 7, PROJ_COLOUR)
        _ring(sheet, rx, ry, 12, REF_COLOUR)
    save(sheet[::-1], out_path)
