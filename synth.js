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
let state = {
    runActive: false,
    kFiles: 0,
    lastKFile: 1,
    history: [[]],
    currentStatus: 'queued',
    buildInProgress: false,
    sortDirection: null, // null for default, 'asc' for ascending, 'desc' for descending
    sortColumn: null,
    userSwitchedTab: false
};


/**
 * Generates a URL based on the current configuration settings.
 *
 * @param {string} [endpoint=''] - The specific endpoint to append to the URL.
 * @returns {string} The complete URL with the base URL, port (if specified), path, and endpoint.
 *
 */
function generateUrl(endpoint = '') {
    const baseUrl = CONFIG.API_BASE_URL || 'https://ironman.dragonflybsd.org';
    const port = CONFIG.PORT ? `:${CONFIG.PORT}` : '';
    const path = CONFIG.PATH || 'dports/logs/Report';
    const timestamp = Date.now(); // Current Unix timestamp in milliseconds
    const url = `${baseUrl}${port}/${path}/${endpoint}`.replace(/([^:]\/)\/+/g, "$1");
    return `${url}${url.includes('?') ? '&' : '?'}t=${timestamp}`;
}

/**
 * Switches between tabs in the UI
 * @param {string} tabName - The name of the tab to switch to
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
 * Updates the progress bar based on build statistics
 * @param {Object} stats - Object containing build statistics
 */
const updateProgressBar = (stats) => {
    const total = stats.queued + stats.built + stats.meta + stats.failed + stats.ignored + stats.skipped;

    if (total === 0) {
        document.getElementById('progress-bar').style.display = 'none';
        return;
    }

    document.getElementById('progress-bar').style.display = 'flex';

    const updateSection = (id, value) => {
        const element = document.getElementById(`progress-${id}`);
        if (element) {
            const percentage = (value / total) * 200;
            element.style.width = `${percentage}%`;
        } else {
            console.warn(`Progress bar element with id 'progress-${id}' not found.`);
        }
    };

    ['built', 'meta', 'failed', 'ignored', 'skipped'].forEach(id => updateSection(id, stats[id]));
};

/**
 * Creates a badge element for displaying statistics
 * @param {string} key - The key of the statistic
 * @param {number} value - The value of the statistic
 * @param {string} color - The color of the badge
 * @returns {string} HTML string for the badge
 */
const createBadge = (key, value, color) => {
    return `<span id="stats_${key}" class="px-2 py-1 rounded-full bg-${color}-100 text-${color}-800 text-xs font-medium cursor-pointer filterable" onclick="handleStatusFilter('${key}')">${key.charAt(0).toUpperCase() + key.slice(1)}: ${value}</span>`;
};

/**
 * Updates the statistics display in the UI
 * @param {Object} stats - Object containing build statistics
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

    const additionalStats = ['remains', 'load', 'swapinfo', 'elapsed', 'pkghour', 'impulse'];
    additionalStats.forEach(key => {
        additionalStatsContainer.innerHTML += `<div><span class="font-bold">${key.charAt(0).toUpperCase() + key.slice(1)}:</span> <span id="stats_${key}">${stats[key]}</span></div>`;
    });

    // Update the selected stat if there is one
    if (state.currentStatus) {
        updateSelectedStat(state.currentStatus);
    }
};

/**
 * Updates the selected stat badge
 * @param {string} status - The selected status
 */
const updateSelectedStat = (status) => {
    const statBadges = document.querySelectorAll('.filterable');
    statBadges.forEach(badge => {
        const key = badge.id.split('_')[1];
        if (key === status) {
            badge.classList.remove('bg-gray-100', 'bg-green-100', 'bg-purple-100', 'bg-red-100', 'bg-blue-100', 'bg-yellow-100');
            badge.classList.add(`bg-${getStatColor(key)}-300`);
        } else {
            badge.classList.remove('bg-gray-300', 'bg-green-300', 'bg-purple-300', 'bg-red-300', 'bg-blue-300', 'bg-yellow-300');
            badge.classList.add(`bg-${getStatColor(key)}-100`);
        }
    });
};

