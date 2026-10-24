// Focus on a window's frame as i3 does (docs/spec-decoration.md, "focus on the frame"): KWin
// gives the pointer no focus window over a decoration, so neither hover nor click there focuses;
// this filter, which runs before KWin's decoration filter, makes the frame part of the window for
// focus, with KWin's own calls. (Until 2026-10-24 it also did modifier + mouse button chords,
// docs/mouse-plugin-design.md; dropped, KWin's own Meta+drag moves.) Installed by the helper
// plugin (helper.cpp).
#pragma once

#include <input.h>

#include <QPointer>

class FrameFocus : public KWin::InputEventFilter
{
public:
    FrameFocus();

    bool pointerMotion(KWin::PointerMotionEvent *event) override;
    bool pointerButton(KWin::PointerButtonEvent *event) override;

private:
    KWin::Window *frameWindow() const;

    QPointer<KWin::Window> m_frameWindow; // the window whose frame the pointer is on, if any
};
