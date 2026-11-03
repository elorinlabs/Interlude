#pragma once
#include <iostream>
#include <stdexcept>

enum class DisplayConfiguration { Original, Saved };
enum class DisplayRestoration { Restored, Retained };

// A headless host keeps its only usable screen and finishes the old session.
// The saved configuration can survive monitor changes that invalidate our snapshot.
template <typename Available, typename Apply, typename Verify>
DisplayRestoration restore_display_configuration(Available available, Apply apply, Verify verify) {
    if (!available()) return DisplayRestoration::Retained;
    try {
        apply(DisplayConfiguration::Original);
        verify();
        return DisplayRestoration::Restored;
    } catch (const std::exception& error) {
        std::cerr << "privacy original display configuration: " << error.what() << '\n';
    }
    apply(DisplayConfiguration::Saved);
    verify();
    return DisplayRestoration::Restored;
}
