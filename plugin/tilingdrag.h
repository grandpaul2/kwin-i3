// i3's tiling drag (docs/spec-tiled-look.md, part B): a left press on a tiled window's title bar,
// or Meta+left (Meta+Shift+left, the swap) anywhere in it, is taken before KWin's decoration and
// window-action filters can arm a move: the window stays put and kwin-i3 drops it where the
// pointer is released. The helper only carries the drag: a hidden kwin-i3 action says it began,
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
    // "phase id x y shift": phase none, drag, drop or cancel; id the window's internal id; x y the
    // pointer (the release's, for a drop); shift 1 if the press held Shift (the swap). A drop or
    // a cancel is answered once, then none.
    QString State();
    // kwin-i3 is there to drop (at its start), or gone (its release): presses are KWin's.
    void SetOn(bool on);

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

private:
    enum class Phase { None, Pressed, Drag, Drop, Cancel };

    void begin();
    void cancel();
    void hoverAt(const QPointF &pos);

    TilingDragBus m_bus;
    bool m_on = false;
    QPointer<KWin::Window> m_window;  // the dragged window, from the press
    QString m_id;
    QPointF m_start, m_pos;
    bool m_shift = false;
    bool m_threshold = false;         // a title-bar press: a drag only past the start-drag distance
    Qt::MouseButtons m_taken;         // presses taken: their releases are this filter's too
    Phase m_phase = Phase::None;
    // A drag kwin-i3 never asked about: it isn't there (unloaded without its release). The drag
    // ends and the presses are KWin's again.
    QTimer m_unanswered;
};
