// PROBE (never merged): kwin-i3's key wins a key Plasma also holds. A filter ahead of KWin's
// global shortcuts takes Meta+Left and runs kwin-i3's Focus Left through kglobalaccel.
#pragma once

#include <input.h>

class KeyOverride : public KWin::InputEventFilter
{
public:
    KeyOverride();
    bool keyboardKey(KWin::KeyboardKeyEvent *event) override;

    quint32 m_marked = 0;        // KI3_PROBE_RELEASE=mutate: the press filter B takes after the shortcuts

private:
    quint32 m_swallowed = 0;     // the press taken: its release is taken too
};

// After GlobalShortcut: takes the press filter A let through with its key changed.
class KeyOverrideAfter : public KWin::InputEventFilter
{
public:
    explicit KeyOverrideAfter(KeyOverride *a);
    bool keyboardKey(KWin::KeyboardKeyEvent *event) override;

private:
    KeyOverride *m_a;
};
