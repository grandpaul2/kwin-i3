#include "popupgrace.h"

#include <options.h>
#include <window.h>
#include <workspace.h>

#include <KConfigGroup>
#include <KSharedConfig>

// The grace a panel popup gets (Paul, 2026-10-25): long enough to forgive a pointer that strays
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

// The user's own delay, from kwinrc each time (as KWin's Options reads it), so a change made in
// System Settings while a popup was open is the one put back.
void PopupGrace::restore()
{
    if (!m_raised || !KWin::options) {
        return;
    }
    m_raised = false;
    KSharedConfigPtr config = KSharedConfig::openConfig(QStringLiteral("kwinrc"), KConfig::NoGlobals);
    config->reparseConfiguration();
    KWin::options->setDelayFocusInterval(config->group(QStringLiteral("Windows")).readEntry("DelayFocusInterval", 0));
}
