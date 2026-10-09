"""Shrink an uploaded photo to at most MAX_BYTES (JPEG, no metadata) and make a thumbnail."""

import io

from PIL import Image, ImageOps, UnidentifiedImageError

MAX_UPLOAD_BYTES = 15 * 1024 * 1024  # what we are willing to read from the phone
MAX_PIXELS = 50_000_000  # refuse decompression bombs
FIRST_EDGE = 2000  # longest side to start from
THUMB_EDGE = 320
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP", "GIF", "MPO"}


class ImageRejected(ValueError):
    """The upload is not a usable picture; the message is safe to show the user."""


def _encode(img, edge, quality):
    work = img.copy()
    work.thumbnail((edge, edge), Image.LANCZOS)
    out = io.BytesIO()
    work.save(out, format="JPEG", quality=quality, optimize=True)
    return out.getvalue(), work.size


def shrink(raw, max_bytes):
    """Return (jpeg bytes <= max_bytes, (width, height), thumbnail bytes). Raises ImageRejected."""
    if len(raw) > MAX_UPLOAD_BYTES:
        raise ImageRejected("That picture is too large (limit 15 MB).")
    try:
        probe = Image.open(io.BytesIO(raw))
        probe.verify()  # catches truncated and corrupt files
        img = Image.open(io.BytesIO(raw))
        if img.format not in ALLOWED_FORMATS:
            raise ImageRejected("Only JPEG, PNG, WebP or GIF pictures can be sent.")
        if img.width * img.height > MAX_PIXELS:
            raise ImageRejected("That picture's dimensions are too large.")
        img.load()
    except ImageRejected:
        raise
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError, Image.DecompressionBombError):
        raise ImageRejected("That file is not a picture we can read.")

    img = ImageOps.exif_transpose(img)  # stand it upright, then forget the metadata
    if img.mode in ("RGBA", "LA", "P"):
        rgba = img.convert("RGBA")
        base = Image.new("RGB", rgba.size, (255, 255, 255))
        base.paste(rgba, mask=rgba.split()[-1])
        img = base
    else:
        img = img.convert("RGB")

    edge, quality = FIRST_EDGE, 85
    data, size = _encode(img, edge, quality)
    # lower the quality first, then the dimensions, until it fits
    while len(data) > max_bytes:
        if quality > 50:
            quality -= 10
        elif edge > 400:
            edge = int(edge * 0.8)
            quality = 80
        else:
            raise ImageRejected("That picture could not be made small enough.")
        data, size = _encode(img, edge, quality)

    thumb, _ = _encode(img, THUMB_EDGE, 70)
    return data, size, thumb
