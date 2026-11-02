#include "tilingdrag.h"
#include "gapstrips.h"

#include <effect/globals.h>
#include <input_event.h>
#include <options.h>
#include <pointer_input.h>
#include <window.h>
#include <workspace.h>

#include <KDecoration3/Decoration>

#include <KConfigGroup>
#include <KSharedConfig>

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

void TilingDragBus::Cancel()
{
    m_drag->cancelFromOutside();
}

void TilingDragBus::SetBars(const QString &spec)
{
    m_drag->setBars(spec);
}

QString TilingDragBus::TabEvent()
{
    return m_drag->tabEvent();
}

void TilingDragBus::SetFloating(const QString &id, bool on)
{
    m_drag->setFloating(id, on);
}

TilingDragKeys::TilingDragKeys(TilingDrag *drag)
    : InputEventFilter(InputFilterOrder::TabBox)
    , m_drag(drag)
{
}

bool TilingDragKeys::keyboardKey(KeyboardKeyEvent *event)
{
    if (m_drag->dragging() && event->state == KeyboardKeyState::Pressed) {
        m_drag->cancelFromOutside();
    }
    return false;               // the key goes on: its binding still runs, as in i3
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

TilingDragFloat::TilingDragFloat()
    : InputEventFilter(InputFilterOrder::InteractiveMoveResize)
{
}

void TilingDragFloat::start(Window *window)
{
    m_window = window;
}

Window *TilingDragFloat::active() const
{
    Window *window = workspace()->moveResizeWindow();
    return window && window == m_window ? window : nullptr;
}

// KWin 6.7.5 input.cpp MoveResizeFilter, with Shift taken out of the modifiers.
bool TilingDragFloat::pointerMotion(PointerMotionEvent *event)
{
    Window *window = active();
    if (!window) {
        return false;
    }
    window->updateInteractiveMoveResize(event->position, event->modifiers & ~Qt::ShiftModifier);
    return true;
}

bool TilingDragFloat::pointerButton(PointerButtonEvent *event)
{
    Window *window = active();
    if (!window) {
        return false;
    }
    if (event->state == PointerButtonState::Released && event->buttons == Qt::NoButton) {
        m_window.clear();
        window->endInteractiveMoveResize();
    }
    return true;
}

bool TilingDragFloat::keyboardKey(KeyboardKeyEvent *event)
{
    Window *window = active();
    if (!window) {
        return false;
    }
    if (event->state == KeyboardKeyState::Repeated || event->state == KeyboardKeyState::Pressed) {
        window->keyPressEvent(QKeyCombination{event->modifiers & ~Qt::ShiftModifier, event->key});
        if (window->isInteractiveMove() || window->isInteractiveResize()) {
            window->updateInteractiveMoveResize(input()->globalPointer(), input()->keyboardModifiers() & ~Qt::ShiftModifier);
        }
    }
    return true;
}

TilingDrag::TilingDrag()
    : InputEventFilter(InputFilterOrder::Decoration)
    , m_bus(this)
    , m_grab(this)
    , m_keys(this)
    , m_watcher(KConfigWatcher::create(KSharedConfig::openConfig(QStringLiteral("kwinrc"))))
{
    loadConfig();
    QObject::connect(m_watcher.get(), &KConfigWatcher::configChanged, &m_context, [this] { loadConfig(); });
    QObject::connect(workspace(), &Workspace::configChanged, &m_context, [this] { loadConfig(); });
    for (Window *window : workspace()->windows()) {
        watchMoves(window);
    }
    QObject::connect(workspace(), &Workspace::windowAdded, &m_context, [this](Window *window) { watchMoves(window); });
    // kwin-i3 says SetOn at every reconfigure: one now, for a helper loaded after it.
    QMetaObject::invokeMethod(workspace(), &Workspace::reconfigure, Qt::QueuedConnection);
    m_unanswered.setSingleShot(true);
    m_unanswered.setInterval(500);
    QObject::connect(&m_unanswered, &QTimer::timeout, &m_bus, [this] {
        m_on = false;
        m_offUnanswered = true;
        if (m_phase == Phase::Drag) {
            m_phase = Phase::None;
            m_window.clear();
        }
    });
}

// A tiling window doesn't move (§10 X5): i3 ignores a client's move request on one
// (handlers.c:936), and has no keyboard or menu move for it. KWin runs each as its own
// interactive move (an app's header bar: 6.7.5 xdgshellwindow.cpp:1045; Move Window; the window
// menu's Move), which would take the window out of its tile at the first step; the helper starts
// none on a tiled window. Cancelled on the next turn, not inside the signal: KWin's
// startInteractiveMoveResize still has work after it (window.cpp:1067-1070). A move whose first
// step came first has untiled the window already, and goes on as before (floating where dropped).
void TilingDrag::watchMoves(Window *window)
{
    QObject::connect(window, &Window::interactiveMoveResizeStarted, &m_context, [this, window] {
        if (!m_on || !window->isInteractiveMove() || window->quickTileMode() != QuickTileMode(QuickTileFlag::Custom)) {
            return;
        }
        QTimer::singleShot(0, &m_context, [window = QPointer<Window>(window)] {
            if (window && !window->isDeleted() && window->isInteractiveMove()
                && window->quickTileMode() == QuickTileMode(QuickTileFlag::Custom)) {
                window->cancelInteractiveMoveResize();
            }
        });
    });
}

TilingDrag::~TilingDrag()
{
    if (m_keysInstalled && input()) {
        input()->uninstallInputEventFilter(&m_keys);
    }
}

// i3's tiling_drag (§9 G3): which presses start the drag.
void TilingDrag::loadConfig()
{
    auto config = m_watcher->config();
    config->reparseConfiguration();
    const QString mode = config->group(QStringLiteral("Script-kwin-i3")).readEntry("tilingDrag", QStringLiteral("modifier titlebar"));
    m_modifierDrag = mode.contains(QLatin1String("modifier"));
    m_titlebarDrag = mode.contains(QLatin1String("titlebar"));
}

// "phase id x y side tab": side is the ring's side of a Z3 press, a tab's "top", else "-"; tab the
// bar and tab of a Meta press on a tab ("key:index", SetBars' key), else "-".
QString TilingDrag::state()
{
    m_unanswered.stop();
    // kwin-i3 answering late (a busy script, past the 500 ms) is still there: the timeout's "gone"
    // is undone, else every drag stayed off until the next reconfigure.
    if (m_offUnanswered) {
        m_offUnanswered = false;
        m_on = true;
    }
    const char *phase = m_phase == Phase::Drag ? (m_resize ? "resize" : "drag") : m_phase == Phase::Drop ? "drop" : m_phase == Phase::Cancel ? "cancel" : "none";
    const QString s = QStringLiteral("%1 %2 %3 %4 %5").arg(QLatin1String(phase), m_id.isEmpty() ? QStringLiteral("-") : m_id).arg(int(m_pos.x())).arg(int(m_pos.y()))
                          .arg(m_side.isEmpty() ? QStringLiteral("-") : m_side) + QLatin1Char(' ') + (m_tab.isEmpty() ? QStringLiteral("-") : m_tab);
    if (m_phase == Phase::Drop || m_phase == Phase::Cancel) {
        m_phase = Phase::None;
        m_id.clear();
    }
    return s;
}

void TilingDrag::setOn(bool on)
{
    m_on = on;
    m_offUnanswered = false;
    if (!on) {
        m_floating.clear();     // kwin-i3 gone: a new instance tells its own
    }
}

void TilingDrag::setFloating(const QString &id, bool on)
{
    if (on) {
        m_floating.insert(id);
    } else {
        m_floating.remove(id);
    }
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

// kwin-i3's Cancel, or a key press (TilingDragKeys): the drag ends; the button still held keeps
// its release ours.
void TilingDrag::cancelFromOutside()
{
    if (m_phase == Phase::Pressed || m_phase == Phase::Drag) {
        cancel();
    }
}

// A press taken for a drag or a resize: who, which button, from where; the key filter goes in
// front of the shortcuts while it is held.
void TilingDrag::takePress(Window *window, Qt::MouseButton button, const QPointF &pos, bool resize, const QString &side, bool threshold)
{
    m_window = window;
    m_id = window->internalId().toString();
    m_start = m_pos = pos;
    m_taken |= button;
    m_button = button;
    m_resize = resize;
    m_side = side;
    m_tab.clear();
    m_threshold = threshold;
    m_phase = Phase::Pressed;
    if (!m_keysInstalled && input()) {
        input()->installInputEventFilter(&m_keys);
        m_keysInstalled = true;
    }
    if (!threshold) {
        begin();
    }
}

void TilingDrag::pressDone()
{
    m_button = Qt::NoButton;
    m_window.clear();
    if (m_keysInstalled && input()) {
        input()->uninstallInputEventFilter(&m_keys);
        m_keysInstalled = false;
    }
}

// A plain left or right press on a tiled window's ring (FrameFocus found it): i3's tiling_resize on
// a border, against the neighbour on that side (§9 Z3). The activation is FrameFocus's (F3).
void TilingDrag::pressRing(Window *window, const QString &side, PointerButtonEvent *event)
{
    if (!m_on || !window || window->isDeleted() || dragging()) {
        return;
    }
    takePress(window, event->button, event->position, true, side, false);
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
        // The drag button's release drops; so does any other button's while a drag runs (i3's
        // drain_drag_events: any release ends it at the pointer, §9 G7). The drag button's own
        // release afterwards is still ours, taken.
        if (event->button == m_button || (dragging() && m_phase == Phase::Drag)) {
            if (m_phase == Phase::Drag) {
                m_phase = Phase::Drop;
                m_pos = event->position;
            } else if (m_phase == Phase::Pressed) {
                m_phase = Phase::None;
            }
            pressDone();
            hoverAt(event->position);
        }
        return true;
    }
    // Another button's press during a drag goes nowhere (i3 drains it); its release drops (above).
    if (dragging()) {
        m_taken |= event->button;
        return true;
    }
    m_taken &= ~event->button;      // a press starts afresh (FrameFocus::pointerButton, finding 5)
    if (!m_on || (event->button != Qt::LeftButton && event->button != Qt::RightButton) || input()->pointer()->isConstrained()
        || workspace()->globalShortcutsDisabled()) {
        return false;
    }
    if (pressBar(event)) {          // a group's bar, with or without a modifier (FrameFocus asks too)
        return true;
    }
    if (event->button == Qt::RightButton) {
        return pressResize(event);
    }
    Window *window = input()->pointer()->hover();
    if (!window || window->isDeleted()) {
        return false;
    }
    const auto mods = event->modifiersRelevantForShortcuts & ~Qt::KeypadModifier;
    const bool metaShift = mods == (Qt::MetaModifier | Qt::ShiftModifier);
    const bool tiled = window->quickTileMode() == QuickTileMode(QuickTileFlag::Custom);
    if (metaShift && !tiled) {
        // i3's floating modifier ignores Shift on the left button (click.c:284): a floating window
        // of kwin-i3's moves as with Meta alone, KWin's window action (§9 F1), which KWin itself
        // starts only on Meta alone (6.7.5 input.cpp:1299). Anything else keeps its press.
        if (!m_floating.contains(window->internalId().toString()) || window->isFullScreen() || !window->isMovable()) {
            return false;
        }
        m_float.start(window);      // the move without Shift: no custom-tile drop (TilingDragFloat)
        window->performMousePressCommand(options->commandAll1(), event->position);
        return true;
    }
    if (!tiled) {
        return false;
    }
    bool threshold = false;
    if (metaShift) {
        // i3's swap modifier, read at the press (tiling_drag.c:341): here the same tiling drag as
        // Meta alone, the centre's bands deciding (§9 G11). With tiling_drag off or titlebar (G3)
        // the press is the app's, as in i3: KWin's window action, which G4's swallow is for, never
        // fires with Shift held.
        if (!m_modifierDrag) {
            return false;
        }
    } else if (mods == Qt::MetaModifier) {
        // Anywhere in the window, with no threshold (i3's floating modifier, click.c), and no
        // activation: i3 starts the drag before it focuses anything (step 2 before 3), and after
        // the drop the focus stays unless the dragged window had it (§9 G1). With
        // tiling_drag off or titlebar (G3): the press is swallowed all the same, or KWin's
        // window-action filter would float the window (G4's reason); it activates, as G4 does.
        if (!m_modifierDrag) {
            window->performMousePressCommand(Options::MouseActivateAndRaise, event->position);
            m_taken |= Qt::LeftButton;
            return true;
        }
    } else if (mods != Qt::NoModifier || !window->decoration() || window->decoration()->sectionUnderMouse() != Qt::TitleBarArea) {
        return false;   // the client's press, an edge's resize: KWin's
    } else if (!m_titlebarDrag) {
        // tiling_drag off or modifier (G3): the title bar activates and raises, nothing moves.
        window->performMousePressCommand(window->isActive() ? options->commandActiveTitlebar1() : options->commandInactiveTitlebar1(), event->position);
        m_taken |= Qt::LeftButton;
        return true;
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
        threshold = true;
    }
    takePress(window, Qt::LeftButton, event->position, false, QString(), threshold);
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
        if (!w->isClient() || !w->isShown() || !w->isOnCurrentDesktop() || !w->isOnCurrentActivity() || w->isFullScreen()
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
    if (window && !window->isDeleted() && !window->isDesktop() && !GapStrips::isStrip(window)) {
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
    takePress(window, Qt::RightButton, event->position, true, QString(), false);
    return true;
}

void TilingDrag::setBars(const QString &spec)
{
    m_bars.clear();
    const QStringList lines = spec.split(QLatin1Char('\n'), Qt::SkipEmptyParts);
    for (const QString &line : lines) {
        const QStringList f = line.split(QLatin1Char(' '), Qt::SkipEmptyParts);
        if (f.size() != 7) {
            continue;
        }
        BarSpot b;
        b.key = f[0];
        b.rect = QRectF(f[1].toDouble(), f[2].toDouble(), f[3].toDouble(), f[4].toDouble());
        b.stacked = f[5] == QLatin1String("1");
        b.n = f[6].toInt();
        if (b.n > 0 && !b.rect.isEmpty()) {
            m_bars << b;
        }
    }
}

QString TilingDrag::tabEvent()
{
    const QString e = m_tabEvent;
    m_tabEvent.clear();
    return e;
}

// Over a bar only where no window of anyone's is: KWin's hover there is the desktop, a gap strip of
// kwin-i3's, or nothing. A floating window, a panel or a popup over the bar keeps its press. The
// index as i3 lays the tabs out (render_con_tabbed: equal widths; render_con_stacked: equal rows).
int TilingDrag::barAt(const QPointF &pos, const BarSpot **bar) const
{
    Window *hover = input()->pointer()->hover();
    if (hover && !hover->isDeleted() && !hover->isDesktop() && !GapStrips::isStrip(hover)) {
        return -1;
    }
    for (const BarSpot &b : m_bars) {
        if (!b.rect.contains(pos)) {
            continue;
        }
        *bar = &b;
        const double along = b.stacked ? (pos.y() - b.rect.y()) / b.rect.height() : (pos.x() - b.rect.x()) / b.rect.width();
        return std::clamp(int(along * b.n), 0, b.n - 1);
    }
    return -1;
}

void TilingDrag::tellTab(const QString &event)
{
    m_tabEvent = event;
    auto msg = QDBusMessage::createMethodCall(QStringLiteral("org.kde.kglobalaccel"), QStringLiteral("/component/kwin"),
                                              QStringLiteral("org.kde.kglobalaccel.Component"), QStringLiteral("invokeShortcut"));
    msg << QStringLiteral("kwin-i3 Tab Click");
    QDBusConnection::sessionBus().asyncCall(msg);
}

// A press on a tab (click.c route_click, CLICK_DECORATION), any modifiers, in i3's steps: 2, the
// floating modifier's left press drags that tab's container at once, focusing nothing; 3, any
// other left or right press focuses the tab by i3's rule (kwin-i3, told by "Tab Click"); 8, with
// tiling_drag's titlebar a left press is then a tiling drag of the tab past the drag distance;
// 10, else a left press, and every right press, resizes against the neighbour above (BORDER_TOP).
// i3 waits for its threshold there only if the tab wasn't focused; here always (§9 G14: the
// helper decides at the press, the focus is the tree's). The press is taken with the window the
// bar is drawn with: kwin-i3 finds the tab from "key:index" (step 2) or its tab click (the rest).
bool TilingDrag::pressBar(PointerButtonEvent *event)
{
    if (!m_on || (event->button != Qt::LeftButton && event->button != Qt::RightButton) || dragging()) {
        return false;
    }
    const BarSpot *bar = nullptr;
    const int index = barAt(event->position, &bar);
    if (index < 0) {
        return false;
    }
    Window *shown = nullptr;
    const QString windowId = bar->key.section(QLatin1Char('#'), 0, 0);   // "id#N": a further bar of that window
    for (Window *w : workspace()->windows()) {
        if (w->internalId().toString() == windowId) {
            shown = w;
        }
    }
    m_taken |= event->button;
    if (!shown || shown->isDeleted()) {
        return true;
    }
    const bool mod = event->modifiersRelevantForShortcuts & Qt::MetaModifier;
    const bool left = event->button == Qt::LeftButton;
    if (left && mod && m_modifierDrag) {
        takePress(shown, Qt::LeftButton, event->position, false, QString(), false);
        m_tab = QStringLiteral("%1:%2").arg(bar->key).arg(index);
        return true;
    }
    tellTab(QStringLiteral("click %1 %2").arg(bar->key).arg(index));
    if (left && m_titlebarDrag) {
        // The drag is the shown window's until kwin-i3 has focused the tab: it reports the tab's
        // window in State() once it knows (the tab clicked is the one that ends up shown).
        takePress(shown, Qt::LeftButton, event->position, false, QString(), !mod);
    } else {
        takePress(shown, event->button, event->position, true, QStringLiteral("top"), true);
    }
    return true;
}

// i3's scroll over a tabbed or stacked decoration: the next or previous tab (click.c, step 1).
bool TilingDrag::pointerAxis(PointerAxisEvent *event)
{
    if (!m_on || dragging() || (event->modifiersRelevantForGlobalShortcuts & ~Qt::KeypadModifier) != Qt::NoModifier) {
        return false;
    }
    const BarSpot *bar = nullptr;
    if (barAt(event->position, &bar) < 0) {
        return false;
    }
    if (event->delta == 0) {
        return true;
    }
    tellTab(QStringLiteral("scroll %1 %2").arg(bar->key).arg(event->delta < 0 ? -1 : 1));
    return true;
}
