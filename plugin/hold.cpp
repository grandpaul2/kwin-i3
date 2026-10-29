#include "hold.h"

#include <utility>

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
#include <QFontMetrics>
#include <QGuiApplication>
#include <QImage>
#include <QPainter>
#include <QPen>
#include <QTime>

#include <cmath>

using namespace KWin;

// The blend state as found, put back whole when this goes out of scope: on or off, and the four
// factors (KWin's item renderer sets its own per draw; anything later in the chain may not;
// review 2026-10-28: two paths left the function changed, the others kept only RGB).
namespace
{
struct BlendState {
    BlendState()
        : on(glIsEnabled(GL_BLEND))
    {
        glGetIntegerv(GL_BLEND_SRC_RGB, &srcRgb);
        glGetIntegerv(GL_BLEND_DST_RGB, &dstRgb);
        glGetIntegerv(GL_BLEND_SRC_ALPHA, &srcAlpha);
        glGetIntegerv(GL_BLEND_DST_ALPHA, &dstAlpha);
    }
    ~BlendState()
    {
        glBlendFuncSeparate(srcRgb, dstRgb, srcAlpha, dstAlpha);
        if (on) {
            glEnable(GL_BLEND);
        } else {
            glDisable(GL_BLEND);
        }
    }
    bool on;
    GLint srcRgb = GL_ONE, dstRgb = GL_ZERO, srcAlpha = GL_ONE, dstAlpha = GL_ZERO;
};
}

// The config form's group (docs/spec-settings.md); the old [kwin-i3-hold] keys are still read
// where the new ones are missing.
static const QString s_group = QStringLiteral("Script-kwin-i3");
static const QString s_oldGroup = QStringLiteral("kwin-i3-hold");
static const int s_graceMs = 20;   // a closing window waits this long for a neighbour; a new one for a tile
static const int s_quietMs = 3;
static const int s_landMs = 1000;  // a new window still drawing its tile at the release: hidden this long at most    // kwin-i3's second pass comes microseconds after the first
// Breeze's: 2.5 x smallSpacing (2 on Wayland), breezedecoration.cpp:857. Logical, unsnapped: KWin
// scales and rounds a window's radius per output (itemrenderer_opengl.cpp:190).
static const qreal s_radius = 5.0;
static const int s_eventsKeep = 500;

static QString name(EffectWindow *w)
{
    return w->caption().left(40);
}

static QString rect(const RectF &r)
{
    return QStringLiteral("%1,%2 %3x%4").arg(std::lround(r.x())).arg(std::lround(r.y())).arg(std::lround(r.width())).arg(std::lround(r.height()));
}

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
    m_dragCursor.setSingleShot(true);
    m_dragCursor.setInterval(500);
    connect(&m_dragCursor, &QTimer::timeout, this, [this] { effects->stopMouseInterception(this); });

    const auto windows = effects->stackingOrder();
    for (EffectWindow *w : windows) {
        watchWindow(w);
    }
    connect(effects, &EffectsHandler::windowAdded, this, &Hold::onAdded);
    connect(effects, &EffectsHandler::windowClosed, this, &Hold::onClosed);
    connect(effects, &EffectsHandler::windowDeleted, this, &Hold::onDeleted);

    // What the effect draws about focus follows kwin-i3's tree, never KWin's active window
    // (plan.md, "Focus"; i3's x.c:498-512): SetFocused says which window that is.

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
    effects->stopMouseInterception(this);
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
    m_bannersStale = true;
    auto config = m_watcher->config();
    config->reparseConfiguration();
    const KConfigGroup group = config->group(s_group), old = config->group(s_oldGroup);
    m_enabled = group.hasKey("holdEnabled") ? group.readEntry("holdEnabled", true) : old.readEntry("Enabled", true);
    m_timeoutMs = group.hasKey("holdTimeoutMs") ? group.readEntry("holdTimeoutMs", 200)
                                                : old.readEntry("TimeoutMs", 200);   // tests raise it to capture mid-hold
    // A layout never waits longer than 2 s, nor not at all (a negative timer never fires: the
    // hold would wait on a window for good; review 2026-10-28).
    m_timeoutMs = std::clamp(m_timeoutMs, 1, 2000);
    // The frame's keys (src/settings.js); not affected by holdEnabled.
    m_frameWidth = std::clamp(group.readEntry("frameWidth", 1), 1, 10);
    const auto colour = [&group](const char *key, const QColor &def) {
        const QColor c(group.readEntry(key, def.name()));
        return c.isValid() ? QColor(c.red(), c.green(), c.blue()) : def;    // opaque whatever it says
    };
    m_frameColour[0] = colour("frameActive", QColor(0x4c, 0x78, 0x99));
    m_frameColour[1] = colour("frameInactive", QColor(0x33, 0x33, 0x33));
    // An indicator colour left empty (the default for the unfocused class) is its class's
    // frame colour, read at paint time: invalid here.
    const auto optColour = [&group](const char *key, const QColor &def) {
        const QString text = group.readEntry(key, def.isValid() ? def.name() : QString());
        const QColor c(text);
        return text.isEmpty() ? QColor() : c.isValid() ? QColor(c.red(), c.green(), c.blue()) : def;
    };
    m_indicatorColour[0] = optColour("frameIndicatorActive", QColor(0x3d, 0xae, 0xe9));
    m_indicatorColour[1] = optColour("frameIndicatorInactive", QColor());
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
    // The radius on signals, not in a paint hook: setDecoration has just reset it (before this
    // signal), and the paint hooks don't run once nothing is framed (the last window fullscreen).
    // These, the tile signals below and loadConfig are every way into or out of framed().
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
    updateRadius(w);    // one already tiled when it comes (a rule, a restored session)
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
    if (win && win->isInternal()) {
        return;     // KWin's own windows and kwini3helper's gap strips: nothing kwin-i3 places
    }
    const bool transient = w->isDialog() || w->isModal() || (win && win->transientFor());
    if (w->isNormalWindow() && !transient && shown(w) && !w->isFullScreen() && !w->isDeleted()) {
        hide(w, s_graceMs);
    }
}

