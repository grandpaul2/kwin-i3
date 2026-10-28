#include "pointerprobe.h"

#include <cursor.h>
#include <cursorsource.h>
#include <input_event.h>
#include <pointer_input.h>
#include <window.h>
#include <workspace.h>

#include <QDBusConnection>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QTime>

using namespace KWin;

static const int s_eventsKeep = 1000;
// Each pixel walks the stacking order a few times on KWin's main thread: 100000 stalled KWin
// for seconds (review 2026-10-28); tools/pointer-map asks in slices of this size.
static const int s_mapMaxPixels = 10000;

static QString at(const QPointF &p);
static QString cursorNow();

PointerProbe::PointerProbe(FrameFocus *frameFocus)
    : InputEventFilter(InputFilterOrder::VirtualTerminal)
    , m_frameFocus(frameFocus)
{
    m_frameFocus->setProbe(this);
    const auto windows = workspace()->windows();
    for (Window *w : windows) {
        watch(w);
    }
    connect(workspace(), &Workspace::windowAdded, this, &PointerProbe::watch);
    connect(Cursors::self()->mouse(), &Cursor::cursorChanged, this, [this] {
        const QString cursor = cursorNow();
        if (cursor != m_lastCursor) {
            m_lastCursor = cursor;
            note(QStringLiteral("cursor %1 at %2, pointer focus %3").arg(cursor, at(input()->pointer()->pos()), name(input()->pointer()->focus())));
        }
    });
    QDBusConnection::sessionBus().registerObject(QStringLiteral("/kwini3helper/pointer"), QStringLiteral("net.local.kwini3helper.Pointer"),
                                                 this, QDBusConnection::ExportAllSlots);
}

PointerProbe::~PointerProbe()
{
    m_frameFocus->setProbe(nullptr);
    QDBusConnection::sessionBus().unregisterObject(QStringLiteral("/kwini3helper/pointer"));
}

static QString kind(const Window *w)
{
    return w->isDesktop()        ? QStringLiteral("desktop")
         : w->isDock()           ? QStringLiteral("dock")
         : w->isAppletPopup()    ? QStringLiteral("appletpopup")
         : w->isNotification()   ? QStringLiteral("notification")
         : w->isOnScreenDisplay() ? QStringLiteral("osd")
         : w->isPopupWindow()    ? QStringLiteral("popup")
         : w->isDialog()         ? QStringLiteral("dialog")
         : w->isNormalWindow()   ? QStringLiteral("normal")
                                 : QStringLiteral("other");
}

// A window, short and unique: its class, its kind, and the start of KWin's id for it.
QString PointerProbe::name(const Window *w)
{
    if (!w) {
        return QStringLiteral("none");
    }
    QString cls = w->resourceClass();
    if (cls.isEmpty()) {
        cls = w->caption().left(24);
    }
    return QStringLiteral("%1[%2 %3]").arg(cls, kind(w), w->internalId().toString(QUuid::WithoutBraces).left(4));
}

static QJsonArray rect(const RectF &r)
{
    return {r.x(), r.y(), r.width(), r.height()};
}

// On screen now: KWin paints it (closing windows' animations aside).
static bool shown(const Window *w)
{
    return !w->isDeleted() && w->isShown() && w->isOnCurrentDesktop() && w->isOnCurrentActivity();
}

// The pointer's cursor now: a shape's name, an image an app drew, or hidden.
static QString cursorNow()
{
    const CursorSource *source = Cursors::self()->mouse()->source();
    if (!source || source->isBlank()) {
        return QStringLiteral("hidden");
    }
    if (const auto shape = qobject_cast<const ShapeCursorSource *>(source)) {
        return QStringLiteral("shape \"%1\"").arg(QString::fromLatin1(shape->shape()));
    }
    if (qobject_cast<const SurfaceCursorSource *>(source)) {
        return QStringLiteral("app image %1x%2").arg(source->size().width()).arg(source->size().height());
    }
    return QStringLiteral("other");
}

static QString gravity(Gravity g)
{
    static const char *const names[] = {"none (a move)", "left", "right", "top", "bottom", "top-left", "top-right", "bottom-left", "bottom-right"};
    const int i = int(Gravity::Kind(g));
    return QString::fromLatin1(i >= 0 && i < 9 ? names[i] : "?");
}

