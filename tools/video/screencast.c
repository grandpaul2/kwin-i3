// A region of the test KWin as a PipeWire stream, for tools/video: KWin's own screencast protocol
// (zkde_screencast_unstable_v1, refused only to sandboxed clients), the way Spectacle and the
// desktop portal record. Prints the stream's PipeWire node id, then holds the stream until killed.
//
//   screencast X Y W H [--pointer]   logical pixels; the pointer is left out unless --pointer
//                                    (a video driven by keys alone would show it idle mid-screen)
//
// Refuses to run outside tools/testkwin.sh: it would record the real desktop.
// Build: make video  (wayland-scanner, wayland-client)
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <wayland-client.h>
#include "zkde-screencast-unstable-v1-client.h"

static struct zkde_screencast_unstable_v1 *screencast;

static void global(void *data, struct wl_registry *reg, uint32_t name, const char *iface, uint32_t version) {
    (void)data;
    if (!strcmp(iface, zkde_screencast_unstable_v1_interface.name))
        screencast = wl_registry_bind(reg, name, &zkde_screencast_unstable_v1_interface, version < 5 ? version : 5);
}
static void global_remove(void *data, struct wl_registry *reg, uint32_t name) { (void)data; (void)reg; (void)name; }
static const struct wl_registry_listener registry_listener = { global, global_remove };

static void closed(void *data, struct zkde_screencast_stream_unstable_v1 *s) {
    (void)data; (void)s;
    fprintf(stderr, "screencast: KWin closed the stream\n");
    exit(1);
}
static void created(void *data, struct zkde_screencast_stream_unstable_v1 *s, uint32_t node) {
    (void)data; (void)s;
    printf("%u\n", node);
    fflush(stdout);
}
static void failed(void *data, struct zkde_screencast_stream_unstable_v1 *s, const char *error) {
    (void)data; (void)s;
    fprintf(stderr, "screencast: %s\n", error);
    exit(1);
}
// Version 6's serial: never sent, as version 5 is bound (the node id from created is what
// pipewiresrc's path takes).
static void serial(void *data, struct zkde_screencast_stream_unstable_v1 *s, uint32_t hi, uint32_t lo) {
    (void)data; (void)s; (void)hi; (void)lo;
}
static const struct zkde_screencast_stream_unstable_v1_listener stream_listener = { closed, created, failed, serial };

int main(int argc, char **argv) {
    const char *inner = getenv("KI3_INNER"), *display = getenv("WAYLAND_DISPLAY");
    if (!inner || strcmp(inner, "1") || !display || strncmp(display, "ki3test-", 8)) {
        fprintf(stderr, "screencast: only inside tools/testkwin.sh (this would record the real desktop)\n");
        return 2;
    }
    if (argc != 5 && !(argc == 6 && !strcmp(argv[5], "--pointer"))) {
        fprintf(stderr, "usage: screencast X Y W H [--pointer]\n");
        return 2;
    }
    uint32_t pointer = argc == 6 ? ZKDE_SCREENCAST_UNSTABLE_V1_POINTER_EMBEDDED
                                 : ZKDE_SCREENCAST_UNSTABLE_V1_POINTER_HIDDEN;
    struct wl_display *dpy = wl_display_connect(NULL);
    if (!dpy) {
        fprintf(stderr, "screencast: cannot connect to %s\n", display);
        return 1;
    }
    struct wl_registry *reg = wl_display_get_registry(dpy);
    wl_registry_add_listener(reg, &registry_listener, NULL);
    wl_display_roundtrip(dpy);
    if (!screencast) {
        fprintf(stderr, "screencast: KWin offers no zkde_screencast_unstable_v1\n");
        return 1;
    }
    struct zkde_screencast_stream_unstable_v1 *stream = zkde_screencast_unstable_v1_stream_region(
        screencast, atoi(argv[1]), atoi(argv[2]), (uint32_t)atoi(argv[3]), (uint32_t)atoi(argv[4]),
        wl_fixed_from_int(1), pointer);
    zkde_screencast_stream_unstable_v1_add_listener(stream, &stream_listener, NULL);
    while (wl_display_dispatch(dpy) != -1) {}
    return 0;
}
