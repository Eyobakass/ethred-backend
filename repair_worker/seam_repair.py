"""
seam_repair.py — OpenCV-based equirectangular seam detection and repair.
SRS Reference: SRS-ETHRED-2026-VT-1.0 §13.2, REQ-TOUR-REP-02

Strategy:
  1. Detect the vertical seam at the 0°/360° boundary (leftmost/rightmost column)
  2. Apply a Gaussian blur band across the seam to reduce harsh transitions
  3. Use OpenCV inpainting (Telea method) on a seam mask for more severe artifacts

The seam in an equirectangular panorama is always at the image's left/right edge —
the columns that should be identical but rarely are after stitching.
"""

import cv2
import numpy as np


# Width of the seam correction band in pixels (both sides of the 0°/360° boundary)
SEAM_BAND_PX = 32
BLUR_SIGMA = 15


def _build_seam_mask(height: int, width: int, band: int = SEAM_BAND_PX) -> np.ndarray:
    """
    Returns a single-channel mask (uint8) marking the seam band.
    The seam in equirectangular panoramas wraps at x=0 and x=width-1.
    We mark `band` pixels from each edge.
    """
    mask = np.zeros((height, width), dtype=np.uint8)
    mask[:, :band] = 255
    mask[:, width - band:] = 255
    return mask


def detect_and_repair_seams(image: np.ndarray) -> np.ndarray:
    """
    Detect and soften the vertical seam in an equirectangular panorama.

    Args:
        image: BGR image as a numpy array (modified in place, copy is recommended).

    Returns:
        Repaired BGR image as numpy array.
    """
    height, width = image.shape[:2]

    # ── Step 1: Roll the image by half-width to put the seam in the centre ─────
    # This prevents Gaussian blur from bleeding off the edge.
    half = width // 2
    rolled = np.roll(image, half, axis=1)

    # ── Step 2: Compute absolute difference between left/right columns ──────────
    left_col  = rolled[:, half - 1]       # just left of seam
    right_col = rolled[:, half]            # just right of seam
    diff = np.abs(left_col.astype(np.int32) - right_col.astype(np.int32))
    mean_diff = float(diff.mean())

    if mean_diff < 3.0:
        # Seam is visually clean — skip expensive processing
        return image

    # ── Step 3: Apply Gaussian blur to seam band on the rolled image ────────────
    seam_start = half - SEAM_BAND_PX
    seam_end   = half + SEAM_BAND_PX

    band_region = rolled[:, seam_start:seam_end].copy()
    blurred = cv2.GaussianBlur(
        band_region,
        ksize=(0, 0),
        sigmaX=BLUR_SIGMA,
        sigmaY=BLUR_SIGMA,
        borderType=cv2.BORDER_REFLECT,
    )

    # ── Step 4: Blend original and blurred using a linear alpha ramp ────────────
    # Pixels closest to the seam centre get the most blurring.
    band_width = seam_end - seam_start
    alpha = np.abs(np.linspace(-1.0, 1.0, band_width)).reshape(1, -1, 1)
    # alpha = 1 at edges (original), 0 at centre (full blur)
    blended = (alpha * band_region + (1.0 - alpha) * blurred).astype(np.uint8)
    rolled[:, seam_start:seam_end] = blended

    # ── Step 5: Roll back to original orientation ────────────────────────────────
    result = np.roll(rolled, -half, axis=1)

    return result
