#include "hold.h"

#include <core/output.h>
#include <effect/effecthandler.h>
#include <core/region.h>
#include <core/rendertarget.h>
#include <core/renderviewport.h>
#include <opengl/glshader.h>
#include <opengl/glshadermanager.h>
#include <opengl/glvertexbuffer.h>
#include <scene/borderradius.h>
#include <scene/windowitem.h>
#include <window.h>
#include <workspace.h>

#include <KConfigGroup>
#include <KSharedConfig>

#include <QDBusConnection>

#include <cmath>

using namespace KWin;

// The config form's group (docs/spec-settings.md); the old [kwin-i3-hold] keys are still read
// where the new ones are missing.
static const QString s_group = QStringLiteral("Script-kwin-i3");
static const QString s_oldGroup = QStringLiteral("kwin-i3-hold");
static const int s_graceMs = 20;   // a closing window waits this long for a neighbour; a new one for a tile
static const int s_quietMs = 3;    // kwin-i3's second pass comes microseconds after the first
// Breeze's: 2.5 x smallSpacing (2 on Wayland), breezedecoration.cpp:857. Logical, unsnapped: KWin
// scales and rounds a window's radius per output (itemrenderer_opengl.cpp:190).
static const qreal s_radius = 5.0;

Hold::Hold()
    : CrossFadeEffect()
    , m_watcher(KConfigWatcher::create(KSharedConfig::openConfig(QStringLiteral("kwinrc"))))
{
    connect(m_watcher.get(), &KConfigWatcher::configChanged, this, [this](const KConfigGroup &group) {
        if (group.name() == s_group || group.name() == s_oldGroup) {
            loadConfig();
        }
    });
    // KWin's reconfigure (Meta+Shift+C, or Apply with kwini3helper) reconfigures no effect by
    // itself: only a --notify write reaches one (effecthandler.cpp). So this hears it directly.
    connect(workspace(), &Workspace::configChanged, this, &Hold::loadConfig);
    loadConfig();

    m_deadline.setSingleShot(true);
    connect(&m_deadline, &QTimer::timeout, this, [this] { release(true); });
    m_quiet.setSingleShot(true);
    m_quiet.setTimerType(Qt::PreciseTimer);
    m_quiet.setInterval(s_quietMs);
    connect(&m_quiet, &QTimer::timeout, this, &Hold::queueCheck);

    const auto windows = effects->stackingOrder();
    for (EffectWindow *w : windows) {
        watchWindow(w);
    }
    connect(effects, &EffectsHandler::windowAdded, this, &Hold::onAdded);
    connect(effects, &EffectsHandler::windowClosed, this, &Hold::onClosed);
    connect(effects, &EffectsHandler::windowDeleted, this, &Hold::onDeleted);

    connect(effects, &EffectsHandler::windowActivated, this, [this](EffectWindow *w) {
        if (m_active) {
            repaintRing(m_active, m_active->frameGeometry());
        }
        m_active = w;
        if (w) {
            repaintRing(w, w->frameGeometry());
        }
    });
    m_active = effects->activeWindow();

    QDBusConnection::sessionBus().registerObject(QStringLiteral("/kwini3hold"),
                                                 QStringLiteral("net.local.kwini3hold"),
                                                 this, QDBusConnection::ExportAllSlots);
    // kwin-i3 draws no frame of its own without this effect (spec-window-modes R5): KWin's
    // reconfigure is how it hears that the effect came or went (it asks Stats on every one).
    QMetaObject::invokeMethod(workspace(), &Workspace::reconfigure, Qt::QueuedConnection);
}

Hold::~Hold()
{
    QDBusConnection::sessionBus().unregisterObject(QStringLiteral("/kwini3hold"));
    releaseAll();
    resetRadii();
    if (workspace()) {
        QMetaObject::invokeMethod(workspace(), &Workspace::reconfigure, Qt::QueuedConnection);
    }
}

bool Hold::supported()
{
    return effects->isOpenGLCompositing();
}

void Hold::reconfigure(ReconfigureFlags)
{
    loadConfig();
}

