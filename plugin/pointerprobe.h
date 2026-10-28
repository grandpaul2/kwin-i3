// The pointer, known instead of guessed (OPEN.md item 43, Paul 2026-10-28: "we can't be guessing
// anymore"). Three questions at any point of the screen, each answered from KWin's own state:
//   drawn by:    the windows whose buffer, frame or kwini3hold ring cover the point, top first
//   received by: the window KWin gives the pointer there (InputRedirection::findToplevel, its
//                hover), and each window's own hit test (Window::hitTest: its input region)
//   acted on:    what kwin-i3's press filter does there (FrameFocus::decide, the one function
//                its real presses run)
// On D-Bus at /kwini3helper/pointer (net.local.kwini3helper.Pointer):
//   Probe(x, y)          one point, as JSON
//   Map(x, y, w, h)      every pixel of a rectangle, as JSON (tools/pointer-map draws it)
//   Windows()            every window on screen, top first, as JSON
//   Events()             the last presses and pointer crossings, stamped to the millisecond
//                        (tools/capture saves them; capture-read merges them in as "ptr")
// The events come from a filter first in KWin's chain (VirtualTerminal's place, input.h
// InputFilterOrder: only the output and accessibility filters come before), which only watches:
// a press it logs with no "FrameFocus" line after was taken by a filter between the two.
// And every move or resize KWin runs itself (its interactive move/resize: an app's own border,
// a decoration, a window action, the task manager), started and finished, with the edge, the
// pointer and whether the window was in a tile: in a tile, KWin resizes the tile live
// (window.cpp updateInteractiveMoveResize), Plasma's resize in place of i3's.
// And every change of the pointer's cursor: a named shape (KWin's own, or an app's through the
// cursor-shape protocol), an image the app drew, or hidden; with the window that has the pointer
// focus, which is who set it unless KWin did. i3 shows the arrow on frames and in the gaps, and a
// resize cursor only once a resize has started (i3 x.c, resize.c).
// Read-only: nothing here changes what a press or a motion does.
#pragma once

#include "framefocus.h"

#include <input.h>

#include <QObject>
#include <QPointer>
#include <QStringList>

class PointerProbe : public QObject, public KWin::InputEventFilter
{
    Q_OBJECT
    Q_CLASSINFO("D-Bus Interface", "net.local.kwini3helper.Pointer")
public:
    explicit PointerProbe(FrameFocus *frameFocus);
    ~PointerProbe() override;

    bool pointerMotion(KWin::PointerMotionEvent *event) override;
    bool pointerButton(KWin::PointerButtonEvent *event) override;

    void note(const QString &text);
    static QString name(const KWin::Window *w);

public Q_SLOTS:
    QString Probe(double x, double y) const;
    QString Map(int x, int y, int width, int height) const;
    QStringList Events() const;
    QString Windows() const;

private:
    void watch(KWin::Window *w);

    FrameFocus *m_frameFocus;
    QStringList m_events;
    // The last crossing logged: the window KWin gives the pointer and what a press would do.
    QPointer<KWin::Window> m_lastTop;
    QString m_lastDecision;
    QString m_lastCursor;
};
