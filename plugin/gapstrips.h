// The gaps are kwin-i3's, as i3's are i3's. i3
// reparents every client into a frame window of its own, so X11 clips the client to its tile and
// the space between tiles is the window manager's: the arrow there, and i3's press. On Wayland an
// app that draws its own frame (VS Code, Chromium, GTK header bars) keeps an invisible resize band
// past it that KWin hands the pointer to, gap and all. So kwin-i3 puts windows of its own over the
// gaps, inside KWin (InternalWindow: KWin's hit test honours them before any app, Overlay layer),
// transparent, one per strip so that only the gaps are ever painted:
//   the strips: each shown tiled window's frame grown by the gap reach (TilingDrag's), less every
//   tiled frame, on its output; less every other shown window (floating, panels, popups,
//   notifications: all are above the tiles, and the strips are above everything); none on an
//   output with a fullscreen window. Kept current on any change of those, once per event loop.
// A press on a strip is a gap press (FrameFocus::decide). Installed by the helper (helper.cpp).
#pragma once

#include <QList>
#include <QObject>
#include <QRegion>
#include <QTimer>
#include <QWindow>

#include <functional>
#include <memory>
#include <vector>

namespace KWin
{
class Window;
}

class GapStrips : public QObject
{
public:
    // reach: the gap reach in px (TilingDrag's resize gap; 0 when off), read at each update.
    explicit GapStrips(std::function<int()> reach, std::function<int()> frameWidth);
    ~GapStrips() override;

    // A strip of kwin-i3's: for the filters, the pointer over it is the pointer in the gap.
    static bool isStrip(const KWin::Window *w);
    // Ask for an update at the next turn of the event loop (several asks, one update).
    void dirty();

private:
    void watch(KWin::Window *w);
    void update();
    QRegion strips() const;

    std::function<int()> m_reach;
    std::function<int()> m_frameWidth;
    QTimer m_timer;
    std::vector<std::unique_ptr<QWindow>> m_windows;   // one per rect of the region, reused
    QRegion m_region;
};
