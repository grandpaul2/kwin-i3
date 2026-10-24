#include "frame.h"

#include <KDecoration3/DecoratedWindow>
#include <KDecoration3/ScaleHelpers>

#include <KConfigGroup>
#include <KPluginFactory>
#include <KSharedConfig>

#include <QHoverEvent>
#include <QMouseEvent>
#include <QPainter>

K_PLUGIN_FACTORY_WITH_JSON(KWinI3FrameFactory, "frame.json", registerPlugin<KWinI3::Frame>();)

namespace KWinI3
{

// i3's default_border pixel 1, with the colours of the retired Aurorae theme i3frame; the
// floating green is kwin-i3's own (i3 has no floating colour). Defaults for the kwinrc keys.
static const char s_group[] = "kwin-i3-frame";
static const QColor s_active(0x4c, 0x78, 0x99);
static const QColor s_inactive(0x33, 0x33, 0x33);
static const QColor s_floatingActive(0x4c, 0x99, 0x5a);
static const QColor s_floatingInactive(0x33, 0x33, 0x33);

// A key's colour, or its default when the key is missing or not a colour QColor can read.
static QColor colourOf(const KConfigGroup &group, const char *key, const QColor &def)
{
    const QColor c(group.readEntry(key, def.name()));
    return c.isValid() ? c : def;
}

Frame::Frame(QObject *parent, const QVariantList &args)
    : KDecoration3::Decoration(parent, args)
{
}

bool Frame::init()
{
    updateBorders();
    connect(window(), &KDecoration3::DecoratedWindow::nextScaleChanged, this, &Frame::updateBorders);
    // No title bar: the top line is a border like the others. Resize-only borders stay at their
    // default (zero), so the input region is exactly the 1 px line. No shadow, no rounding.
    setTitleBar(QRectF());
    setOpaque(true);
    // Colours from kwinrc, watched as kwini3hold watches its group (hold.cpp): a change written
    // with kwriteconfig6 --notify repaints every frame.
    m_watcher = KConfigWatcher::create(KSharedConfig::openConfig(QStringLiteral("kwinrc")));
    connect(m_watcher.get(), &KConfigWatcher::configChanged, this, [this](const KConfigGroup &group) {
        if (group.name() == QLatin1String(s_group)) {
            loadConfig();
            update();
        }
    });
    loadConfig();
    connect(window(), &KDecoration3::DecoratedWindow::activeChanged, this, qOverload<>(&KDecoration3::Decoration::update));
    connect(window(), &KDecoration3::DecoratedWindow::keepAboveChanged, this, qOverload<>(&KDecoration3::Decoration::update));
    return true;
}

void Frame::loadConfig()
{
    auto config = m_watcher->config();
    config->reparseConfiguration();
    const KConfigGroup group = config->group(QLatin1String(s_group));
    m_active = colourOf(group, "Active", s_active);
    m_inactive = colourOf(group, "Inactive", s_inactive);
    m_floatingActive = colourOf(group, "FloatingActive", s_floatingActive);
    m_floatingInactive = colourOf(group, "FloatingInactive", s_floatingInactive);
}

// One device pixel at any output scale (Breeze's borderSize does the same).
void Frame::updateBorders()
{
    const qreal b = KDecoration3::snapToPixelGrid(1, window()->nextScale());
    setBorders(QMarginsF(b, b, b, b));
}

// KWin renders a decoration as four border parts, each clipped to its strip, so a plain fill is
// exactly the border, at any scale and at the corners. repaintArea rather than rect(): at a
// fractional window size rect() can leave one translucent pixel (review 2, 2026-10-23).
void Frame::paint(QPainter *painter, const QRectF &repaintArea)
{
    const bool floating = window()->isKeepAbove();
    const QColor &c = window()->isActive() ? (floating ? m_floatingActive : m_active)
                                           : (floating ? m_floatingInactive : m_inactive);
    painter->fillRect(repaintArea, c);
}

void Frame::hoverEnterEvent(QHoverEvent *)
{
}

void Frame::hoverLeaveEvent(QHoverEvent *)
{
}

void Frame::hoverMoveEvent(QHoverEvent *)
{
}

void Frame::mouseMoveEvent(QMouseEvent *)
{
}

void Frame::mousePressEvent(QMouseEvent *event)
{
    event->setAccepted(true);
}

void Frame::mouseReleaseEvent(QMouseEvent *event)
{
    event->setAccepted(true);
}

} // namespace KWinI3

#include "frame.moc"
