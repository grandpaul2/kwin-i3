#include "framefocus.h"

#include <effect/globals.h>
#include <input_event.h>
#include <options.h>
#include <pointer_input.h>
#include <window.h>
#include <workspace.h>

#include <KConfigGroup>
#include <KSharedConfig>

using namespace KWin;

FrameFocus::FrameFocus()
    : InputEventFilter(InputFilterOrder::Decoration)
    , m_watcher(KConfigWatcher::create(KSharedConfig::openConfig(QStringLiteral("kwinrc"))))
{
    const auto load = [this] {
        auto config = m_watcher->config();
        config->reparseConfiguration();
        const KConfigGroup group = config->group(QStringLiteral("Script-kwin-i3"));
        m_frameWidth = std::clamp(group.readEntry("frameWidth", 1), 1, 10);
        m_frameOnFloating = group.readEntry("frameOnFloating", false);
    };
    load();
    QObject::connect(m_watcher.get(), &KConfigWatcher::configChanged, &m_context, load);
    QObject::connect(workspace(), &Workspace::configChanged, &m_context, load);
}

// The tiled window whose frame ring is under the pointer, else null. Only where the pointer is
// over no window, or over the desktop: a window above a frame (a floating one) keeps its clicks.
// Framed as kwini3hold frames it (Hold::framed, Hold::floatingFramed): in one of kwin-i3's tiles
// (custom tiling), or floating with frameOnFloating; no server decoration, not fullscreen.
KWin::Window *FrameFocus::ringWindow(const QPointF &pos) const
{
    Window *hover = input()->pointer()->hover();
    if (hover && !hover->isDesktop()) {
        return nullptr;
    }
    const auto order = workspace()->stackingOrder();
    for (auto it = order.crbegin(); it != order.crend(); ++it) {
        Window *w = *it;
        if (!w->isClient() || w->isDeleted() || w->isMinimized() || w->isHidden() || !w->isOnCurrentDesktop()
            || w->isFullScreen() || w->decoration()) {
            continue;
        }
        // Tiled (kwin-i3's custom tiles), or floating with its border taken while floating
        // windows are framed too (kwini3hold's floating set isn't readable from here; kwin-i3
        // takes the border of no floating window but its own).
        const bool tiled = w->requestedQuickTileMode() == QuickTileMode(QuickTileFlag::Custom) || w->quickTileMode() == QuickTileMode(QuickTileFlag::Custom);
        if (!tiled && !(m_frameOnFloating && w->noBorder() && w->isNormalWindow())) {
            continue;
        }
        const RectF frame = w->frameGeometry();
        const double f = m_frameWidth;
        if (frame.adjusted(-f, -f, f, f).contains(pos) && !frame.contains(pos)) {
            return w;
        }
    }
    return nullptr;
}

// Focus follows the mouse onto a frame, as into a client: the request KWin's own
// Window::pointerEnterEvent makes. Not pointerEnterEvent itself: KWin has just stored this
// pointer position as the focus-mouse position, so its "has the mouse moved" check would refuse
// (review 2, 2026-10-23). No cancel when the frame is left for another window: KWin has already
// requested that window's focus, and cancelDelayFocus would drop it.
bool FrameFocus::pointerMotion(PointerMotionEvent *event)
{
    Window *window = ringWindow(event->position);
    if (window == m_ringWindow) {
        return false;
    }
    m_ringWindow = window;
    if (window && options->focusPolicy() != Options::ClickToFocus) {
        workspace()->requestDelayFocus(window);
    }
    return false;
}

// A plain press on a frame: what a press in the window does (activate and raise by the
// [MouseBindings] CommandWindow* commands, as i3's click on a border), and the press and its
// release go no further, to the desktop beneath (review R1-12). A press with modifiers is
// KWin's own (Meta+drag), and so is everything while a game holds the pointer or a window
// inhibits shortcuts (input.cpp globalWindowAction skips those too).
bool FrameFocus::pointerButton(PointerButtonEvent *event)
{
    if (event->state == PointerButtonState::Released) {
        if (m_taken & event->button) {
            m_taken &= ~event->button;
            return true;
        }
        return false;
    }
    // A press starts afresh: a filter before this one may have taken the release of a press
    // taken here, which would otherwise leave the bit set and eat the next release of that
    // button anywhere (review of the change, finding 5).
    m_taken &= ~event->button;
    if (input()->pointer()->isConstrained() || workspace()->globalShortcutsDisabled()) {
        return false;
    }
    if ((event->modifiersRelevantForShortcuts & ~Qt::KeypadModifier) != Qt::NoModifier) {
        return false;
    }
    Window *window = ringWindow(event->position);
    if (!window) {
        return false;
    }
    if (const auto command = window->getMousePressCommand(event->button)) {
        window->performMousePressCommand(*command, event->position);
    }
    m_taken |= event->button;
    return true;
}

// A scroll on a frame goes nowhere (on the desktop beneath it would switch desktops).
bool FrameFocus::pointerAxis(PointerAxisEvent *event)
{
    return (event->modifiers & ~Qt::KeypadModifier) == Qt::NoModifier && ringWindow(event->position);
}
