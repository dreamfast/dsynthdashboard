/*
 * Copyright (c) 2024, Nathan Sapwell <nathan@dreamfast.solutions>
 * Copyright (c) 2015-2017, John R. Marino <draco@marino.st>
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 */

// Config object for API settings
const CONFIG = {
    API_BASE_URL: '', // Will default to 'https://ironman.dragonflybsd.org' if empty
    PORT: '', // Will be omitted from the URL if empty, defaulting to HTTPS
    PATH: '', // Will default to 'dports/logs/Report' if empty
    POLL_INTERVAL: 10000, // 10 seconds
    HTML_TITLE: 'DSynth Dashboard'
};

// State object to manage application state
const state = {
    runActive: false,
    kFiles: 0,
    history: [],
    currentStatus: 'queued',
    buildInProgress: false,
    sortDirection: null, // null for default, 'asc' for ascending, 'desc' for descending
    sortColumn: null,
    userSwitchedTab: false
};

// Helper Functions

/**
 * Generates a URL with the given endpoint, including the base URL, port, and path from the CONFIG object.
 * Adds a timestamp query parameter to prevent caching.
 *
 * @param {string} [endpoint=''] - The endpoint to append to the base URL and path.
 * @returns {string} - The fully constructed URL with the timestamp query parameter.
 */
const generateUrl = (endpoint = '') => {
    const baseUrl = CONFIG.API_BASE_URL || 'https://ironman.dragonflybsd.org';
    const port = CONFIG.PORT ? `:${CONFIG.PORT}` : '';
    const path = CONFIG.PATH || 'dports/logs/Report';
    const url = `${baseUrl}${port}/${path}/${endpoint}`.replace(/([^:]\/)\/+/g, "$1");
    return `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`;
};

/**
 * Generates an HTML badge element for a given build phase.
 *
 * @param {string} phase - The current build phase.
 * @returns {string} - The HTML string for the badge element with appropriate styling.
 */
const getBuildPhaseBadge = (phase) => {
    const badgeClasses = {
        'Idle': 'bg-gray-100 text-gray-800',
        'build': 'bg-green-100 text-green-800',
        'install-pkgs': 'bg-yellow-100 text-yellow-800',
        'extract': 'bg-purple-100 text-purple-800'
    };
    const defaultClasses = 'bg-blue-100 text-blue-800';

    return `<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${badgeClasses[phase] || defaultClasses}">
        ${phase}
    </span>`;
};

/**
 * Returns the color associated with a given status key.
 *
 * @param {string} key - The status key.
 * @returns {string} - The color associated with the status key.
 */
const getStatColor = (key) => {
    const colors = {
        queued: 'gray',
        built: 'green',
        meta: 'purple',
        failed: 'red',
        ignored: 'blue',
        skipped: 'yellow'
    };
    return colors[key] || 'gray';
};

/**
 * Returns the CSS class for a table row based on the result status.
 *
 * @param {string} result - The result status.
 * @returns {string} - The CSS class for the table row.
 */
const getRowClass = (result) => {
    const classes = {
        built: 'bg-green-100',
        failed: 'bg-red-100',
        skipped: 'bg-yellow-100',
        ignored: 'bg-blue-100',
        meta: 'bg-purple-100'
    };
    return classes[result] || 'bg-gray-100';
};

/**
 * Returns the CSS class for a result badge based on the result status.
 *
 * @param {string} result - The result status.
 * @returns {string} - The CSS class for the result badge.
 */
const getResultClass = (result) => {
    const classes = {
        built: 'bg-green-500',
        failed: 'bg-red-500',
        skipped: 'bg-yellow-500',
        ignored: 'bg-blue-500',
        meta: 'bg-purple-500'
    };
    return classes[result] || 'bg-gray-500';
};

/**
 * Generates a hyperlink to the FreshPorts page for a given origin.
 *
 * @param {string} origin - The origin in the format 'category/portName'.
 * @returns {string} - The formatted HTML string with the hyperlink.
 */
const portsMon = (origin) => {
    const [category, portName] = origin.split('/');
    return `<a class="text-blue-600 hover:underline" title="portsmon for ${origin}" href="https://www.freshports.org/${category}/${portName.split('@')[0]}">${origin}</a>`;
};

/**
 * Truncates the given text to the specified maximum length, appending '...' if truncated.
 *
 * @param {string} text - The text to truncate.
 * @param {number} maxLength - The maximum length of the truncated text.
 * @returns {string} - The truncated text.
 */
const truncateText = (text, maxLength) =>
    text.length <= maxLength ? text : text.substr(0, maxLength) + '...';

