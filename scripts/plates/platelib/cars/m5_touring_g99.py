"""m5_touring_g99 (M5 Touring): the fixes and role assignments only this car needs.

apply(ctx) runs once after the shared look; on_view(ctx, view) after every view change.
Everything the Touring shares with the saloon is in _m5_common.py; read that file's header first.
"""
from . import _m5_common as m5


def apply(ctx):
    # The Touring's lamp mesh has no lit strips in the tail lamps (no LightTail material), so its L-shaped
    # light bars are lit themselves; otherwise the rear lamps would be off while the saloon's are on.
    m5.apply(ctx, tail_bars_lit=True)
