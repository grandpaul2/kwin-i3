#include "framefocus.h"
#include "gapstrips.h"
#include "pointerprobe.h"
#include "tilingdrag.h"

#include <effect/globals.h>
#include <input_event.h>
#include <options.h>
#include <pointer_input.h>
#include <window.h>
#include <workspace.h>

#include <KConfigGroup>
#include <KSharedConfig>

using namespace KWin;

FrameFocus::FrameFocus(TilingDrag *drag)
    : InputEventFilter(InputFilterOrder::Decoration)
    , m_drag(drag)
    , m_watcher(KConfigWatcher::create(KSharedConfig::openConfig(QStringLiteral("kwinrc"))))
{
    const auto load = [this] {
        auto config = m_watcher->config();
        config->reparseConfiguration();
        const KConfigGroup group = config->group(QStringLiteral("Script-kwin-i3"));
        m_frameWidth = std::clamp(group.readEntry("frameWidth", 1), 1, 10);
        m_frameOnFloating = group.readEntry("frameOnFloating", false);
        // Tiled windows have a ring in i3's frame look only (docs/spec-tiled-look.md).
        m_tiledRing = group.readEntry("tiledLook", QStringLiteral("frame")) == QLatin1String("frame");
    };
    load();
    QObject::connect(m_watcher.get(), &KConfigWatcher::configChanged, &m_context, load);
    QObject::connect(workspace(), &Workspace::configChanged, &m_context, load);
}

// The side of a window's frame a press outside it is on: top, then left, right, bottom at a corner
// (i3's tiling_resize on a border, CLICK_BORDER).
static QString sideOf(const Window *w, const QPointF &pos)
{
    const RectF frame = w->frameGeometry();
    return pos.y() < frame.top() ? QStringLiteral("top") : pos.x() < frame.left() ? QStringLiteral("left")
         : pos.x() >= frame.right() ? QStringLiteral("right") : QStringLiteral("bottom");
}

static bool customTiled(const Window *w)
{
    return w->requestedQuickTileMode() == QuickTileMode(QuickTileFlag::Custom) || w->quickTileMode() == QuickTileMode(QuickTileFlag::Custom);
}

// The pointer over a tiled window's own input area outside its frame: an app that draws its own
// frame keeps an invisible resize border there (VS Code, Chromium's frame; a GTK header bar),
// since KWin reports no tiled edges for a tile with padding (tile.cpp Tile::anchors), and kwin-i3's
// tiles always have padding. A press there would be the app's resize, KWin's live tile resize
// (OPEN.md item 43): the ring and the gap stay kwin-i3's, as beside any other window.
bool FrameFocus::overTiledMargin(const QPointF &pos, Window *hover) const
{
    return hover && hover->isClient() && customTiled(hover) && !hover->frameGeometry().contains(pos);
}

// The tiled window whose frame ring is under the pointer, else null. Only where the pointer is
// over no window, the desktop, or a tiled window's margin (overTiledMargin): a window above a
// frame (a floating one) keeps its clicks.
// Framed as kwini3hold frames it (Hold::framed, Hold::floatingFramed): in one of kwin-i3's tiles
// (custom tiling), or floating with frameOnFloating; no server decoration, not fullscreen.
KWin::Window *FrameFocus::ringWindow(const QPointF &pos, Window *hover) const
{
    if (hover && !hover->isDesktop() && !GapStrips::isStrip(hover) && !overTiledMargin(pos, hover)) {
        return nullptr;
    }
    const auto order = workspace()->stackingOrder();
    for (auto it = order.crbegin(); it != order.crend(); ++it) {
        if (onRing(*it, pos)) {
            return *it;
        }
    }
    return nullptr;
}

// The shown tiled window whose own frame holds pos, if any (tiled windows never overlap).
KWin::Window *FrameFocus::tiledFrameAt(const QPointF &pos) const
{
    const auto order = workspace()->stackingOrder();
    for (auto it = order.crbegin(); it != order.crend(); ++it) {
        Window *w = *it;
        if (w->isClient() && !w->isDeleted() && !w->isMinimized() && !w->isHidden() && w->isOnCurrentDesktop() && !w->isFullScreen()
            && customTiled(w) && w->frameGeometry().contains(pos)) {
            return w;
        }
    }
    return nullptr;
}

bool FrameFocus::onRing(const Window *w, const QPointF &pos) const
{
    if (!w->isClient() || w->isDeleted() || w->isMinimized() || w->isHidden() || !w->isOnCurrentDesktop()
        || w->isFullScreen() || w->decoration() || GapStrips::isStrip(w)) {
        return false;
    }
    // Tiled (kwin-i3's custom tiles), or floating with its border taken while floating
    // windows are framed too (kwini3hold's floating set isn't readable from here; kwin-i3
    // takes the border of no floating window but its own).
    const bool tiled = customTiled(w);
    if (tiled ? !m_tiledRing : !(m_frameOnFloating && w->noBorder() && w->isNormalWindow())) {
        return false;
    }
    const RectF frame = w->frameGeometry();
    const double f = m_frameWidth;
    return frame.adjusted(-f, -f, f, f).contains(pos) && !frame.contains(pos);
}