void Hold::onClosed(EffectWindow *w)
{
    m_dragging.removeAll(w);
    repaintRing(w, w->frameGeometry());
    if (m_hidden.remove(w)) {      // never shown: nothing to keep on screen
        note(QStringLiteral("close %1: never shown").arg(name(w)));
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
            grabClose(w);
            note(QStringLiteral("close %1: kept, held already").arg(name(w)));
        }
        queueCheck();
        return;
    }
    if (!tiled(w) || !shown(w) || w->isFullScreen()) {
        return;
    }
    w->refWindow();
    grabClose(w);
    if (m_open) {
        Held h;
        h.closed = true;
        m_held.insert(w, h);
        ++m_stats.closeHoldsKept;
        note(QStringLiteral("close %1: kept, hold open").arg(name(w)));
        restartQuiet();
        return;
    }
    // Pending: its neighbours' aboutToChange, if any, promotes it (ensureOpen); else let it go.
    note(QStringLiteral("close %1: kept %2 ms for a neighbour").arg(name(w)).arg(s_graceMs));
    m_pendingClose.insert(w, QElapsedTimer());
    m_pendingClose[w].start();
    QPointer<EffectWindow> qp(w);
    QTimer::singleShot(s_graceMs, this, [this, qp] {
        if (qp && m_pendingClose.remove(qp)) {
            ++m_stats.closeHoldsDropped;
            note(QStringLiteral("close %1: dropped, no neighbour moved").arg(name(qp)));
            qp->unrefWindow();
        }
    });
}

// Kept as it was, not shrunk and faded by a close animation (Scale, Plasma's default) while its
// neighbours grow: an effect that grabs the close has the others leave it alone, and Scale cancels
// one already running (scale/package/contents/code/main.js:133, :165 in 6.7.5). One another
// effect already grabbed stays that effect's.
void Hold::grabClose(EffectWindow *w)
{
    if (!w->data(WindowClosedGrabRole).value<void *>()) {
        w->setData(WindowClosedGrabRole, QVariant::fromValue(static_cast<void *>(this)));
    }
}

