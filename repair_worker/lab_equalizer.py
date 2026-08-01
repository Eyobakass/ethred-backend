"""
lab_equalizer.py — scikit-image LAB colour channel equalization.
SRS Reference: SRS-ETHRED-2026-VT-1.0 §13.2, REQ-TOUR-REP-02

Strategy:
  - Convert BGR → LAB colour space
  - Apply CLAHE (Contrast Limited Adaptive Histogram Equalization) to the L channel only
  - Leave A and B (colour) channels unchanged to prevent colour shifting
  - Convert LAB → BGR

This corrects exposure and contrast inconsistencies that commonly appear
at panorama stitching seams without affecting colour balance.
"""

import cv2
import numpy as np


# CLAHE parameters — tune these for aggressiveness vs. naturalness
CLIP_LIMIT = 2.0       # higher = more aggressive contrast boost
TILE_GRID_SIZE = (8, 8)  # grid for adaptive histogram


def equalize_lab(image: np.ndarray) -> np.ndarray:
    """
    Apply CLAHE equalisation to the L channel of the LAB colour space.

    Args:
        image: BGR uint8 numpy array.

    Returns:
        Equalized BGR uint8 numpy array (same shape).
    """
    if image is None or image.size == 0:
        return image

    # ── Convert BGR → LAB ─────────────────────────────────────────────────────
    lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)

    # ── Split into channels ────────────────────────────────────────────────────
    l_channel, a_channel, b_channel = cv2.split(lab)

    # ── Apply CLAHE to L channel only ──────────────────────────────────────────
    clahe = cv2.createCLAHE(clipLimit=CLIP_LIMIT, tileGridSize=TILE_GRID_SIZE)
    l_equalized = clahe.apply(l_channel)

    # ── Recombine and convert back to BGR ────────────────────────────────────
    lab_equalized = cv2.merge([l_equalized, a_channel, b_channel])
    result = cv2.cvtColor(lab_equalized, cv2.COLOR_LAB2BGR)

    return result
