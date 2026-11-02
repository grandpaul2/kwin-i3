// i3's tiling drag: a left press on a tiled window's title bar,
// or Meta+left anywhere in it, is taken before KWin's decoration and
// window-action filters can arm a move: the window stays put and kwin-i3 drops it where the
// pointer is released. Meta+right on a tiled window, or in the gap beside one, is i3's resize of
// the boundary: taken the same way, kwin-i3 draws the bar and
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
#include <QElapsedTimer>
#include <QHash>
#include <QList>
#include <QRectF>
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
    // A window of kwin-i3's floats, or no longer does: Meta+Shift+left on it is i3's floating
    // move, which KWin's window action (Meta alone) doesn't start (§9 F1). Told again after every
    // SetOn(true).
    void SetFloating(const QString &id, bool on);
    // A window in a split or a group floated whole: "group" (its container's key), with " top"
    // when it has a neighbour above; "" for none. Its presses are kwin-i3's, moving or resizing
    // the whole container (plan.md "The mouse"), where KWin's would move one window.
    void SetFloated(const QString &id, const QString &group);
    // The focus is a container or a workspace (i3's focus parent) and KWin keeps this window
    // active, by its internal id; "" for none. A press on it, or with focus follows mouse the
    // pointer entering it, is told by the hidden "Window Pressed" action: KWin activates it no
    // further, where i3 focuses it (click.c route_click step 3, handlers.c handle_enter_notify).
    void SetFocusParent(const QString &id);
    // i3's has_drop_targets (tiling_drag.c:42), counted by kwin-i3 after each pass: with nowhere
    // to drop, a Meta+Shift press goes to the app as i3 replays it (§9 G4). True until told.
    void SetDropTargets(bool any);
    // Whether tiling windows have the frame's ring (the script's verdict, which it tells the
    // effect too: SetTiledRing): frame focus counts the ring only then (§1).
    void SetTiledRing(bool on);
    // kwin-i3's tabbed and stacked groups shown: one line a bar, "key x y w h stacked n floated"
    // (key the window the bar is drawn with, "#N" after it for that window's further bar, the rect
    // logical and global, n tabs or rows of equal size; floated 0 for a tiled group, 1 for one
    // in a floated container (SetFloated), 2 for one there with a neighbour above inside it).
    // A plain left press on a bar, or a scroll over it, over nothing else (the desktop, a gap
    // strip), is the bar's: kwin-i3 is told by its hidden "Tab Click" action and asks TabEvent.
    void SetBars(const QString &spec);
    // The last press or scroll on a bar, once: "click KEY INDEX" or "scroll KEY -1|1"; "" none.
    QString TabEvent();

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
// place), installed only while a press is held (§9 G7, Z7).
class TilingDragKeys : public KWin::InputEventFilter
{
public:
    explicit TilingDragKeys(TilingDrag *drag);
    bool keyboardKey(KWin::KeyboardKeyEvent *event) override;

private:
    TilingDrag *m_drag;
};

