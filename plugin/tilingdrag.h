// i3's tiling drag (docs/records/spec-tiled-look.md, part B): a left press on a tiled window's title bar,
// or Meta+left anywhere in it, is taken before KWin's decoration and
// window-action filters can arm a move: the window stays put and kwin-i3 drops it where the
// pointer is released. Meta+right on a tiled window, or in the gap beside one, is i3's resize of
// the boundary (docs/records/spec-tiling-resize.md): taken the same way, kwin-i3 draws the bar and
// resizes at the release. The helper only carries the drag: a hidden kwin-i3 action says it began,
// and kwin-i3 polls State() over D-Bus until it ends (a script has no inbound D-Bus). kwin-i3
// works out the target and the zone, tells kwini3hold the indicator, and moves the window in its
// tree. Installed by the helper plugin (helper.cpp); the probes it came from: the spec, items 7
// and 9, "Probe result".
#pragma once

#include <functional>

#include <input.h>

#include <KConfigWatcher>

#include <QObject>
#include <QPointer>
#include <QPointF>
#include <QSet>
#include <QTimer>

class TilingDrag;

// org.kde.KWin /kwini3drag net.local.kwini3drag: what kwin-i3 calls.
class TilingDragBus : public QObject
{
    Q_OBJECT
    Q_CLASSINFO("D-Bus Interface", "net.local.kwini3drag")
public:
    explicit TilingDragBus(TilingDrag *drag);
    ~TilingDragBus() override;

public Q_SLOTS:
    // "phase id x y": phase none, drag (a resize: "resize"), drop or cancel; id the window's
    // internal id; x y the pointer (the release's, for a drop). A drop or a cancel is answered
    // once, then none.
    QString State();
    // kwin-i3 is there to drop (at its start), or gone (its release): presses are KWin's.
    void SetOn(bool on);
    // How far outside a tiled window's frame a Meta+right still takes it (the gap, spec B); 0
    // takes none. Told with SetOn, so a reconfigure's new gaps arrive.
    void SetResizeGap(int px);
    // Moves the pointer (i3 warps it onto the resize bar at the press, spec D); during a resize
    // State() reports it at once, the warp's own motion being no event to this filter.
    void Warp(int x, int y);
    // kwin-i3 ends the drag (a window closed on the focused workspace, i3's drain_drag_events;
    // nothing to resize on a ring's side): the presses taken stay taken until released.
    void Cancel();
    // A window of kwin-i3's floats, or no longer does: Meta+Shift+left on it is float to tile
    // (§9 G13). Told again after every SetOn(true).
    void SetFloating(const QString &id, bool on);

private:
    TilingDrag *m_drag;
};

// A drag's input while it lasts, ahead of KWin's effects filter: kwini3hold grabs the mouse for
// the move cursor (SetDragCursor), and KWin's effects filter would then take every pointer event
// before TilingDrag (at the decoration filter's place) saw it. Only a drag's motions, its release,
// another button and Escape; a new press is TilingDrag's alone.
class TilingDragGrab : public KWin::InputEventFilter
{
public:
    explicit TilingDragGrab(TilingDrag *drag);

    bool pointerMotion(KWin::PointerMotionEvent *event) override;
    bool pointerButton(KWin::PointerButtonEvent *event) override;
    bool keyboardKey(KWin::KeyboardKeyEvent *event) override;

private:
    TilingDrag *m_drag;
};

// i3's drain_drag_events: any key press cancels a drag, and the key goes on as usual (a binding
// still runs). The helper's drag filters sit at Decoration and Effects, after KWin's global
// shortcuts, so a bound key never reaches them: this one is ahead of the shortcuts (TabBox's
// place), installed only while a press is held (§9 G7, Z7; redo stage 6).
class TilingDragKeys : public KWin::InputEventFilter
{
public:
    explicit TilingDragKeys(TilingDrag *drag);
    bool keyboardKey(KWin::KeyboardKeyEvent *event) override;

private:
    TilingDrag *m_drag;
};

