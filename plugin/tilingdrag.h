// i3's tiling drag (docs/spec-tiled-look.md, part B): a left press on a tiled window's title bar,
// or Meta+left (Meta+Shift+left, the swap) anywhere in it, is taken before KWin's decoration and
// window-action filters can arm a move: the window stays put and kwin-i3 drops it where the
// pointer is released. Meta+right on a tiled window, or in the gap beside one, is i3's resize of
// the boundary (docs/spec-tiling-resize.md): taken the same way, kwin-i3 draws the bar and
// resizes at the release. The helper only carries the drag: a hidden kwin-i3 action says it began,
// and kwin-i3 polls State() over D-Bus until it ends (a script has no inbound D-Bus). kwin-i3
// works out the target and the zone, tells kwini3hold the indicator, and moves the window in its
// tree. Installed by the helper plugin (helper.cpp); the probes it came from: the spec, items 7
// and 9, "Probe result".
#pragma once

#include <input.h>

#include <QObject>
#include <QPointer>
#include <QPointF>
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
    // "phase id x y shift": phase none, drag (a resize: "resize"), drop or cancel; id the window's internal id; x y the
    // pointer (the release's, for a drop); shift 1 if the press held Shift (the swap). A drop or
    // a cancel is answered once, then none.
    QString State();
    // kwin-i3 is there to drop (at its start), or gone (its release): presses are KWin's.
    void SetOn(bool on);
    // How far outside a tiled window's frame a Meta+right still takes it (the gap, spec B); 0
    // takes none. Told with SetOn, so a reconfigure's new gaps arrive.
    void SetResizeGap(int px);
    // Moves the pointer (i3 warps it onto the resize bar at the press, spec D); during a resize
    // State() reports it at once, the warp's own motion being no event to this filter.
    void Warp(int x, int y);

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

class TilingDrag : public KWin::InputEventFilter
{
public:
    TilingDrag();

    bool pointerMotion(KWin::PointerMotionEvent *event) override;
    bool pointerButton(KWin::PointerButtonEvent *event) override;
    bool keyboardKey(KWin::KeyboardKeyEvent *event) override;

    QString state();
    void setOn(bool on);
    void setResizeGap(int px) { m_resizeGap = px; }
    void warp(int x, int y);
    bool dragging() const { return m_taken & m_button; }   // a press taken, its release not yet
    TilingDragGrab *grab() { return &m_grab; }

private:
    enum class Phase { None, Pressed, Drag, Drop, Cancel };

    bool pressResize(KWin::PointerButtonEvent *event);
    KWin::Window *gapWindow(const QPointF &pos) const;
    void begin();
    void cancel();
    void hoverAt(const QPointF &pos);

    TilingDragBus m_bus;
    TilingDragGrab m_grab;
    bool m_on = false;
    QPointer<KWin::Window> m_window;  // the dragged window, from the press
    QString m_id;
    QPointF m_start, m_pos;
    bool m_shift = false;
    bool m_resize = false;            // the drag is a Meta+right resize (m_button is the right button)
    Qt::MouseButton m_button = Qt::NoButton;   // the button of the drag taken, until its release
    int m_resizeGap = 0;
    bool m_threshold = false;         // a title-bar press: a drag only past the start-drag distance
    Qt::MouseButtons m_taken;         // presses taken: their releases are this filter's too
    Phase m_phase = Phase::None;
    // A drag kwin-i3 never asked about: it isn't there (unloaded without its release). The drag
    // ends and the presses are KWin's again.
    QTimer m_unanswered;
};
