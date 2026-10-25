// kwini3helper: kwin-i3's KWin plugin, three jobs a script can't do (README, "Optional: the
// plugins"). Focus on the frame (framefocus.h), settings that apply on Apply (settingswatch.h),
// and the keys that mean a key position fitted to the keyboard layout (layoutkeys.h). One plugin
// for all three: each Plasma update needs a rebuild of every version-locked plugin, so there are
// no more of them than KWin's plugin kinds require.
// (Named kwini3mouse until 2026-10-24, when it also did mouse chords.)
#pragma once

#include "framefocus.h"
#include "layoutkeys.h"
#include "settingswatch.h"

#include <plugin.h>

class Helper : public KWin::Plugin
{
    Q_OBJECT
public:
    Helper();
    ~Helper() override;

private:
    FrameFocus m_frameFocus;
    SettingsWatch m_settingsWatch;
    LayoutKeys m_layoutKeys;
};
