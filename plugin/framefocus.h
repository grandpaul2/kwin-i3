// Focus on a tiled window's frame as i3 does: the frame kwini3hold draws in the tile's padding
// is outside every window, so KWin would give a press there to
// whatever is beneath, the desktop (its menu on a right-click, a rubber band on a drag). This
// filter makes the frame part of its window for focus and clicks, with KWin's own calls.
// (It did the same for kwini3frame's decoration until that was retired, 2026-10-24; and modifier
// + mouse button chords until earlier that day.) Installed by the
// helper plugin (helper.cpp).
#pragma once

#include <input.h>

#include <KConfigWatcher>

#include <QObject>
#include <QPointer>

class PointerProbe;
class TilingDrag;

class FrameFocus : public KWin::InputEventFilter
{
public:
    explicit FrameFocus(TilingDrag *drag);

    bool pointerMotion(KWin::PointerMotionEvent *event) override;
    bool pointerButton(KWin::PointerButtonEvent *event) override;
    bool pointerAxis(KWin::PointerAxisEvent *event) override;

    // What a plain press of `button` at `pos` does here, with `hover` the window KWin gives the
    // pointer there: the one decision pointerButton acts on and the pointer probe reports
    // (pointerprobe.h), so the probe can't say other than what a press does.
    struct Decision {
        enum Kind {
            Pass,       // not this filter's: on to KWin's filters and the window under the pointer
            Ring,       // on a frame ring: activate and raise, the press and its release taken
            RingResize, // on a tiled window's ring: i3's resize on `side` (TilingDrag::pressRing)
            GapResize,  // in the gap: i3's resize of the nearest tiled window on `side`
            Margin,     // over a tiled window's margin, no tiled window in reach: taken, nothing
        };
        Kind kind = Pass;
        KWin::Window *window = nullptr;
        QString side;
        QString describe() const;
    };
    Decision decide(const QPointF &pos, KWin::Window *hover, Qt::MouseButton button) const;
    void setProbe(PointerProbe *probe) { m_probe = probe; }
    // `w` has a frame ring and `pos` is on it (what kwini3hold draws there; ringWindow's test).
    bool onRing(const KWin::Window *w, const QPointF &pos) const;
    int frameWidth() const { return m_frameWidth; }

private:
    KWin::Window *ringWindow(const QPointF &pos, KWin::Window *hover) const;
    bool overTiledMargin(const QPointF &pos, KWin::Window *hover) const;
    KWin::Window *tiledFrameAt(const QPointF &pos) const;

    TilingDrag *m_drag;                   // a ring press is its resize on that side (§9 Z3)
    PointerProbe *m_probe = nullptr;      // records each press's decision
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
    QPointer<KWin::Window> m_raised;      // the tiled window last raised over a neighbour's band
    Qt::MouseButtons m_taken;             // presses taken on a frame: their releases are ours too
};