/**
 * Checks if the given text contains an 'href=' attribute.
 *
 * @param {string} text - The text to check.
 * @returns {boolean} - True if the text contains 'href=', false otherwise.
 */
const containsHref = (text) => text.includes('href=');

/**
 * Generates a URL for the log file of the given origin.
 *
 * @param {string} origin - The origin in the format 'category/portName'.
 * @returns {string} - The URL for the log file.
 */
const logFile = (origin) => {
    const [category, name] = origin.split('/');
    return generateUrl(`../${category}___${name}.log`);
};

// UI Update Functions

/**
 * Switches the active tab to the specified tab name.
 *
 * @param {string} tabName - The name of the tab to switch to.
 */
const switchTab = (tabName) => {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.add('hidden'));
    document.getElementById(tabName).classList.remove('hidden');

    document.querySelectorAll('.tab-link').forEach(link => {
        link.classList.remove('border-blue-500', 'text-blue-600');
        link.classList.add('text-gray-500', 'hover:text-gray-700', 'hover:border-gray-300');
    });
    const activeLink = document.querySelector(`.tab-link[data-tab="${tabName}"]`);
    activeLink.classList.add('border-blue-500', 'text-blue-600');
    activeLink.classList.remove('text-gray-500', 'hover:text-gray-700', 'hover:border-gray-300');
    state.userSwitchedTab = true;
};

/**
 * Updates the progress bar based on the provided statistics.
 *
 * @param {Object} stats - The statistics object containing counts for each status.
 */
const updateProgressBar = (stats) => {
    const progressBar = document.getElementById('progress-bar');
    const total = stats.queued + stats.built + stats.meta + stats.failed + stats.ignored + stats.skipped;

    if (total === 0) {
        progressBar.style.display = 'none';
        return;
    }

    progressBar.style.display = 'flex';

    const updateSection = (id) => {
        const element = document.getElementById(`progress-${id}`);
        if (element) {
            const percentage = (stats[id] / total) * 200;
            element.style.width = `${percentage}%`;
        }
    };

    ['built', 'meta', 'failed', 'ignored', 'skipped'].forEach(updateSection);
};


/**
 * Creates an HTML badge element for a given status key, value, and color.
 *
 * @param {string} key - The status key.
 * @param {number} value - The value associated with the status key.
 * @param {string} color - The color associated with the status key.
 * @returns {string} - The HTML string for the badge element.
 */
const createBadge = (key, value, color) =>
    `<span id="stats_${key}" class="px-2 py-1 rounded-full bg-${color}-100 text-${color}-800 text-xs font-medium cursor-pointer filterable" onclick="handleStatusFilter('${key}')">${key.charAt(0).toUpperCase() + key.slice(1)}: ${value}</span>`;

/**
 * Updates the display of statistics badges and additional stats.
 *
 * @param {Object} stats - The statistics object containing counts for each status and additional stats.
 */
const updateStatsDisplay = (stats) => {
    const statsContainer = document.getElementById('stats');
    const additionalStatsContainer = document.getElementById('additional_stats');

    statsContainer.innerHTML = '';
    additionalStatsContainer.innerHTML = '';

    const mainStats = ['queued', 'built', 'meta', 'failed', 'ignored', 'skipped'];
    const colors = ['gray', 'green', 'purple', 'red', 'blue', 'yellow'];

    mainStats.forEach((key, index) => {
        statsContainer.innerHTML += createBadge(key, stats[key], colors[index]);
    });

    ['remains', 'load', 'swapinfo', 'elapsed', 'pkghour', 'impulse'].forEach(key => {
        additionalStatsContainer.innerHTML += `<div><span class="font-bold">${key.charAt(0).toUpperCase() + key.slice(1)}:</span> <span id="stats_${key}">${stats[key]}</span></div>`;
    });

    if (state.currentStatus) {
        updateSelectedStat(state.currentStatus);
    }
};

/**
 * Updates the selected status badge to highlight the current status.
 *
 * @param {string} status - The current status to highlight.
 */
const updateSelectedStat = (status) => {
    document.querySelectorAll('.filterable').forEach(badge => {
        const key = badge.id.split('_')[1];
        const colorClass = `bg-${getStatColor(key)}-${key === status ? '300' : '100'}`;
        badge.classList.remove('bg-gray-100', 'bg-green-100', 'bg-purple-100', 'bg-red-100', 'bg-blue-100', 'bg-yellow-100', 'bg-gray-300', 'bg-green-300', 'bg-purple-300', 'bg-red-300', 'bg-blue-300', 'bg-yellow-300');
        badge.classList.add(colorClass);
    });
};