/**
 * Gets the color for a specific stat
 * @param {string} key - The key of the statistic
 * @returns {string} The color associated with the stat
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
 * Updates the builders table in the UI
 * @param {Array} builders - Array of builder objects
 */
const updateBuildersTable = (builders) => {
    const tableBody = document.querySelector('#builders_body');
    const fragment = document.createDocumentFragment();

    builders.forEach(builder => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="p-2 b${builder.ID}" onclick="filter('[${builder.ID}]')" title="Click to filter for work done by builder ${builder.ID}">${builder.ID}</td>
            <td class="p-2">${builder.elapsed}</td>
            <td class="p-2">${builder.phase}</td>
            <td class="p-2">${builder.origin}</td>
            <td class="p-2">${builder.lines}</td>
        `;
        fragment.appendChild(row);
    });

    tableBody.innerHTML = '';
    tableBody.appendChild(fragment);
};

/**
 * Fetches data from the API with retry mechanism
 * @param {string} url - The URL to fetch from
 * @param {number} retries - Number of retry attempts
 * @returns {Promise} Resolved with JSON data or rejected with error
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
 * Fetches the summary data from the API
 * @returns {Promise} Resolved with summary data
 */
const fetchSummary = () => fetchWithRetry(generateUrl('summary.json'));

/**
 * Fetches history data from the API
 * @param {number} kFiles - Number of history files to fetch
 * @returns {Promise} Resolved with an array of history data
 */
const fetchHistory = async (kFiles) => {
    const fetchPromises = Array.from({ length: kFiles }, (_, i) => {
        const fileName = String(i + 1).padStart(2, '0') + '_history.json';
        return fetchWithRetry(generateUrl(fileName));
    });
    return Promise.all(fetchPromises);
};

/**
 * Processes the summary data and updates the UI
 * @param {Object} data - The summary data object
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
 * Processes the history data and updates the build report table
 * @param {Array} historyData - Array of history data objects
 */
const processHistory = (historyData) => {
    state.history = historyData;
    const buildHistory = historyData.flat();
    const filteredAndSortedHistory = filterAndSortHistory(buildHistory);
    updateBuildReportTable(filteredAndSortedHistory);

    // Add event listeners for expanding/collapsing information
    document.querySelectorAll('.info-text').forEach(span => {
        span.addEventListener('click', function() {
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

    // Update sort icon
    updateSortIcon();

    // Apply current filter if any
    if (state.currentStatus !== 'queued') {
        filterRows(document.getElementById('search').value.toLowerCase(), state.currentStatus);
    }
};

/**
 * Handles the search input event
 * @param {Event} e - The input event object
 */
const handleSearch = (e) => {
    const searchValue = e.target.value.toLowerCase();
    filterRows(searchValue, state.currentStatus);
};

/**
 * Handles the status filter selection
 * @param {string} status - The selected status filter
 */
const handleStatusFilter = (status) => {
    state.currentStatus = status;
    const buildHistory = state.history.flat();
    const filteredAndSortedHistory = filterAndSortHistory(buildHistory);
    updateBuildReportTable(filteredAndSortedHistory);
    updateSelectedStat(status);
    switchTab('build-report');

    // Update the document title with the current stat
    const statBadge = document.getElementById(`stats_${status}`);
    if (statBadge) {
        const trimmedText = statBadge.textContent.split(':')[0].trim();
        document.title = `${CONFIG.HTML_TITLE} - ${trimmedText}`;
    }
};

/**
 * Updates the sort icon in the Skip column header
 */
function updateSortIcon() {
    const sortIcon = document.getElementById('skipSortIcon');
    if (state.sortColumn === 'skip') {
        sortIcon.textContent = state.sortDirection === 'asc' ? '▲' : '▼';
    } else {
        sortIcon.textContent = '⇅';
    }
}

/**
 * Filters the table rows based on search value and status
 * @param {string} searchValue - The search input value
 * @param {string} status - The selected status filter
 */
const filterRows = (searchValue, status) => {
    const rows = document.querySelectorAll('#report_body tr');

    rows.forEach(row => {
        const rowText = Array.from(row.cells)
            .filter((_, index) => index !== 3)
            .reduce((text, cell) => text + ' ' + cell.textContent.toLowerCase(), '');

        const statusCell = row.cells[3];
        const statusText = statusCell.textContent.trim().toLowerCase();

        const matchesSearch = rowText.includes(searchValue);
        const matchesStatus = status === 'queued' || statusText === status;

        row.style.display = (matchesSearch && matchesStatus) ? '' : 'none';
    });
};

/**
 * Sorts the build history based on the Skip column
 * @param {Array} buildHistory - The array of build history items
 * @returns {Array} Sorted build history array
 */
function sortBySkip(buildHistory) {
    return buildHistory.sort((a, b) => {
        const skipA = parseInt(skipInfo(a.result, a.info)) || 0;
        const skipB = parseInt(skipInfo(b.result, b.info)) || 0;

        if (state.sortDirection === 'asc') {
            return skipA - skipB;
        } else {
            return skipB - skipA;
        }
    });
}

/**
 * Handles the click event on the Skip column header
 */
function handleSkipSort() {
    if (state.sortColumn === 'skip') {
        if (state.sortDirection === 'asc') {
            state.sortDirection = 'desc';
        } else if (state.sortDirection === 'desc') {
            state.sortColumn = null;
            state.sortDirection = null;
        }
    } else {
        state.sortColumn = 'skip';
        state.sortDirection = 'asc';
    }

    const buildHistory = state.history.flat();
    const filteredAndSortedHistory = filterAndSortHistory(buildHistory);
    updateBuildReportTable(filteredAndSortedHistory);
    updateSortIcon();
}

/**
 * Filters and sorts the build history based on current state
 * @param {Array} buildHistory - The full build history array
 * @returns {Array} Filtered and sorted build history array
 */
/**
 * Filters and sorts the build history based on current state
 * @param {Array} buildHistory - The full build history array
 * @returns {Array} Filtered and sorted build history array
 */
function filterAndSortHistory(buildHistory) {
    // Add original index to each item
    let indexedHistory = buildHistory.map((item, index) => ({...item, originalIndex: index + 1}));

    // Filter by current status
    let filteredHistory = indexedHistory;
    if (state.currentStatus !== 'queued') {
        filteredHistory = indexedHistory.filter(item => item.result.toLowerCase() === state.currentStatus);
    }

    // Sort if necessary
    if (state.sortColumn === 'skip' && state.sortDirection) {
        filteredHistory = sortBySkip(filteredHistory);
    }

    return filteredHistory;
}

/**
 * Updates the build report table with filtered and sorted data
 * @param {Array} filteredAndSortedHistory - The filtered and sorted build history array
 */
function updateBuildReportTable(filteredAndSortedHistory) {
    const reportBody = document.getElementById('report_body');
    const fragment = document.createDocumentFragment();

    filteredAndSortedHistory.forEach((item, index) => {
        const row = document.createElement('tr');
        row.className = `${getRowClass(item.result)}`;
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
}


/**
 * Creates a table row for a build history item
 * @param {Object} item - The build history item
 * @param {number} index - The row index
 * @returns {HTMLTableRowElement} The created table row
 */
function createTableRow(item, index) {
    const row = document.createElement('tr');
    row.className = `${getRowClass(item.result)}`;
    row.innerHTML = `
        <td class="p-2">${index}</td>
        <td class="p-2">${item.elapsed}</td>
        <td class="p-2">[${item.ID}]</td>
        <td class="p-2"><span class="inline-block px-2 py-1 text-xs font-bold text-white ${getResultClass(item.result)} rounded">${item.result}</span></td>
        <td class="p-2">${portsMon(item.origin)}</td>
        <td class="p-2 relative">${information(item.result, item.origin, item.info)}</td>
        <td class="p-2">${skipInfo(item.result, item.info)}</td>
        <td class="p-2">${item.duration}</td>
    `;
    return row;
}

/**
 * Initializes the application
 */
const initializeApp = async () => {
    try {
        const summaryData = await fetchSummary();
        processSummary(summaryData);

        const historyData = await fetchHistory(state.kFiles);
        processHistory(historyData);

        document.getElementById('build_info').style.display = 'block';
        document.getElementById('loading_stats_build').style.display = 'none';

        // Set up event listeners
        document.getElementById('search').addEventListener('input', handleSearch);

        // Set up tab switching
        document.querySelectorAll('.tab-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                switchTab(e.target.getAttribute('data-tab'));
            });
        });

        const activeBuilder = summaryData.builders.find(builder => builder.phase !== "Idle");
        if (activeBuilder) {
            switchTab('progress-builders');
        } else {
            switchTab('build-report');
        }
        state.userSwitchedTab = false; // Reset after initial tab selection

        // Set up polling
        const pollData = async () => {
            const newSummary = await fetchSummary();
            processSummary(newSummary);

            if (state.buildInProgress) {
                setTimeout(pollData, CONFIG.POLL_INTERVAL);
            }
        };

        if (state.buildInProgress) {
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


// Event listener for DOMContentLoaded
document.addEventListener('DOMContentLoaded', initializeApp);

// Helper functions
/**
 * Gets the CSS class for a table row based on the build result
 * @param {string} result - The build result
 * @returns {string} The CSS class for the row
 */
function getRowClass(result) {
    const classes = {
        built: 'bg-green-100',
        failed: 'bg-red-100',
        skipped: 'bg-yellow-100',
        ignored: 'bg-blue-100',
        meta: 'bg-purple-100'
    };
    return classes[result] || 'bg-gray-100';
}

/**
 * Gets the CSS class for the result badge based on the build result
 * @param {string} result - The build result
 * @returns {string} The CSS class for the badge
 */
function getResultClass(result) {
    const classes = {
        built: 'bg-green-500',
        failed: 'bg-red-500',
        skipped: 'bg-yellow-500',
        ignored: 'bg-blue-500',
        meta: 'bg-purple-500'
    };
    return classes[result] || 'bg-gray-500';
}

/**
 * Formats the entry for display in the table
 * @param {string} entry - The entry name
 * @param {string} origin - The origin of the entry
 * @returns {string} Formatted HTML for the entry
 */
function formatEntry(entry, origin) {
    return `<span class="entry cursor-pointer text-blue-600 hover:underline" onclick="filter('${origin}')">${entry}</span>`;
}

/**
 * Generates a link to the FreshPorts page for the given origin
 * @param {string} origin - The origin of the port
 * @returns {string} Formatted HTML for the FreshPorts link
 */
function portsMon(origin) {
    const [category, name] = origin.split('/');
    const [portName] = name.split('@');
    return `<a class="text-blue-600 hover:underline" title="portsmon for ${origin}" href="https://www.freshports.org/${category}/${portName}">${origin}</a>`;
}
/**
 * Truncates text to a specified length
 * @param {string} text - The text to truncate
 * @param {number} maxLength - The maximum length of the truncated text
 * @returns {string} Truncated text with ellipsis if necessary
 */
function truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substr(0, maxLength) + '...';
}

/**
 * Checks if a string contains an href attribute
 * @param {string} text - The text to check
 * @returns {boolean} True if the text contains an href, false otherwise
 */
function containsHref(text) {
    return text.includes('href=');
}

/**
 * Generates information HTML based on the build result
 * @param {string} result - The build result
 * @param {string} origin - The origin of the port
 * @param {string} info - Additional information
 * @returns {string} Formatted HTML with build information
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
 * Generates skip information HTML based on the build result
 * @param {string} result - The build result
 * @param {string} info - Additional information
 * @returns {string} Formatted HTML with skip information
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
 * Generates the URL for the log file
 * @param {string} origin - The origin of the port
 * @returns {string} URL of the log file
 */
function logFile(origin) {
    const [category, name] = origin.split('/');
    return generateUrl(`../${category}___${name}.log`);
}

/**
 * Global function used in onclick attributes to filter the table
 * @param {string} txt - The text to filter by
 */
function filter(txt) {
    const reportInput = document.querySelector('#report input');
    reportInput.value = txt;
    reportInput.dispatchEvent(new Event('input'));
}
