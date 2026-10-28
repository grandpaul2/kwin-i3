#include "gapstrips.h"

#include <core/output.h>
#include <window.h>
#include <workspace.h>

#include <QBackingStore>
#include <QPainter>

using namespace KWin;

static const QString s_title = QStringLiteral("kwin-i3 gap");

// Paints itself fully transparent: the gap shows what is beneath; the strip only takes the pointer.
// Not Qt::Tool: it holds Qt::Popup's bit, and KWin closes a popup as the pointer leaves it
// (probed 2026-10-28). Bypassing the window manager, it is placed exactly and never focused.
class GapStrip : public QWindow
{
public:
    GapStrip()
        : m_store(this)
    {
        QSurfaceFormat format;
        format.setAlphaBufferSize(8);
        setFormat(format);
        setFlags(Qt::FramelessWindowHint | Qt::BypassWindowManagerHint | Qt::WindowDoesNotAcceptFocus);
        setTitle(s_title);
        setCursor(Qt::ArrowCursor);           // i3's on its frames and the root (x.c:171)
        setMinimumSize(QSize(1, 1));
        setProperty("KWIN_SKIP_CLOSE_ANIMATION", true);
    }

protected:
    void exposeEvent(QExposeEvent *) override
    {
        if (!isExposed()) {
            return;
        }
        const QRect rect(QPoint(), size());
        m_store.resize(size());
        m_store.beginPaint(rect);
        QPainter p(m_store.paintDevice());
        p.setCompositionMode(QPainter::CompositionMode_Source);
        p.fillRect(rect, Qt::transparent);
        p.end();
        m_store.endPaint();
        m_store.flush(rect);
    }

private:
    QBackingStore m_store;
};

GapStrips::GapStrips(std::function<int()> reach, std::function<int()> frameWidth)
    : m_reach(std::move(reach))
    , m_frameWidth(std::move(frameWidth))
{
    m_timer.setSingleShot(true);
    m_timer.setInterval(0);
    connect(&m_timer, &QTimer::timeout, this, &GapStrips::update);
    for (Window *w : workspace()->windows()) {
        watch(w);
    }
    connect(workspace(), &Workspace::windowAdded, this, [this](Window *w) {
        watch(w);
        dirty();
    });
    connect(workspace(), &Workspace::windowRemoved, this, &GapStrips::dirty);
    connect(workspace(), &Workspace::stackingOrderChanged, this, &GapStrips::dirty);
    connect(workspace(), &Workspace::currentDesktopChanged, this, &GapStrips::dirty);
    connect(workspace(), &Workspace::showingDesktopChanged, this, &GapStrips::dirty);
    connect(workspace(), &Workspace::outputsChanged, this, &GapStrips::dirty);
    dirty();
}

GapStrips::~GapStrips() = default;

bool GapStrips::isStrip(const Window *w)
{
    return w && w->isInternal() && w->caption() == s_title;
}

void GapStrips::dirty()
{
    m_timer.start();
}

// Every change that can move a gap or cover one. Owned by this object, so they end with the
// plugin (framefocus.h, m_context).
void GapStrips::watch(Window *w)
{
    if (isStrip(w)) {
        return;
    }
    connect(w, &Window::frameGeometryChanged, this, &GapStrips::dirty);
    connect(w, &Window::minimizedChanged, this, &GapStrips::dirty);
    connect(w, &Window::fullScreenChanged, this, &GapStrips::dirty);
    connect(w, &Window::quickTileModeChanged, this, &GapStrips::dirty);
    connect(w, &Window::desktopsChanged, this, &GapStrips::dirty);
    connect(w, &Window::hiddenChanged, this, &GapStrips::dirty);
    connect(w, &Window::outputChanged, this, &GapStrips::dirty);
    connect(w, &Window::closed, this, &GapStrips::dirty);
}

static bool shown(const Window *w)
{
    return !w->isDeleted() && w->isShown() && !w->isHidden() && w->isOnCurrentDesktop() && w->isOnCurrentActivity();
}

// Tiled in one of kwin-i3's tiles and on screen (TilingDrag::gapWindow's test).
static bool tiled(const Window *w)
{
    return w->isClient() && shown(w) && !w->isFullScreen() && w->quickTileMode() == QuickTileMode(QuickTileFlag::Custom);
}

QRegion GapStrips::strips() const
{
    // The reach a gap press has (TilingDrag::gapWindow), and at least the ring.
    const int reach = std::max(m_reach(), m_frameWidth());
    const auto windows = workspace()->stackingOrder();
    QRegion all;
    for (LogicalOutput *output : workspace()->outputs()) {
        const QRect area = output->geometry();
        bool fullscreen = false;
        QRegion grown;
        QRegion frames;
        for (const Window *w : windows) {
            if (!shown(w) || isStrip(w) || w->output() != output) {
                continue;
            }
            fullscreen |= w->isFullScreen();
            if (tiled(w)) {
                const RectF f = w->frameGeometry();
                grown += QRect(f.adjusted(-reach, -reach, reach, reach).toAlignedRect());
                frames += QRect(f.toAlignedRect());
            }
        }
        if (!fullscreen) {
            all += (grown - frames) & area;   // area: KWin's Rect, a QRect
        }
    }
    // Everything else on screen is above the tiles (floating windows keep above, panels, popups,
    // notifications) and the strips are above everything: never over any of them. The desktop
    // is beneath; a tiled window's own band is what the strips are for.
    for (const Window *w : windows) {
        if (shown(w) && !isStrip(w) && !w->isDesktop() && !tiled(w)) {
            all -= QRect(w->frameGeometry().toAlignedRect());
            all -= QRect(w->bufferGeometry().toAlignedRect());
        }
    }
    return all;
}

void GapStrips::update()
{
    const QRegion region = strips();
    if (region == m_region) {
        return;
    }
    m_region = region;
    // Strips are only ever moved, never destroyed, and a spare one is parked off every output:
    // a strip added or removed is a stacking change, at which KWin enters whatever window is now
    // under a pointer that hasn't moved, and focus follows mouse focuses it (input.cpp
    // InputDeviceHandler::init, window.cpp pointerEnterEvent: KWin's last mouse position is stale
    // after a drag kwin-i3 took). i3 focuses on motion only. A move is no stacking change.
    QList<QRect> rects(region.begin(), region.end());
    static const QRect parked(-100000, -100000, 1, 1);
    for (size_t i = 0; i < std::max(m_windows.size(), size_t(rects.size())); ++i) {
        if (i == m_windows.size()) {
            m_windows.push_back(std::make_unique<GapStrip>());
        }
        QWindow *strip = m_windows[i].get();
        const QRect rect = i < size_t(rects.size()) ? rects[int(i)] : parked;
        if (strip->geometry() != rect) {
            strip->setGeometry(rect);
        }
        if (!strip->isVisible()) {
            strip->show();
            // Not a window to the user: never in Overview, the task manager or Alt+Tab (KWin's
            // window model lists every managed normal window, and to it this is one).
            if (Window *w = workspace()->findInternal(strip)) {
                w->setSkipSwitcher(true);
                w->setSkipTaskbar(true);
                w->setSkipPager(true);
            }
        }
    }
}
