#pragma once

// A completed stage belongs to the disconnected session. Retrying a later stage
// must not lock a newly authenticated session or replay an already restored layout.
class PrivacyRecovery {
    bool lock_confirmed = false;
    bool layout_restored = false;
public:
    template <typename Lock, typename Restore, typename Release>
    void run(bool require_lock, Lock lock, Restore restore, Release release) {
        if (require_lock && !lock_confirmed) {
            lock();
            lock_confirmed = true;
        }
        if (!layout_restored) {
            restore();
            layout_restored = true;
        }
        release();
    }
};
