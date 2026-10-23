// kwini3frame: i3's 1 px frame as a KDecoration3 plugin (docs/spec-decoration.md). The frame
// starts nothing from the pointer: no resize cursor, no edge drag, no title-bar move, no menu.
// Focus on the frame is kwini3mouse's job (mousechords.cpp), as the decoration API can't ask for it.
#pragma once

#include <KDecoration3/Decoration>

#include <QVariant>

namespace KWinI3
{

class Frame : public KDecoration3::Decoration
{
    Q_OBJECT
public:
    explicit Frame(QObject *parent = nullptr, const QVariantList &args = QVariantList());

    bool init() override;
    void paint(QPainter *painter, const QRectF &repaintArea) override;

protected:
    // All six without the base: the base's hover-enter, hover-move and release compute the
    // section under the mouse (the resize/title-bar areas), and that section is what KWin turns
    // into a cursor and a gravity. Ours stays NoSection forever. Press and release are accepted,
    // so KWin never sees an unaccepted press on the decoration (that is what starts its delayed
    // move/resize, the double-click timer and the title-bar mouse commands).
    void hoverEnterEvent(QHoverEvent *event) override;
    void hoverLeaveEvent(QHoverEvent *event) override;
    void hoverMoveEvent(QHoverEvent *event) override;
    void mouseMoveEvent(QMouseEvent *event) override;
    void mousePressEvent(QMouseEvent *event) override;
    void mouseReleaseEvent(QMouseEvent *event) override;

private:
    void updateBorders();
};

} // namespace KWinI3
