#include "windows_restore.hpp"
#include <vector>

namespace {
struct DisplayScenario {
    bool available = true;
    bool available_known = true;
    bool snapshot_valid = true;
    bool saved_valid = true;
    bool ordinary_display_restored = true;
    unsigned verified = 0;
    std::vector<DisplayConfiguration> applied;

    DisplayRestoration restore() {
        return restore_display_configuration([&] {
            if (!available_known) throw std::runtime_error("display identity unavailable");
            return available;
        }, [&](DisplayConfiguration configuration) {
            applied.push_back(configuration);
            const bool valid = configuration == DisplayConfiguration::Original ? snapshot_valid : saved_valid;
            if (!valid) throw std::runtime_error("test display configuration invalid");
        }, [&] {
            ++verified;
            if (!ordinary_display_restored) throw std::runtime_error("only privacy display active");
        });
    }
};
void require(bool condition, const char* message) {
    if (!condition) throw std::runtime_error(message);
}
void expect_failure(DisplayScenario& scenario) {
    bool failed = false;
    try { scenario.restore(); } catch (const std::exception&) { failed = true; }
    require(failed, "restoration must retain the virtual display when no replacement is verified");
}
void verify_snapshot_and_fallback() {
    DisplayScenario original;
    original.restore();
    require(original.applied == std::vector{DisplayConfiguration::Original}, "intact snapshot must not use fallback");
    require(original.verified == 1, "the restored snapshot must be verified");
    DisplayScenario stale;
    stale.snapshot_valid = false;
    stale.restore();
    require(stale.applied == std::vector{DisplayConfiguration::Original, DisplayConfiguration::Saved},
        "a stale snapshot must try saved display configuration");
    require(stale.verified == 1, "the saved fallback must be verified");
    DisplayScenario failed;
    failed.snapshot_valid = false;
    failed.saved_valid = false;
    expect_failure(failed);
}
void verify_headless_and_reconnect() {
    DisplayScenario headless;
    headless.available = false;
    require(headless.restore() == DisplayRestoration::Retained,
        "headless recovery must finish while retaining the only usable display");
    require(headless.applied.empty() && headless.verified == 0,
        "headless recovery must not reset the display or wait for an absent monitor");
    headless.available = true;
    require(headless.restore() == DisplayRestoration::Restored, "connected displays must be restored normally");
    require(headless.applied.size() == 1, "recovery must resume when a monitor reconnects");
    DisplayScenario unknown;
    unknown.available_known = false;
    expect_failure(unknown);
    require(unknown.applied.empty(), "unknown display ownership must not be treated as an ordinary monitor");
}
void verify_unusable_restoration() {
    DisplayScenario unavailable;
    unavailable.ordinary_display_restored = false;
    expect_failure(unavailable);
    require(unavailable.verified == 2, "successful API calls must still verify snapshot and fallback displays");
    DisplayScenario invalid_fallback;
    invalid_fallback.snapshot_valid = false;
    invalid_fallback.ordinary_display_restored = false;
    expect_failure(invalid_fallback);
    require(invalid_fallback.verified == 1, "unusable fallback must not authorize release of the private screen");
}
}
int main() {
    try {
        verify_snapshot_and_fallback();
        verify_headless_and_reconnect();
        verify_unusable_restoration();
        std::cout << "Privacy restoration: stale layouts, saved fallback, headless and reconnect passed.\n";
    } catch (const std::exception& error) { std::cerr << error.what() << '\n'; return 1; }
    return 0;
}
