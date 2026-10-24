// kwini3helper: kwin-i3's KWin plugin, two jobs a script can't do (README, "Optional: the
// plugins"). Focus on the frame (framefocus.h) and settings that apply on Apply
// (settingswatch.h). One plugin for both: each Plasma update needs a rebuild of every
// version-locked plugin, so there are no more of them than KWin's plugin kinds require.
// (Named kwini3mouse until 2026-10-24, when it also did mouse chords.)
#pragma once

#include "framefocus.h"
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
};