void Hold::loadConfig()
{
    auto config = m_watcher->config();
    config->reparseConfiguration();
    const KConfigGroup group = config->group(s_group), old = config->group(s_oldGroup);
    m_enabled = group.hasKey("holdEnabled") ? group.readEntry("holdEnabled", true) : old.readEntry("Enabled", true);
    m_timeoutMs = group.hasKey("holdTimeoutMs") ? group.readEntry("holdTimeoutMs", 100)
                                                : old.readEntry("TimeoutMs", 100);   // tests raise it to capture mid-hold
    // The frame's keys (src/settings.js), shared with kwini3frame's; not affected by holdEnabled.
    m_frameWidth = std::clamp(group.readEntry("frameWidth", 1), 1, 10);
    const auto colour = [&group](const char *key, const QColor &def) {
        const QColor c(group.readEntry(key, def.name()));
        return c.isValid() ? QColor(c.red(), c.green(), c.blue()) : def;    // opaque whatever it says
    };
    m_frameActive = colour("frameActive", QColor(0x4c, 0x78, 0x99));
    m_frameInactive = colour("frameInactive", QColor(0x33, 0x33, 0x33));
    m_floatingActive = colour("frameFloatingActive", QColor(0x4d, 0x72, 0x54));
    m_floatingInactive = colour("frameFloatingInactive", QColor(0x33, 0x33, 0x33));
    m_frameOnFloating = group.readEntry("frameOnFloating", false);
    m_roundedCorners = group.readEntry("roundedCorners", true);
    updateRadii();
    effects->addRepaintFull();
    if (!m_enabled) {
        releaseAll();
    }
}

// ---- windows and their signals --------------------------------------------------------------

void Hold::watchWindow(EffectWindow *w)
{
    connect(w, &EffectWindow::windowFrameGeometryAboutToChange, this, &Hold::onAboutToChange);
    connect(w, &EffectWindow::windowFrameGeometryChanged, this, &Hold::queueCheck);
    // The frame is outside the window: nothing repaints it but this (the old ring and the new).
    connect(w, &EffectWindow::windowFrameGeometryChanged, this, [this](EffectWindow *w, const RectF &old) {
        repaintRing(w, old);
        repaintRing(w, w->frameGeometry());
    });
    const auto ringChanged = [this](EffectWindow *w) {
        repaintRing(w, w->frameGeometry());
    };
    // The radius here, not only in prePaintWindow: setDecoration has just reset it (before this
    // signal), and the paint hooks don't run once nothing is framed (the last window fullscreen).
    const auto radiusChanged = [this](EffectWindow *w) {
        updateRadius(w);
        repaintRing(w, w->frameGeometry());
    };
    connect(w, &EffectWindow::windowDecorationChanged, this, radiusChanged);
    connect(w, &EffectWindow::windowFullScreenChanged, this, radiusChanged);
    connect(w, &EffectWindow::minimizedChanged, this, radiusChanged);
    connect(w, &EffectWindow::windowDesktopsChanged, this, ringChanged);
    connect(w, &EffectWindow::windowHiddenChanged, this, ringChanged);
    if (Window *win = w->window()) {
        QPointer<EffectWindow> qp(w);
        const auto tileChanged = [this, qp] {
            if (qp) {
                updateRadius(qp);
                repaintRing(qp, qp->frameGeometry());
            }
        };
        connect(win, &Window::tileChanged, this, tileChanged);
        connect(win, &Window::requestedTileChanged, this, tileChanged);
    }
    connect(w, &EffectWindow::minimizedChanged, this, &Hold::queueCheck);
    connect(w, &EffectWindow::windowDesktopsChanged, this, &Hold::queueCheck);
    connect(w, &EffectWindow::windowHiddenChanged, this, &Hold::queueCheck);
    connect(w, &EffectWindow::windowStartUserMovedResized, this, [this](EffectWindow *w) {
        m_dragging.append(w);
    });
    connect(w, &EffectWindow::windowFinishUserMovedResized, this, [this](EffectWindow *w) {
        m_dragging.removeAll(w);
    });
}

void Hold::onAdded(EffectWindow *w)
{
    watchWindow(w);
    if (!m_enabled || !supported()) {
        return;
    }
    // Hidden until a tile places it, or 20 ms: kwin-i3 places it a turn later, and without this
    // the window would show at KWin's default spot for a frame. Not dialogs, modal or transient
    // windows (a Wayland transient is still "Normal" by type): kwin-i3 floats them.
    Window *win = w->window();
    const bool transient = w->isDialog() || w->isModal() || (win && win->transientFor());
    if (w->isNormalWindow() && !transient && shown(w) && !w->isFullScreen() && !w->isDeleted()) {
        hide(w);
    }
}

