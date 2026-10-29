#include "helper.h"

#include <input.h>

Helper::Helper()
    : m_frameFocus(&m_tilingDrag)
    , m_pointerProbe(&m_frameFocus)
    , m_gapStrips([this] { return m_tilingDrag.resizeGap(); }, [this] { return m_frameFocus.frameWidth(); })
{
    m_tilingDrag.onResizeGapChanged = [this] { m_gapStrips.dirty(); };
    KWin::input()->installInputEventFilter(&m_pointerProbe);
    KWin::input()->installInputEventFilter(&m_frameFocus);
    KWin::input()->installInputEventFilter(&m_tilingDrag);
    KWin::input()->installInputEventFilter(m_tilingDrag.grab());
    KWin::input()->installInputEventFilter(m_tilingDrag.floatMove());   // ahead of KWin's move filter, its weight
}

Helper::~Helper()
{
    if (KWin::input()) {
        m_tilingDrag.onResizeGapChanged = nullptr;
        KWin::input()->uninstallInputEventFilter(&m_pointerProbe);
        KWin::input()->uninstallInputEventFilter(&m_frameFocus);
        KWin::input()->uninstallInputEventFilter(&m_tilingDrag);
        KWin::input()->uninstallInputEventFilter(m_tilingDrag.grab());
        KWin::input()->uninstallInputEventFilter(m_tilingDrag.floatMove());
    }
}
