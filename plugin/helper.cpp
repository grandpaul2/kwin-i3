#include "helper.h"

#include <input.h>

Helper::Helper()
    : m_frameFocus(&m_tilingDrag)
{
    KWin::input()->installInputEventFilter(&m_frameFocus);
    KWin::input()->installInputEventFilter(&m_tilingDrag);
    KWin::input()->installInputEventFilter(m_tilingDrag.grab());
}

Helper::~Helper()
{
    if (KWin::input()) {
        KWin::input()->uninstallInputEventFilter(&m_frameFocus);
        KWin::input()->uninstallInputEventFilter(&m_tilingDrag);
        KWin::input()->uninstallInputEventFilter(m_tilingDrag.grab());
    }
}
