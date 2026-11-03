// Capture configuration updates are asynchronous. Coalesce new requests while one is in flight.
struct CaptureFrameRate {
    private(set) var current: Int
    private var requested: Int
    private var updating: Int?

    init(_ fps: Int) { current = fps; requested = fps }

    mutating func request(_ fps: Int) { requested = fps }

    mutating func beginUpdate() -> Int? {
        guard updating == nil, requested != current else { return nil }
        updating = requested
        return updating
    }

    mutating func finishUpdate(succeeded: Bool) {
        guard let updating else { return }
        if succeeded { current = updating }
        // A refused setting must not retry forever or interrupt the working capture.
        else if requested == updating { requested = current }
        self.updating = nil
    }
}
