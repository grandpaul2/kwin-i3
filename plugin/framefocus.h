// Focus on a tiled window's frame as i3 does: the frame kwini3hold draws in the tile's padding
// (docs/spec-window-modes.md) is outside every window, so KWin would give a press there to
// whatever is beneath, the desktop (its menu on a right-click, a rubber band on a drag). This
// filter makes the frame part of its window for focus and clicks, with KWin's own calls.
// (It did the same for kwini3frame's decoration until that was retired, 2026-10-24; and modifier
// + mouse button chords until earlier that day, docs/mouse-plugin-design.md.) Installed by the
// helper plugin (helper.cpp).
#pragma once

#include <input.h>

#include <KConfigWatcher>

#include <QObject>
#include <QPointer>

class TilingDrag;

class FrameFocus : public KWin::InputEventFilter
{
public:
    explicit FrameFocus(TilingDrag *drag);

    bool pointerMotion(KWin::PointerMotionEvent *event) override;
    bool pointerButton(KWin::PointerButtonEvent *event) override;
    bool pointerAxis(KWin::PointerAxisEvent *event) override;

private:
    KWin::Window *ringWindow(const QPointF &pos) const;

    TilingDrag *m_drag;                   // a ring press is its resize on that side (§9 Z3)
    KConfigWatcher::Ptr m_watcher;
    // Owns this filter's subscriptions, so they end with it. Not m_watcher: KDE's config watcher
    // is shared by everyone watching kwinrc and outlives an unloaded plugin, whose library KWin
    // keeps; a subscription owned by it called the unloaded filter at the next config change and
    // KWin crashed (2026-10-24, live, tests/live/64-plugin-reload.sh).
    QObject m_context;
    int m_frameWidth = 1;
    bool m_frameOnFloating = false;
    bool m_tiledRing = true;
    QPointer<KWin::Window> m_ringWindow;  // the window whose frame the pointer is on, if any
    Qt::MouseButtons m_taken;             // presses taken on a frame: their releases are ours too
};