// Owned by this object, so they end with the plugin (framefocus.h, m_context).
void PointerProbe::watch(Window *w)
{
    connect(w, &Window::interactiveMoveResizeStarted, this, [this, w] {
        note(QStringLiteral("KWin %1 started on %2, edge %3, pointer %4, anchor %5, %6")
                 .arg(w->isInteractiveResize() ? QStringLiteral("resize") : QStringLiteral("move"), name(w),
                      gravity(w->interactiveMoveResizeGravity()), at(input()->pointer()->pos()), at(w->interactiveMoveResizeAnchor()),
                      w->tile() ? QStringLiteral("in a KWin tile (live tile resize)") : QStringLiteral("no tile")));
    });
    connect(w, &Window::interactiveMoveResizeFinished, this, [this, w] {
        const RectF f = w->frameGeometry();
        note(QStringLiteral("KWin move/resize finished on %1, frame %2,%3 %4x%5").arg(name(w)).arg(f.x()).arg(f.y()).arg(f.width()).arg(f.height()));
    });
}

void PointerProbe::note(const QString &text)
{
    m_events.append(QTime::currentTime().toString(QStringLiteral("HH:mm:ss.zzz")) + QLatin1Char(' ') + text);
    if (m_events.size() > s_eventsKeep) {
        m_events.removeFirst();
    }
}

QStringList PointerProbe::Events() const
{
    return m_events;
}

static QString at(const QPointF &p)
{
    return QStringLiteral("(%1,%2)").arg(p.x(), 0, 'f', 1).arg(p.y(), 0, 'f', 1);
}

// A crossing: the window KWin gives the pointer changes, or what a left press would do does.
// Not every motion: a crossing is what a transition zone is made of.
bool PointerProbe::pointerMotion(PointerMotionEvent *event)
{
    Window *top = input()->findToplevel(event->position);
    const QString decision = m_frameFocus->decide(event->position, top, Qt::LeftButton).describe();
    if (top != m_lastTop || decision != m_lastDecision) {
        m_lastTop = top;
        m_lastDecision = decision;
        note(QStringLiteral("cross %1 toplevel %2, press would be %3").arg(at(event->position), name(top), decision));
    }
    return false;
}

// Each press and release as it enters KWin's chain, with what KWin holds at that moment: the
// hover (what FrameFocus decides by), the toplevel found afresh at the press (a hover that differs
// is stale), the pointer focus (the surface the press goes to if nobody takes it), and whether a
// server decoration is under it.
bool PointerProbe::pointerButton(PointerButtonEvent *event)
{
    const auto pointer = input()->pointer();
    Window *top = input()->findToplevel(event->position);
    note(QStringLiteral("%1 %2 %3 hover %4 toplevel %5 focus %6%7")
             .arg(event->state == PointerButtonState::Pressed ? QStringLiteral("press") : QStringLiteral("release"))
             .arg(int(event->button), 0, 16)
             .arg(at(event->position), name(pointer->hover()), name(top), name(pointer->focus()))
             .arg(pointer->decoration() ? QStringLiteral(" decoration") : QString()));
    return false;
}

QString PointerProbe::Windows() const
{
    QJsonArray windows;
    const auto order = workspace()->stackingOrder();
    for (auto it = order.crbegin(); it != order.crend(); ++it) {
        const Window *w = *it;
        if (!shown(w)) {
            continue;
        }
        windows.append(QJsonObject{
            {QStringLiteral("name"), name(w)},
            {QStringLiteral("caption"), w->caption()},
            {QStringLiteral("layer"), int(w->layer())},
            {QStringLiteral("frame"), rect(w->frameGeometry())},
            {QStringLiteral("buffer"), rect(w->bufferGeometry())},
            {QStringLiteral("visible"), rect(w->visibleGeometry())},
            {QStringLiteral("tiled"), w->quickTileMode() == QuickTileMode(QuickTileFlag::Custom)},
            {QStringLiteral("decoration"), w->decoration() != nullptr},
        });
    }
    return QString::fromUtf8(QJsonDocument(windows).toJson(QJsonDocument::Indented));
}

