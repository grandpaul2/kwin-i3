#include "hold.h"

#include <core/output.h>
#include <effect/effecthandler.h>
#include <scene/windowitem.h>
#include <core/rendertarget.h>
#include <core/renderviewport.h>
#include <opengl/glshader.h>
#include <opengl/glshadermanager.h>
#include <opengl/glvertexbuffer.h>
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
    connect(effects, &EffectsHandler::windowActivated, this, [] { effects->addRepaintFull(); });
    connect(effects, &EffectsHandler::windowClosed, this, &Hold::onClosed);
    connect(effects, &EffectsHandler::windowDeleted, this, &Hold::onDeleted);

    QDBusConnection::sessionBus().registerObject(QStringLiteral("/kwini3hold"),
                                                 QStringLiteral("net.local.kwini3hold"),
                                                 this, QDBusConnection::ExportAllSlots);
}

Hold::~Hold()
{
    QDBusConnection::sessionBus().unregisterObject(QStringLiteral("/kwini3hold"));
    releaseAll();
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
    m_frameWidth = std::clamp(group.readEntry("frameWidth", 1), 1, 10);
    m_frameActive = QColor(group.readEntry("frameActive", QStringLiteral("#4c7899")));
    m_frameInactive = QColor(group.readEntry("frameInactive", QStringLiteral("#333333")));
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
    // PROTOTYPE: the frame is outside the window, so nothing repaints it for us. Coarse: all.
    connect(w, &EffectWindow::windowFrameGeometryChanged, this, [] { effects->addRepaintFull(); });
    connect(w, &EffectWindow::windowDecorationChanged, this, [] { effects->addRepaintFull(); });
    connect(w, &EffectWindow::windowFullScreenChanged, this, [] { effects->addRepaintFull(); });
    if (Window *win = w->window()) {
        connect(win, &Window::tileChanged, this, [] { effects->addRepaintFull(); });
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

bool Hold::isActive() const
{
    return true;    // PROTOTYPE: the frame needs the paint hooks always
    return m_open || !m_hidden.isEmpty();
}

void Hold::prePaintScreen(ScreenPrePaintData &data)
{
    if (isActive()) {
        data.mask |= PAINT_SCREEN_WITH_TRANSFORMED_WINDOWS;
    }
    effects->prePaintScreen(data);
}

void Hold::prePaintWindow(RenderView *view, EffectWindow *w, WindowPrePaintData &data)
{
    if (m_held.contains(w) || m_hidden.contains(w) || framed(w)) {
        data.setTransformed();      // no clipping to its current frame, no culling beneath it
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
    if (framed(w) && !m_hidden.contains(w)) {
        paintFrame(renderTarget, viewport, w, data);
    }
}

bool Hold::framed(EffectWindow *w) const
{
    Window *win = w->window();
    return win && (win->requestedTile() || win->tile()) && !w->hasDecoration() && !w->isFullScreen() && !w->isDeleted();
}

// The frame around wherever the window is drawn: its frame, moved and scaled as the paint data
// says (a held snapshot is drawn at its old frame this way, a sliding desktop moves it).
void Hold::paintFrame(const RenderTarget &renderTarget, const RenderViewport &viewport, EffectWindow *w, const WindowPaintData &data)
{
    const RectF cur = w->frameGeometry();
    const double s = viewport.scale(), f = m_frameWidth;
    const double x0 = std::round((cur.x() + data.xTranslation()) * s), y0 = std::round((cur.y() + data.yTranslation()) * s);
    const double x1 = std::round((cur.x() + data.xTranslation() + cur.width() * data.xScale()) * s);
    const double y1 = std::round((cur.y() + data.yTranslation() + cur.height() * data.yScale()) * s);
    const double fd = std::round(f * s);
    // four bars outside [x0,x1) x [y0,y1): top and bottom span the corners
    const RectF bars[] = {
        RectF(x0 - fd, y0 - fd, x1 - x0 + 2 * fd, fd), RectF(x0 - fd, y1, x1 - x0 + 2 * fd, fd),
        RectF(x0 - fd, y0, fd, y1 - y0), RectF(x1, y0, fd, y1 - y0)};
    QList<QVector2D> verts;
    for (const RectF &r : bars) {
        verts << QVector2D(r.x() + r.width(), r.y()) << QVector2D(r.x(), r.y()) << QVector2D(r.x(), r.y() + r.height())
              << QVector2D(r.x(), r.y() + r.height()) << QVector2D(r.x() + r.width(), r.y() + r.height()) << QVector2D(r.x() + r.width(), r.y());
    }
    GLVertexBuffer *vbo = GLVertexBuffer::streamingBuffer();
    vbo->reset();
    ShaderBinder binder(ShaderTrait::UniformColor | ShaderTrait::TransformColorspace);
    binder.shader()->setUniform(GLShader::Mat4Uniform::ModelViewProjectionMatrix, viewport.projectionMatrix());
    binder.shader()->setColorspaceUniforms(ColorDescription::sRGB, renderTarget.colorDescription(), RenderingIntent::Perceptual);
    binder.shader()->setUniform(GLShader::ColorUniform::Color, effects->activeWindow() == w ? m_frameActive : m_frameInactive);
    vbo->setVertices(verts);
    vbo->render(GL_TRIANGLES);
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
    if (isActive()) {
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
    return m;
}

#include "moc_hold.cpp"
