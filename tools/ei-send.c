// Real input for the live tests: pointer moves, clicks and keys sent into a KWin over libei, the
// interface remote-desktop tools use. Never pointed at the live session: tools/inject.py gets the
// connection from the test KWin on the private bus and hands its fd here.
//
//   ei-send <fd>        then commands on stdin, one per line:
//     abs X Y           move the pointer to X,Y (logical pixels, whole desktop)
//     btn left|right|middle down|up
//     key CODE down|up  evdev key code (KEY_LEFTMETA 125, KEY_LEFTSHIFT 42, ...)
//     wait MS           pause, still processing KWin's events
//   Prints "ready" once the devices can be used, "ok" after each command, errors on stderr.
//
// Build: make tools  (gcc, libei-devel)
#include <errno.h>
#include <poll.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <libei.h>

#define BTN_LEFT 0x110
#define BTN_RIGHT 0x111
#define BTN_MIDDLE 0x112

static struct ei *ei;
static struct ei_device *absdev, *kbd;
static uint32_t sequence = 1;
static bool abs_on, kbd_on;     // resumed by KWin and emulating (libei 1.6 has no state getter)

static void handle_events(void) {
    struct ei_event *e;
    while ((e = ei_get_event(ei))) {
        struct ei_device *d = ei_event_get_device(e);
        switch (ei_event_get_type(e)) {
        case EI_EVENT_SEAT_ADDED:
            ei_seat_bind_capabilities(ei_event_get_seat(e), EI_DEVICE_CAP_POINTER_ABSOLUTE,
                                      EI_DEVICE_CAP_BUTTON, EI_DEVICE_CAP_KEYBOARD, NULL);
            break;
        case EI_EVENT_DEVICE_ADDED:
            if (ei_device_has_capability(d, EI_DEVICE_CAP_POINTER_ABSOLUTE) && !absdev)
                absdev = ei_device_ref(d);
            if (ei_device_has_capability(d, EI_DEVICE_CAP_KEYBOARD) && !kbd)
                kbd = ei_device_ref(d);
            break;
        case EI_EVENT_DEVICE_RESUMED:
            ei_device_start_emulating(d, sequence++);
            if (d == absdev) abs_on = true;
            if (d == kbd) kbd_on = true;
            break;
        case EI_EVENT_DEVICE_PAUSED:
            if (d == absdev) abs_on = false;
            if (d == kbd) kbd_on = false;
            break;
        case EI_EVENT_DISCONNECT:
            fprintf(stderr, "ei-send: KWin disconnected\n");
            exit(1);
        default:
            break;
        }
        ei_event_unref(e);
    }
}


// Process KWin's events for up to ms milliseconds (or until ready() holds, if given).
static void pump(int ms, bool (*ready)(void)) {
    struct timespec start, now;
    clock_gettime(CLOCK_MONOTONIC, &start);
    for (;;) {
        if (ready && ready()) return;
        clock_gettime(CLOCK_MONOTONIC, &now);
        long left = ms - ((now.tv_sec - start.tv_sec) * 1000 + (now.tv_nsec - start.tv_nsec) / 1000000);
        if (left <= 0) return;
        struct pollfd p = { .fd = ei_get_fd(ei), .events = POLLIN };
        if (poll(&p, 1, (int)left) > 0) {
            ei_dispatch(ei);
            handle_events();
        }
    }
}

static bool devices_ready(void) { return abs_on && kbd_on; }

int main(int argc, char **argv) {
    if (argc != 2) { fprintf(stderr, "usage: ei-send <fd>\n"); return 2; }
    ei = ei_new_sender(NULL);
    ei_configure_name(ei, "kwin-i3 tests");
    int rc = ei_setup_backend_fd(ei, atoi(argv[1]));
    if (rc != 0) { fprintf(stderr, "ei-send: setup failed: %s\n", strerror(-rc)); return 1; }
    pump(5000, devices_ready);
    if (!devices_ready()) { fprintf(stderr, "ei-send: no pointer/keyboard devices after 5 s\n"); return 1; }
    printf("ready\n");
    fflush(stdout);

    char line[256];
    while (fgets(line, sizeof line, stdin)) {
        char cmd[16], a[32], b[32];
        int n = sscanf(line, "%15s %31s %31s", cmd, a, b);
        if (n < 1) continue;
        if (!strcmp(cmd, "abs") && n == 3) {
            ei_device_pointer_motion_absolute(absdev, atof(a), atof(b));
            ei_device_frame(absdev, ei_now(ei));
        } else if (!strcmp(cmd, "btn") && n == 3) {
            uint32_t code = !strcmp(a, "right") ? BTN_RIGHT : !strcmp(a, "middle") ? BTN_MIDDLE : BTN_LEFT;
            ei_device_button_button(absdev, code, !strcmp(b, "down"));
            ei_device_frame(absdev, ei_now(ei));
        } else if (!strcmp(cmd, "key") && n == 3) {
            ei_device_keyboard_key(kbd, (uint32_t)atoi(a), !strcmp(b, "down"));
            ei_device_frame(kbd, ei_now(ei));
        } else if (!strcmp(cmd, "wait") && n == 2) {
            pump(atoi(a), NULL);
        } else {
            fprintf(stderr, "ei-send: bad command: %s", line);
            return 2;
        }
        pump(10, NULL);          // let KWin take it before the next command
        printf("ok\n");
        fflush(stdout);
    }
    return 0;
}
