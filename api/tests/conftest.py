"""Pytest configuration — ensure api/ is on sys.path for shared imports."""
import sys
from pathlib import Path

# Add api/ to path so `from shared.X import Y` works in tests
api_dir = Path(__file__).resolve().parent.parent
if str(api_dir) not in sys.path:
    sys.path.insert(0, str(api_dir))
