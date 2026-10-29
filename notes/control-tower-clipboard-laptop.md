# For the control tower: the laptop's clipboard row

From kwin-i3-2b, 2026-10-29, at Paul's word.

`pauls-laptop` is moving to **Plasma 6.7 on Wayland** (kwin-i3's `OPEN.md` item 50; the dotfiles
session is installing it now), with i3 on X11 kept as a fallback session at login. The clipboard
table in the global `~/.claude/CLAUDE.md` still gives the laptop as "Arch + i3, X11" with `xclip`
only. Once Plasma Wayland is its session, the row needs both:

| session | copy | paste / read | screenshot |
|---|---|---|---|
| Plasma, **Wayland** | `wl-copy <<'EOF' … EOF` | `wl-paste` (`wl-paste -t image/png`) | Spectacle |
| i3, X11 (fallback) | `DISPLAY=:0 xclip -selection clipboard <<'EOF' … EOF` | `xclip -selection clipboard -o` | Mod+Shift+S |

`wl-clipboard` is in the dotfiles session's install list. Delete this note once the table is
updated.
