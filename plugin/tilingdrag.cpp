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
    const char *phase = m_phase == Phase::Drag ? "drag" : m_phase == Phase::Drop ? "drop" : m_phase == Phase::Cancel ? "cancel" : "none";
    const QString s = QStringLiteral("%1 %2 %3 %4 %5").arg(QLatin1String(phase), m_id.isEmpty() ? QStringLiteral("-") : m_id).arg(int(m_pos.x())).arg(int(m_pos.y())).arg(int(m_shift));
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

// Tell kwin-i3 through its hidden action (KWin calling itself: never wait for it).
void TilingDrag::begin()
{
    m_phase = Phase::Drag;
    auto msg = QDBusMessage::createMethodCall(QStringLiteral("org.kde.kglobalaccel"), QStringLiteral("/component/kwin"),
                                              QStringLiteral("org.kde.kglobalaccel.Component"), QStringLiteral("invokeShortcut"));
    msg << QStringLiteral("kwin-i3 Tiling Drag");
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
    if (!(m_taken & Qt::LeftButton)) {
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
        if (event->button == Qt::LeftButton) {
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
    if (m_taken & Qt::LeftButton) {
        cancel();
        m_taken |= event->button;
        return true;
    }
    m_taken &= ~event->button;      // a press starts afresh (FrameFocus::pointerButton, finding 5)
    if (!m_on || event->button != Qt::LeftButton || input()->pointer()->isConstrained() || workspace()->globalShortcutsDisabled()) {
        return false;
    }
    Window *window = input()->pointer()->hover();
    if (!window || window->isDeleted() || window->quickTileMode() != QuickTileMode(QuickTileFlag::Custom)) {
        return false;
    }
    const auto mods = event->modifiersRelevantForShortcuts & ~Qt::KeypadModifier;
    if (mods == Qt::MetaModifier || mods == (Qt::MetaModifier | Qt::ShiftModifier)) {
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
    m_shift = mods & Qt::ShiftModifier;
    m_taken |= Qt::LeftButton;
    m_phase = Phase::Pressed;
    if (!m_threshold) {
        begin();
    }
    return true;
}