void Hold::onClosed(EffectWindow *w)
{
    m_dragging.removeAll(w);
    repaintRing(w, w->frameGeometry());
    if (m_hidden.remove(w)) {      // never shown: nothing to keep on screen
        m_held.remove(w);
        queueCheck();
        return;
    }
    if (!m_enabled || !supported()) {
        return;
    }
    if (auto it = m_held.find(w); it != m_held.end()) {
        if (!it->closed) {
            it->closed = true;             // keeps its snapshot; counts as settled
            w->refWindow();
        }
        queueCheck();
        return;
    }
    if (!tiled(w) || !shown(w) || w->isFullScreen()) {
        return;
    }
    w->refWindow();
    if (m_open) {
        Held h;
        h.closed = true;
        m_held.insert(w, h);
        ++m_stats.closeHoldsKept;
        restartQuiet();
        return;
    }
    // Pending: its neighbours' aboutToChange, if any, promotes it (ensureOpen); else let it go.
    m_pendingClose.insert(w, QElapsedTimer());
    m_pendingClose[w].start();
    QPointer<EffectWindow> qp(w);
    QTimer::singleShot(s_graceMs, this, [this, qp] {
        if (qp && m_pendingClose.remove(qp)) {
            ++m_stats.closeHoldsDropped;
            qp->unrefWindow();
        }
    });
}

void Hold::onDeleted(EffectWindow *w)
{
    m_floating.remove(w->internalId().toString());
    m_rounded.remove(w->internalId().toString());
    m_held.remove(w);
    m_hidden.remove(w);
    m_pendingClose.remove(w);
    m_dragging.removeAll(w);
    queueCheck();
}

void Hold::onAboutToChange(EffectWindow *w)
{
    if (!m_enabled || !supported()) {
        return;
    }
    if (m_hidden.contains(w)) {
        if (m_held.contains(w)) {           // already joined
            restartQuiet();
            queueCheck();
            return;
        }
        if (tiled(w) && shown(w)) {         // its tile places it: join, still hidden, no snapshot
            Held h;
            h.joined = true;
            m_held.insert(w, h);
            ensureOpen();
            restartQuiet();
            queueCheck();
        } else {                            // placed by other means (floated): show it
            unhide(w);
        }
        return;
    }
    if (!eligible(w)) {
        return;
    }
    if (!m_held.contains(w)) {
        Held h;
        h.frame = w->frameGeometry();
        snapshot(w);
        h.snapshot = true;
        m_held.insert(w, h);
        ensureOpen();
    }
    restartQuiet();
    queueCheck();
}

// ---- tests on windows -------------------------------------------------------------------------

bool Hold::tiled(EffectWindow *w) const
{
    Window *win = w->window();
    return win && (win->requestedTile() || win->tile());
}

bool Hold::shown(EffectWindow *w) const
{
    return w->isOnCurrentDesktop() && w->isOnCurrentActivity() && !w->isMinimized() && !w->isHidden();
}

bool Hold::outputDragged(EffectWindow *w) const
{
    for (const QPointer<EffectWindow> &d : m_dragging) {
        if (d && d->screen() == w->screen()) {
            return true;
        }
    }
    return false;
}

bool Hold::eligible(EffectWindow *w) const
{
    return tiled(w) && shown(w) && !w->isFullScreen() && !w->isDeleted() && w->screen()
        && !w->bufferGeometry().isEmpty() && !outputDragged(w);
}

// The frame is where KWin asked it to be (within a device pixel): no configure outstanding.
bool Hold::settled(EffectWindow *w) const
{
    Window *win = w->window();
    if (!win) {
        return true;
    }
    const RectF a = win->frameGeometry(), b = win->moveResizeGeometry();
    const qreal scale = w->screen() ? w->screen()->scale() : 1.0;
    auto near = [scale](qreal x, qreal y) { return std::abs((x - y) * scale) < 0.51; };
    return near(a.x(), b.x()) && near(a.y(), b.y()) && near(a.width(), b.width()) && near(a.height(), b.height());
}

// ---- the transaction --------------------------------------------------------------------------

