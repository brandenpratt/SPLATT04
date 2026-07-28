"""Resect the review camera from annotated reference landmarks.

    python3 tools/blender/solve_review_camera.py [--apply] [--anchors perimeter|structural]

Runs under plain python3 — no Blender, no scipy. The projection model is written out
directly and minimised with Nelder-Mead, which is more than adequate for six unknowns and
a dozen correspondences.

Why fit to the perimeter by default: the arena footprint is 82 x 56 m *by definition* in
`vice-estate-04.layout.json`, so those four corners are the only anchors whose world
positions are certainly correct. Villas, fountain, orb and bridge are proxy geometry that
is known to be structurally wrong, so fitting the camera to them would bake that error
into the camera. Solving from the perimeter first makes the residuals on everything else a
direct readout of how far each proxy has to move.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LANDMARKS = ROOT / "docs" / "art" / "vice-estate" / "reference-landmarks.json"
LAYOUT = ROOT / "packages" / "shared" / "src" / "arenas" / "vice-estate-04.layout.json"

SENSOR_WIDTH = 36.0
HORIZON_RANGE = 500_000.0


def project(params, point, width, height):
    cx, cy, cz, pitch, yaw, focal = params
    cp, sp = math.cos(pitch), math.sin(pitch)
    cyaw, syaw = math.cos(yaw), math.sin(yaw)

    forward = (syaw * cp, -sp, -cyaw * cp)
    right = (cyaw, 0.0, syaw)
    up = (right[1] * forward[2] - right[2] * forward[1],
          right[2] * forward[0] - right[0] * forward[2],
          right[0] * forward[1] - right[1] * forward[0])

    vx, vy, vz = point[0] - cx, point[1] - cy, point[2] - cz
    xc = vx * right[0] + vy * right[1] + vz * right[2]
    yc = vx * up[0] + vy * up[1] + vz * up[2]
    zc = vx * forward[0] + vy * forward[1] + vz * forward[2]
    if zc <= 1e-6:
        return None
    scale = (width / 2.0) * focal / (SENSOR_WIDTH / 2.0)
    return width / 2.0 + scale * xc / zc, height / 2.0 - scale * yc / zc


def residuals(params, anchors, width, height):
    total, count = 0.0, 0
    for anchor in anchors:
        world = anchor["world"]
        if anchor.get("horizon"):
            world = (0.0, params[1], -HORIZON_RANGE)
        projected = project(params, world, width, height)
        if projected is None:
            return 1e12
        target = (anchor["image"][0] * width, anchor["image"][1] * height)
        total += (projected[0] - target[0]) ** 2 + (projected[1] - target[1]) ** 2
        count += 1
    return math.sqrt(total / max(count, 1))


def nelder_mead(fn, start, step, iterations=6000):
    n = len(start)
    simplex = [list(start)]
    for i in range(n):
        point = list(start)
        point[i] += step[i]
        simplex.append(point)
    scores = [fn(p) for p in simplex]

    for _ in range(iterations):
        order = sorted(range(n + 1), key=lambda i: scores[i])
        simplex = [simplex[i] for i in order]
        scores = [scores[i] for i in order]
        if abs(scores[-1] - scores[0]) < 1e-9:
            break
        centroid = [sum(p[i] for p in simplex[:-1]) / n for i in range(n)]
        worst = simplex[-1]

        reflected = [centroid[i] + 1.0 * (centroid[i] - worst[i]) for i in range(n)]
        r_score = fn(reflected)
        if r_score < scores[0]:
            expanded = [centroid[i] + 2.0 * (centroid[i] - worst[i]) for i in range(n)]
            e_score = fn(expanded)
            simplex[-1], scores[-1] = (expanded, e_score) if e_score < r_score else (reflected, r_score)
        elif r_score < scores[-2]:
            simplex[-1], scores[-1] = reflected, r_score
        else:
            contracted = [centroid[i] + 0.5 * (worst[i] - centroid[i]) for i in range(n)]
            c_score = fn(contracted)
            if c_score < scores[-1]:
                simplex[-1], scores[-1] = contracted, c_score
            else:
                for i in range(1, n + 1):
                    simplex[i] = [(simplex[i][j] + simplex[0][j]) / 2 for j in range(n)]
                    scores[i] = fn(simplex[i])
    best = min(range(n + 1), key=lambda i: scores[i])
    return simplex[best], scores[best]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="write the solve into the layout")
    parser.add_argument("--anchors", default="certain",
                        choices=["certain", "perimeter", "structural", "all"])
    parser.add_argument("--free-symmetry", action="store_true",
                        help="let the solve move the camera off the centreline and yaw it")
    args = parser.parse_args()

    data = json.loads(LANDMARKS.read_text())
    width, height = data["referenceSize"]
    diagonal = math.hypot(width, height)

    # "certain": only anchors whose world position follows from the authoritative layout.
    # The arena footprint is 82 x 56 m by definition and the fountain sits at its hero
    # centre; everything else is proxy geometry the reference disagrees with.
    CERTAIN = {"perimeter-far-left", "perimeter-far-right", "fountain-center"}
    if args.anchors == "certain":
        fit = [a for a in data["anchors"]
               if (a["id"] in CERTAIN or a.get("horizon")) and not a.get("offFrame")]
    elif args.anchors == "perimeter":
        fit = [a for a in data["anchors"]
               if (a["id"].startswith("perimeter") or a.get("horizon"))
               and not a.get("offFrame")]
    elif args.anchors == "structural":
        fit = [a for a in data["anchors"] if a.get("kind") == "structural"]
    else:
        fit = [a for a in data["anchors"] if a["world"] or a.get("horizon")]

    print(f"fitting {len(fit)} anchors: {', '.join(a['id'] for a in fit)}")

    # The reference composition is symmetric about the courtyard — the fountain sits within
    # a percent of image centre — so the camera is held on the centreline with no yaw
    # unless asked otherwise. Four anchors cannot support six free parameters; the earlier
    # unconstrained fit collapsed onto a degenerate 85 mm view 224 m away.
    symmetric = not args.free_symmetry
    print(f"symmetry: {'camera locked to x=0, yaw=0' if symmetric else 'free'}\n")

    def unpack(p):
        return [0.0, p[0], p[1], p[2], 0.0, p[3]] if symmetric else list(p)

    def cost(p):
        return residuals(unpack(p), fit, width, height)

    if symmetric:
        start = [30.0, 70.0, math.radians(30.0), 30.0]
        step = [8.0, 15.0, math.radians(8.0), 6.0]
        polish = [1.0, 2.0, math.radians(1.0), 1.0]
    else:
        start = [0.0, 30.0, 70.0, math.radians(30.0), 0.0, 30.0]
        step = [2.0, 8.0, 15.0, math.radians(8.0), math.radians(3.0), 6.0]
        polish = [0.4, 1.0, 2.0, math.radians(1.0), math.radians(0.5), 1.0]

    best, score = nelder_mead(cost, start, step)
    best, score = nelder_mead(cost, best, polish)
    best = unpack(best)

    cx, cy, cz, pitch, yaw, focal = best
    vfov = 2 * math.degrees(math.atan((SENSOR_WIDTH * height / width / 2) / focal))
    print(f"position      [{cx:.2f}, {cy:.2f}, {cz:.2f}]")
    print(f"pitch         {math.degrees(pitch):.2f} deg down")
    print(f"yaw           {math.degrees(yaw):.2f} deg")
    print(f"focal         {focal:.2f} mm   (vFOV {vfov:.1f} deg)")
    print(f"fit RMS       {score:.1f} px = {100*score/diagonal:.2f}% of diagonal\n")

    print(f"{'anchor':32} {'ref':>14} {'projected':>14} {'err px':>8} {'% diag':>7}")
    for anchor in data["anchors"]:
        world = anchor["world"]
        if anchor.get("horizon"):
            world = (0.0, cy, -HORIZON_RANGE)
        if world is None:
            continue
        p = project(best, world, width, height)
        target = (anchor["image"][0] * width, anchor["image"][1] * height)
        if p is None:
            print(f"{anchor['id']:32} {'':>14} {'BEHIND CAMERA':>14}")
            continue
        err = math.hypot(p[0] - target[0], p[1] - target[1])
        marker = "  <-- fitted" if anchor in fit else ""
        print(f"{anchor['id']:32} {target[0]:6.0f},{target[1]:5.0f} "
              f"{p[0]:6.0f},{p[1]:5.0f} {err:8.0f} {100*err/diagonal:6.2f}%{marker}")

    if args.apply:
        distance = 70.0
        target_point = [
            round(cx + distance * math.sin(yaw) * math.cos(pitch), 2),
            round(cy - distance * math.sin(pitch), 2),
            round(cz - distance * math.cos(yaw) * math.cos(pitch), 2),
        ]
        doc = json.loads(LAYOUT.read_text())
        doc["reviewCamera"].update({
            "position": [round(cx, 2), round(cy, 2), round(cz, 2)],
            "target": target_point,
            "focalLengthMm": round(focal, 2),
            "sensorWidthMm": 36,
        })
        LAYOUT.write_text(json.dumps(doc, indent=2) + "\n")
        print(f"\napplied to layout reviewCamera: {json.dumps(doc['reviewCamera'])}")


if __name__ == "__main__":
    main()