/**
 * Updates the builders table with the provided builders data.
 *
 * @param {Array} builders - The array of builder objects.
 */
const updateBuildersTable = (builders) => {
    const tableBody = document.querySelector('#builders_body');
    const fragment = document.createDocumentFragment();

    builders.forEach(builder => {
        const row = document.createElement('tr');
        row.className = builder.phase === 'Idle' ? 'bg-gray-50' : 'bg-white';
        row.innerHTML = `
            <td class="px-1 py-1 whitespace-nowrap">
                <span class="px-2 inline-flex text-xs leading-5 font-bold">
                    ${builder.ID}
                </span>
            </td>
            <td class="px-1 py-1 whitespace-nowrap text-sm text-gray-500">${builder.elapsed}</td>
            <td class="px-1 py-1 whitespace-nowrap">
                ${getBuildPhaseBadge(builder.phase)}
            </td>
            <td class="px-1 py-1 whitespace-nowrap text-sm text-gray-500">${builder.origin || '-'}</td>
            <td class="px-1 py-1 whitespace-nowrap text-sm text-gray-500">${builder.lines || '-'}</td>
        `;
        fragment.appendChild(row);
    });

    tableBody.innerHTML = '';
    tableBody.appendChild(fragment);
};

/**
 * Updates the sort icon based on the current sort state.
 */
const updateSortIcon = () => {
    const sortIcon = document.getElementById('skipSortIcon');
    sortIcon.textContent = state.sortColumn === 'skip' ? (state.sortDirection === 'asc' ? '▲' : '▼') : '⇅';
};

/**
 * Updates the build report table with the provided filtered and sorted history data.
 *
 * @param {Array} filteredAndSortedHistory - The array of filtered and sorted history objects.
 */
const updateBuildReportTable = (filteredAndSortedHistory) => {
    const reportBody = document.getElementById('report_body');
    const fragment = document.createDocumentFragment();

    filteredAndSortedHistory.forEach((item) => {
        const row = document.createElement('tr');
        row.className = getRowClass(item.result);
        row.innerHTML = `
            <td class="p-2">${item.originalIndex}</td>
            <td class="p-2">${item.elapsed}</td>
            <td class="p-2">[${item.ID}]</td>
            <td class="p-2"><span class="inline-block px-2 py-1 text-xs font-bold text-white ${getResultClass(item.result)} rounded">${item.result}</span></td>
            <td class="p-2">${portsMon(item.origin)}</td>
            <td class="p-2 relative">${information(item.result, item.origin, item.info)}</td>
            <td class="p-2">${skipInfo(item.result, item.info)}</td>
            <td class="p-2">${item.duration}</td>
        `;
        fragment.appendChild(row);
    });

    reportBody.innerHTML = '';
    reportBody.appendChild(fragment);

    applyInfoTextListeners();

    const searchValue = document.getElementById('search').value.toLowerCase();
    filterRows(searchValue, state.currentStatus);
};

// Event Handlers

/**
 * Handles the search input event to filter rows based on the search value.
 *
 * @param {Event} e - The input event.
 */
const handleSearch = (e) => {
    const searchValue = e.target.value.toLowerCase();
    filterRows(searchValue, state.currentStatus);
};

/**
 * Handles the status filter selection, updates the current status, filters and sorts the build history,
 * updates the build report table, and updates the document title with the current status.
 *
 * @param {string} status - The selected status filter.
 */
const handleStatusFilter = (status) => {
    state.currentStatus = status;
    const buildHistory = state.history.flat();
    const filteredAndSortedHistory = filterAndSortHistory(buildHistory);
    updateBuildReportTable(filteredAndSortedHistory);
    updateSelectedStat(status);
    switchTab('build-report');

    const searchValue = document.getElementById('search').value.toLowerCase();
    filterRows(searchValue, status);

    const statBadge = document.getElementById(`stats_${status}`);
    if (statBadge) {
        const trimmedText = statBadge.textContent.split(':')[0].trim();
        document.title = `${CONFIG.HTML_TITLE} - ${trimmedText}`;
    }
};

/**
 * Handles the sorting of the build history by the 'skip' column, toggling the sort direction.
 */
const handleSkipSort = () => {
    if (state.sortColumn === 'skip') {
        state.sortDirection = state.sortDirection === 'asc' ? 'desc' : null;
        state.sortColumn = state.sortDirection ? 'skip' : null;
    } else {
        state.sortColumn = 'skip';
        state.sortDirection = 'asc';
    }

    const buildHistory = state.history.flat();
    const filteredAndSortedHistory = filterAndSortHistory(buildHistory);
    updateBuildReportTable(filteredAndSortedHistory);
    updateSortIcon();
};

