# DragonFlyBSD DSynth Dashboard

A simple web application that provides insights to the current DSynth build status and build results.

The original application was developed by John R. Marino <draco@marino.st>. This repository has modernised the javascript, removed any javascript dependencies in favour of vanilla js and uses TailwindCSS for a responsive and modern interface. 

To use on a live website the following files are required:
- `index.html`
- `style.css`
- `synth.js`
- `favicon.png`
- `dsynth.png`

## Configuration

The DSynth Dashboard has some configurable options at the top of `synth.js`.

```javascript
const CONFIG = {
    API_BASE_URL: 'http://localhost', // Replace with actual API base URL
    PORT: 8899, // Port number for the API, if this value is empty it will default to the HTTPS.
    POLL_INTERVAL: 10000, // Polling interval in milliseconds (10 seconds)
};
```

# Development

A precompiled CSS file is provided, however if you are developing with TailwindCSS you will need to do the following to build the final `style.css` file or keep it up to date when developing.

## Prerequisites
- Node.js
- npm
- npx

## Installation
1. Install the required dependencies from `package.json`:
    ```sh
    npm install
    ```

## Building the Tailwind CSS File
1. Run the following command to build the `tailwindcss` `style.css` file:
    ```sh
    npx tailwindcss -i ./input.css -o ./style.css --watch --minify
    ```

This command will watch for changes in the `index.html` and `synth.js` file and output the compiled CSS to `style.css`. Remove the `--watch` argument if you just want to compile the file.
