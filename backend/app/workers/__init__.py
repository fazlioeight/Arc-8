"""Long-running worker entry points.

Each module here is invocable as ``python -m app.workers.<name>`` and is
designed to run as a separate Container App revision (one workload per
container, easy to scale and roll back independently).

Workers must NOT import FastAPI route handlers — that would pull the entire
HTTP stack into a process that doesn't need it. They share models, services,
and config with the API.
"""
