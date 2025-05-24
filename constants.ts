
export const DESCRIPTION_DISPLAY_TIME = 5; // seconds
export const IMAGE_DISPLAY_TIME = 5;       // seconds
export const POSE_HOLD_SECONDS = 4;        // seconds

// Colors (hex for web)
export const COLOR_CORRECT = "#00FF00";     // Green
export const COLOR_INCORRECT = "#FF0000";   // Red
export const COLOR_LANDMARK = "#E6E6E6";    // Light Gray (used by MediaPipe default drawing)
export const COLOR_TEXT = "#FFFFFF";        // White
export const COLOR_TEXT_BG = "#000000";     // Black (for text background)
export const COLOR_PROGRESS_BAR_BG = "#646464";
export const COLOR_PROGRESS_BAR_FG = "#00C800";

export const EASY_MODE_TOLERANCE = 20; // Degrees tolerance

export const DEFAULT_CAMERA_WIDTH = 1280;
export const DEFAULT_CAMERA_HEIGHT = 720;

export const TTS_DELAY = 0.5; // seconds delay after each TTS utterance
export const TTS_RATE = 1.2; // Speech rate (0.1 to 10, default 1)

export const PLACEHOLDER_IMAGE_SVG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'%3E%3Crect width='200' height='200' fill='%233C3C3C'/%3E%3Ctext x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='100' fill='%23C8C8C8'%3E?%3C/text%3E%3C/svg%3E";

export const CONFIG_FILE_PATH = 'exercise_config.json'; // Changed: Removed leading slash
