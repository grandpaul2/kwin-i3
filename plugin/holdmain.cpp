// The effect factory KWin loads (as src/plugins/blendchanges/main.cpp in KWin).
#include "hold.h"

#include <effect/effect.h>

KWIN_EFFECT_FACTORY_SUPPORTED(Hold, "hold.json", return Hold::supported();)

#include "holdmain.moc"
