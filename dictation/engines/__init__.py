"""Speech and text engines. Each lives in its own module so another vendor can be added beside it."""


class EngineUnavailable(Exception):
    """The engine is not configured (no credentials, no model id) or the vendor call failed."""