void Hold::snapshot(EffectWindow *w)
{
    QElapsedTimer t;
    t.start();
    m_snapshotting = true;      // drawWindow: the plain chain, not our snapshot-only path
    redirect(w);
    m_snapshotting = false;
    const double ms = t.nsecsElapsed() / 1e6;
    ++m_stats.snapshots;
    m_stats.lastSnapshotMs = ms;
    m_stats.maxSnapshotMs = std::max(m_stats.maxSnapshotMs, ms);
}

void Hold::hide(EffectWindow *w)
{
    Hidden h;
    h.effect = std::make_shared<ItemEffect>(w->windowItem());
    h.since.start();
    m_hidden.insert(w, h);
    ++m_stats.newHidden;
    QPointer<EffectWindow> qp(w);
    QTimer::singleShot(s_graceMs, this, [this, qp] {
        if (qp && m_hidden.contains(qp) && !m_held.contains(qp)) {
            unhide(qp);
        }
    });
    effects->addRepaintFull();
}

void Hold::unhide(EffectWindow *w)
{
    auto it = m_hidden.find(w);
    if (it == m_hidden.end()) {
        return;
    }
    const double ms = it->since.nsecsElapsed() / 1e6;
    m_stats.lastHiddenMs = ms;
    m_stats.maxHiddenMs = std::max(m_stats.maxHiddenMs, ms);
    m_hidden.erase(it);
    effects->addRepaintFull();
}

void Hold::ensureOpen()
{
    if (m_open) {
        return;
    }
    m_open = true;
    m_started.start();
    m_deadline.start(m_timeoutMs);
    ++m_stats.transactions;
    // Closing windows waiting for exactly this.
    const auto pending = m_pendingClose.keys();
    m_pendingClose.clear();
    for (EffectWindow *w : pending) {
        Held h;
        h.closed = true;
        m_held.insert(w, h);
        ++m_stats.closeHoldsKept;
    }
    effects->addRepaintFull();
}

void Hold::restartQuiet()
{
    m_quiet.start();
}

void Hold::queueCheck()
{
    if (m_checkQueued) {
        return;
    }
    m_checkQueued = true;
    QMetaObject::invokeMethod(this, [this] {
        m_checkQueued = false;
        check();
    }, Qt::QueuedConnection);
}

// Never synchronous (a same-size move settles inside the call that made it, before the next
// window's aboutToChange): queued, after whatever caused it has returned.
void Hold::check()
{
    if (!m_open) {
        return;
    }
    bool all = true;
    for (auto it = m_held.begin(); it != m_held.end(); ++it) {
        EffectWindow *w = it.key();
        Held &h = it.value();
        if (h.closed || h.settledHidden) {
            continue;
        }
        if (!shown(w)) {
            // Gone to another desktop or minimized: it will never acknowledge, so it counts as
            // settled, but its snapshot stays on screen (a hidden window leaves the stacking
            // order, and its slot would show wallpaper while the neighbours are still held).
            if (h.snapshot) {
                h.visible.emplace(w, EffectWindow::PAINT_DISABLED | EffectWindow::PAINT_DISABLED_BY_DESKTOP
                                      | EffectWindow::PAINT_DISABLED_BY_MINIMIZE | EffectWindow::PAINT_DISABLED_BY_ACTIVITY);
            }
            h.settledHidden = true;
            continue;
        }
        if (!settled(w)) {
            all = false;
        }
    }
    if (!all || m_quiet.isActive()) {
        return;
    }
    release(false);
}

void Hold::release(bool timedOut)
{
    if (!m_open) {
        return;
    }
    m_open = false;
    m_deadline.stop();
    m_quiet.stop();
    const double ms = m_started.nsecsElapsed() / 1e6;
    m_stats.lastMs = ms;
    m_stats.maxMs = std::max(m_stats.maxMs, ms);
    if (timedOut) {
        ++m_stats.timeouts;
    }
    // On copies: unrefWindow can delete a window, and windowDeleted then edits these lists.
    // (The copies hold their own visible refs, so a hidden window stays drawn until the end.)
    const QHash<EffectWindow *, Held> held = m_held;
    m_held.clear();
    for (auto it = held.cbegin(); it != held.cend(); ++it) {
        if (it->snapshot) {
            unredirect(it.key());
        }
    }
    for (auto it = held.cbegin(); it != held.cend(); ++it) {
        if (it->joined) {
            unhide(it.key());
        }
    }
    // Visible refs before the closed windows' refs: unrefWindow can delete the window and its
    // item, and a visible ref dying later would touch it (a window sent away, then closed, in
    // one hold).
    QHash<EffectWindow *, Held> mutableHeld = held;
    for (auto it = mutableHeld.begin(); it != mutableHeld.end(); ++it) {
        it->visible.reset();
    }
    for (auto it = mutableHeld.begin(); it != mutableHeld.end(); ++it) {
        if (it->closed) {
            it.key()->unrefWindow();
        }
    }
    effects->addRepaintFull();
}

