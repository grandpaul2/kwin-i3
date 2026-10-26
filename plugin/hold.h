// kwini3hold: atomic layout changes (docs/spec-atomic-layout.md), and i3's frame around tiled
// windows (docs/spec-window-modes.md). When tiled windows are
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
#include <QSet>
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

    void reconfigure(ReconfigureFlags flags) override;   // KWin's reconfigure, as well as the watcher
    bool isActive() const override;
    void prePaintScreen(KWin::ScreenPrePaintData &data) override;
    void paintScreen(const KWin::RenderTarget &renderTarget, const KWin::RenderViewport &viewport, int mask, const KWin::Region &deviceRegion, KWin::LogicalOutput *screen) override;
    void prePaintWindow(KWin::RenderView *view, KWin::EffectWindow *w, KWin::WindowPrePaintData &data) override;
    void paintWindow(const KWin::RenderTarget &renderTarget, const KWin::RenderViewport &viewport, KWin::EffectWindow *w, int mask, const KWin::Region &deviceRegion, KWin::WindowPaintData &data) override;
    void drawWindow(const KWin::RenderTarget &renderTarget, const KWin::RenderViewport &viewport, KWin::EffectWindow *w, int mask, const KWin::Region &deviceRegion, KWin::WindowPaintData &data) override;
    void postPaintScreen() override;
    bool blocksDirectScanout() const override;

public Q_SLOTS:
    // D-Bus: org.kde.KWin /kwini3hold net.local.kwini3hold Stats
    QVariantMap Stats() const;
    // D-Bus: the last events (holds opened and released, closes kept, snapshots, new windows
    // hidden), stamped HH:mm:ss.zzz and with the frame count; tools/capture saves them.
    QStringList Events() const;
    // kwin-i3 says which windows it floats (docs/spec-window-modes.md, decision 5c): the set
    // outlives a reload of the script, which reads it back from Stats ("floating").
    void SetFloating(const QString &id, bool on);
    // kwin-i3 says whether tiled windows get the ring (tiledLook "frame"; not "bare", where they
    // stay borderless and rounded without it: docs/spec-tiled-look.md). Told by the script, not
    // read from kwinrc, so the ring and the tiles' frame room change in the same pass.
    void SetTiledRing(bool on);
    // kwin-i3's tiling drag (docs/spec-tiled-look.md, item 8): where the dragged window would
    // drop, drawn over everything in the tiled frame's active colour, half transparent; a width
    // or height of 0 clears it. In logical pixels, global.
    void SetDropIndicator(int x, int y, int width, int height);
    // kwin-i3's tiling drag: i3's move cursor while it lasts. KWin shows an effect's cursor only
    // while the effect holds the mouse (CursorImage::reevaluteSource), so on grabs it; the
    // helper's drag filter sits ahead of KWin's effects filter and keeps the drag's input. Renewed
    // by every poll of kwin-i3's: unrenewed for 500 ms (kwin-i3 gone), the grab ends by itself,
    // never leaving the pointer dead.
    void SetDragCursor(bool on);

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
    void note(const QString &what);
    void watchWindow(KWin::EffectWindow *w);
    void onAdded(KWin::EffectWindow *w);
    void onClosed(KWin::EffectWindow *w);
    void onDeleted(KWin::EffectWindow *w);
    void onAboutToChange(KWin::EffectWindow *w);

    bool tiled(KWin::EffectWindow *w) const;
    bool holding() const;                                   // a hold, or a new window hidden
    bool framed(KWin::EffectWindow *w) const;               // in one of kwin-i3's tiles, no decoration
    bool floatingFramed(KWin::EffectWindow *w) const;       // floating, its decoration taken (frameOnFloating)
    bool ringed(KWin::EffectWindow *w) const;               // drawn with a ring: framed with the tiled ring, or floatingFramed
    void updateRadius(KWin::EffectWindow *w);               // rounded while framed (docs/spec-rounded-corners.md)
    void updateRadii();
    void resetRadii();
    QList<KWin::RectF> ring(KWin::EffectWindow *w, const KWin::RectF &frame, double scale, double radius) const;
    void repaintRing(KWin::EffectWindow *w, const KWin::RectF &frame);
    void paintFrame(const KWin::RenderTarget &renderTarget, const KWin::RenderViewport &viewport, KWin::EffectWindow *w, const KWin::Region &deviceRegion, const KWin::WindowPaintData &data);
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
    int m_frameWidth = 1;
    QColor m_frameActive{0x4c, 0x78, 0x99}, m_frameInactive{0x33, 0x33, 0x33};
    QColor m_floatingActive{0x4d, 0x72, 0x54}, m_floatingInactive{0x33, 0x33, 0x33};
    bool m_frameOnFloating = false;
    bool m_roundedCorners = true;
    bool m_tiledRing = true;                                // SetTiledRing; until told, as before tiledLook
    QSet<QString> m_floating;                               // kwin-i3's floating windows, by internal id
    QSet<QString> m_rounded;                                // windows this effect gave a radius, by internal id
    QPointer<KWin::EffectWindow> m_active;                 // its ring changes colour on activation
    KWin::RectF m_drop;                                     // SetDropIndicator; empty when none
    QTimer m_dragCursor;                                    // SetDragCursor: running while it grabs

    QHash<KWin::EffectWindow *, Held> m_held;
    QHash<KWin::EffectWindow *, Hidden> m_hidden;        // new windows not placed yet
    QHash<KWin::EffectWindow *, QElapsedTimer> m_pendingClose; // kept, waiting for a neighbour
    QList<QPointer<KWin::EffectWindow>> m_dragging;
    QStringList m_events;                                   // note(): the last 500, for Events

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
        quint64 frames = 0, framesHolding = 0;              // screens painted while active, and while holding
    } m_stats;
};
