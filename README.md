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
    FOOTER_TEXT: 'DragonFlyBSD. All Rights Reserved.' // Customise the footer text
};
```

### Configuration Details

- `API_BASE_URL`: Set this to your API's base URL. If left empty, it will default to 'https://ironman.dragonflybsd.org'.
- `PORT`: Specify the port number if your API uses a non-standard port. If left empty, the port will be omitted from the URL, effectively defaulting to the standard HTTPS port (443).
- `PATH`: Set this to the specific path for your API endpoints. If left empty, it defaults to 'dports/logs/Report'.
- `POLL_INTERVAL`: The interval (in milliseconds) at which the dashboard will poll for updates.
- `HTML_TITLE`: The title that will be displayed in the browser tab.

## Development

A precompiled CSS file is provided. However, if you are developing with TailwindCSS you will need to do the following to build the final `style.css` file or keep it up to date when developing.

### Prerequisites
- Node.js
- npm
- npx

### Installation
1. Install the required dependencies from `package.json`:
    ```sh
    npm install
    ```

### Building the Tailwind CSS File
1. Run the following command to build the `tailwindcss` `style.css` file:
    ```sh
    npx tailwindcss -i ./input.css -o ./style.css --watch --minify
    ```

This command will watch for changes in the `index.html` and `synth.js` files and output the compiled CSS to `style.css`. Remove the `--watch` argument if you just want to compile the file once.

## License

This project is licensed under the MIT License. See the LICENSE file for details.
