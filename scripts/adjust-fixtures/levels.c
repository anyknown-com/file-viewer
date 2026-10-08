// Levels fixtures: runs Compositor's levels_apply (Compositor/Rendering/LevelsPixels.c @11d8d7a)
// over an opaque 0–255 gray ramp with tables built as LevelsFilter.run builds them
// (Compositor/Document/Levels.swift), and prints the cases as JSON on stdout.
#include <math.h>
#include <stdio.h>
#include "LevelsPixels.h"

typedef struct { double black, gamma, white, outputBlack, outputWhite; } Range;
static const Range ID = {0, 1, 255, 0, 255};

static double clampd(double n, double lo, double hi, double fallback) {
    return isfinite(n) ? fmin(hi, fmax(lo, n)) : fallback;
}
// LevelRange.normalized + LevelRange.apply
static double apply(Range r, double value) {
    double black = clampd(r.black, 0, 254, 0);
    double white = clampd(r.white, black + 1, 255, 255);
    double gamma = clampd(r.gamma, 0.1, 9.99, 1);
    double ob = clampd(r.outputBlack, 0, 255, 0), ow = clampd(r.outputWhite, 0, 255, 255);
    double input = fmin(1, fmax(0, (value * 255 - black) / (white - black)));
    return (ob + pow(input, 1 / gamma) * (ow - ob)) / 255;
}
static void print_range(Range r) {
    printf("{\"black\":%g,\"gamma\":%g,\"white\":%g,\"outputBlack\":%g,\"outputWhite\":%g}",
           r.black, r.gamma, r.white, r.outputBlack, r.outputWhite);
}
static void run(const Range ranges[4], int last) {
    float tables[768];
    for (int c = 0; c < 3; ++c)
        for (int i = 0; i < 256; ++i)
            tables[c * 256 + i] = (float)apply(ranges[0], apply(ranges[c + 1], i / 255.0));
    uint8_t pixels[1024];
    for (int i = 0; i < 256; ++i) {
        pixels[i * 4] = pixels[i * 4 + 1] = pixels[i * 4 + 2] = (uint8_t)i;
        pixels[i * 4 + 3] = 255;
    }
    levels_apply(pixels, 256, tables);
    printf("{\"levels\":{\"channel\":\"RGB\",\"ranges\":[");
    for (int c = 0; c < 4; ++c) { if (c) printf(","); print_range(ranges[c]); }
    printf("]},\"out\":[");
    for (int i = 0; i < 256; ++i)
        for (int c = 0; c < 3; ++c) printf(i || c ? ",%d" : "%d", pixels[i * 4 + c]);
    printf("]}%s\n", last ? "" : ",");
}

int main(void) {
    Range identity[4] = {ID, ID, ID, ID};
    Range input[4] = {{20, 1.4, 230, 0, 255}, ID, ID, ID};
    Range output[4] = {{0, 1, 255, 10, 240}, ID, ID, ID};
    Range red[4] = {ID, {0, 1, 200, 0, 255}, ID, ID};
    printf("{\"cases\":[\n");
    run(identity, 0);
    run(input, 0);
    run(output, 0);
    run(red, 1);
    printf("]}\n");
    return 0;
}