// Meta+Shift+left on a floating window (§9 F1) is i3's floating move, ignoring Shift
// (click.c:284): KWin's own window action, started by the helper as KWin's fires only on Meta
// alone (6.7.5 input.cpp:1299). Shift held during a KWin move is its "drop into a custom tile": an
// outline over each tile passed, and the window tiled at a release with Shift down (window.cpp:1245,
// :1108), into one of kwin-i3's. Just ahead of KWin's move filter (same weight, installed after
// it), and only for a move the helper started: what that filter does, with Shift taken out.
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
    void setFloated(const QString &id, const QString &group);
    void setFocusParent(const QString &id) { m_focusParent = id; }
    void setDropTargets(bool any) { m_dropTargets = any; }
    void setTiledRing(bool on) { m_tiledRingTold = on ? 1 : 0; }
    // The script's ring verdict: 1 on, 0 off, -1 not told yet (FrameFocus falls back to kwinrc).
    int tiledRingTold() const { return m_tiledRingTold; }
    // The tiling window whose frame holds pos, over `hover` when the pointer is on a neighbour's
    // invisible resize band (i3's frames clip each client, manage.c:557; §9 Z9).
    KWin::Window *frameOwner(KWin::Window *hover, const QPointF &pos) const;
    // A press i3 focuses first (route_click step 3) on the window a focus-parent container
    // descends to: KWin activates nothing (it is active), so kwin-i3 is told (§5 B3).
    void noticePressed(KWin::Window *window);
    // The window SetFocusParent names, if it is still there.
    KWin::Window *focusParentWindow() const;
    void tellWindowPressed();
    // In a floated container (SetFloated), and whether it has a neighbour inside it on `side`.
    bool floated(const KWin::Window *window) const;
    bool floatedHas(const KWin::Window *window, const QString &side) const;
    // A press on a floated window's ring with no neighbour on that side: the container resized
    // whole (route_click, step 6: floating_resize_window).
    bool pressFloatedRing(KWin::Window *window, KWin::PointerButtonEvent *event);
    void cancelFromOutside();
    bool dragging() const { return m_taken & m_button; }   // a press taken, its release not yet
    TilingDragGrab *grab() { return &m_grab; }
    TilingDragFloat *floatMove() { return &m_float; }
    // A left or right press on a tiled window's ring (FrameFocus; i3's tiling_resize on a border,
    // §9 Z3): a resize against the neighbour on that side ("top", "left", "right", "bottom").
    void pressRing(KWin::Window *window, const QString &side, KWin::PointerButtonEvent *event);
    KWin::Window *gapWindow(const QPointF &pos) const;
    // A press on a group's bar (FrameFocus asks first, before its own gap and ring presses).
    bool pressBar(KWin::PointerButtonEvent *event);
    bool pointerAxis(KWin::PointerAxisEvent *event) override;
    void setBars(const QString &spec);
    QString tabEvent();

private:
    enum class Phase { None, Pressed, Drag, Drop, Cancel };

    bool pressResize(KWin::PointerButtonEvent *event);
    // A floated container moved (Meta+left, its title bar) or resized (Meta+right) whole: its
    // windows step together on every motion, as one (i3's floating_drag_window,
    // floating_resize_window from the corner nearest the press); at the release kwin-i3 reads the
    // new rect back ("Floated Moved").
    // `activate` false: the press focuses by kwin-i3's rule instead (a tab, "Tab Click").
    bool pressGroup(KWin::Window *window, KWin::PointerButtonEvent *event, bool resize, bool activate = true);
    void groupMotion(const QPointF &pos);
    void endGroup(bool revert);
    void begin();
    void cancel();
    void hoverAt(const QPointF &pos);
    void takePress(KWin::Window *window, Qt::MouseButton button, const QPointF &pos, bool resize, const QString &side, bool threshold);
    void pressDone();
    bool releaseLost(Qt::MouseButtons held);
    void loadConfig();
    void watchMoves(KWin::Window *window);

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
    QHash<QString, QString> m_floated;   // SetFloated: internal id -> "group" or "group top"
    bool m_groupActive = false;
    bool m_groupResize = false;
    bool m_groupLeft = false, m_groupTop = false;   // the corner a resize moves
    QList<QPointer<KWin::Window>> m_group;
    QList<QRectF> m_groupStart;       // each window's frame at the press
    QRectF m_groupUnion;              // all of them together at the press
    QPointF m_groupPress;
    QElapsedTimer m_groupCursorTold;  // the effect's cursor, asked again while the drag lasts
    void tellGroupCursor(bool on);
    KConfigWatcher::Ptr m_watcher;
    QObject m_context;                // owns the subscriptions, so they end with the filter (framefocus.h)
    QString m_side;                   // a ring press's side, else empty
    QString m_tab;                    // a Meta press's tab, "key:index", else empty (State)
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
    struct BarSpot {
        QString key;
        QRectF rect;
        bool stacked = false;
        int n = 0;
        int floated = 0;              // the spec's last field
    };
    QList<BarSpot> m_bars;            // SetBars
    QString m_tabEvent;               // TabEvent's answer
    QString m_scrollBar;              // the bar the scroll below was on
    Qt::Orientation m_scrollOrientation = Qt::Vertical;
    int m_scrollV120 = 0;             // a scroll not yet a whole step, in 120ths of one
    QString m_focusParent;            // SetFocusParent
    bool m_dropTargets = true;        // SetDropTargets
    int m_tiledRingTold = -1;         // SetTiledRing
    // The tab under pos on a bar no other window covers: its bar, and the index; -1 for none.
    int barAt(const QPointF &pos, const BarSpot **bar) const;
    void tellTab(const QString &event);
};
