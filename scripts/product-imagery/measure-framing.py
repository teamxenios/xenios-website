#!/usr/bin/env python3
"""Read-only, resolution-scaled framing measurement for private imagery evidence.

The pixel method is the smallest deterministic successor to Claude review 27's
Pillow probe. It reads one PNG and writes JSON to stdout. It never changes the
input and never writes an image or sidecar file.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
import platform
import sys
from pathlib import Path
from typing import Any

import PIL
from PIL import Image, ImageChops, ImageDraw, ImageFilter


SCHEMA_VERSION = "xenios_imagery_framing_v1"
REFERENCE_SIDE_PX = 1254
CONTRAST_THRESHOLD_8_BIT = 18
SOURCE_METHOD = {
    "reviewCommit": "96e06765dbec9063a7311f128d0ab8accf8588b5",
    "reviewPath": (
        "docs/review/xenios-health-launch-review-20260930/imagery/"
        "27_measure_framing.py"
    ),
    "reviewedCalibrationSource": "aa4f31f9b650e68a7c7c2c749f00417d20607665",
    "referenceSidePx": REFERENCE_SIDE_PX,
    "method": (
        "Pillow grayscale minus scaled Gaussian blur, fixed 8-bit contrast "
        "threshold, scaled Min/Max morphology, foreground bounding box, and "
        "scaled left-background vertical-gradient horizon probe"
    ),
}
AUTHORITY = {
    "measurementOnly": True,
    "renderAuthorization": False,
    "publicationAuthorization": False,
    "commerceAuthority": False,
    "independentAcceptance": False,
}

REFERENCE_SPATIAL_PARAMETERS = {
    "blurRadiusPx": 30,
    "morphologyKernelPx": 5,
    "horizonInsetPx": 40,
    "horizonGradientHalfWindowPx": 20,
    "horizonScanTopPx": 200,
    "horizonScanBottomExclusionPx": 100,
}
SPATIAL_RATIOS = {
    key: value / REFERENCE_SIDE_PX
    for key, value in REFERENCE_SPATIAL_PARAMETERS.items()
}

SUBJECT_HEIGHT_RANGE = (0.61, 0.75)
SUBJECT_HEIGHT_TARGET = 0.68
HORIZON_RANGE = (0.521, 0.575)
TOP_MARGIN_RANGE = (0.163, 0.179)
PROVISIONAL_HORIZONTAL_CENTER_TOLERANCE = 0.05


def _round_half_up(value: float) -> int:
    return int(math.floor(value + 0.5))


def _nearest_odd(value: float) -> int:
    """Quantize a scaled morphology window to the nearest positive odd size."""

    nearest = max(1, _round_half_up(value))
    if nearest % 2 == 1:
        return nearest
    lower = max(1, nearest - 1)
    upper = nearest + 1
    if abs(value - lower) <= abs(upper - value):
        return lower
    return upper


def _normalized(value: float) -> float:
    return round(value, 8)


def scale_parameters(side_px: int) -> dict[str, Any]:
    if side_px <= 0:
        raise ValueError("side_px must be positive")

    scaled = {
        "blurRadiusPx": round(SPATIAL_RATIOS["blurRadiusPx"] * side_px, 8),
        "morphologyKernelPx": _nearest_odd(
            SPATIAL_RATIOS["morphologyKernelPx"] * side_px
        ),
        "horizonInsetPx": max(
            1, _round_half_up(SPATIAL_RATIOS["horizonInsetPx"] * side_px)
        ),
        "horizonGradientHalfWindowPx": max(
            1,
            _round_half_up(
                SPATIAL_RATIOS["horizonGradientHalfWindowPx"] * side_px
            ),
        ),
        "horizonScanTopPx": _round_half_up(
            SPATIAL_RATIOS["horizonScanTopPx"] * side_px
        ),
        "horizonScanBottomExclusionPx": _round_half_up(
            SPATIAL_RATIOS["horizonScanBottomExclusionPx"] * side_px
        ),
    }
    return {
        "referenceSidePx": REFERENCE_SIDE_PX,
        "referencePx": dict(REFERENCE_SPATIAL_PARAMETERS),
        "ratios": {
            key: round(value, 10) for key, value in SPATIAL_RATIOS.items()
        },
        "scaledPx": scaled,
        "contrastThreshold8Bit": CONTRAST_THRESHOLD_8_BIT,
        "contrastThresholdNormalized": round(CONTRAST_THRESHOLD_8_BIT / 255, 10),
        "scalingRule": (
            "Every spatial blur, kernel, inset, gradient window, and scan bound "
            "is derived from sidePx; only the dimensionless 8-bit contrast "
            "threshold remains fixed"
        ),
    }


def _pixel_range(side_px: int, ratio_range: tuple[float, float]) -> tuple[int, int]:
    # Rounded inclusive bounds retain the accepted 1254 px reference measurements:
    # study 01 top=204 and horizon=653, study 02 top=224 and horizon=721.
    return (
        _round_half_up(ratio_range[0] * side_px),
        _round_half_up(ratio_range[1] * side_px),
    )


def _gate_criteria(side_px: int) -> dict[str, Any]:
    subject_bounds = _pixel_range(side_px, SUBJECT_HEIGHT_RANGE)
    top_bounds = _pixel_range(side_px, TOP_MARGIN_RANGE)
    horizon_bounds = _pixel_range(side_px, HORIZON_RANGE)
    return {
        "squareRequired": True,
        "subjectHeight": {
            "minimumNormalized": SUBJECT_HEIGHT_RANGE[0],
            "maximumNormalized": SUBJECT_HEIGHT_RANGE[1],
            "targetNormalized": SUBJECT_HEIGHT_TARGET,
            "inclusivePixelBounds": list(subject_bounds),
        },
        "topMargin": {
            "minimumNormalized": TOP_MARGIN_RANGE[0],
            "maximumNormalized": TOP_MARGIN_RANGE[1],
            "inclusivePixelBounds": list(top_bounds),
        },
        "horizon": {
            "minimumNormalized": HORIZON_RANGE[0],
            "maximumNormalized": HORIZON_RANGE[1],
            "inclusivePixelBounds": list(horizon_bounds),
            "gateProbe": "left_background_column",
        },
        "horizontalCenter": {
            "maximumOffsetNormalized": PROVISIONAL_HORIZONTAL_CENTER_TOLERANCE,
            "provisionalEngineeringToleranceNotFounderAuthorized": True,
        },
        "edgeContactAllowed": False,
        "pixelQuantization": "round_half_up_then_compare_inclusive",
    }


def evaluate_gate(
    *,
    side_px: int,
    square: bool,
    bbox: tuple[int, int, int, int] | None,
    horizon_px: int | None,
) -> dict[str, Any]:
    """Evaluate already-measured pixel geometry against the prospective gate."""

    criteria = _gate_criteria(side_px)
    failure_codes: list[str] = []

    if not square:
        failure_codes.append("NOT_SQUARE")
        return {
            "passed": False,
            "result": "fail",
            "failureCodes": failure_codes,
            "criteria": criteria,
            "authorityBoundary": (
                "A passing measurement grants no render, publication, commerce, "
                "or independent-acceptance authority"
            ),
        }

    if bbox is None:
        failure_codes.append("SUBJECT_NOT_DETECTED")
        return {
            "passed": False,
            "result": "fail",
            "failureCodes": failure_codes,
            "criteria": criteria,
            "authorityBoundary": (
                "A passing measurement grants no render, publication, commerce, "
                "or independent-acceptance authority"
            ),
        }

    x0, y0, x1, y1 = bbox
    subject_height_px = y1 - y0
    subject_min_px, subject_max_px = criteria["subjectHeight"][
        "inclusivePixelBounds"
    ]
    top_min_px, top_max_px = criteria["topMargin"]["inclusivePixelBounds"]
    horizon_min_px, horizon_max_px = criteria["horizon"]["inclusivePixelBounds"]

    if subject_height_px < subject_min_px:
        failure_codes.append("SUBJECT_HEIGHT_BELOW_MIN")
    if subject_height_px > subject_max_px:
        failure_codes.append("SUBJECT_HEIGHT_ABOVE_MAX")
    if y0 < top_min_px:
        failure_codes.append("TOP_MARGIN_BELOW_MIN")
    if y0 > top_max_px:
        failure_codes.append("TOP_MARGIN_ABOVE_MAX")
    if horizon_px is None:
        failure_codes.append("HORIZON_NOT_DETECTED")
    elif horizon_px < horizon_min_px:
        failure_codes.append("HORIZON_BELOW_MIN")
    elif horizon_px > horizon_max_px:
        failure_codes.append("HORIZON_ABOVE_MAX")

    horizontal_center = (x0 + x1) / (2 * side_px)
    if abs(horizontal_center - 0.5) > PROVISIONAL_HORIZONTAL_CENTER_TOLERANCE:
        failure_codes.append("HORIZONTAL_CENTER_OUTSIDE_PROVISIONAL_TOLERANCE")

    if x0 <= 0 or y0 <= 0 or x1 >= side_px or y1 >= side_px:
        failure_codes.append("EDGE_CONTACT")

    return {
        "passed": not failure_codes,
        "result": "pass" if not failure_codes else "fail",
        "failureCodes": failure_codes,
        "criteria": criteria,
        "authorityBoundary": (
            "A passing measurement grants no render, publication, commerce, "
            "or independent-acceptance authority"
        ),
    }


def _detect_horizon(
    blurred: Image.Image,
    *,
    x: int,
    scan_start: int,
    scan_end: int,
    half_window: int,
) -> dict[str, int]:
    column = [blurred.getpixel((x, y)) for y in range(blurred.height)]
    best_strength = -1
    best_y = scan_start
    # Strict greater-than intentionally retains the earliest y on an equal peak,
    # matching the report-27 method.
    for y in range(scan_start, scan_end):
        strength = abs(column[y + half_window] - column[y - half_window])
        if strength > best_strength:
            best_strength = strength
            best_y = y
    return {"pixels": best_y, "strength8Bit": best_strength}


def _measure_pixels(grayscale: Image.Image) -> dict[str, Any]:
    width, height = grayscale.size
    if width != height:
        return {
            "parameters": None,
            "measurements": None,
            "gate": evaluate_gate(
                side_px=max(width, height),
                square=False,
                bbox=None,
                horizon_px=None,
            ),
        }

    side_px = width
    parameters = scale_parameters(side_px)
    scaled = parameters["scaledPx"]
    blurred = grayscale.filter(ImageFilter.GaussianBlur(scaled["blurRadiusPx"]))
    foreground = ImageChops.difference(grayscale, blurred).point(
        lambda value: 255 if value > CONTRAST_THRESHOLD_8_BIT else 0
    )
    morphology_kernel = scaled["morphologyKernelPx"]
    if morphology_kernel > 1:
        foreground = foreground.filter(ImageFilter.MinFilter(morphology_kernel))
        foreground = foreground.filter(ImageFilter.MaxFilter(morphology_kernel))
    bbox = foreground.getbbox()

    half_window = scaled["horizonGradientHalfWindowPx"]
    scan_start = max(scaled["horizonScanTopPx"], half_window)
    scan_end = min(
        side_px - scaled["horizonScanBottomExclusionPx"],
        side_px - half_window,
    )
    if scan_end <= scan_start:
        raise ValueError("scaled horizon scan window is empty")

    inset = min(max(1, scaled["horizonInsetPx"]), side_px - 1)
    left_horizon = _detect_horizon(
        blurred,
        x=inset,
        scan_start=scan_start,
        scan_end=scan_end,
        half_window=half_window,
    )
    right_horizon = _detect_horizon(
        blurred,
        x=side_px - inset,
        scan_start=scan_start,
        scan_end=scan_end,
        half_window=half_window,
    )

    gate = evaluate_gate(
        side_px=side_px,
        square=True,
        bbox=bbox,
        horizon_px=left_horizon["pixels"],
    )
    if bbox is None:
        return {
            "parameters": parameters,
            "measurements": None,
            "gate": gate,
        }

    x0, y0, x1, y1 = bbox
    subject_width_px = x1 - x0
    subject_height_px = y1 - y0
    center_x = (x0 + x1) / (2 * side_px)
    center_y = (y0 + y1) / (2 * side_px)
    edge_pixels = {
        "left": x0,
        "right": side_px - x1,
        "top": y0,
        "bottom": side_px - y1,
    }
    measurements = {
        "bbox": {
            "pixels": {
                "x0": x0,
                "y0": y0,
                "x1Exclusive": x1,
                "y1Exclusive": y1,
            },
            "normalized": {
                "x0": _normalized(x0 / side_px),
                "y0": _normalized(y0 / side_px),
                "x1Exclusive": _normalized(x1 / side_px),
                "y1Exclusive": _normalized(y1 / side_px),
            },
        },
        "subjectWidth": {
            "pixels": subject_width_px,
            "normalized": _normalized(subject_width_px / side_px),
        },
        "subjectHeight": {
            "pixels": subject_height_px,
            "normalized": _normalized(subject_height_px / side_px),
            "targetNormalized": SUBJECT_HEIGHT_TARGET,
        },
        "topMargin": {
            "pixels": y0,
            "normalized": _normalized(y0 / side_px),
        },
        "horizon": {
            "pixels": left_horizon["pixels"],
            "normalized": _normalized(left_horizon["pixels"] / side_px),
            "strength8Bit": left_horizon["strength8Bit"],
            "gateProbe": "left",
            "left": {
                **left_horizon,
                "normalized": _normalized(left_horizon["pixels"] / side_px),
            },
            "rightDiagnostic": {
                **right_horizon,
                "normalized": _normalized(right_horizon["pixels"] / side_px),
            },
        },
        "center": {
            "normalizedX": _normalized(center_x),
            "normalizedY": _normalized(center_y),
            "horizontalOffsetFromFrameCenter": _normalized(abs(center_x - 0.5)),
            "verticalOffsetFromFrameCenter": _normalized(abs(center_y - 0.5)),
            "provisionalHorizontalTolerance": (
                PROVISIONAL_HORIZONTAL_CENTER_TOLERANCE
            ),
            "provisionalEngineeringToleranceNotFounderAuthorized": True,
        },
        "edgeClearance": {
            "pixels": edge_pixels,
            "normalized": {
                key: _normalized(value / side_px)
                for key, value in edge_pixels.items()
            },
            "minimumPixels": min(edge_pixels.values()),
            "minimumNormalized": _normalized(
                min(edge_pixels.values()) / side_px
            ),
            "contact": any(value <= 0 for value in edge_pixels.values()),
        },
    }
    return {
        "parameters": parameters,
        "measurements": measurements,
        "gate": gate,
    }


def measure_png(input_path: Path) -> dict[str, Any]:
    content = input_path.read_bytes()
    content_sha256 = hashlib.sha256(content).hexdigest()
    with Image.open(io.BytesIO(content)) as source:
        source.load()
        if source.format != "PNG":
            raise ValueError("input must be a PNG")
        dimensions = source.size
        grayscale = source.convert("L")

    measured = _measure_pixels(grayscale)
    width, height = dimensions
    return {
        "schemaVersion": SCHEMA_VERSION,
        "kind": "image_framing_measurement",
        "authority": dict(AUTHORITY),
        "sourceMethod": dict(SOURCE_METHOD),
        "tool": {
            "pythonVersion": platform.python_version(),
            "pillowVersion": PIL.__version__,
        },
        "input": {
            "contentSha256": content_sha256,
            "format": "PNG",
        },
        "dimensions": {
            "width": width,
            "height": height,
            "square": width == height,
            "sidePx": width if width == height else None,
        },
        **measured,
    }


def _synthetic_image(side_px: int) -> Image.Image:
    horizon_px = _round_half_up(0.55 * side_px)
    transition = max(1.0, 0.035 * side_px)
    column = Image.new("L", (1, side_px))
    column.putdata(
        [
            _round_half_up(
                34
                + 26
                * (0.5 + 0.5 * math.tanh((y - horizon_px) / transition))
            )
            for y in range(side_px)
        ]
    )
    image = column.resize((side_px, side_px))
    draw = ImageDraw.Draw(image)
    # The probe detects the high-frequency edge band around the drawn form, so
    # this source geometry intentionally lands at about .17 top / .68 height in
    # the measured mask rather than treating draw coordinates as measurements.
    top = _round_half_up(0.20 * side_px)
    height = _round_half_up(0.62 * side_px)
    left = _round_half_up(0.35 * side_px)
    right = _round_half_up(0.65 * side_px) - 1
    bottom = top + height - 1
    draw.rounded_rectangle(
        (left, top, right, bottom),
        radius=max(1, _round_half_up(0.025 * side_px)),
        fill=190,
    )
    return image


def _self_test() -> dict[str, Any]:
    scale_sides = [320, 768, 1254, 2048]
    scale_results = [
        {"sidePx": side, "parameters": scale_parameters(side)}
        for side in scale_sides
    ]

    side = REFERENCE_SIDE_PX
    subject_min, subject_max = _pixel_range(side, SUBJECT_HEIGHT_RANGE)
    top_min, top_max = _pixel_range(side, TOP_MARGIN_RANGE)
    horizon_min, horizon_max = _pixel_range(side, HORIZON_RANGE)

    def bbox_for(
        *,
        height_px: int = _round_half_up(SUBJECT_HEIGHT_TARGET * side),
        top_px: int = _round_half_up(0.17 * side),
        x0: int = _round_half_up(0.35 * side),
        x1: int = _round_half_up(0.65 * side),
    ) -> tuple[int, int, int, int]:
        return (x0, top_px, x1, top_px + height_px)

    cases: list[dict[str, Any]] = []

    def gate_case(
        name: str,
        expected_codes: list[str],
        *,
        square: bool = True,
        bbox: tuple[int, int, int, int] | None = None,
        horizon_px: int | None = _round_half_up(0.55 * side),
    ) -> None:
        actual = evaluate_gate(
            side_px=side,
            square=square,
            bbox=bbox_for() if bbox is None and square else bbox,
            horizon_px=horizon_px,
        )
        if actual["failureCodes"] != expected_codes:
            raise AssertionError(
                f"{name}: expected {expected_codes}, got {actual['failureCodes']}"
            )
        cases.append(
            {
                "name": name,
                "passed": True,
                "gatePassed": actual["passed"],
                "failureCodes": actual["failureCodes"],
            }
        )

    gate_case("nominal_pass", [])
    gate_case(
        "inclusive_minimums_pass",
        [],
        bbox=bbox_for(height_px=subject_min, top_px=top_min),
        horizon_px=horizon_min,
    )
    gate_case(
        "inclusive_maximums_pass",
        [],
        bbox=bbox_for(height_px=subject_max, top_px=top_max),
        horizon_px=horizon_max,
    )
    gate_case("not_square", ["NOT_SQUARE"], square=False, bbox=None)
    no_subject = evaluate_gate(
        side_px=side,
        square=True,
        bbox=None,
        horizon_px=_round_half_up(0.55 * side),
    )
    if no_subject["failureCodes"] != ["SUBJECT_NOT_DETECTED"]:
        raise AssertionError("subject-not-detected gate drifted")
    cases.append(
        {
            "name": "subject_not_detected",
            "passed": True,
            "gatePassed": False,
            "failureCodes": no_subject["failureCodes"],
        }
    )
    gate_case(
        "subject_height_below",
        ["SUBJECT_HEIGHT_BELOW_MIN"],
        bbox=bbox_for(height_px=subject_min - 1),
    )
    gate_case(
        "subject_height_above",
        ["SUBJECT_HEIGHT_ABOVE_MAX"],
        bbox=bbox_for(height_px=subject_max + 1),
    )
    gate_case(
        "top_margin_below",
        ["TOP_MARGIN_BELOW_MIN"],
        bbox=bbox_for(top_px=top_min - 1),
    )
    gate_case(
        "top_margin_above",
        ["TOP_MARGIN_ABOVE_MAX"],
        bbox=bbox_for(top_px=top_max + 1),
    )
    gate_case(
        "horizon_below",
        ["HORIZON_BELOW_MIN"],
        horizon_px=horizon_min - 1,
    )
    gate_case(
        "horizon_above",
        ["HORIZON_ABOVE_MAX"],
        horizon_px=horizon_max + 1,
    )
    centered_width = _round_half_up(0.30 * side)
    off_center_x0 = _round_half_up(0.56 * side) - centered_width // 2
    gate_case(
        "horizontal_center_outside",
        ["HORIZONTAL_CENTER_OUTSIDE_PROVISIONAL_TOLERANCE"],
        bbox=bbox_for(x0=off_center_x0, x1=off_center_x0 + centered_width),
    )
    gate_case(
        "edge_contact",
        ["EDGE_CONTACT"],
        bbox=bbox_for(x0=0, x1=side),
    )

    synthetic_results = []
    for synthetic_side in scale_sides:
        result = _measure_pixels(_synthetic_image(synthetic_side))
        if not result["gate"]["passed"]:
            raise AssertionError(
                f"synthetic {synthetic_side} failed: "
                f"{result['gate']['failureCodes']}"
            )
        synthetic_results.append(
            {
                "sidePx": synthetic_side,
                "gatePassed": True,
                "subjectHeightNormalized": result["measurements"][
                    "subjectHeight"
                ]["normalized"],
                "topMarginNormalized": result["measurements"]["topMargin"][
                    "normalized"
                ],
                "horizonNormalized": result["measurements"]["horizon"][
                    "normalized"
                ],
            }
        )

    return {
        "schemaVersion": SCHEMA_VERSION,
        "kind": "image_framing_measurement_self_test",
        "authority": dict(AUTHORITY),
        "sourceMethod": dict(SOURCE_METHOD),
        "tool": {
            "pythonVersion": platform.python_version(),
            "pillowVersion": PIL.__version__,
        },
        "scales": scale_results,
        "cases": cases,
        "syntheticMeasurements": synthetic_results,
        "passed": True,
    }


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Measure one PNG against the prospective Xenios 1:1 framing gate."
    )
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--input", type=Path, help="PNG to measure read-only")
    source.add_argument(
        "--self-test",
        action="store_true",
        help="run in-memory scale, gate, and synthetic-image checks",
    )
    parser.add_argument(
        "--enforce",
        action="store_true",
        help="exit 3 when a measured input fails the gate; JSON is still emitted",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    if args.self_test:
        if args.enforce:
            raise ValueError("--enforce is only valid with --input")
        result = _self_test()
        print(json.dumps(result, sort_keys=True))
        return 0

    result = measure_png(args.input)
    print(json.dumps(result, sort_keys=True))
    if args.enforce and not result["gate"]["passed"]:
        return 3
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:  # pragma: no cover - CLI boundary
        print(
            json.dumps(
                {
                    "schemaVersion": SCHEMA_VERSION,
                    "kind": "image_framing_measurement_error",
                    "error": type(error).__name__,
                    "message": str(error),
                },
                sort_keys=True,
            ),
            file=sys.stderr,
        )
        raise SystemExit(2)