QString PointerProbe::Probe(double x, double y) const
{
    const QPointF pos(x, y);
    Window *top = input()->findToplevel(pos);
    QJsonArray windows;
    const auto order = workspace()->stackingOrder();
    for (auto it = order.crbegin(); it != order.crend(); ++it) {
        const Window *w = *it;
        const bool inFrame = w->frameGeometry().contains(pos);
        const bool inBuffer = w->bufferGeometry().contains(pos);
        const bool inVisible = w->visibleGeometry().contains(pos);
        const bool ring = m_frameFocus->onRing(w, pos);
        if (!inFrame && !inBuffer && !inVisible && !ring) {
            continue;
        }
        windows.append(QJsonObject{
            {QStringLiteral("name"), name(w)},
            {QStringLiteral("caption"), w->caption()},
            {QStringLiteral("shown"), shown(w)},
            {QStringLiteral("layer"), int(w->layer())},
            {QStringLiteral("frame"), rect(w->frameGeometry())},
            {QStringLiteral("buffer"), rect(w->bufferGeometry())},
            {QStringLiteral("visible"), rect(w->visibleGeometry())},
            {QStringLiteral("inFrame"), inFrame},
            {QStringLiteral("inBuffer"), inBuffer},
            {QStringLiteral("inVisible"), inVisible},
            {QStringLiteral("onRing"), ring},
            // A closed window can't be asked: an internal one has lost its QWindow and crashes in
            // hitTest (2026-10-28, the test KWin). findToplevel skips them too.
            {QStringLiteral("hitTest"), !w->isDeleted() && w->hitTest(pos)},
            {QStringLiteral("decoration"), w->decoration() != nullptr},
            {QStringLiteral("acceptsInput"), w->wantsInput()},
        });
    }
    const auto pointer = input()->pointer();
    return QString::fromUtf8(QJsonDocument(QJsonObject{
        {QStringLiteral("pos"), QJsonArray{x, y}},
        {QStringLiteral("toplevel"), name(top)},
        {QStringLiteral("press"), m_frameFocus->decide(pos, top, Qt::LeftButton).describe()},
        {QStringLiteral("windows"), windows},
        {QStringLiteral("pointerNow"), QJsonObject{
            {QStringLiteral("pos"), QJsonArray{pointer->pos().x(), pointer->pos().y()}},
            {QStringLiteral("hover"), name(pointer->hover())},
            {QStringLiteral("focus"), name(pointer->focus())},
            {QStringLiteral("cursor"), cursorNow()},
        }},
    }).toJson(QJsonDocument::Indented));
}

// Each pixel's centre: the topmost shown window whose buffer covers it ("drawn"; a buffer can be
// transparent there, so the screenshot settles what shows), the topmost whose frame covers it,
// the ring under it, KWin's toplevel there, and the press decision. Windows are numbered in the
// "windows" table; -1 is none.
QString PointerProbe::Map(int x, int y, int width, int height) const
{
    if (width <= 0 || height <= 0 || qint64(width) * height > s_mapMaxPixels) {
        return QStringLiteral("{\"error\":\"1 to %1 pixels\"}").arg(s_mapMaxPixels);
    }
    QList<const Window *> table;
    const auto index = [&table](const Window *w) -> int {
        if (!w) {
            return -1;
        }
        int i = table.indexOf(w);
        if (i < 0) {
            table.append(w);
            i = table.size() - 1;
        }
        return i;
    };
    const auto order = workspace()->stackingOrder();
    QStringList decisions;
    QJsonArray rows;
    for (int j = 0; j < height; ++j) {
        QJsonArray row;
        for (int i = 0; i < width; ++i) {
            const QPointF pos(x + i + 0.5, y + j + 0.5);
            const Window *buffer = nullptr;
            const Window *frame = nullptr;
            const Window *ring = nullptr;
            for (auto it = order.crbegin(); it != order.crend(); ++it) {
                const Window *w = *it;
                if (!shown(w)) {
                    continue;
                }
                if (!buffer && w->bufferGeometry().contains(pos)) {
                    buffer = w;
                }
                if (!frame && w->frameGeometry().contains(pos)) {
                    frame = w;
                }
                if (!ring && m_frameFocus->onRing(w, pos)) {
                    ring = w;
                }
            }
            Window *top = input()->findToplevel(pos);
            const QString decision = m_frameFocus->decide(pos, top, Qt::LeftButton).describe();
            int d = decisions.indexOf(decision);
            if (d < 0) {
                decisions.append(decision);
                d = decisions.size() - 1;
            }
            row.append(QJsonArray{index(buffer), index(frame), index(ring), index(top), d});
        }
        rows.append(row);
    }
    QJsonArray windows;
    for (const Window *w : std::as_const(table)) {
        windows.append(QJsonObject{
            {QStringLiteral("name"), name(w)},
            {QStringLiteral("caption"), w->caption()},
            {QStringLiteral("frame"), rect(w->frameGeometry())},
            {QStringLiteral("buffer"), rect(w->bufferGeometry())},
        });
    }
    return QString::fromUtf8(QJsonDocument(QJsonObject{
        {QStringLiteral("origin"), QJsonArray{x, y}},
        {QStringLiteral("cell"), QJsonArray{QStringLiteral("buffer"), QStringLiteral("frame"), QStringLiteral("ring"), QStringLiteral("toplevel"), QStringLiteral("press")}},
        {QStringLiteral("windows"), windows},
        {QStringLiteral("presses"), QJsonArray::fromStringList(decisions)},
        {QStringLiteral("rows"), rows},
    }).toJson(QJsonDocument::Compact));
}