void Hold::releaseAll()
{
    release(false);
    const auto pending = m_pendingClose.keys();
    m_pendingClose.clear();
    for (EffectWindow *w : pending) {
        ++m_stats.closeHoldsDropped;
        w->unrefWindow();
    }
    const auto hidden = m_hidden.keys();
    for (EffectWindow *w : hidden) {
        unhide(w);
    }
}

// ---- painting ---------------------------------------------------------------------------------

bool Hold::holding() const
{
    return m_open || !m_hidden.isEmpty();
}

// While a framed window is shown, for the paint hooks; the screen-wide repaint only while holding.
bool Hold::isActive() const
{
    if (holding()) {
        return true;
    }
    const auto windows = effects->stackingOrder();
    for (EffectWindow *w : windows) {
        if ((framed(w) || floatingFramed(w)) && shown(w)) {
            return true;
        }
    }
    return false;
}

// A fullscreen game or video scans out directly unless a hold is on (review R1-3).
bool Hold::blocksDirectScanout() const
{
    return holding();
}

void Hold::prePaintScreen(ScreenPrePaintData &data)
{
    if (holding()) {
        data.mask |= PAINT_SCREEN_WITH_TRANSFORMED_WINDOWS;
    }
    effects->prePaintScreen(data);
}

void Hold::prePaintWindow(RenderView *view, EffectWindow *w, WindowPrePaintData &data)
{
    // Transformed: painted beyond its own rect (a snapshot at its old frame, or its ring), with
    // the region still visible at its place in the stack (WorkspaceScene::paintSimpleScreen).
    if (m_held.contains(w) || m_hidden.contains(w) || framed(w) || floatingFramed(w)) {
        data.setTransformed();
    }
    updateRadius(w);    // any other way into a tile (the signals cover the ways out)
    effects->prePaintWindow(view, w, data);
}

void Hold::paintWindow(const RenderTarget &renderTarget, const RenderViewport &viewport, EffectWindow *w, int mask, const Region &deviceRegion, WindowPaintData &data)
{
    if (auto it = m_held.constFind(w); it != m_held.cend() && it->snapshot) {
        // CrossFadeEffect draws the snapshot over the window's current frame; put it back on
        // the old one. toMatrix is translate-then-scale about the current frame's top left.
        const RectF cur = w->frameGeometry(), old = it->frame;
        if (cur.width() > 0 && cur.height() > 0) {
            data.translate(old.x() - cur.x(), old.y() - cur.y());
            data.setXScale(data.xScale() * old.width() / cur.width());
            data.setYScale(data.yScale() * old.height() / cur.height());
        }
        data.setCrossFadeProgress(0);   // the snapshot only, never the live window
    }
    effects->paintWindow(renderTarget, viewport, w, mask, deviceRegion, data);
    if ((framed(w) || floatingFramed(w)) && !m_hidden.contains(w)) {
        paintFrame(renderTarget, viewport, w, deviceRegion, data);
    }
}

// A floating window kwin-i3 took the decoration of, with frameOnFloating: the frame in the
// floating colours. Not one that draws its own title bar (its decoration policy is the client's:
// review R1-5), not fullscreen, not minimized.
bool Hold::floatingFramed(EffectWindow *w) const
{
    Window *win = w->window();
    if (!m_frameOnFloating || !win || w->isDeleted() || w->isFullScreen() || w->isMinimized() || w->hasDecoration() || !w->isNormalWindow()) {
        return false;
    }
    return win->noBorder() && m_floating.contains(w->internalId().toString());
}

