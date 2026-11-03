#include "platform.hpp"
#include "recovery.hpp"
#include <iostream>
#include <stdexcept>
#include <cstdlib>

class FakePlatform final : public PrivacyPlatform {
    bool active = false;
    bool created = false;
    bool fail_lock = std::getenv("PRIVACY_TEST_LOCK_RETRY") != nullptr;
    bool fail_restore = std::getenv("PRIVACY_TEST_RESTORE_RETRY") != nullptr;
    bool fail_release = std::getenv("PRIVACY_TEST_RELEASE_RETRY") != nullptr;
    bool headless = std::getenv("PRIVACY_TEST_HEADLESS") != nullptr;
    PrivacyRecovery recovery;
    void lock_session() {
        if (fail_lock) {
            fail_lock = false; std::cerr << "lock-pending\n"; throw std::runtime_error("test lock delay");
        }
        std::cerr << "lock-confirmed\n";
    }
    void restore_layout() {
        if (headless) { std::cerr << "retain-display\n"; return; }
        if (fail_restore) {
            fail_restore = false; std::cerr << "restore-pending\nunlock\n";
            throw std::runtime_error("test display disconnected");
        }
        std::cerr << "restore\n";
    }
    void release_display() {
        if (fail_release) {
            fail_release = false; std::cerr << "release-pending\nunlock\n";
            throw std::runtime_error("test device busy");
        }
        active = false; created = false;
    }
public:
    std::string prepare() override { created = true; std::cerr << "prepare\n"; return "test-display"; }
    void commit() override { active = true; std::cerr << "disconnect\n"; }
    void verify() override {}
    void restore(bool lock) override {
        if (!created) return;
        recovery.run(active && lock, [&] { lock_session(); },
            [&] { restore_layout(); }, [&] { release_display(); });
    }
};
std::unique_ptr<PrivacyPlatform> privacy_platform() { return std::make_unique<FakePlatform>(); }
bool platform_command(int, char**) { return false; }
