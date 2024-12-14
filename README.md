# DragonFlyBSD DSynth Dashboard

A simple web application that provides insights into the current DSynth build status and build results.

The original application was developed by John R. Marino <draco@marino.st>. This repository has modernized the JavaScript, removed any JavaScript dependencies in favor of vanilla JS, and uses TailwindCSS for a responsive and modern interface.

You can see DsynthDashboard live at https://ironman.dragonflybsd.org/dports/logs/Report/

To use on a live website, the following files are required:
- `index.html`
- `style.css`
- `synth.js`
- `favicon.png`
- `dsynth.png`

## Configuration

The DSynth Dashboard has configurable options at the top of `synth.js`.

```javascript
const CONFIG = {
   API_BASE_URL: '', // Base URL for the API. If empty, defaults to 'https://ironman.dragonflybsd.org'
   PORT: '', // Port number for the API. If empty, it will be omitted from the URL, defaulting to HTTPS
   PATH: '', // Path for the API. If empty, defaults to 'dports/logs/Report'
   POLL_INTERVAL: 10000, // Polling interval in milliseconds (10 seconds)
   HTML_TITLE: 'DSynth Dashboard', // Title for the HTML page
   FOOTER_TEXT: 'DragonFlyBSD. All Rights Reserved.', // Customise the footer text
   SHOW_LOADING_WHEN_ROWS_EXCEED: 2500, // Show loading spinner when rows exceed this number
   DEBOUNCE_DELAY: 300, // Used with search input to debounce input
   RETRY_ATTEMPTS: 3, // Number of retry attempts before giving up getting json data
};
```

### Configuration Details

- `API_BASE_URL`: Set this to your API's base URL. If left empty, it will default to 'https://ironman.dragonflybsd.org'.
- `PORT`: Specify the port number if your API uses a non-standard port. If left empty, the port will be omitted from the URL, effectively defaulting to the standard HTTPS port (443).
- `PATH`: Set this to the specific path for your API endpoints. If left empty, it defaults to 'dports/logs/Report'.
- `POLL_INTERVAL`: The interval (in milliseconds) at which the dashboard will poll for updates.
- `HTML_TITLE`: The title that will be displayed in the browser tab.
- `FOOTER_TEXT`: The text that will be displayed in the footer of the dashboard. It will always be prepended with the current year and copyright symbol.
- `SHOW_LADING_WHEN_ROWS_EXCEED`: Number of table rows above which the loading spinner will be shown during sorting/filtering operations (default: 2500).
- `DEBOUNCE_DELAY`: Time in milliseconds to wait after the last search input before filtering results (default: 300ms).
- `RETRY_ATTEMPTS`: Number of retry attempts for fetching JSON data before giving up (default: 3).

## Development

A precompiled CSS file is provided. However, if you are developing with TailwindCSS, you'll need to follow these steps to build and maintain the `style.css` file.

### Prerequisites

- Node.js
- npm

### Installation

1. Install the required dependencies:
    ```sh
    npm install
    ```

### Building the CSS

There are several npm commands available for working with the Tailwind CSS:

1. One-time build:
    ```sh
    npm run build
    ```

2. Development mode with auto-rebuild on changes:
    ```sh
    npm run dev
    ```

The build process watches for changes in the `index.html` and `synth.js` files and outputs the compiled CSS to `style.css`. The CSS is automatically minified in production builds.

The source CSS file with Tailwind directives is located at `src/input.css`.

## License

This project is licensed under the MIT License. See the LICENSE file for details.