// Focus follows the mouse onto a frame, as into a client: the request KWin's own
// Window::pointerEnterEvent makes. Not pointerEnterEvent itself: KWin has just stored this
// pointer position as the focus-mouse position, so its "has the mouse moved" check would refuse
// (review 2, 2026-10-23). No cancel when the frame is left for another window: KWin has already
// requested that window's focus, and cancelDelayFocus would drop it.
bool FrameFocus::pointerMotion(PointerMotionEvent *event)
{
    // A tiled neighbour's invisible band over this tiled window's own frame (an app drawing its
    // own frame, stacked above): raise this one among the tiles, so that each tiled window owns
    // its whole frame, as a clipped client does in i3 (spec-gap-ownership.md, part B). Tiled
    // windows never overlap visibly, so the order among them shows nothing (probed: no pixel
    // changed), and floating windows keep above; no focus change.
    Window *hover = input()->pointer()->hover();
    if (overTiledMargin(event->position, hover)) {
        if (Window *owner = tiledFrameAt(event->position); owner && owner != hover && owner != m_raised) {
            m_raised = owner;
            workspace()->raiseWindow(owner);
        }
    } else {
        m_raised = nullptr;
    }
    Window *window = ringWindow(event->position, hover);
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
    // A press this filter doesn't act on goes on to KWin, except over a strip of kwin-i3's own
    // (gapstrips.h): KWin counts it a window (an InternalWindow is always a client) and would run
    // its window actions on it, Meta+right resizing the strip itself (review 2026-10-28). There
    // the press goes nowhere, as on i3's root.
    const bool overStrip = GapStrips::isStrip(input()->pointer()->hover());
    const auto pass = [&](const QString &why) {
        if (m_probe) {
            m_probe->note(QStringLiteral("FrameFocus pass") + why + (overStrip ? QStringLiteral(", over a strip: taken") : QString()));
        }
        if (overStrip) {
            m_taken |= event->button;
        }
        return overStrip;
    };
    if (input()->pointer()->isConstrained() || workspace()->globalShortcutsDisabled()) {
        return pass(QStringLiteral(" (pointer constrained or shortcuts inhibited)"));
    }
    if ((event->modifiersRelevantForShortcuts & ~Qt::KeypadModifier) != Qt::NoModifier) {
        return pass(QStringLiteral(" (modifiers)"));
    }
    const Decision d = decide(event->position, input()->pointer()->hover(), event->button);
    if (m_probe && d.kind != Decision::Pass) {
        m_probe->note(QStringLiteral("FrameFocus ") + d.describe());
    }
    switch (d.kind) {
    case Decision::Pass:
        return pass(QString());
    case Decision::Ring:
    case Decision::RingResize:
    case Decision::GapResize:
        if (const auto command = d.window->getMousePressCommand(event->button)) {
            d.window->performMousePressCommand(*command, event->position);
        }
        if (d.kind != Decision::Ring) {
            m_drag->pressRing(d.window, d.side, event);
            return true;
        }
        break;
    case Decision::Margin:
        break;
    }
    m_taken |= event->button;
    return true;
}

FrameFocus::Decision FrameFocus::decide(const QPointF &pos, Window *hover, Qt::MouseButton button) const
{
    const bool resizeButton = m_drag && m_drag->on() && (button == Qt::LeftButton || button == Qt::RightButton);
    Window *window = ringWindow(pos, hover);
    if (!window) {
        // A plain left or right press in the gap (over the desktop, or a tiled window's margin):
        // as on the ring of the nearest tiled window (TilingDrag::gapWindow, Z2's reach), on its
        // side facing the press. The gap is a handle, not a sliver of desktop: i3 shows none
        // between windows (Paul, 2026-10-28, OPEN.md item 43).
        // Over a strip of kwin-i3's (gapstrips.h): the gap, as the root is in i3.
        const bool gap = !hover || hover->isDesktop() || GapStrips::isStrip(hover) || overTiledMargin(pos, hover);
        // Inside another tiled window's own frame, under this one's band: that window's pixel,
        // which only the app holding the pointer could hand on. Nothing, not a resize of it
        // (spec-gap-ownership.md, part C; the raise in pointerMotion makes it rare).
        if (overTiledMargin(pos, hover) && tiledFrameAt(pos)) {
            return {Decision::Margin, hover, QString()};
        }
        if (gap && resizeButton) {
            if (Window *near = m_drag->gapWindow(pos)) {
                return {Decision::GapResize, near, sideOf(near, pos)};
            }
        }
        // Over a margin with no tiled window in reach: nothing, and not the app's resize.
        if (overTiledMargin(pos, hover)) {
            return {Decision::Margin, hover, QString()};
        }
        return {};
    }
    // A left or right press on a tiled window's ring is i3's resize on that side (tiling_resize,
    // CLICK_BORDER: top, then left, right, bottom at a corner; §9 Z3): the drag filter takes the
    // press from here, kwin-i3 resizes at the release. The release is then its.
    if (customTiled(window) && resizeButton) {
        return {Decision::RingResize, window, sideOf(window, pos)};
    }
    return {Decision::Ring, window, QString()};
}

QString FrameFocus::Decision::describe() const
{
    static const char *const names[] = {"pass", "ring", "ring-resize", "gap-resize", "margin"};
    QString text = QString::fromLatin1(names[kind]);
    if (window) {
        text += QLatin1Char(' ') + PointerProbe::name(window);
    }
    if (!side.isEmpty()) {
        text += QLatin1Char(' ') + side;
    }
    return text;
}

// A scroll on a frame focuses the window, as i3's step 3 does on a border (§9 F4), and goes no
// further (on the desktop beneath it would switch desktops).
bool FrameFocus::pointerAxis(PointerAxisEvent *event)
{
    if ((event->modifiers & ~Qt::KeypadModifier) != Qt::NoModifier) {
        return false;
    }
    Window *window = ringWindow(event->position, input()->pointer()->hover());
    if (!window) {
        return false;
    }
    if (!window->isActive()) {
        workspace()->activateWindow(window);
    }
    return true;
}