void Hold::onDeleted(EffectWindow *w)
{
    m_floating.remove(w->internalId().toString());
    m_rings.remove(w->internalId().toString());
    m_indicatorShown.remove(w->internalId().toString());
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
    if (auto hidden = m_hidden.find(w); hidden != m_hidden.end()) {
        if (m_held.contains(w)) {           // already joined
            restartQuiet();
            queueCheck();
            return;
        }
        if (tiled(w) && shown(w)) {         // its tile places it: join, still hidden, no snapshot
            Held h;
            h.joined = true;
            m_held.insert(w, h);
            note(QStringLiteral("new %1: joined, its tile places it").arg(name(w)));
            ensureOpen();
            restartQuiet();
            queueCheck();
        } else if (hidden->named) {         // kwin-i3 moving it to its output or desktop: not placed yet
            note(QStringLiteral("new %1: moved, still hidden").arg(name(w)));
        } else {                            // placed by other means (floated): show it
            note(QStringLiteral("new %1: shown, not tiled").arg(name(w)));
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
        note(QStringLiteral("snapshot %1 at %2").arg(name(w), rect(h.frame)));
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

// isHidden() leaves Show Desktop out (KWin window.cpp:4521): Plasma's edit mode and Peek hide
// every window that way, and a tile closing then must not be held (audit 2026-10-29).
bool Hold::shown(EffectWindow *w) const
{
    return w->isOnCurrentDesktop() && w->isOnCurrentActivity() && !w->isMinimized() && !w->isHidden()
        && !w->isHiddenByShowDesktop();
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

void Hold::hide(EffectWindow *w, int limitMs)
{
    Hidden h;
    h.effect = std::make_shared<ItemEffect>(w->windowItem());
    h.since.start();
    h.limitMs = limitMs;
    m_hidden.insert(w, h);
    ++m_stats.newHidden;
    note(QStringLiteral("new %1: hidden until placed").arg(name(w)));
    armHidden(w, limitMs);
    effects->addRepaintFull();
}

// Shown when its limit runs out without a tile; a limit raised meanwhile (HoldNew) waits on.
void Hold::armHidden(EffectWindow *w, int ms)
{
    QPointer<EffectWindow> qp(w);
    QTimer::singleShot(ms, this, [this, qp] {
        if (!qp) {
            return;
        }
        auto it = m_hidden.find(qp);
        if (it == m_hidden.end() || m_held.contains(qp)) {
            return;
        }
        const int left = it->limitMs - int(it->since.elapsed());
        if (left > 0) {
            armHidden(qp, left);
            return;
        }
        note(it->landing ? QStringLiteral("new %1: shown, not landed in %2 ms").arg(name(qp)).arg(it->limitMs)
                         : QStringLiteral("new %1: shown, no tile in %2 ms").arg(name(qp)).arg(it->limitMs));
        unhide(qp);
    });
}

void Hold::HoldNew(const QString &id, int ms)
{
    ms = std::min(ms, 1000);    // kwin-i3 asks 200: a larger ask would keep a window unseen (review 2026-10-28)
    EffectWindow *w = nullptr;
    const auto windows = effects->stackingOrder();
    for (EffectWindow *x : windows) {
        if (x->internalId().toString() == id) {
            w = x;
        }
    }
    if (!w || w->isDeleted()) {
        return;
    }
    auto it = m_hidden.find(w);
    if (ms <= 0) {                          // placed: shown now, unless its tile has it (the release shows it)
        if (it != m_hidden.end() && !m_held.contains(w)) {
            note(QStringLiteral("new %1: shown, placed by kwin-i3").arg(name(w)));
            unhide(w);
        }
        return;
    }
    if (!m_enabled || !supported()) {
        return;
    }
    if (it != m_hidden.end()) {
        it->limitMs = std::max(it->limitMs, ms);
        it->named = true;
        note(QStringLiteral("new %1: hidden up to %2 ms, kwin-i3 moves it").arg(name(w)).arg(it->limitMs));
        return;
    }
    if (m_held.contains(w) || !shown(w) || w->isFullScreen()) {
        return;
    }
    hide(w, ms);
    m_hidden[w].named = true;
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
    note(QStringLiteral("open (%1 closing waited)").arg(m_pendingClose.size()));
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
    const auto hidden = m_hidden.keys();
    for (EffectWindow *w : hidden) {
        if (m_hidden[w].landing && settled(w)) {
            note(QStringLiteral("new %1: landed in its tile").arg(name(w)));
            unhide(w);
        }
    }
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
    QStringList late;                  // the ones a timeout gave up on
    if (timedOut) {
        for (auto it = m_held.cbegin(); it != m_held.cend(); ++it) {
            if (!it->closed && !it->settledHidden && !settled(it.key())) {
                late << name(it.key()) + QStringLiteral(" at ") + rect(it.key()->frameGeometry());
            }
        }
    }
    note(QStringLiteral("release after %1 ms, %2 held%3").arg(ms, 0, 'f', 1).arg(m_held.size())
             .arg(timedOut ? QStringLiteral(", TIMED OUT waiting for ") + late.join(QStringLiteral("; ")) : QString()));
    // Taken out whole: unrefWindow can delete a window, and windowDeleted then edits these lists.
    // One container only: a second copy would detach, and its visible refs (reset below) would
    // not be these, which then outlived the window (review 2026-10-28: a use after free).
    QHash<EffectWindow *, Held> held = std::exchange(m_held, {});
    for (auto it = held.cbegin(); it != held.cend(); ++it) {
        if (it->snapshot) {
            unredirect(it.key());
        }
    }
    // A new window shown before its app has drawn its tile would be drawn where KWin first put it
    // (floating, title bar and all: KWin moves it only with the new frame). i3 shows a new window
    // in its tile from the start (x.c:1107, then the map at :1156); one still drawing stays hidden
    // until it lands, its tile empty meanwhile, as i3's frame is before the app draws.
    for (auto it = held.cbegin(); it != held.cend(); ++it) {
        if (!it->joined) {
            continue;
        }
        auto hidden = m_hidden.find(it.key());
        if (hidden == m_hidden.end() || settled(it.key())) {
            unhide(it.key());
            continue;
        }
        hidden->landing = true;
        hidden->limitMs = int(hidden->since.elapsed()) + s_landMs;
        note(QStringLiteral("new %1: still drawing its tile, hidden up to %2 ms more").arg(name(it.key())).arg(s_landMs));
        armHidden(it.key(), s_landMs);
    }
    // Visible refs before the closed windows' refs: unrefWindow can delete the window and its
    // item, and a visible ref dying later would touch it (a window sent away, then closed, in
    // one hold).
    for (auto it = held.begin(); it != held.end(); ++it) {
        it->visible.reset();
    }
    for (auto it = held.cbegin(); it != held.cend(); ++it) {
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
// Per paint and window: cheap checks first (holding, a drop, the mode), then the stacking order
// until the first shown ring; ringed() builds a window's id string only for a framed window. Kept
// as is at the review of 2026-10-28: the allocations happen only when every framed window's ring
// is hidden whole (hideEdgeBorders), a setup too rare for a cache.
bool Hold::isActive() const
{
    if (holding() || !m_drop.isEmpty() || !m_mode.isEmpty()) {
        return true;
    }
    const auto windows = effects->stackingOrder();
    for (EffectWindow *w : windows) {
        if (ringed(w) && shown(w)) {
            return true;
        }
    }
    return false;
}

// Late in the chain, after Slide (50, slide.h:197): the ring and a held snapshot are drawn with
// the paint data the effects before this one gave the window (Slide's offset during a desktop
// switch, Scale's opening, a fade), so they move with it. At the default 0 this effect ran first
// and drew the ring at the window's own place while Slide drew the window elsewhere (the laptop,
// 2026-10-29).
int Hold::requestedEffectChainPosition() const
{
    return 90;
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
    if (m_held.contains(w) || m_hidden.contains(w) || ringed(w)) {
        data.setTransformed();
    }
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
    if (ringed(w) && !m_hidden.contains(w)) {
        paintFrame(renderTarget, viewport, w, deviceRegion, data);
    }
    if (!m_mode.isEmpty() && !m_focusedId.isEmpty() && w->internalId().toString() == m_focusedId && !w->isDeleted() && !m_hidden.contains(w)) {
        paintBanner(renderTarget, viewport, w, data);
    }
}

// i3's bar shows the mode's name; here a banner in the focused window (Paul's call 34), in the
// look of the settings page's inline messages: the frame's active colour, white text, rounded.
// Drawn once as an image at the output's scale and kept as a texture; placed at the top centre
// of wherever the window is drawn, in device pixels, as the ring is. KWin 6.7.5 gives an effect
// no way to draw an offscreen QML scene of its own (OffscreenQuickView has no texture access in
// its public header), so the banner is a plain textured quad.
void Hold::paintBanner(const RenderTarget &renderTarget, const RenderViewport &viewport, EffectWindow *w, const WindowPaintData &data)
{
    const double scale = viewport.scale();
    if (m_bannersStale) {
        m_banners.clear();
        m_bannersStale = false;
    }
    Banner &banner = m_banners[scale];
    if (!banner.texture) {
        // i3's bar shows only the mode's name ("resize", i3bar xcb.c draw_button); here with the
        // way out (Paul, 2026-10-28, OPEN.md item 42).
        const QString text = QStringLiteral("Resize (Esc)");
        QFont font = QGuiApplication::font();
        const QFontMetrics fm(font);
        const int pad = 10, height = fm.height() + 2 * pad, width = fm.horizontalAdvance(text) + 3 * pad;
        QImage img(QSize(std::lround(width * scale), std::lround(height * scale)), QImage::Format_ARGB32_Premultiplied);
        img.setDevicePixelRatio(scale);
        img.fill(Qt::transparent);
        QPainter p(&img);
        p.setRenderHint(QPainter::Antialiasing);
        QColor bg = m_frameColour[0];
        bg.setAlphaF(0.94);
        p.setPen(QPen(m_frameColour[0].lighter(135), 1));
        p.setBrush(bg);
        p.drawRoundedRect(QRectF(0.5, 0.5, width - 1, height - 1), 6, 6);
        p.setPen(Qt::white);
        p.setFont(font);
        p.drawText(QRect(0, 0, width, height), Qt::AlignCenter, text);
        p.end();
        banner.texture = GLTexture::upload(img);
        banner.size = img.size();
    }
    if (!banner.texture) {
        return;
    }
    const RectF cur = w->frameGeometry();
    const RectF drawn(cur.x() + data.xTranslation(), cur.y() + data.yTranslation(), cur.width() * data.xScale(), cur.height() * data.yScale());
    if (drawn.width() * scale < banner.size.width() + 8) {
        return;                                 // too narrow a window for the banner
    }
    const double x = std::round(drawn.x() * scale + (drawn.width() * scale - banner.size.width()) / 2);
    const double y = std::round((drawn.y() + 12) * scale);
    ShaderBinder binder(ShaderTrait::MapTexture | ShaderTrait::TransformColorspace);
    QMatrix4x4 mvp = viewport.projectionMatrix();
    mvp.translate(x, y);
    binder.shader()->setUniform(GLShader::Mat4Uniform::ModelViewProjectionMatrix, mvp);
    binder.shader()->setColorspaceUniforms(ColorDescription::sRGB, renderTarget.colorDescription(), RenderingIntent::Perceptual);
    const BlendState kept;
    glEnable(GL_BLEND);
    glBlendFunc(GL_ONE, GL_ONE_MINUS_SRC_ALPHA);        // premultiplied, as the image is
    banner.texture->bind();
    banner.texture->render(QSizeF(banner.size));
    banner.texture->unbind();
}

void Hold::SetMode(const QString &mode)
{
    if (m_mode == mode) {
        return;
    }
    m_mode = mode;
    note(mode.isEmpty() ? QStringLiteral("mode: off") : QStringLiteral("mode: %1").arg(mode));
    effects->addRepaintFull();
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

bool Hold::ringed(EffectWindow *w) const
{
    if (!((m_tiledRing && framed(w)) || floatingFramed(w))) {
        return false;
    }
    const auto it = m_rings.constFind(w->internalId().toString());
    return it == m_rings.cend() || it->hidden != (Left | Right | Top | Bottom);
}

Hold::Ring Hold::ringOf(EffectWindow *w) const
{
    const auto it = m_rings.constFind(w->internalId().toString());
    if (it != m_rings.cend()) {
        return *it;
    }
    Ring r;      // not told its class (yet): the tree's focus decides, as SetRing would
    r.cls = !m_focusedId.isEmpty() && w->internalId().toString() == m_focusedId ? 0 : 1;
    return r;
}

void Hold::SetFocused(const QString &id)
{
    if (id == m_focusedId) {
        return;
    }
    const QString was = m_focusedId;
    m_focusedId = id;
    if (!was.isEmpty()) {
        repaintRingOf(was);
    }
    if (!id.isEmpty()) {
        repaintRingOf(id);
    }
    // The tree's focus moved on: a split key's indicator goes (ShowIndicator, L4), also for a
    // window on a workspace no longer shown, which SetRing skips.
    for (auto it = m_indicatorShown.begin(); it != m_indicatorShown.end();) {
        if (*it != id) {
            repaintRingOf(*it);
            it = m_indicatorShown.erase(it);
        } else {
            ++it;
        }
    }
    if (!m_mode.isEmpty()) {
        effects->addRepaintFull();     // the banner moves with it
    }
}

void Hold::SetRing(const QString &id, const QString &cls, const QString &indicator, const QString &hidden)
{
    // The split key's indicator goes once the window isn't focused or alone any more (ShowIndicator).
    if (cls != QLatin1String("focused") || indicator.isEmpty()) {
        m_indicatorShown.remove(id);
    }
    if (cls.isEmpty()) {
        m_rings.remove(id);
    } else if (!windowById(id)) {
        return;     // gone already (an async call crossing its deletion): kept, it never left
    } else {
        Ring r;
        r.cls = cls == QLatin1String("focused") ? 0 : 1;
        r.indicator = indicator == QLatin1String("right") ? Right : indicator == QLatin1String("bottom") ? Bottom : 0;
        const QStringList sides = hidden.split(QLatin1Char(' '), Qt::SkipEmptyParts);
        for (const QString &s : sides) {
            r.hidden |= s == QLatin1String("left") ? Left : s == QLatin1String("right") ? Right : s == QLatin1String("top") ? Top : s == QLatin1String("bottom") ? Bottom : 0;
        }
        m_rings.insert(id, r);
    }
    repaintRingOf(id);
}

void Hold::ShowIndicator(const QString &id)
{
    if (!windowById(id)) {
        return;
    }
    m_indicatorShown.insert(id);
    repaintRingOf(id);
}

// The shown window with this id, if it is still there (ids from the script's async calls).
EffectWindow *Hold::windowById(const QString &id) const
{
    const auto windows = effects->stackingOrder();
    for (EffectWindow *w : windows) {
        if (!w->isDeleted() && w->internalId().toString() == id) {
            return w;
        }
    }
    return nullptr;
}

void Hold::repaintRingOf(const QString &id)
{
    const auto windows = effects->stackingOrder();
    for (EffectWindow *w : windows) {
        if (w->internalId().toString() == id) {
            repaintRing(w, w->frameGeometry());
        }
    }
}

void Hold::SetTiledRing(bool on)
{
    if (on == m_tiledRing) {
        return;
    }
    m_tiledRing = on;
    note(QStringLiteral("tiled ring %1").arg(on ? QStringLiteral("on") : QStringLiteral("off")));
    effects->addRepaintFull();
}

void Hold::SetDragCursor(bool on, int shape)
{
    if (!on) {
        m_dragCursor.stop();
        effects->stopMouseInterception(this);
        return;
    }
    // 1: left-right and 2: up-down, the tiling resize's (i3's XCURSOR_CURSOR_RESIZE_*); else the move's.
    const Qt::CursorShape cursor = shape == 1 ? Qt::SizeHorCursor : shape == 2 ? Qt::SizeVerCursor : Qt::SizeAllCursor;
    // A second startMouseInterception while grabbing is ignored (the effect is already grabbing):
    // a new shape mid-grab goes through defineCursor.
    if (!m_dragCursor.isActive()) {
        effects->startMouseInterception(this, cursor);
    } else if (cursor != m_dragShape) {
        effects->defineCursor(cursor);
    }
    m_dragShape = cursor;
    m_dragCursor.start();
}

void Hold::SetDropIndicator(int x, int y, int width, int height)
{
    // Far past any output, the rounding to device pixels would overflow (review 2026-10-28).
    const auto clamp = [](int v) { return std::clamp(v, -100000, 100000); };
    x = clamp(x), y = clamp(y), width = clamp(width), height = clamp(height);
    const RectF drop = width > 0 && height > 0 ? RectF(x, y, width, height) : RectF();
    if (drop == m_drop) {
        return;
    }
    // A pixel of slack for the rounding to device pixels.
    if (!m_drop.isEmpty()) {
        effects->addRepaint(m_drop.adjusted(-1, -1, 1, 1).toAlignedRect());
    }
    if (!drop.isEmpty()) {
        effects->addRepaint(drop.adjusted(-1, -1, 1, 1).toAlignedRect());
    }
    m_drop = drop;
}

// The drop indicator over everything, clipped to the repainted region: blended again over
// pixels this frame didn't repaint, it would darken them frame by frame.
void Hold::paintScreen(const RenderTarget &renderTarget, const RenderViewport &viewport, int mask, const Region &deviceRegion, LogicalOutput *screen)
{
    effects->paintScreen(renderTarget, viewport, mask, deviceRegion, screen);
    if (m_drop.isEmpty()) {
        return;
    }
    const QPoint origin = viewport.scaledRenderRect().topLeft();
    const double scale = viewport.scale();
    const Rect device(std::round(m_drop.x() * scale) - origin.x(), std::round(m_drop.y() * scale) - origin.y(),
                      std::round(m_drop.width() * scale), std::round(m_drop.height() * scale));
    QList<QVector2D> verts;
    for (const Rect &r : (deviceRegion & device).rects()) {
        const float x0 = r.x() + origin.x(), y0 = r.y() + origin.y(), x1 = x0 + r.width(), y1 = y0 + r.height();
        verts << QVector2D(x1, y0) << QVector2D(x0, y0) << QVector2D(x0, y1)
              << QVector2D(x0, y1) << QVector2D(x1, y1) << QVector2D(x1, y0);
    }
    if (verts.isEmpty()) {
        return;
    }
    GLVertexBuffer *vbo = GLVertexBuffer::streamingBuffer();
    vbo->reset();
    ShaderBinder binder(ShaderTrait::UniformColor | ShaderTrait::TransformColorspace);
    binder.shader()->setUniform(GLShader::Mat4Uniform::ModelViewProjectionMatrix, viewport.projectionMatrix());
    binder.shader()->setColorspaceUniforms(ColorDescription::sRGB, renderTarget.colorDescription(), RenderingIntent::Perceptual);
    QColor colour = m_frameColour[0];
    colour.setAlphaF(0.5);
    binder.shader()->setUniform(GLShader::ColorUniform::Color, colour);
    const BlendState kept;
    glEnable(GL_BLEND);
    glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
    vbo->setVertices(verts);
    vbo->render(GL_TRIANGLES);
}

void Hold::SetFloating(const QString &id, bool on)
{
    if (on && windowById(id)) {
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
    if (!workspace()) {     // stackingOrder() needs it (effecthandler.cpp:975)
        m_rounded.clear();
        return;
    }
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
// Top and bottom span the corners, except the right side when it is the indicator: i3 draws
// that side full height (x.c:591). With a radius (device px) each bar reaches that far inside
// the window too: the wedge between a corner and its arc is the frame's, and inside the rect.
// A hidden side is left out, its corners with it (hide_edge_borders: the side at the output's
// edge; the strip stays empty, docs/spec-redo-7-look.md C).
QList<Hold::Bar> Hold::ring(const RectF &frame, double scale, double radius, const Ring &how) const
{
    const double f = m_frameWidth, r = radius;
    const double ix0 = std::round(frame.x() * scale), iy0 = std::round(frame.y() * scale);
    const double ix1 = std::round((frame.x() + frame.width()) * scale), iy1 = std::round((frame.y() + frame.height()) * scale);
    const double ox0 = std::round((frame.x() - f) * scale), oy0 = std::round((frame.y() - f) * scale);
    const double ox1 = std::round((frame.x() + frame.width() + f) * scale), oy1 = std::round((frame.y() + frame.height() + f) * scale);
    const bool rightTall = how.indicator == Right;           // the right bar owns its corners
    const bool left = !(how.hidden & Left), right = !(how.hidden & Right), top = !(how.hidden & Top), bottom = !(how.hidden & Bottom);
    // Where the top and bottom bars start and end: a hidden side takes its corner away, the
    // tall right bar its own.
    const double hx0 = left ? ox0 : ix0 + r, hx1 = right && !rightTall ? ox1 : ix1 - r;
    QList<Bar> bars;
    if (top) {
        bars << Bar{RectF(hx0, oy0, hx1 - hx0, iy0 + r - oy0), how.indicator == Top};
    }
    if (bottom) {
        bars << Bar{RectF(hx0, iy1 - r, hx1 - hx0, oy1 - iy1 + r), how.indicator == Bottom};
    }
    if (left) {
        bars << Bar{RectF(ox0, iy0 + r, ix0 + r - ox0, iy1 - iy0 - 2 * r), how.indicator == Left};
    }
    if (right) {
        const double y0 = rightTall && top ? oy0 : iy0 + r, y1 = rightTall && bottom ? oy1 : iy1 - r;
        bars << Bar{RectF(ix1 - r, y0, ox1 - ix1 + r, y1 - y0), how.indicator == Right};
    }
    return bars;
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
    // The class and the indicator side as kwin-i3 said (SetRing), else by KWin's active window;
    // the sides in two colours at most: the class's, and its indicator colour on the indicator.
    const Ring how = ringOf(w);
    const QColor colour = m_frameColour[how.cls];
    // The indicator only after a split key (ShowIndicator), else the frame's colour.
    const QColor indicator = !m_indicatorShown.contains(w->internalId().toString()) ? colour
        : m_indicatorColour[how.cls].isValid() ? m_indicatorColour[how.cls] : colour;
    QList<QVector2D> verts[2];                             // the frame's, the indicator's
    for (const Bar &bar : ring(drawn, scale, radius, how)) {
        const Rect device(bar.rect.x() - origin.x(), bar.rect.y() - origin.y(), bar.rect.width(), bar.rect.height());
        for (const Rect &r : (deviceRegion & device).rects()) {
            const float x0 = r.x() + origin.x(), y0 = r.y() + origin.y(), x1 = x0 + r.width(), y1 = y0 + r.height();
            verts[bar.indicator ? 1 : 0] << QVector2D(x1, y0) << QVector2D(x0, y0) << QVector2D(x0, y1)
                                         << QVector2D(x0, y1) << QVector2D(x1, y1) << QVector2D(x1, y0);
        }
    }
    if (verts[0].isEmpty() && verts[1].isEmpty()) {
        return;
    }
    const double opacity = std::clamp(data.opacity(), 0.0, 1.0);
    if (opacity <= 0.0) {
        return;
    }
    GLVertexBuffer *vbo = GLVertexBuffer::streamingBuffer();
    if (radius <= 0) {
        // Square: plain bars. The border shader would round the outer corner by the frame
        // width even at radius 0 (base.frag: outer radius = radius + thickness).
        ShaderBinder binder(ShaderTrait::UniformColor | ShaderTrait::TransformColorspace);
        binder.shader()->setUniform(GLShader::Mat4Uniform::ModelViewProjectionMatrix, viewport.projectionMatrix());
        binder.shader()->setColorspaceUniforms(ColorDescription::sRGB, renderTarget.colorDescription(), RenderingIntent::Perceptual);
        const BlendState kept;
        if (opacity < 1.0) {
            glEnable(GL_BLEND);
            glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
        }
        for (int i = 0; i < 2; ++i) {
            if (verts[i].isEmpty()) {
                continue;
            }
            QColor c = i ? indicator : colour;
            c.setAlphaF(opacity);
            binder.shader()->setUniform(GLShader::ColorUniform::Color, c);
            vbo->reset();
            vbo->setVertices(verts[i]);
            vbo->render(GL_TRIANGLES);
        }
        return;
    }
    // Border, not UniformColor too: both declare the colour uniform (base.frag). The opacity by
    // Modulate, after the colour transform from sRGB, as KWin draws a decoration's outline.
    ShaderBinder binder(ShaderTrait::Border | ShaderTrait::TransformColorspace | ShaderTrait::Modulate);
    GLShader *shader = binder.shader();
    shader->setUniform(GLShader::Mat4Uniform::ModelViewProjectionMatrix, viewport.projectionMatrix());
    shader->setColorspaceUniforms(ColorDescription::sRGB, renderTarget.colorDescription(), RenderingIntent::Perceptual);
    shader->setUniform(GLShader::Vec4Uniform::Box, QVector4D((ix0 + ix1) / 2, (iy0 + iy1) / 2, (ix1 - ix0) / 2, (iy1 - iy0) / 2));
    shader->setUniform(GLShader::Vec4Uniform::CornerRadius, QVector4D(radius, radius, radius, radius));
    shader->setUniform(GLShader::IntUniform::Thickness, int(std::round(m_frameWidth * scale)));
    shader->setUniform(GLShader::Vec4Uniform::ModulationConstant, QVector4D(opacity, opacity, opacity, opacity));
    // The shader scales all four channels by coverage: premultiplied, blended always (the
    // antialiased arc is partly transparent even at full opacity); the blend state put back.
    const BlendState kept;
    glEnable(GL_BLEND);
    glBlendFunc(GL_ONE, GL_ONE_MINUS_SRC_ALPHA);
    for (int i = 0; i < 2; ++i) {
        if (verts[i].isEmpty()) {
            continue;
        }
        shader->setUniform(GLShader::ColorUniform::Color, i ? indicator : colour);
        vbo->reset();
        vbo->setVertices(verts[i]);
        vbo->render(GL_TRIANGLES);
    }
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

// Cheap enough to be always on: a few per layout change. "f" is the frame count (postPaintScreen),
// so two events between the same frames were drawn together.
void Hold::note(const QString &what)
{
    m_events.append(QTime::currentTime().toString(QStringLiteral("HH:mm:ss.zzz")) + QStringLiteral(" f")
                    + QString::number(m_stats.frames) + QLatin1Char(' ') + what);
    if (m_events.size() > s_eventsKeep) {
        m_events.removeFirst();
    }
}

QStringList Hold::Events() const
{
    return m_events;
}

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
    m[QStringLiteral("tiledRing")] = m_tiledRing;
    m[QStringLiteral("drop")] = m_drop.isEmpty() ? QString() : QStringLiteral("%1,%2 %3x%4").arg(m_drop.x()).arg(m_drop.y()).arg(m_drop.width()).arg(m_drop.height());
    m[QStringLiteral("floating")] = QStringList(m_floating.cbegin(), m_floating.cend());
    m[QStringLiteral("rings")] = QStringList(m_rings.keyBegin(), m_rings.keyEnd());
    m[QStringLiteral("focused")] = m_focusedId;
    return m;
}

#include "moc_hold.cpp"
