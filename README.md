# My Photobooth

A browser-based photo booth that turns four poses into a custom photo strip.

My Photobooth recreates the experience of stepping behind a curtain, taking four photos, and picking up a freshly printed strip. Drop a coin or open the curtain to start, choose your film, and strike a pose before each three-second countdown ends. Once your strip is ready, customize it with frames, backdrops, and a caption before downloading it as a PNG.

The app is built with vanilla JavaScript, HTML, and CSS. Photos are captured through the browser's camera API, processed with the Canvas API, and rendered into strip or single-photo layouts. Shutter and printer sounds are generated with the Web Audio API. All photo processing happens locally in the browser, with no backend, accounts, or API keys required.

## Built With

- JavaScript
- HTML & CSS
- SVG
- Canvas API
- MediaDevices API
- Web Audio API

## Getting Started

### Prerequisites

- A modern browser with camera support
- A webcam, or existing photos to use if the camera is unavailable
- Python 3 for the local server below, or another static HTTP server

### Installation

1. Clone the repo:

   ```bash
   git clone https://github.com/sanskritim05/photobooth.git
   cd photobooth
   ```

2. Start a local server:

   ```bash
   python3 -m http.server 8000
   ```

3. Open [http://localhost:8000](http://localhost:8000).

There are no dependencies to install or environment variables to configure. Camera access requires localhost or HTTPS and permission from your browser.

## Usage

### Take Photos

1. Click the coin slot or curtain to enter the booth.
2. Allow camera access and choose **color**, **b&w**, or **sepia** film.
3. Click **start** to take four photos, each with a three-second countdown.
4. Wait for the strip to print, then click it or select **pick up your strip**.

If the camera is blocked or unavailable, select **use photos instead** in the camera message. Choose up to four images; fewer images are repeated to fill all four poses.

### Customize Your Prints

- **Strips:** classic, cherry, charcoal, film, gingham, and starry.
- **Singles:** polaroid, digicam, red cam, and now playing. Select which of the four shots to use.
- **Backdrops:** eight built-in designs, plus an option to add your own image. A backdrop places the print on a 1080 × 1920 canvas.
- **Film:** switch between color, black and white, and sepia after taking your photos.
- **Caption:** edit the default date caption on supported frames, up to 32 characters.

Click **download** to save a PNG, **retake** to start a new session, or **back to booth** to return to the entrance.

### Keyboard Controls

| Key | Action |
| --- | --- |
| Enter or Space | Activate the focused coin slot, curtain, or printed strip |
| Space | Start the photo sequence when inside the booth and the camera is ready |
| Escape | Leave the camera view or return from the print editor to the booth |

## How It Works

| Phase | Description |
| --- | --- |
| 1. Enter the Booth | An SVG booth animates into the camera view and requests a front-facing camera stream without audio. |
| 2. Capture Four Poses | Each countdown ends with a flash and shutter sound. Mirrored photos are captured into in-memory canvases. |
| 3. Develop & Print | Pixel processing applies the selected film effect, then the strip slides out of the booth with a printer animation and sound. |
| 4. Customize & Download | Canvas renders the selected frame, photo, caption, and optional backdrop into a downloadable PNG. |

Original photos stay in memory so film effects can be changed without applying filters repeatedly to the same image. The camera stream stops after the session or when you leave the booth.

## App Views

- **Booth:** interactive coin slot, curtain, sample strip, and animated print slot.
- **Camera:** live preview, film selection, countdown, pose progress, thumbnails, and sound toggle.
- **Print editor:** frame previews, shot selection, backdrop uploads, film controls, captions, and download.

## Custom Backdrops

Use the **+** button in the print editor to choose a backdrop image for the current session.

To replace a built-in backdrop in the project, create a `backgrounds/` directory and add a JPG or PNG named after its ID in `backdrops.js`. For example:

```text
backgrounds/
└── cherry-wave.jpg
```

The app tries JPG first, then PNG, and uses the generated design if neither image is available.

## Privacy

Captured photos and selected image files are processed locally and are not uploaded to a server. The app has no photo history or persistent storage, so download any prints you want to keep before refreshing or closing the page. Fonts are loaded from Google Fonts.

## Project Structure

```text
photobooth/
├── index.html       # Booth illustration and the three app views
├── style.css        # Layout, styling, transitions, and animations
├── app.js           # Camera, capture flow, film processing, sound, and export
├── frames.js        # Canvas renderers for strip and single-photo frames
├── backdrops.js     # Generated backdrops, image loading, and rendering cache
├── vercel.json      # Hosting headers and URL configuration
├── .vercelignore
├── .gitignore
└── README.md
```
