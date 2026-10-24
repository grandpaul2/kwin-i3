#include "frame.h"

#include <KDecoration3/DecoratedWindow>
#include <KDecoration3/DecorationSettings>
#include <KDecoration3/ScaleHelpers>

#include <KConfigGroup>
#include <KPluginFactory>
#include <KSharedConfig>

#include <QHoverEvent>
#include <QMouseEvent>
#include <QPainter>

#include <algorithm>

K_PLUGIN_FACTORY_WITH_JSON(KWinI3FrameFactory, "frame.json", registerPlugin<KWinI3::Frame>();)

namespace KWinI3
{

// i3's default_border pixel 1, with the colours of the retired Aurorae theme i3frame; the
// floating green is kwin-i3's own (i3 has no floating colour). Defaults for the kwinrc keys.
static const char s_group[] = "Script-kwin-i3";
static const char s_oldGroup[] = "kwin-i3-frame";       // before 2026-10-24, still read
static const QColor s_active(0x4c, 0x78, 0x99);
static const QColor s_inactive(0x33, 0x33, 0x33);
static const QColor s_floatingActive(0x4d, 0x72, 0x54);
static const QColor s_floatingInactive(0x33, 0x33, 0x33);

// A key's colour, or its default when the key is missing or not a colour QColor can read.
// Opaque whatever the key says (#aarrggbb, "transparent"): the decoration is declared opaque
// (setOpaque below), so a translucent frame would be composed over nothing (review 2026-10-24).
static QColor colourOf(const KConfigGroup &group, const char *key, const KConfigGroup &old, const char *oldKey, const QColor &def)
{
    QColor c(group.hasKey(key) ? group.readEntry(key, def.name()) : old.readEntry(oldKey, def.name()));
    if (!c.isValid()) {
        return def;
    }
    c.setAlpha(255);
    return c;
}

std::shared_ptr<FrameConfig> FrameConfig::get()
{
    static std::weak_ptr<FrameConfig> s_config;
    std::shared_ptr<FrameConfig> config = s_config.lock();
    if (!config) {
        config.reset(new FrameConfig());
        s_config = config;
    }
    return config;
}

FrameConfig::FrameConfig()
    : m_watcher(KConfigWatcher::create(KSharedConfig::openConfig(QStringLiteral("kwinrc"))))
{
    connect(m_watcher.get(), &KConfigWatcher::configChanged, this, [this](const KConfigGroup &group) {
        if (group.name() == QLatin1String(s_group) || group.name() == QLatin1String(s_oldGroup)) {
            reload();
        }
    });
    reload();
}

void FrameConfig::reload()
{
    auto config = m_watcher->config();
    config->reparseConfiguration();
    const KConfigGroup group = config->group(QLatin1String(s_group)), old = config->group(QLatin1String(s_oldGroup));
    const QColor a = colourOf(group, "frameActive", old, "Active", s_active);
    const QColor i = colourOf(group, "frameInactive", old, "Inactive", s_inactive);
    const QColor fa = colourOf(group, "frameFloatingActive", old, "FloatingActive", s_floatingActive);
    const QColor fi = colourOf(group, "frameFloatingInactive", old, "FloatingInactive", s_floatingInactive);
    const int w = std::clamp(group.readEntry("frameWidth", 1), 1, 10);
    if (a == active && i == inactive && fa == floatingActive && fi == floatingInactive && w == width) {
        return;
    }
    active = a, inactive = i, floatingActive = fa, floatingInactive = fi, width = w;
    Q_EMIT changed();
}

Frame::Frame(QObject *parent, const QVariantList &args)
    : KDecoration3::Decoration(parent, args)
{
}

bool Frame::init()
{
    m_config = FrameConfig::get();
    updateBorders();
    connect(window(), &KDecoration3::DecoratedWindow::nextScaleChanged, this, &Frame::updateBorders);
    // No title bar: the top line is a border like the others. Resize-only borders stay at their
    // default (zero), so the input region is exactly the 1 px line. No shadow, no rounding.
    setTitleBar(QRectF());
    setOpaque(true);
    // Width and colours from the shared settings: a change resizes and repaints every frame. KWin's
    // decoration settings are one object for all decorations; the unique connection reloads once.
    connect(m_config.get(), &FrameConfig::changed, this, [this] {
        updateBorders();
        update();
    });
    connect(settings().get(), &KDecoration3::DecorationSettings::reconfigured, m_config.get(), &FrameConfig::reload, Qt::UniqueConnection);
    connect(window(), &KDecoration3::DecoratedWindow::activeChanged, this, qOverload<>(&KDecoration3::Decoration::update));
    connect(window(), &KDecoration3::DecoratedWindow::keepAboveChanged, this, qOverload<>(&KDecoration3::Decoration::update));
    return true;
}

// frameWidth (default 1) whole device pixels at any output scale (Breeze's borderSize does the same).
void Frame::updateBorders()
{
    const qreal b = KDecoration3::snapToPixelGrid(m_config->width, window()->nextScale());
    setBorders(QMarginsF(b, b, b, b));
}

// KWin renders a decoration as four border parts, each clipped to its strip, so a plain fill is
// exactly the border, at any scale and at the corners. repaintArea rather than rect(): at a
// fractional window size rect() can leave one translucent pixel (review 2, 2026-10-23).
void Frame::paint(QPainter *painter, const QRectF &repaintArea)
{
    const bool floating = window()->isKeepAbove();
    const FrameConfig &f = *m_config;
    const QColor &c = window()->isActive() ? (floating ? f.floatingActive : f.active)
                                           : (floating ? f.floatingInactive : f.inactive);
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