void Hold::SetFloating(const QString &id, bool on)
{
    if (on) {
        m_floating.insert(id);
    } else {
        m_floating.remove(id);
    }
    const auto windows = effects->stackingOrder();
    for (EffectWindow *w : windows) {
        if (w->internalId().toString() == id) {
            repaintRing(w, w->frameGeometry());
        }
    }
}

// ---- the frame --------------------------------------------------------------------------------

// A window in one of kwin-i3's tiles (KWin's custom tiling; quick tiling is a Plasma window's)
// with no server decoration: kwin-i3 took it, or the client draws its own (CSD), framed alike.
bool Hold::framed(EffectWindow *w) const
{
    Window *win = w->window();
    if (!win || w->isDeleted() || w->isFullScreen() || w->isMinimized() || w->hasDecoration() || !w->isNormalWindow()) {
        return false;
    }
    return win->requestedQuickTileMode() == QuickTileMode(QuickTileFlag::Custom)
        || win->quickTileMode() == QuickTileMode(QuickTileFlag::Custom);
}

// Rounded while framed and roundedCorners is on; set back to none when it stops being either,
// only on windows this effect rounded and only without a decoration (a decorated one has its
// theme's radius from setDecoration, which kwin-i3 never touches).
void Hold::updateRadius(EffectWindow *w)
{
    Window *win = w ? w->window() : nullptr;
    if (!win || w->isDeleted()) {
        return;
    }
    const QString id = w->internalId().toString();
    if (m_roundedCorners && framed(w)) {
        if (win->borderRadius() != BorderRadius(s_radius)) {
            win->setBorderRadius(BorderRadius(s_radius));
        }
        m_rounded.insert(id);
    } else if (m_rounded.remove(id) && !w->hasDecoration()) {
        win->setBorderRadius(BorderRadius());
    }
}

void Hold::updateRadii()
{
    const auto windows = effects->stackingOrder();
    for (EffectWindow *w : windows) {
        updateRadius(w);
    }
}

void Hold::resetRadii()
{
    const auto windows = effects->stackingOrder();
    for (EffectWindow *w : windows) {
        if (m_rounded.remove(w->internalId().toString()) && w->window() && !w->isDeleted() && !w->hasDecoration()) {
            w->window()->setBorderRadius(BorderRadius());
        }
    }
    m_rounded.clear();
}

// The bars around `frame`, in device pixels (logical x scale): each from the window's rounded
// edge out to the rounded edge of the frame width beyond it, which is the middle of the padding
// between two windows, so neighbours meet with no overlap and no gap at any scale (review R1-6).
// Top and bottom span the corners. With a radius (device px) each bar reaches that far inside
// the window too: the wedge between a corner and its arc is the frame's, and inside the rect.
QList<RectF> Hold::ring(EffectWindow *, const RectF &frame, double scale, double radius) const
{
    const double f = m_frameWidth, r = radius;
    const double ix0 = std::round(frame.x() * scale), iy0 = std::round(frame.y() * scale);
    const double ix1 = std::round((frame.x() + frame.width()) * scale), iy1 = std::round((frame.y() + frame.height()) * scale);
    const double ox0 = std::round((frame.x() - f) * scale), oy0 = std::round((frame.y() - f) * scale);
    const double ox1 = std::round((frame.x() + frame.width() + f) * scale), oy1 = std::round((frame.y() + frame.height() + f) * scale);
    return {RectF(ox0, oy0, ox1 - ox0, iy0 + r - oy0), RectF(ox0, iy1 - r, ox1 - ox0, oy1 - iy1 + r),
            RectF(ox0, iy0 + r, ix0 + r - ox0, iy1 - iy0 - 2 * r), RectF(ix1 - r, iy0 + r, ox1 - ix1 + r, iy1 - iy0 - 2 * r)};
}

void Hold::repaintRing(EffectWindow *w, const RectF &frame)
{
    if (!w || frame.isEmpty()) {
        return;
    }
    const double f = m_frameWidth + 1;      // and a pixel of slack for the rounding
    const double r = m_roundedCorners ? s_radius : 0;   // the wedges inside the corners
    const RectF outer = frame.adjusted(-f, -f, f, f);
    effects->addRepaint(Rect(std::floor(outer.x()), std::floor(outer.y()), frame.width() + 2 * f + 1, f + 1 + r));
    effects->addRepaint(Rect(std::floor(outer.x()), std::floor(frame.y() + frame.height() - 1 - r), frame.width() + 2 * f + 1, f + 2 + r));
    effects->addRepaint(Rect(std::floor(outer.x()), std::floor(outer.y()), f + 1 + r, frame.height() + 2 * f + 1));
    effects->addRepaint(Rect(std::floor(frame.x() + frame.width() - 1 - r), std::floor(outer.y()), f + 2 + r, frame.height() + 2 * f + 1));
}

