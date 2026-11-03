use tauri::{LogicalSize, PhysicalPosition, Runtime, WebviewWindow};

const MENU_WIDTH: f64 = 360.0;
const MAX_HEIGHT: f64 = 720.0;
const EDGE_GAP: f64 = 8.0;

pub(super) fn present<R: Runtime>(
    window: &WebviewWindow<R>,
    anchor: PhysicalPosition<f64>,
    height: f64,
) -> tauri::Result<()> {
    let monitor = window.monitor_from_point(anchor.x, anchor.y)?;
    let Some(monitor) = monitor.or(window.primary_monitor()?) else {
        return Ok(());
    };
    let scale = monitor.scale_factor();
    let area = monitor.work_area();
    let gap = EDGE_GAP * scale;
    let width = (MENU_WIDTH * scale)
        .min(f64::from(area.size.width) - gap * 2.0)
        .max(1.0);
    let height = if height.is_finite() {
        height.clamp(100.0, MAX_HEIGHT)
    } else {
        MAX_HEIGHT
    };
    let height = (height * scale)
        .min(f64::from(area.size.height) - gap * 2.0)
        .max(1.0);
    let left = f64::from(area.position.x) + gap;
    let top = f64::from(area.position.y) + gap;
    let x = fit_axis(
        anchor.x,
        left,
        f64::from(area.size.width) - gap * 2.0,
        width,
    );
    let y = fit_axis(
        anchor.y,
        top,
        f64::from(area.size.height) - gap * 2.0,
        height,
    );
    window.set_position(PhysicalPosition::new(x.round() as i32, y.round() as i32))?;
    window.set_size(LogicalSize::new(width / scale, height / scale))?;
    window.show()?;
    window.set_focus()
}

fn fit_axis(anchor: f64, start: f64, available: f64, size: f64) -> f64 {
    let end = (start + available - size).max(start);
    let preferred = if anchor + size > start + available {
        anchor - size
    } else {
        anchor
    };
    preferred.clamp(start, end)
}

#[cfg(test)]
mod tests {
    use super::fit_axis;

    #[test]
    fn opens_above_taskbar_and_inside_negative_coordinate_monitors() {
        assert_eq!(fit_axis(1075.0, 8.0, 1024.0, 620.0), 412.0);
        assert_eq!(fit_axis(-20.0, -1912.0, 1904.0, 360.0), -380.0);
        assert_eq!(fit_axis(-2000.0, -1912.0, 1904.0, 360.0), -1912.0);
    }
}
