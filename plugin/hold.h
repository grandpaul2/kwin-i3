// kwini3hold: atomic layout changes (docs/records/spec-atomic-layout.md), and i3's frame around tiled
// windows (docs/records/spec-window-modes.md). When tiled windows are
// rearranged, each one is snapshotted just before it moves and drawn at its old place until every
// moved window has its new frame (or 100 ms), then they all switch in one frame: no wallpaper
// between, as Sway's transactions give. A closing window is kept on screen while its neighbours
// grow into its space; a new window is hidden until its tile has placed it (or 20 ms).
// For the hold nothing is asked of kwin-i3: KWin says "about to change" before every geometry
// change. kwin-i3 tells it the rest: the floating set, the tiled ring, the drop indicator and the
// drag cursor (the slots below).
#pragma once

#include <effect/effectwindow.h>
#include <effect/offscreeneffect.h>
#include <opengl/gltexture.h>
#include <scene/item.h>

#include <KConfigWatcher>

#include <QElapsedTimer>
#include <QHash>
#include <QSet>
#include <QPointer>
#include <QTimer>
#include <QVariantMap>

#include <map>
#include <memory>
#include <optional>

// KWin 6.8's paint hooks return false when painting failed (a GPU reset), and an effect then
// stops at once (effect/effect.h); 6.7's return nothing. KI3_PAINT runs the chain's call and
// stops on a failure; KI3_PAINTED ends a hook that painted.
#ifdef KI3_PAINT_RESULT
using PaintResult = bool;
#define KI3_PAINT(call) do { if (!(call)) return false; } while (0)
#define KI3_PAINTED return true
#else
using PaintResult = void;
#define KI3_PAINT(call) call
#define KI3_PAINTED return
#endif

class Hold : public KWin::CrossFadeEffect
{
    Q_OBJECT
public:
    Hold();
    ~Hold() override;

    static bool supported();