// Data Processing Functions

/**
 * Filters rows based on the search value and status.
 *
 * @param {string} searchValue - The search value to filter rows.
 * @param {string} status - The status to filter rows.
 */
const filterRows = (searchValue, status) => {
    const rows = document.querySelectorAll('#report_body tr');

    rows.forEach(row => {
        const rowText = Array.from(row.cells)
            .filter((_, index) => index !== 3)
            .reduce((text, cell) => text + ' ' + cell.textContent.toLowerCase(), '');

        const statusText = row.cells[3].textContent.trim().toLowerCase();

        const matchesSearch = searchValue === '' || rowText.includes(searchValue);
        const matchesStatus = status === 'queued' || statusText === status;

        row.style.display = (matchesSearch && matchesStatus) ? '' : 'none';
    });
};

/**
 * Sorts the build history by the 'skip' column.
 *
 * @param {Array} buildHistory - The build history array.
 * @returns {Array} - The sorted build history array.
 */
const sortBySkip = (buildHistory) =>
    buildHistory.sort((a, b) => {
        const skipA = parseInt(skipInfo(a.result, a.info)) || 0;
        const skipB = parseInt(skipInfo(b.result, b.info)) || 0;
        return state.sortDirection === 'asc' ? skipA - skipB : skipB - skipA;
    });

/**
 * Filters and sorts the build history based on the current status and sort settings.
 *
 * @param {Array} buildHistory - The build history array.
 * @returns {Array} - The filtered and sorted build history array.
 */
const filterAndSortHistory = (buildHistory) => {
    let indexedHistory = buildHistory.map((item, index) => ({...item, originalIndex: index + 1}));

    if (state.currentStatus !== 'queued') {
        indexedHistory = indexedHistory.filter(item => item.result.toLowerCase() === state.currentStatus);
    }

    if (state.sortColumn === 'skip' && state.sortDirection) {
        indexedHistory = sortBySkip(indexedHistory);
    }

    return indexedHistory;
};

/**
 * Processes the summary data and updates the application state and UI.
 *
 * @param {Object} data - The summary data object.
 */
const processSummary = (data) => {
    state.kFiles = parseInt(data.kfiles);
    state.runActive = parseInt(data.active);

    document.getElementById('profile').textContent = data.profile;
    document.getElementById('kickoff').textContent = new Date(data.kickoff).toLocaleString();
    document.getElementById('polling').textContent = state.runActive ? "Active" : "Complete";

    if (data.stats) {
        updateStatsDisplay(data.stats);
        updateProgressBar(data.stats);
    }

    updateBuildersTable(data.builders);

    const activeBuilder = data.builders.find(builder => builder.phase !== "Idle");
    if (activeBuilder) {
        state.buildInProgress = true;
        if (!state.userSwitchedTab) {
            switchTab('progress-builders');
        }
    } else if (state.buildInProgress) {
        state.buildInProgress = false;
        if (!state.userSwitchedTab) {
            switchTab('build-report');
        }
    }
};

/**
 * Processes the history data and updates the application state and UI.
 *
 * @param {Array} historyData - The history data array.
 */
const processHistory = (historyData) => {
    state.history = historyData;
    const buildHistory = historyData.flat();
    const filteredAndSortedHistory = filterAndSortHistory(buildHistory);
    updateBuildReportTable(filteredAndSortedHistory);

    updateSortIcon();

    if (state.currentStatus !== 'queued') {
        filterRows(document.getElementById('search').value.toLowerCase(), state.currentStatus);
    }
};

// API Functions

/**
 * Fetches data from the given URL with retry logic.
 *
 * @param {string} url - The URL to fetch data from.
 * @param {number} [retries=3] - The number of retry attempts.
 * @returns {Promise<Object>} - The fetched data as a JSON object.
 * @throws {Error} - Throws an error if all retry attempts fail.
 */
const fetchWithRetry = async (url, retries = 3) => {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error(`Attempt ${i + 1} failed: ${error}`);
            if (i === retries - 1) throw error;
        }
    }
};

/**
 * Fetches the summary data.
 *
 * @returns {Promise<Object>} - The summary data as a JSON object.
 */
const fetchSummary = () => fetchWithRetry(generateUrl('summary.json'));

/**
 * Fetches the history data for the given number of files.
 *
 * @param {number} kFiles - The number of history files to fetch.
 * @returns {Promise<Array>} - An array of history data objects.
 */
