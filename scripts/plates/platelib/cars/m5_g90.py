"""m5_g90 (M5 saloon): the fixes and role assignments only this car needs.

apply(ctx) runs once after the shared look; on_view(ctx, view) after every view change.
Everything the saloon shares with the Touring is in _m5_common.py; read that file's header first.
"""
from . import _m5_common as m5


def apply(ctx):
    # The saloon's tail lamps have their own lit strips (LightTail) behind clear light bars.
    m5.apply(ctx, tail_bars_lit=False)