    void reconfigure(ReconfigureFlags flags) override;   // a --notify write; KWin's own reconfigure arrives as Workspace::configChanged (hold.cpp)
    bool isActive() const override;
    void prePaintScreen(KWin::ScreenPrePaintData &data) override;
    PaintResult paintScreen(const KWin::RenderTarget &renderTarget, const KWin::RenderViewport &viewport, int mask, const KWin::Region &deviceRegion, KWin::LogicalOutput *screen) override;
    void prePaintWindow(KWin::RenderView *view, KWin::EffectWindow *w, KWin::WindowPrePaintData &data) override;
    PaintResult paintWindow(const KWin::RenderTarget &renderTarget, const KWin::RenderViewport &viewport, KWin::EffectWindow *w, int mask, const KWin::Region &deviceRegion, KWin::WindowPaintData &data) override;
    PaintResult drawWindow(const KWin::RenderTarget &renderTarget, const KWin::RenderViewport &viewport, KWin::EffectWindow *w, int mask, const KWin::Region &deviceRegion, KWin::WindowPaintData &data) override;
    void postPaintScreen() override;
    bool blocksDirectScanout() const override;
    int requestedEffectChainPosition() const override;

public Q_SLOTS:
    // D-Bus: org.kde.KWin /kwini3hold net.local.kwini3hold Stats
    QVariantMap Stats() const;
    // D-Bus: the last events (holds opened and released, closes kept, snapshots, new windows
    // hidden), stamped HH:mm:ss.zzz and with the frame count; tools/capture saves them.
    QStringList Events() const;
    // kwin-i3 says which windows it floats (docs/records/spec-window-modes.md, decision 5c): the set
    // outlives a reload of the script, which reads it back from Stats ("floating").
    void SetFloating(const QString &id, bool on);
    // kwin-i3 says how a window's ring is drawn (docs/records/spec-redo-7-look.md A-C; i3's x.c): its
    // colour class, "focused" or "unfocused" ("" forgets the window: KWin's
    // active window colours it, as before the first call); the indicator side, "right" or
    // "bottom", drawn in the class's indicator colour on a window alone in its split, else "";
    // and the sides hidden at the output's edge (hide_edge_borders), "left right top bottom" in
    // any mix, "" for none. Sent only when it changes; the script reads back the ids it holds
    // from Stats ("rings") after a reload of either side.
    void SetRing(const QString &id, const QString &cls, const QString &indicator, const QString &hidden);
    // kwin-i3 says whether tiled windows get the ring (tiledLook "frame"; not "bare", where they
    // stay borderless and rounded without it: docs/records/spec-tiled-look.md). Told by the script, not
    // read from kwinrc, so the ring and the tiles' frame room change in the same pass.
    void SetTiledRing(bool on);
    // kwin-i3 says a split key was pressed on this window (Split H, Split V, Toggle Split; Paul,
    // 2026-10-28, ≠ i3's indicator always on): its indicator side shows until another window is
    // activated or SetRing says it is no longer focused or alone (the split happened). No timer:
    // it goes with a repaint that happens anyway. Without it, the side is in the frame's colour.
    void ShowIndicator(const QString &id);
    // kwin-i3's tiling drag (docs/records/spec-tiled-look.md, item 8): where the dragged window would
    // drop, drawn over everything in the tiled frame's active colour, half transparent; a width
    // or height of 0 clears it. In logical pixels, global.
    void SetDropIndicator(int x, int y, int width, int height);
    // kwin-i3's tiling drag: i3's move cursor while it lasts. KWin shows an effect's cursor only
    // while the effect holds the mouse (CursorImage::reevaluteSource), so on grabs it; the
    // helper's drag filter sits ahead of KWin's effects filter and keeps the drag's input. Renewed
    // by every poll of kwin-i3's: unrenewed for 500 ms (kwin-i3 gone), the grab ends by itself,
    // never leaving the pointer dead. `shape`: 0 the move cursor, 1 left-right and 2 up-down for
    // the tiling resize (docs/records/spec-tiling-resize.md).
    void SetDragCursor(bool on, int shape);
    // The helper's resize mode (plugin/resizemode.cpp; docs/records/spec-redo-5-keys.md A, Paul's call 34):
    // "resize" draws the mode's banner at the top of the focused window, "" takes it away.
    void SetMode(const QString &mode);
    // kwin-i3's focused window (the tree's focus), by internal id; "" for none (an empty
    // workspace, a release). The banner is drawn on it, an untold ring takes its class from it,
    // and a split key's indicator goes when it changes (plan.md, "Focus").
    void SetFocused(const QString &id);
    // kwin-i3 moves a new window to another output or desktop (docs/records/spec-redo-1-new-windows.md,
    // A): keep it hidden until its tile places it, or `ms` at most, instead of the 20 ms a new
    // window gets by itself; a geometry change that isn't its tile's leaves it hidden meanwhile.
    // ms 0: kwin-i3 has placed it (a floating window); shown now unless its tile holds it.
    void HoldNew(const QString &id, int ms);

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
        int limitMs = 0;                                 // shown after this long without a tile
        bool named = false;                              // kwin-i3 moves it (HoldNew): other moves keep it hidden
        bool landing = false;                            // tiled, released, its app still drawing the tile
    };

    void loadConfig();
    void note(const QString &what);
    void watchWindow(KWin::EffectWindow *w);
    void onAdded(KWin::EffectWindow *w);
    void onClosed(KWin::EffectWindow *w);
    void grabClose(KWin::EffectWindow *w);
    void onDeleted(KWin::EffectWindow *w);
    void onAboutToChange(KWin::EffectWindow *w);

    bool tiled(KWin::EffectWindow *w) const;
    bool holding() const;                                   // a hold, or a new window hidden
    bool framed(KWin::EffectWindow *w) const;               // in one of kwin-i3's tiles, no decoration
    bool floatingFramed(KWin::EffectWindow *w) const;       // floating, its decoration taken (frameOnFloating)
    bool ringed(KWin::EffectWindow *w) const;               // drawn with a ring: framed with the tiled ring, or floatingFramed; not one hidden on every side
    void updateRadius(KWin::EffectWindow *w);               // rounded while framed (docs/records/spec-rounded-corners.md)
    void updateRadii();
    void resetRadii();
    // One window's ring as kwin-i3 last said (SetRing); without an entry, by KWin's active window.
    enum Side { Left = 1, Right = 2, Top = 4, Bottom = 8 };
    struct Ring
    {
        int cls = 0;                                        // 0 focused, 1 unfocused
        int indicator = 0;                                  // 0 none, else the Side (Right or Bottom)
        int hidden = 0;                                     // Sides not drawn
    };
    struct Bar
    {
        KWin::RectF rect;
        bool indicator = false;                             // drawn in the class's indicator colour
    };
    Ring ringOf(KWin::EffectWindow *w) const;
    void repaintRingOf(const QString &id);
    QList<Bar> ring(const KWin::RectF &frame, double scale, double radius, const Ring &how) const;
    void repaintRing(KWin::EffectWindow *w, const KWin::RectF &frame);
    void paintFrame(const KWin::RenderTarget &renderTarget, const KWin::RenderViewport &viewport, KWin::EffectWindow *w, const KWin::Region &deviceRegion, const KWin::WindowPaintData &data);
    KWin::EffectWindow *windowById(const QString &id) const;
    void paintBanner(const KWin::RenderTarget &renderTarget, const KWin::RenderViewport &viewport, KWin::EffectWindow *w, const KWin::WindowPaintData &data);
    bool shown(KWin::EffectWindow *w) const;
    bool eligible(KWin::EffectWindow *w) const;
    bool settled(KWin::EffectWindow *w) const;
    bool outputDragged(KWin::EffectWindow *w) const;

    void snapshot(KWin::EffectWindow *w);
    void hide(KWin::EffectWindow *w, int limitMs);
    void armHidden(KWin::EffectWindow *w, int ms);
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
    QString m_mode;                                          // the helper's mode: "resize" shows the banner
    struct Banner {
        std::unique_ptr<KWin::GLTexture> texture;
        QSize size;
    };
    // The banner's text, drawn once per output scale (two monitors at two scales redrew it on
    // every paint, review 2026-10-28); cleared when the settings change (its colour).
    std::map<double, Banner> m_banners;
    bool m_bannersStale = false;    // set by loadConfig; cleared in the paint, where GL is current
    // i3's colour classes (docs/behaviour.md §7 L3), by Ring::cls; an invalid indicator colour
    // means the class's frame colour (the form's empty value).
    QColor m_frameColour[2]{QColor(0x4c, 0x78, 0x99), QColor(0x33, 0x33, 0x33)};
    QColor m_indicatorColour[2]{QColor(0x3d, 0xae, 0xe9), QColor()};
    bool m_frameOnFloating = false;
    bool m_roundedCorners = true;
    bool m_tiledRing = true;                                // SetTiledRing; until told, as before tiledLook
    QSet<QString> m_floating;                               // kwin-i3's floating windows, by internal id
    QHash<QString, Ring> m_rings;                           // SetRing, by internal id
    QSet<QString> m_indicatorShown;                         // ShowIndicator, by internal id
    QSet<QString> m_rounded;                                // windows this effect gave a radius, by internal id
    QString m_focusedId;                                    // SetFocused: the tree's focused window
    KWin::RectF m_drop;                                     // SetDropIndicator; empty when none
    Qt::CursorShape m_dragShape = Qt::SizeAllCursor;        // the shape it grabs with now
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
        double lastSnapshotMs = 0, maxSnapshotMs = 0;
        quint64 frames = 0, framesHolding = 0;              // screens painted while active, and while holding
    } m_stats;
};
