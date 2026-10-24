#include "framefocus.h"

#include <input_event.h>
#include <options.h>
#include <pointer_input.h>
#include <window.h>
#include <workspace.h>

using namespace KWin;

FrameFocus::FrameFocus()
    : InputEventFilter(InputFilterOrder::Decoration)
{
    input()->installInputEventFilter(this);
}

FrameFocus::~FrameFocus()
{
    if (input()) {
        input()->uninstallInputEventFilter(this);
    }
}

// The window whose decoration the pointer is on, else null. KWin updates the pointer's decoration
// and hover before the filters run (pointer_input.cpp processMotion -> update()); over a
// decoration the pointer's focus() is null but hover() is the window.
KWin::Window *FrameFocus::frameWindow() const
{
    if (!input()->pointer()->decoration()) {
        return nullptr;
    }
    Window *window = input()->pointer()->hover();
    return window && window->isClient() ? window : nullptr;
}

// Focus follows the mouse onto a frame, as into a client: the same request KWin's own
// Window::pointerEnterEvent makes for a client area. Not pointerEnterEvent itself: KWin has just
// stored this pointer position as the focus-mouse position, so its "has the mouse moved" check
// would refuse (review 2, 2026-10-23). No cancel when the frame is left for another window: KWin
// has already requested that window's focus, and cancelDelayFocus would drop it. One check of
// pointerEnterEvent's is not made: "the window menu is open" (useractions.h is not buildable
// from kwin-devel: it includes a generated ui_ header); the menu can't open from a frame any
// more, and it closes on the first click anyway.
bool FrameFocus::pointerMotion(PointerMotionEvent *)
{
    Window *window = frameWindow();
    if (window == m_frameWindow) {
        return false;
    }
    m_frameWindow = window;
    if (window) {
        if (options->focusPolicy() != Options::ClickToFocus && !window->isDesktop() && !window->isDock()) {
            workspace()->requestDelayFocus(window);
        }
    } else if (!input()->pointer()->hover()) {
        workspace()->cancelDelayFocus();
    }
    return false;
}

// A plain press on a window's frame: what a press in its client area does (KWin's
// WindowActionInputFilter, which never runs over a decoration), activate and raise by the
// [MouseBindings] CommandWindow* commands, as i3's click on a border does. The press goes on to
// the decoration, which accepts it, so nothing moves. A press with modifiers is KWin's own
// (Meta+drag moves, Meta+right-drag resizes).
bool FrameFocus::pointerButton(PointerButtonEvent *event)
{
    if (event->state != PointerButtonState::Pressed) {
        return false;
    }
    // KWin's own window actions skip these too (input.cpp globalWindowAction, windowActionFor...):
    // a game holding the pointer, or a window inhibiting shortcuts (a VM, a remote desktop).
    if (input()->pointer()->isConstrained() || workspace()->globalShortcutsDisabled()) {
        return false;
    }
    if ((event->modifiersRelevantForShortcuts & ~Qt::KeypadModifier) != Qt::NoModifier) {
        return false;
    }
    if (Window *window = frameWindow()) {
        if (const auto command = window->getMousePressCommand(event->button)) {
            window->performMousePressCommand(*command, event->position);
        }
    }
    return false;
}
