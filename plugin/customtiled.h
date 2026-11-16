// Whether a window is in one of kwin-i3's custom tiles, as kwin-i3's tree has it.
#pragma once

#include <window.h>

namespace KWin
{

// True when the window's requested or committed quick-tile mode is Custom. quickTileMode() is the
// committed mode, which a Wayland client takes only on its ack: a window just tiled whose client
// is slow, or stopped, would read untiled from it alone (docs/kwin-notes.md).
inline bool customTiled(const Window *w)
{
    return w->requestedQuickTileMode() == QuickTileMode(QuickTileFlag::Custom) || w->quickTileMode() == QuickTileMode(QuickTileFlag::Custom);
}

}
