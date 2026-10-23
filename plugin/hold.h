// kwini3hold: atomic layout changes (docs/spec-atomic-layout.md). When tiled windows are
// rearranged, each one is snapshotted just before it moves and drawn at its old place until every
// moved window has its new frame (or 100 ms), then they all switch in one frame: no wallpaper
// between, as Sway's transactions give. A closing window is kept on screen while its neighbours
// grow into its space; a new window is hidden until its tile has placed it (or 20 ms).
// Nothing is asked of kwin-i3: KWin says "about to change" before every geometry change.
#pragma once

#include <effect/effectwindow.h>
#include <effect/offscreeneffect.h>
#include <scene/item.h>

#include <KConfigWatcher>

#include <QElapsedTimer>
#include <QHash>
#include <QPointer>
#include <QTimer>
#include <QVariantMap>

#include <memory>
#include <optional>

class Hold : public KWin::CrossFadeEffect
{
    Q_OBJECT
public:
    Hold();
    ~Hold() override;

    static bool supported();

    bool isActive() const override;
    void prePaintScreen(KWin::ScreenPrePaintData &data) override;
    void prePaintWindow(KWin::RenderView *view, KWin::EffectWindow *w, KWin::WindowPrePaintData &data) override;
    void paintWindow(const KWin::RenderTarget &renderTarget, const KWin::RenderViewport &viewport, KWin::EffectWindow *w, int mask, const KWin::Region &deviceRegion, KWin::WindowPaintData &data) override;
    void drawWindow(const KWin::RenderTarget &renderTarget, const KWin::RenderViewport &viewport, KWin::EffectWindow *w, int mask, const KWin::Region &deviceRegion, KWin::WindowPaintData &data) override;
    void postPaintScreen() override;

public Q_SLOTS:
    // D-Bus: org.kde.KWin /kwini3hold net.local.kwini3hold Stats
    QVariantMap Stats() const;

private:
    // One held window. A snapshot (redirected into a texture, drawn at `frame`), or a closing
    // window kept by refWindow (KWin draws it as it was), or a new window that got a tile while
    // hidden (drawn not at all until the release).
    struct Held
    {
        KWin::RectF frame;
        bool snapshot = false;
        bool closed = false;
        bool joined = false;
        bool settledHidden = false;                      // went to another desktop / minimized
        std::optional<KWin::EffectWindowVisibleRef> visible; // keeps a hidden one drawn
    };
    struct Hidden
    {
        std::shared_ptr<KWin::ItemEffect> effect;        // keeps it off hardware planes
        QElapsedTimer since;
    };

    void loadConfig();
    void watchWindow(KWin::EffectWindow *w);
    void onAdded(KWin::EffectWindow *w);
    void onClosed(KWin::EffectWindow *w);
    void onDeleted(KWin::EffectWindow *w);
    void onAboutToChange(KWin::EffectWindow *w);

    bool tiled(KWin::EffectWindow *w) const;
    bool shown(KWin::EffectWindow *w) const;
    bool eligible(KWin::EffectWindow *w) const;
    bool settled(KWin::EffectWindow *w) const;
    bool outputDragged(KWin::EffectWindow *w) const;

    void snapshot(KWin::EffectWindow *w);
    void hide(KWin::EffectWindow *w);
    void unhide(KWin::EffectWindow *w);
    void ensureOpen();
    void restartQuiet();
    void queueCheck();
    void check();
    void release(bool timedOut);
    void releaseAll();

    KConfigWatcher::Ptr m_watcher;
    bool m_enabled = true;
    int m_timeoutMs = 100;

    QHash<KWin::EffectWindow *, Held> m_held;
    QHash<KWin::EffectWindow *, Hidden> m_hidden;        // new windows not placed yet
    QHash<KWin::EffectWindow *, QElapsedTimer> m_pendingClose; // kept, waiting for a neighbour
    QList<QPointer<KWin::EffectWindow>> m_dragging;

    bool m_open = false;
    bool m_snapshotting = false;
    bool m_checkQueued = false;
    QElapsedTimer m_started;
    QTimer m_deadline;
    QTimer m_quiet;

    struct
    {
        quint64 transactions = 0, timeouts = 0, closeHoldsKept = 0, closeHoldsDropped = 0;
        quint64 newHidden = 0, snapshots = 0;
        double lastMs = 0, maxMs = 0, lastHiddenMs = 0, maxHiddenMs = 0;
        double lastSnapshotMs = 0, maxSnapshotMs = 0, lastQuietWaitMs = 0;
    } m_stats;
};