const fetchHistory = async (kFiles) => {
    const fetchPromises = Array.from({length: kFiles}, (_, i) => {
        const fileName = String(i + 1).padStart(2, '0') + '_history.json';
        return fetchWithRetry(generateUrl(fileName));
    });
    return Promise.all(fetchPromises);
};

// Application Initialization

/**
 * Initializes the application by fetching summary and history data, processing the data,
 * and setting up event listeners and UI elements.
 *
 * - Fetches summary data and processes it.
 * - Fetches history data and processes it.
 * - Displays the build information and hides the loading indicator.
 * - Sets up event listeners for search input and tab links.
 * - Switches to the appropriate tab based on the active builder.
 * - Polls for new summary data if a build is in progress.
 * - Updates the document title with the current status.
 *
 * @async
 * @function initializeApp
 * @throws {Error} If initialization fails, an error message is displayed.
 */
const initializeApp = async () => {
    try {
        const summaryData = await fetchSummary();
        processSummary(summaryData);

        const historyData = await fetchHistory(state.kFiles);
        processHistory(historyData);

        document.getElementById('build_info').style.display = 'block';
        document.getElementById('loading_stats_build').style.display = 'none';

        document.getElementById('search').addEventListener('input', handleSearch);

        document.querySelectorAll('.tab-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                switchTab(e.target.getAttribute('data-tab'));
            });
        });

        const activeBuilder = summaryData.builders.find(builder => builder.phase !== "Idle");
        switchTab(activeBuilder ? 'progress-builders' : 'build-report');
        state.userSwitchedTab = false;

        if (state.buildInProgress) {
            const pollData = async () => {
                const newSummary = await fetchSummary();
                processSummary(newSummary);

                if (state.buildInProgress) {
                    setTimeout(pollData, CONFIG.POLL_INTERVAL);
                }
            };
            await pollData();
        }

        document.title = `${CONFIG.HTML_TITLE} - ${state.currentStatus.charAt(0).toUpperCase() + state.currentStatus.slice(1)}`;

    } catch (error) {
        console.error('Initialization failed:', error);
        const errorMessageElement = document.getElementById('error-message');
        if (errorMessageElement) {
            errorMessageElement.textContent = 'Failed to load data. Please try refreshing the page.';
            errorMessageElement.style.display = 'block';
        }
    }
};

// Event Listeners

document.addEventListener('DOMContentLoaded', initializeApp);

// Additional Helper Functions

/**
 * Generates the information content based on the result, origin, and info.
 *
 * @param {string} result - The result status.
 * @param {string} origin - The origin of the build.
 * @param {string} info - Additional information about the build.
 * @returns {string} - The formatted HTML string for the information content.
 */
function information(result, origin, info) {
    let content;
    switch (result) {
        case "meta":
            content = 'meta-node complete.';
            break;
        case "built":
            content = `<a class="text-blue-600 hover:underline" href="${logFile(origin)}">logfile</a>`;
            break;
        case "failed":
            const [phase] = info.split(':');
            content = `Failed ${phase} phase (<a class="text-blue-600 hover:underline" href="${logFile(origin)}">logfile</a>)`;
            break;
        case "skipped":
            content = `Issue with ${info}`;
            break;
        case "ignored":
            const [reason] = info.split(':|:');
            content = reason;
            break;
        default:
            content = "??";
    }

    if (!containsHref(content)) {
        const truncated = truncateText(content, 255);
        return `<span class="info-text cursor-pointer block truncate" data-full="${content}" title="${content}">${truncated}</span>`;
    } else {
        return content;
    }
}

/**
 * Extracts skip information from the result and info.
 *
 * @param {string} result - The result status.
 * @param {string} info - Additional information about the build.
 * @returns {string} - The extracted skip information.
 */
function skipInfo(result, info) {
    switch (result) {
        case "failed":
            const [, details] = info.split(':');
            return details;
        case "ignored":
            const [, skipReason] = info.split(':|:');
            return skipReason;
        default:
            return "";
    }
}

/**
 * Applies click event listeners to elements with the 'info-text' class to toggle text truncation.
 */
function applyInfoTextListeners() {
    document.querySelectorAll('.info-text').forEach(span => {
        span.addEventListener('click', function () {
            const fullText = this.getAttribute('data-full');
            if (this.classList.contains('truncate')) {
                this.textContent = fullText;
                this.classList.remove('truncate');
                this.classList.add('whitespace-normal', 'break-words');
            } else {
                this.textContent = truncateText(fullText, 255);
                this.classList.add('truncate');
                this.classList.remove('whitespace-normal', 'break-words');
            }
        });
    });
}
