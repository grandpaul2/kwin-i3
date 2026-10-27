#include "tilingdrag.h"

#include <effect/globals.h>
#include <input_event.h>
#include <options.h>
#include <pointer_input.h>
#include <window.h>
#include <workspace.h>

#include <KDecoration3/Decoration>

#include <QCoreApplication>
#include <QDBusConnection>
#include <QDBusMessage>
#include <QDBusPendingCall>
#include <QGuiApplication>
#include <QHoverEvent>
#include <QMouseEvent>
#include <QStyleHints>

#include <algorithm>

using namespace KWin;

TilingDragBus::TilingDragBus(TilingDrag *drag)
    : m_drag(drag)
{
    QDBusConnection::sessionBus().registerObject(QStringLiteral("/kwini3drag"), this, QDBusConnection::ExportAllSlots);
}

TilingDragBus::~TilingDragBus()
{
    QDBusConnection::sessionBus().unregisterObject(QStringLiteral("/kwini3drag"));
}

QString TilingDragBus::State()
{
    return m_drag->state();
}

void TilingDragBus::SetOn(bool on)
{
    m_drag->setOn(on);
}

void TilingDragBus::SetResizeGap(int px)
{
    m_drag->setResizeGap(px);
}

void TilingDragBus::Warp(int x, int y)
{
    m_drag->warp(x, y);
}

TilingDragGrab::TilingDragGrab(TilingDrag *drag)
    : InputEventFilter(InputFilterOrder::Effects)
    , m_drag(drag)
{
}

bool TilingDragGrab::pointerMotion(PointerMotionEvent *event)
{
    return m_drag->dragging() && m_drag->pointerMotion(event);
}

bool TilingDragGrab::pointerButton(PointerButtonEvent *event)
{
    return m_drag->dragging() && m_drag->pointerButton(event);
}

bool TilingDragGrab::keyboardKey(KeyboardKeyEvent *event)
{
    return m_drag->dragging() && m_drag->keyboardKey(event);
}

TilingDrag::TilingDrag()
    : InputEventFilter(InputFilterOrder::Decoration)
    , m_bus(this)
    , m_grab(this)
{
    // kwin-i3 says SetOn at every reconfigure: one now, for a helper loaded after it.
    QMetaObject::invokeMethod(workspace(), &Workspace::reconfigure, Qt::QueuedConnection);
    m_unanswered.setSingleShot(true);
    m_unanswered.setInterval(500);
    QObject::connect(&m_unanswered, &QTimer::timeout, &m_bus, [this] {
        m_on = false;
        if (m_phase == Phase::Drag) {
            m_phase = Phase::None;
            m_window.clear();
        }
    });
}

QString TilingDrag::state()
{
    m_unanswered.stop();
    const char *phase = m_phase == Phase::Drag ? (m_resize ? "resize" : "drag") : m_phase == Phase::Drop ? "drop" : m_phase == Phase::Cancel ? "cancel" : "none";
    const QString s = QStringLiteral("%1 %2 %3 %4").arg(QLatin1String(phase), m_id.isEmpty() ? QStringLiteral("-") : m_id).arg(int(m_pos.x())).arg(int(m_pos.y()));
    if (m_phase == Phase::Drop || m_phase == Phase::Cancel) {
        m_phase = Phase::None;
        m_id.clear();
    }
    return s;
}

void TilingDrag::setOn(bool on)
{
    m_on = on;
}

// Only for a resize in progress (a stray call must not move the pointer); the position State()
// reports is the warp's, since PointerInputRedirection::warp sends this filter no motion.
void TilingDrag::warp(int x, int y)
{
    if (m_phase != Phase::Drag || !m_resize) {
        return;
    }
    m_pos = QPointF(x, y);
    input()->pointer()->warp(m_pos);
}

// Tell kwin-i3 through its hidden action (KWin calling itself: never wait for it).
void TilingDrag::begin()
{
    m_phase = Phase::Drag;
    auto msg = QDBusMessage::createMethodCall(QStringLiteral("org.kde.kglobalaccel"), QStringLiteral("/component/kwin"),
                                              QStringLiteral("org.kde.kglobalaccel.Component"), QStringLiteral("invokeShortcut"));
    msg << (m_resize ? QStringLiteral("kwin-i3 Tiling Resize") : QStringLiteral("kwin-i3 Tiling Drag"));
    QDBusConnection::sessionBus().asyncCall(msg);
    m_unanswered.start();
}