// G5's float (Meta+Shift+left on a tiled window) is KWin's own move, and Shift held during a KWin
// move is its "drop into a custom tile": an outline over each tile passed, and the window tiled at
// a release with Shift down (KWin 6.7.5 window.cpp:1245, :1108). kwin-i3's windows all sit in
// custom tiles, so every window passed showed it (Paul's capture, 2026-10-29). Just ahead of
// KWin's move filter (same weight, installed after it), and only for a move G5 started: what that
// filter does, with Shift taken out (docs/records/mouse-plugin-design.md, ChordMoveFilter, 2026-10-22).
class TilingDragFloat : public KWin::InputEventFilter
{
public:
    TilingDragFloat();
    void start(KWin::Window *window);

    bool pointerMotion(KWin::PointerMotionEvent *event) override;
    bool pointerButton(KWin::PointerButtonEvent *event) override;
    bool keyboardKey(KWin::KeyboardKeyEvent *event) override;

private:
    KWin::Window *active() const;
    QPointer<KWin::Window> m_window;
};

class TilingDrag : public KWin::InputEventFilter
{
public:
    TilingDrag();
    ~TilingDrag() override;

    bool pointerMotion(KWin::PointerMotionEvent *event) override;
    bool pointerButton(KWin::PointerButtonEvent *event) override;
    bool keyboardKey(KWin::KeyboardKeyEvent *event) override;

    QString state();
    void setOn(bool on);
    bool on() const { return m_on; }
    void setResizeGap(int px)
    {
        m_resizeGap = px;
        if (onResizeGapChanged) {
            onResizeGapChanged();
        }
    }
    int resizeGap() const { return m_resizeGap; }
    std::function<void()> onResizeGapChanged;   // the gap strips follow it (gapstrips.h)
    void warp(int x, int y);
    void setFloating(const QString &id, bool on);
    void cancelFromOutside();
    bool dragging() const { return m_taken & m_button; }   // a press taken, its release not yet
    TilingDragGrab *grab() { return &m_grab; }
    TilingDragFloat *floatMove() { return &m_float; }
    // A left or right press on a tiled window's ring (FrameFocus; i3's tiling_resize on a border,
    // §9 Z3): a resize against the neighbour on that side ("top", "left", "right", "bottom").
    void pressRing(KWin::Window *window, const QString &side, KWin::PointerButtonEvent *event);
    KWin::Window *gapWindow(const QPointF &pos) const;

private:
    enum class Phase { None, Pressed, Drag, Drop, Cancel };

    bool pressResize(KWin::PointerButtonEvent *event);
    void begin();
    void cancel();
    void hoverAt(const QPointF &pos);
    void takePress(KWin::Window *window, Qt::MouseButton button, const QPointF &pos, bool resize, const QString &side, bool threshold);
    void pressDone();
    void loadConfig();

    TilingDragBus m_bus;
    TilingDragGrab m_grab;
    TilingDragFloat m_float;
    TilingDragKeys m_keys;
    bool m_keysInstalled = false;
    bool m_on = false;
    // i3's tiling_drag (§9 G3), from kwinrc [Script-kwin-i3] tilingDrag: "off", "modifier",
    // "titlebar", "modifier titlebar" (the default).
    bool m_modifierDrag = true, m_titlebarDrag = true;
    QSet<QString> m_floating;         // kwin-i3's floating windows, by internal id (SetFloating)
    // One float or float to tile per press of the keys (§9 G5, G13; Paul 2026-10-28): set by a
    // Meta+Shift+left press taken, cleared when Meta or Shift is released.
    bool m_shiftLatched = false;
    KConfigWatcher::Ptr m_watcher;
    QObject m_context;                // owns the subscriptions, so they end with the filter (framefocus.h)
    QString m_side;                   // a ring press's side, else empty
    QPointer<KWin::Window> m_window;  // the dragged window, from the press
    QString m_id;
    QPointF m_start, m_pos;
    bool m_resize = false;            // the drag is a Meta+right resize (m_button is the right button)
    Qt::MouseButton m_button = Qt::NoButton;   // the button of the drag taken, until its release
    bool m_offUnanswered = false;  // m_on turned off by the 500 ms timeout, not by kwin-i3
    int m_resizeGap = 0;
    bool m_threshold = false;         // a title-bar press: a drag only past the start-drag distance
    Qt::MouseButtons m_taken;         // presses taken: their releases are this filter's too
    Phase m_phase = Phase::None;
    // A drag kwin-i3 never asked about: it isn't there (unloaded without its release). The drag
    // ends and the presses are KWin's again.
    QTimer m_unanswered;
};
