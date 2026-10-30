// Panel popups forgive a stray pointer (docs/records/spec-popup-grace.md). With focus follows mouse, a
// pointer crossing the gap between a floating panel and its popup focuses the window beneath at
// once and the popup closes (KDE bug 511162, closed as invalid). KWin's focus delay would forgive
// it, but for every focus change. This raises the delay only while a panel popup has the focus,
// and puts the user's own value back as soon as anything else has it.
#pragma once

#include <QObject>

namespace KWin
{
class Window;
}

class PopupGrace : public QObject
{
    Q_OBJECT
public:
    PopupGrace();
    ~PopupGrace() override;

private:
    void activated(KWin::Window *window);
    void restore();

    bool m_raised = false;
};
