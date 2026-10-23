// Modifier + mouse button chords (docs/mouse-plugin-design.md): kwinrc [kwin-i3-mouse], one entry
// per chord, "Meta+Shift+Left=Move". An action is a KWin mouse command by KWin's own name, or
// "shortcut:<name>", a global shortcut of KWin's component (kwin-i3's are "kwin-i3 ...").
// Also: focus on a window's frame as i3 does (docs/spec-decoration.md, "focus on the frame"):
// KWin gives the pointer no focus window over a decoration, so neither hover nor click there
// focuses; this filter, which runs before KWin's decoration filter, makes the frame part of the
// window for focus, with KWin's own calls.
#pragma once

#include <input.h>
#include <options.h>
#include <plugin.h>

#include <KConfigWatcher>

#include <QHash>
#include <QPointer>
#include <QSet>

// While a move or resize started by a chord runs: KWin's own MoveResizeFilter (input.cpp), but
// with Shift taken out of the modifiers. Shift held during an interactive move is KWin's "drop into
// a custom tile" (window.cpp updateInteractiveMoveResize, finishInteractiveMoveResize), and a chord
// may well hold Shift (Meta+Shift+drag). Installed just before KWin's filter.
class ChordMoveFilter : public KWin::InputEventFilter
{
public:
    ChordMoveFilter();
    void start(KWin::Window *window);

    bool pointerMotion(KWin::PointerMotionEvent *event) override;
    bool pointerButton(KWin::PointerButtonEvent *event) override;
    bool keyboardKey(KWin::KeyboardKeyEvent *event) override;

private:
    KWin::Window *active() const;
    QPointer<KWin::Window> m_window;
};

class MouseChords : public KWin::Plugin, public KWin::InputEventFilter
{
    Q_OBJECT
public:
    MouseChords();
    ~MouseChords() override;

    bool pointerMotion(KWin::PointerMotionEvent *event) override;
    bool pointerButton(KWin::PointerButtonEvent *event) override;

private:
    struct Action
    {
        KWin::Options::MouseCommand command = KWin::Options::MouseNothing;
        QString shortcut; // set: a global shortcut instead of a mouse command
    };
    void loadConfig();
    KWin::Window *frameWindow() const;

    ChordMoveFilter m_moveFilter;
    KConfigWatcher::Ptr m_watcher;
    QHash<QPair<int, int>, Action> m_chords; // (modifiers, button) -> action
    QSet<int> m_swallowRelease; // buttons whose press we took
    QPointer<KWin::Window> m_frameWindow; // the window whose frame the pointer is on, if any
};