void TilingDrag::cancel()
{
    m_phase = m_phase == Phase::Drag ? Phase::Cancel : Phase::None;
    m_window.clear();
}

// The decoration under the pointer never saw the drag's motions: its hover catches up now, not
// at the next motion (a drag released over a button).
void TilingDrag::hoverAt(const QPointF &pos)
{
    Window *window = input()->pointer()->hover();
    if (window && window->decoration()) {
        const QPointF p = pos - window->pos();
        QHoverEvent e(QEvent::HoverMove, p, pos, p);
        QCoreApplication::sendEvent(window->decoration(), &e);
    }
}

bool TilingDrag::pointerMotion(PointerMotionEvent *event)
{
    if (!dragging()) {
        return false;
    }
    if (m_phase == Phase::Pressed && m_window
        && (!m_threshold || (event->position - m_start).manhattanLength() >= QGuiApplication::styleHints()->startDragDistance())) {
        begin();
    }
    if (m_phase == Phase::Drag) {
        m_pos = event->position;
    }
    // A drag's motions go nowhere, as under i3's pointer grab: not to the pressed window's title-bar
    // buttons (KWin's decoration filter would hover them), nor its client. (Focus can't follow
    // anyway: KWin updates no focus while a button is held, PointerInputRedirection::
    // focusUpdatesBlocked.)
    return true;
}

// Escape cancels, as i3's drag_pointer reverts; the button's release stays this filter's.
bool TilingDrag::keyboardKey(KeyboardKeyEvent *event)
{
    if (m_phase != Phase::Drag || event->key != Qt::Key_Escape) {
        return false;
    }
    if (event->state == KeyboardKeyState::Pressed) {
        cancel();
    }
    return true;
}

bool TilingDrag::pointerButton(PointerButtonEvent *event)
{
    if (event->state == PointerButtonState::Released) {
        if (!(m_taken & event->button)) {
            return false;
        }
        m_taken &= ~event->button;
        if (event->button == m_button) {
            m_button = Qt::NoButton;
            if (m_phase == Phase::Drag) {
                m_phase = Phase::Drop;
                m_pos = event->position;
            } else if (m_phase == Phase::Pressed) {
                m_phase = Phase::None;
            }
            m_window.clear();
            hoverAt(event->position);
        }
        return true;
    }
    // Another button during a drag ends it, as in i3; its press and release go nowhere.
    if (dragging()) {
        cancel();
        m_taken |= event->button;
        return true;
    }
    m_taken &= ~event->button;      // a press starts afresh (FrameFocus::pointerButton, finding 5)
    if (!m_on || (event->button != Qt::LeftButton && event->button != Qt::RightButton) || input()->pointer()->isConstrained()
        || workspace()->globalShortcutsDisabled()) {
        return false;
    }
    if (event->button == Qt::RightButton) {
        return pressResize(event);
    }
    Window *window = input()->pointer()->hover();
    if (!window || window->isDeleted() || window->quickTileMode() != QuickTileMode(QuickTileFlag::Custom)) {
        return false;
    }
    const auto mods = event->modifiersRelevantForShortcuts & ~Qt::KeypadModifier;
    if (mods == (Qt::MetaModifier | Qt::ShiftModifier)) {
        // Meta+Shift: pull it out and float it (beyond i3, Paul 2026-10-26: the swap no longer
        // needs Shift). KWin's own move, as Meta+drag was before the tiling drag: the window
        // leaves its tile at its floating size and follows the pointer; kwin-i3 floats it where
        // it is dropped. KWin's move takes the motions and the release from here.
        window->performMousePressCommand(Options::MouseActivateRaiseAndMove, event->position);
        return true;
    }
    if (mods == Qt::MetaModifier) {
        // Anywhere in the window, with no threshold (i3's floating modifier, click.c).
        window->performMousePressCommand(Options::MouseActivateAndRaise, event->position);
        m_threshold = false;
    } else if (mods != Qt::NoModifier || !window->decoration() || window->decoration()->sectionUnderMouse() != Qt::TitleBarArea) {
        return false;   // the client's press, an edge's resize: KWin's
    } else {
        // The decoration first, as KWin's DecorationEventFilter: a button accepts the press, and
        // its release then goes on to KWin's filter and the button as usual. Refused, it is the
        // title bar: activated and raised as KWin would, and no move armed.
        const QPointF p = event->position - window->pos();
        QMouseEvent e(QEvent::MouseButtonPress, p, event->position, event->button, event->buttons, event->modifiers);
        e.setTimestamp(std::chrono::duration_cast<std::chrono::milliseconds>(event->timestamp).count());
        e.setAccepted(false);
        QCoreApplication::sendEvent(window->decoration(), &e);
        if (e.isAccepted()) {
            return true;
        }
        window->performMousePressCommand(window->isActive() ? options->commandActiveTitlebar1() : options->commandInactiveTitlebar1(), event->position);
        m_threshold = true;
    }
    m_window = window;
    m_id = window->internalId().toString();
    m_start = m_pos = event->position;
    m_taken |= Qt::LeftButton;
    m_button = Qt::LeftButton;
    m_resize = false;
    m_phase = Phase::Pressed;
    if (!m_threshold) {
        begin();
    }
    return true;
}

