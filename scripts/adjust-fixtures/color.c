// Color fixtures: runs Compositor's adjust_gradient_map, adjust_black_white and adjust_color_balance
// (Compositor/Rendering/AdjustPixels.c @11d8d7a) over 512 fixed opaque RGB8 colors, with the
// arguments built as Compositor/Document/ImageAdjustments.swift builds them, and prints the cases as
// JSON on stdout.
#include <math.h>
#include <stdio.h>
#include "AdjustPixels.h"

#define COUNT 512

typedef struct { double red, green, blue; } Color;
typedef struct { Color shadows, highlights; int reversed; } GradientMap;
typedef struct { double weights[6]; int tint; double tintHue, tintSaturation; } BlackWhite;
typedef struct { double shadows[3], midtones[3], highlights[3]; int preserveLuminosity; } ColorBalance;

static uint8_t pixels[COUNT * 4];

static void fill(void) {
    for (int i = 0; i < COUNT; ++i) {
        pixels[i * 4] = (uint8_t)(i * 37 % 256);
        pixels[i * 4 + 1] = (uint8_t)(i * 91 % 256);
        pixels[i * 4 + 2] = (uint8_t)(i * 173 % 256);
        pixels[i * 4 + 3] = 255;
    }
}

static void print_out(int last) {
    printf("\"out\":[");
    for (int i = 0; i < COUNT; ++i)
        for (int c = 0; c < 3; ++c) printf(i || c ? ",%d" : "%d", pixels[i * 4 + c]);
    printf("]}%s\n", last ? "" : ",");
}

static void print_color(const char *name, Color c) {
    printf("\"%s\":{\"red\":%g,\"green\":%g,\"blue\":%g}", name, c.red, c.green, c.blue);
}

// GradientMapSettings.apply
static void gradient_map(GradientMap s, int last) {
    Color dark = s.reversed ? s.highlights : s.shadows, light = s.reversed ? s.shadows : s.highlights;
    uint8_t table[256 * 3];
    for (int i = 0; i < 256; ++i) {
        double t = i / 255.0, from[3] = {dark.red, dark.green, dark.blue};
        double to[3] = {light.red, light.green, light.blue};
        for (int c = 0; c < 3; ++c)
            table[i * 3 + c] = (uint8_t)fmin(255, fmax(0, round((from[c] + (to[c] - from[c]) * t) * 255)));
    }
    fill();
    adjust_gradient_map(pixels, COUNT, 1, COUNT * 4, table);
    printf("{\"kind\":\"gradientMap\",\"settings\":{");
    print_color("shadows", s.shadows);
    printf(",");
    print_color("highlights", s.highlights);
    printf(",\"reversed\":%s},", s.reversed ? "true" : "false");
    print_out(last);
}

// BlackWhiteSettings.apply
static void black_white(BlackWhite s, int last) {
    float weights[6];
    for (int i = 0; i < 6; ++i) weights[i] = (float)(s.weights[i] / 100);
    fill();
    adjust_black_white(pixels, COUNT, 1, COUNT * 4, weights, s.tint, s.tintHue, s.tintSaturation / 100);
    const double *w = s.weights;
    printf("{\"kind\":\"blackWhite\",\"settings\":{\"reds\":%g,\"yellows\":%g,\"greens\":%g,\"cyans\":%g,"
           "\"blues\":%g,\"magentas\":%g,\"tint\":%s,\"tintHue\":%g,\"tintSaturation\":%g},",
           w[0], w[1], w[2], w[3], w[4], w[5], s.tint ? "true" : "false", s.tintHue, s.tintSaturation);
    print_out(last);
}

// ColorBalanceSettings.apply
static void color_balance(ColorBalance s, int last) {
    float sh[3], mid[3], hi[3];
    for (int i = 0; i < 3; ++i) {
        sh[i] = (float)(s.shadows[i] / 100);
        mid[i] = (float)(s.midtones[i] / 100);
        hi[i] = (float)(s.highlights[i] / 100);
    }
    fill();
    adjust_color_balance(pixels, COUNT, 1, COUNT * 4, sh, mid, hi, s.preserveLuminosity);
    printf("{\"kind\":\"colorBalance\",\"settings\":{\"shadowCyanRed\":%g,\"shadowMagentaGreen\":%g,"
           "\"shadowYellowBlue\":%g,\"midCyanRed\":%g,\"midMagentaGreen\":%g,\"midYellowBlue\":%g,"
           "\"highlightCyanRed\":%g,\"highlightMagentaGreen\":%g,\"highlightYellowBlue\":%g,"
           "\"preserveLuminosity\":%s},",
           s.shadows[0], s.shadows[1], s.shadows[2], s.midtones[0], s.midtones[1], s.midtones[2],
           s.highlights[0], s.highlights[1], s.highlights[2], s.preserveLuminosity ? "true" : "false");
    print_out(last);
}

int main(void) {
    printf("{\"cases\":[\n");
    gradient_map((GradientMap){{0.1, 0.2, 0.5}, {1, 0.9, 0.3}, 0}, 0);
    gradient_map((GradientMap){{0, 0, 0}, {1, 0.5, 0.25}, 1}, 0);
    black_white((BlackWhite){{40, 60, 40, 60, 20, 80}, 0, 40, 20}, 0);
    black_white((BlackWhite){{120, -50, 200, 10, -100, 250}, 1, 200, 35}, 0);
    color_balance((ColorBalance){{20, -30, 40}, {0, 0, 0}, {-10, 25, 0}, 1}, 0);
    color_balance((ColorBalance){{0, 0, 0}, {60, -40, -80}, {100, -100, 50}, 0}, 1);
    printf("]}\n");
    return 0;
}
