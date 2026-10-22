// Modifier + mouse button chords (docs/mouse-plugin-design.md): kwinrc [kwin-i3-mouse], one entry
// per chord, "Meta+Shift+Left=Move". An action is a KWin mouse command by KWin's own name, or
// "shortcut:<name>", a global shortcut of KWin's component (kwin-i3's are "kwin-i3 ...").
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

    bool pointerButton(KWin::PointerButtonEvent *event) override;

private:
    struct Action
    {
        KWin::Options::MouseCommand command = KWin::Options::MouseNothing;
        QString shortcut; // set: a global shortcut instead of a mouse command
    };
    void loadConfig();

    ChordMoveFilter m_moveFilter;
    KConfigWatcher::Ptr m_watcher;
    QHash<QPair<int, int>, Action> m_chords; // (modifiers, button) -> action
    QSet<int> m_swallowRelease; // buttons whose press we took
};