// The tiled window nearest the pointer within the gap kwin-i3 passed, else null: for a press over
// no window or the desktop, in the gap or on a frame ring. Found from the stacking order as
// FrameFocus::ringWindow does; tiled windows only (a floating one's neighbourhood stays KWin's).
Window *TilingDrag::gapWindow(const QPointF &pos) const
{
    Window *best = nullptr;
    double bestDistance = m_resizeGap + 1;
    const auto order = workspace()->stackingOrder();
    for (auto it = order.crbegin(); it != order.crend(); ++it) {
        Window *w = *it;
        if (!w->isClient() || w->isDeleted() || w->isMinimized() || w->isHidden() || !w->isOnCurrentDesktop() || w->isFullScreen()
            || w->quickTileMode() != QuickTileMode(QuickTileFlag::Custom)) {
            continue;
        }
        const RectF frame = w->frameGeometry();
        const double dx = std::max({frame.left() - pos.x(), 0.0, pos.x() - frame.right()});
        const double dy = std::max({frame.top() - pos.y(), 0.0, pos.y() - frame.bottom()});
        const double distance = std::max(dx, dy);
        if (distance < bestDistance) {
            best = w;
            bestDistance = distance;
        }
    }
    return best;
}

// Meta+right (i3's floating modifier on a tiled client, click.c): on a tiled window anywhere, or
// in the gap beside one (beyond i3, whose gap press only focuses the output). Taken like the
// Meta+left press, so KWin's window-action filter never arms its own resize, which would take
// the window out of its tile; floating windows and every other chord stay KWin's. kwin-i3 does
// the rest from the hidden "Tiling Resize" action; the window id reported is the pressed
// window's, or the nearest tiled one for a gap.
bool TilingDrag::pressResize(PointerButtonEvent *event)
{
    if ((event->modifiersRelevantForShortcuts & ~Qt::KeypadModifier) != Qt::MetaModifier) {
        return false;
    }
    Window *window = input()->pointer()->hover();
    if (window && !window->isDeleted() && !window->isDesktop()) {
        if (window->quickTileMode() != QuickTileMode(QuickTileFlag::Custom)) {
            return false;
        }
    } else if (m_resizeGap > 0) {
        window = gapWindow(event->position);
    } else {
        window = nullptr;
    }
    if (!window) {
        return false;
    }
    window->performMousePressCommand(Options::MouseActivateAndRaise, event->position);
    m_window = window;
    m_id = window->internalId().toString();
    m_start = m_pos = event->position;
    m_threshold = false;
    m_taken |= Qt::RightButton;
    m_button = Qt::RightButton;
    m_resize = true;
    m_phase = Phase::Pressed;
    begin();
    return true;
}
