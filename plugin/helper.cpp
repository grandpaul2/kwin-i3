#include "helper.h"

#include <input.h>

Helper::Helper()
{
    KWin::input()->installInputEventFilter(&m_frameFocus);
}

Helper::~Helper()
{
    if (KWin::input()) {
        KWin::input()->uninstallInputEventFilter(&m_frameFocus);
    }
}
