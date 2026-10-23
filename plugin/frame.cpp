#include "frame.h"

#include <KDecoration3/DecoratedWindow>
#include <KDecoration3/ScaleHelpers>

#include <KPluginFactory>

#include <QColor>
#include <QHoverEvent>
#include <QMouseEvent>
#include <QPainter>

K_PLUGIN_FACTORY_WITH_JSON(KWinI3FrameFactory, "frame.json", registerPlugin<KWinI3::Frame>();)

namespace KWinI3
{

// i3's default_border pixel 1, with the colours of the retired Aurorae theme i3frame.
static const QColor s_active(0x4c, 0x78, 0x99);
static const QColor s_inactive(0x33, 0x33, 0x33);

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
    connect(window(), &KDecoration3::DecoratedWindow::activeChanged, this, qOverload<>(&KDecoration3::Decoration::update));
    return true;
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
    painter->fillRect(repaintArea, window()->isActive() ? s_active : s_inactive);
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
