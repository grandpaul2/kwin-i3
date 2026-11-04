#include "popupgrace.h"

#include <options.h>
#include <window.h>
#include <workspace.h>

#include <KConfigGroup>
#include <KSharedConfig>

// The grace a panel popup gets: long enough to forgive a pointer that strays
// across the gap or onto a window and comes back.
static const int s_graceMs = 1500;

PopupGrace::PopupGrace()
{
    connect(KWin::workspace(), &KWin::Workspace::windowActivated, this, &PopupGrace::activated);
    activated(KWin::workspace()->activeWindow());
}

PopupGrace::~PopupGrace()
{
    restore();
}

void PopupGrace::activated(KWin::Window *window)
{
    if (window && window->isAppletPopup()) {
        KWin::options->setDelayFocusInterval(s_graceMs);
        m_raised = true;
    } else {
        restore();
    }
}

// The delay as kwin-i3 has it: none with its focus follows mouse on (the script writes 0 live,
// src/kwin.js winOptions), else Plasma's own from kwinrc, read each time as KWin's Options reads it.
void PopupGrace::restore()
{
    if (!m_raised || !KWin::options) {
        return;
    }
    m_raised = false;
    KSharedConfigPtr config = KSharedConfig::openConfig(QStringLiteral("kwinrc"), KConfig::NoGlobals);
    config->reparseConfiguration();
    const bool ffm = config->group(QStringLiteral("Script-kwin-i3")).readEntry("focusFollowsMouse", true);
    KWin::options->setDelayFocusInterval(ffm ? 0 : config->group(QStringLiteral("Windows")).readEntry("DelayFocusInterval", 300));     // kwin.kcfg's default
}