// The ring around wherever the window is drawn: its frame moved and scaled as the paint data says
// (a held snapshot at its old frame, a sliding desktop), clipped to the region this paint may
// touch, which leaves out windows above it (review R1-1), and as opaque as the window (a fade).
// Read after effects->paintWindow has returned: the effects after this one in the chain have
// changed the same paint data by then (Hold asks for no chain position; spec R1-16).
// Drawn with KWin's border shader (what Breeze's outline uses, base.frag): the inner edge the
// window's rect with the radius KWin clips the window to, so the ring follows its corners; the
// outer edge the frame width beyond. In global device pixels, as the vertices are.
void Hold::paintFrame(const RenderTarget &renderTarget, const RenderViewport &viewport, EffectWindow *w, const Region &deviceRegion, const WindowPaintData &data)
{
    const RectF cur = w->frameGeometry();
    const RectF drawn(cur.x() + data.xTranslation(), cur.y() + data.yTranslation(), cur.width() * data.xScale(), cur.height() * data.yScale());
    const QPoint origin = viewport.scaledRenderRect().topLeft();
    const double scale = viewport.scale();
    const double radius = std::round(w->window()->borderRadius().topLeft() * scale);   // as KWin rounds its clip
    const double ix0 = std::round(drawn.x() * scale), iy0 = std::round(drawn.y() * scale);
    const double ix1 = std::round((drawn.x() + drawn.width()) * scale), iy1 = std::round((drawn.y() + drawn.height()) * scale);
    QList<QVector2D> verts;
    for (const RectF &bar : ring(w, drawn, scale, radius)) {
        const Rect device(bar.x() - origin.x(), bar.y() - origin.y(), bar.width(), bar.height());
        for (const Rect &r : (deviceRegion & device).rects()) {
            const float x0 = r.x() + origin.x(), y0 = r.y() + origin.y(), x1 = x0 + r.width(), y1 = y0 + r.height();
            verts << QVector2D(x1, y0) << QVector2D(x0, y0) << QVector2D(x0, y1)
                  << QVector2D(x0, y1) << QVector2D(x1, y1) << QVector2D(x1, y0);
        }
    }
    if (verts.isEmpty()) {
        return;
    }
    const double opacity = std::clamp(data.opacity(), 0.0, 1.0);
    if (opacity <= 0.0) {
        return;
    }
    GLVertexBuffer *vbo = GLVertexBuffer::streamingBuffer();
    vbo->reset();
    const bool active = effects->activeWindow() == w;
    QColor colour = framed(w) ? (active ? m_frameActive : m_frameInactive) : (active ? m_floatingActive : m_floatingInactive);
    if (radius <= 0) {
        // Square: plain bars. The border shader would round the outer corner by the frame
        // width even at radius 0 (base.frag: outer radius = radius + thickness).
        ShaderBinder binder(ShaderTrait::UniformColor | ShaderTrait::TransformColorspace);
        binder.shader()->setUniform(GLShader::Mat4Uniform::ModelViewProjectionMatrix, viewport.projectionMatrix());
        binder.shader()->setColorspaceUniforms(ColorDescription::sRGB, renderTarget.colorDescription(), RenderingIntent::Perceptual);
        colour.setAlphaF(opacity);
        if (opacity < 1.0) {
            glEnable(GL_BLEND);
            glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
        }
        binder.shader()->setUniform(GLShader::ColorUniform::Color, colour);
        vbo->setVertices(verts);
        vbo->render(GL_TRIANGLES);
        if (opacity < 1.0) {
            glDisable(GL_BLEND);
        }
        return;
    }
    // Border, not UniformColor too: both declare the colour uniform (base.frag).
    ShaderBinder binder(ShaderTrait::Border | ShaderTrait::TransformColorspace);
    GLShader *shader = binder.shader();
    shader->setUniform(GLShader::Mat4Uniform::ModelViewProjectionMatrix, viewport.projectionMatrix());
    shader->setColorspaceUniforms(ColorDescription::sRGB, renderTarget.colorDescription(), RenderingIntent::Perceptual);
    shader->setUniform(GLShader::Vec4Uniform::Box, QVector4D((ix0 + ix1) / 2, (iy0 + iy1) / 2, (ix1 - ix0) / 2, (iy1 - iy0) / 2));
    shader->setUniform(GLShader::Vec4Uniform::CornerRadius, QVector4D(radius, radius, radius, radius));
    shader->setUniform(GLShader::IntUniform::Thickness, int(std::round(m_frameWidth * scale)));
    // The shader scales all four channels by coverage: premultiplied, blended always (the
    // antialiased arc is partly transparent even at full opacity).
    shader->setUniform(GLShader::ColorUniform::Color, QVector4D(colour.redF() * opacity, colour.greenF() * opacity, colour.blueF() * opacity, opacity));
    glEnable(GL_BLEND);
    glBlendFunc(GL_ONE, GL_ONE_MINUS_SRC_ALPHA);
    vbo->setVertices(verts);
    vbo->render(GL_TRIANGLES);
    glDisable(GL_BLEND);
}

