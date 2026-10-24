// kwini3frame: i3's 1 px frame as a KDecoration3 plugin (docs/spec-decoration.md). The frame
// starts nothing from the pointer: no resize cursor, no edge drag, no title-bar move, no menu.
// Focus on the frame is kwini3helper's job (framefocus.cpp), as the decoration API can't ask for it.
#pragma once

#include <KDecoration3/Decoration>

#include <KConfigWatcher>

#include <QColor>
#include <QVariant>

#include <memory>

namespace KWinI3
{

// The frame's settings, one object for every window's decoration (a watcher per window was one
// per window; docs/spec-settings.md, review). kwinrc [Script-kwin-i3], the config form's group:
// frameWidth (px, 1-10) and the four colours; a colour key missing there is read from the old
// [kwin-i3-frame] group. Read again on KWin's reconfigure (DecorationSettings::reconfigured,
// emitted on every one: Meta+Shift+C, or Apply with kwini3helper) and on a --notify write.
class FrameConfig : public QObject
{
    Q_OBJECT
public:
    static std::shared_ptr<FrameConfig> get();
    void reload();

    // Four colours: tiled/floating x active/inactive (docs/spec-frame-colours.md). "Floating" is
    // the keep-above flag kwin-i3 sets on every floating window; the decoration API has no other
    // channel to the script.
    QColor active, inactive, floatingActive, floatingInactive;
    int width = 1;

Q_SIGNALS:
    void changed();

private:
    FrameConfig();
    KConfigWatcher::Ptr m_watcher;
};

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

    std::shared_ptr<FrameConfig> m_config;
};

} // namespace KWinI3