void Hold::drawWindow(const RenderTarget &renderTarget, const RenderViewport &viewport, EffectWindow *w, int mask, const Region &deviceRegion, WindowPaintData &data)
{
    if (m_snapshotting) {
        // redirect() renders the window through the chain: the live window, not our snapshot.
        Effect::drawWindow(renderTarget, viewport, w, mask, deviceRegion, data);
        return;
    }
    if (m_hidden.contains(w)) {
        return;                         // not placed yet: nothing at all
    }
    // Held: the snapshot only (progress 0). Anything else: live.
    CrossFadeEffect::drawWindow(renderTarget, viewport, w, mask, deviceRegion, data);
}

void Hold::postPaintScreen()
{
    ++m_stats.frames;
    if (holding()) {
        ++m_stats.framesHolding;
        effects->addRepaintFull();
    }
    if (m_open) {
        // A client that answers a configure with its current size changes no geometry, so no
        // signal would ever say it settled (a window at its minimum size in a smaller tile).
        queueCheck();
    }
    effects->postPaintScreen();
}

// ---- observability ----------------------------------------------------------------------------

QVariantMap Hold::Stats() const
{
    QVariantMap m;
    m[QStringLiteral("enabled")] = m_enabled;
    m[QStringLiteral("supported")] = supported();
    m[QStringLiteral("open")] = m_open;
    m[QStringLiteral("held")] = m_held.size();
    m[QStringLiteral("hidden")] = m_hidden.size();
    m[QStringLiteral("pendingClose")] = m_pendingClose.size();
    m[QStringLiteral("timeoutMs")] = m_timeoutMs;
    m[QStringLiteral("transactions")] = m_stats.transactions;
    m[QStringLiteral("timeouts")] = m_stats.timeouts;
    m[QStringLiteral("lastMs")] = m_stats.lastMs;
    m[QStringLiteral("maxMs")] = m_stats.maxMs;
    m[QStringLiteral("closeHoldsKept")] = m_stats.closeHoldsKept;
    m[QStringLiteral("closeHoldsDropped")] = m_stats.closeHoldsDropped;
    m[QStringLiteral("newHidden")] = m_stats.newHidden;
    m[QStringLiteral("lastHiddenMs")] = m_stats.lastHiddenMs;
    m[QStringLiteral("maxHiddenMs")] = m_stats.maxHiddenMs;
    m[QStringLiteral("snapshots")] = m_stats.snapshots;
    m[QStringLiteral("lastSnapshotMs")] = m_stats.lastSnapshotMs;
    m[QStringLiteral("maxSnapshotMs")] = m_stats.maxSnapshotMs;
    m[QStringLiteral("frames")] = m_stats.frames;
    m[QStringLiteral("framesHolding")] = m_stats.framesHolding;
    m[QStringLiteral("frameWidth")] = m_frameWidth;
    m[QStringLiteral("frameOnFloating")] = m_frameOnFloating;
    m[QStringLiteral("floating")] = QStringList(m_floating.cbegin(), m_floating.cend());
    return m;
}

#include "moc_hold.cpp"
