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
    API_BASE_URL: '', // Will default to the url it's hosted on if empty
    PORT: '', // Will be omitted from the URL if empty, defaulting to HTTPS
    PATH: '', // Will default to 'dports/logs/Report' if empty
    POLL_INTERVAL: 10000, // 10 seconds
    HTML_TITLE: 'DSynth Dashboard',
    FOOTER_TEXT: 'DragonFlyBSD. All Rights Reserved.', // Customise the footer text
    SHOW_LOADING_WHEN_ROWS_EXCEED: 2500, // Show loading spinner when rows exceed this number
    DEBOUNCE_DELAY: 300,
    RETRY_ATTEMPTS: 3,
};

// State object to manage application state
const state = {
    runActive: false,
    kFiles: 0,
    history: [],
    currentStatus: null, // Changed from 'queued' to null to better handle initial state
    buildInProgress: false,
    sortDirection: 'asc',
    sortColumn: null,
    userSwitchedTab: false,
    totalBuilds: 0,
    remaining: 0,
    selectedBuildPhase: null,
    buildPhases: new Map(),
    cachedFilteredData: null,
    lastFilter: null,
    isLoading: false,
    initialDataLoaded: false // New flag to track initial data load
};

// Helper Functions

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
        const truncated = truncateText(content, 80);
        return `<span class="info-text cursor-pointer block truncate hover:whitespace-normal hover:break-words" style="max-width: 100%; transition: all 0.3s ease;" data-full="${content}" title="${content}">${truncated}</span>`;
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
 * Updates the footer text with the current year and configured footer text.
 *
 * - Retrieves the current year.
 * - Selects the footer element by its ID.
 * - Sets the footer text to include the current year and the configured footer text.
 */
function applyFooterText() {
    const currentYear = new Date().getFullYear();
    const footer = document.getElementById('footer');
    footer.textContent = `© ${currentYear} ${CONFIG.FOOTER_TEXT}`;
}


/**
 * Handles errors by logging them to the console and displaying an error message in the UI.
 *
 * @param {Error} error - The error object to handle.
 * @param {string} context - A description of the context in which the error occurred.
 */
const handleError = (error, context) => {
    console.error(`Error in ${context}:`, error);
    const errorElement = document.getElementById('error-message');
    if (errorElement) {
        errorElement.textContent = `Failed to ${context}. Please try refreshing the page.`;
        errorElement.style.display = 'block';
    }
};


/**
 * Creates a debounced function that delays invoking the provided function until after
 * the specified wait time has elapsed since the last time the debounced function was invoked.
 *
 * @param {Function} func - The function to debounce.
 * @param {number} wait - The number of milliseconds to delay.
 * @returns {Function} - The debounced function.
 */
const debounce = (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
        return new Promise((resolve) => {
            const later = async () => {
                clearTimeout(timeout);
                resolve(await func(...args));
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        });
    };
};


/**
 * Sets the loading state for the table and displays or hides the full-screen loader accordingly.
 *
 * @param {boolean} loading - A boolean indicating whether the table is loading.
 */
const setTableLoading = (loading) => {
    document.getElementById('loading_stats_build').style.display = loading ? 'flex' : 'none';
};


/**
 * Handles the selection of a build phase, updates the state, filters and sorts the build history,
 * and updates the build report table.
 *
 * @param {string|null} phase - The selected build phase. If null, all phases are selected.
 */
const handlePhaseSelect = async (phase) => {
    state.selectedBuildPhase = phase;
    const buildHistory = state.history.flat();
    const filteredAndSortedHistory = filterAndSortHistory(buildHistory);
    await updateBuildReportTable(filteredAndSortedHistory);
};


/**
 * Extracts the build phases from the build history and counts the occurrences of each phase.
 *
 * @param {Array} buildHistory - The array of build history objects.
 * @returns {Map<string, number>} - A map of build phases and their counts.
 */
const extractBuildPhases = (buildHistory) => {
    const phases = new Map();

    buildHistory.forEach(item => {
        if (item.result === 'failed') {
            const phase = item.info.split(':')[0];
            phases.set(phase, (phases.get(phase) || 0) + 1);
        }
    });

    return phases;
};


/**
 * Creates the HTML for the phase filter buttons based on the provided phases, counts, and selected phase.
 *
 * @param {Map<string, number>} phases - A map of build phases and their counts.
 * @param {Map<string, number>} counts - A map of build phases and their counts.
 * @param {string|null} selectedPhase - The currently selected build phase. If null, all phases are selected.
 * @returns {string} - The HTML string for the phase filter buttons.
 */
const createPhaseFilter = (phases, counts, selectedPhase) => {
    const buttons = Array.from(phases.keys()).map(phase => `
        <button
            class="px-2 py-1 text-xs font-medium rounded-full ${selectedPhase === phase
        ? 'bg-red-200 text-red-800'
        : 'bg-gray-100 text-gray-800 hover:bg-gray-200'}"
            onclick="handlePhaseSelect('${phase}')"
        >
            ${phase} (${counts.get(phase) || 0})
        </button>
    `).join('');

    return `
        <div class="flex flex-wrap gap-2 p-4 bg-white rounded-lg shadow-sm mb-4">
            <span class="text-sm font-medium text-gray-700">Filter failed builds by phase:</span>
            <div class="flex gap-2">
                <button
                    class="px-2 py-1 text-xs font-medium rounded-full ${!selectedPhase
        ? 'bg-red-200 text-red-800'
        : 'bg-gray-100 text-gray-800 hover:bg-gray-200'}"
                    onclick="handlePhaseSelect(null)"
                >
                    All Failed
                </button>
                ${buttons}
            </div>
        </div>
    `;
};


/**
 * Generates a URL with the given endpoint, including the base URL, port, and path from the CONFIG object.
 * Adds a timestamp query parameter to prevent caching.
 *
 * @param {string} [endpoint=''] - The endpoint to append to the base URL and path.
 * @returns {string} - The fully constructed URL with the timestamp query parameter.
 */
const generateUrl = (endpoint = '') => {
    // If we have a configured API URL, use it fully qualified
    if (CONFIG.API_BASE_URL) {
        const baseUrl = CONFIG.API_BASE_URL;
        const port = CONFIG.PORT ? `:${CONFIG.PORT}` : '';
        const path = CONFIG.PATH || 'dports/logs/Report';
        const url = `${baseUrl}${port}/${path}/${endpoint}`.replace(/([^:]\/)\/+/g, "$1");
        return `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`;
    }

    // Otherwise, just use the endpoint directly as a relative path
    return `${endpoint}${endpoint.includes('?') ? '&' : '?'}t=${Date.now()}`;
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
    text.length <= maxLength ? text : text.substring(0, maxLength) + '...';


/**
 * Checks if the given text contains 'href=' attribute.
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
const switchTab = async (tabName) => {
    if (!document.getElementById(tabName).classList.contains('hidden')) {
        return;
    }

    const searchValue = document.getElementById('search').value.toLowerCase();

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

    // Handle Promise from filterRows
    if (tabName === 'build-report' && searchValue) {
        try {
            await filterRows(searchValue, state.currentStatus);
        } catch (error) {
            handleError(error, 'filter rows during tab switch');
        }
    }
};


/**
 * Updates the progress bar based on the provided statistics.
 *
 * @param {Object} stats - The statistics object containing counts for each status.
 */
const updateProgressBar = (stats) => {
    const progressBar = document.getElementById('progress-bar');
    const total = stats.queued + stats.built + stats.meta + stats.failed + stats.ignored + stats.skipped;

    if (total === '0') {
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
 * @param clickable
 * @returns {string} - The HTML string for the badge element.
 */
const createBadge = (key, value, color, clickable = true) => {
    let displayText = key.charAt(0).toUpperCase() + key.slice(1);
    let badgeKey = key;

    // Special handling for queued to show as Total
    if (key === 'queued') {
        displayText = 'Total';
        badgeKey = 'total'; // Use 'total' as the key for the click handler
    }

    const clickableClass = clickable ? 'cursor-pointer filterable' : '';
    const onClick = clickable ? `onclick="handleStatusFilter('${badgeKey}')"` : '';

    return `<span id="stats_${key}" class="px-2 py-1 rounded-full bg-${color}-100 text-${color}-800 text-xs font-medium ${clickableClass}" ${onClick}>${displayText}: ${value}</span>`;
};


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

    // Main stats - now queued displays as Total and is clickable
    const mainStats = ['queued', 'built', 'meta', 'failed', 'ignored', 'skipped'];
    const colors = ['gray', 'green', 'purple', 'red', 'blue', 'yellow'];

    // Add Total (queued) first - now clickable
    statsContainer.innerHTML += createBadge('queued', stats.queued, colors[0], true);

    // Add Remaining badge - still non-clickable
    const remaining = stats.remains;
    statsContainer.innerHTML += createBadge('remaining', remaining, 'gray', false);

    // Add other status badges
    mainStats.slice(1).forEach((key, index) => {
        statsContainer.innerHTML += createBadge(key, stats[key], colors[index + 1]);
    });

    // Update additional stats
    ['load', 'swapinfo', 'elapsed', 'pkghour', 'impulse'].forEach(key => {
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
        // Handle both 'queued' (Total) and regular status badges
        const statusKey = key === 'queued' ? 'total' : key;
        const colorClass = `bg-${getStatColor(key)}-${statusKey === status ? '300' : '100'}`;
        badge.classList.remove('bg-gray-100', 'bg-green-100', 'bg-purple-100', 'bg-red-100', 'bg-blue-100', 'bg-yellow-100',
            'bg-gray-300', 'bg-green-300', 'bg-purple-300', 'bg-red-300', 'bg-blue-300', 'bg-yellow-300');
        badge.classList.add(colorClass);
    });
};


/**
 * Updates the builders table with the provided builders' data.
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
            <td class="px-1 py-1 whitespace-nowrap text-sm text-gray-500">${builder.origin ? portsMon(builder.origin) : '-'}</td>
            <td class="px-1 py-1 whitespace-nowrap text-sm text-gray-500">${builder.lines || '-'}</td>
            <td class="px-1 py-1 whitespace-nowrap text-sm text-gray-500">
                ${builder.origin ? `<a href="${logFile(builder.origin)}" class="text-blue-600 hover:underline" target="_blank">Log</a>` : '-'}
            </td>
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
    const sortIcons = {
        'skip': document.getElementById('skipSortIcon'),
        'no': document.getElementById('noSortIcon')
    };

    for (const [column, icon] of Object.entries(sortIcons)) {
        if (state.sortColumn === column) {
            icon.textContent = state.sortDirection === 'desc' ? '▼' : '▲';
        } else {
            icon.textContent = '⇅';
        }
    }
};


/**
 * Handles the sorting of the build history by the specified column.
 *
 * - Toggles the sort direction if the same column is clicked again.
 * - Sets the sort direction to ascending if a new column is clicked.
 * - Updates the build report table with the filtered and sorted history.
 * - Updates the sort icon to reflect the current sort state.
 *
 * @param {string} column - The column to sort by.
 */
const handleSort = async (column) => {
    // Get currently displayed data size, not total data size
    const currentData = state.cachedFilteredData;
    if (!currentData) return;

    const dataSize = currentData.length;
    const showLoading = dataSize > CONFIG.SHOW_LOADING_WHEN_ROWS_EXCEED;

    if (showLoading) {
        setTableLoading(true);
    }

    try {
        if (state.sortColumn === column) {
            if (state.sortDirection === 'desc') {
                state.sortDirection = 'asc';
            } else if (state.sortDirection === 'asc') {
                state.sortDirection = null;
                state.sortColumn = null;
            }
        } else {
            state.sortColumn = column;
            state.sortDirection = 'desc';
        }

        const buildHistory = state.history.flat();
        const filteredAndSortedHistory = filterAndSortHistory(buildHistory);

        if (showLoading) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        await updateBuildReportTable(filteredAndSortedHistory);
        updateSortIcon();
    } catch (error) {
        handleError(error, 'sort data');
    } finally {
        if (showLoading) {
            setTableLoading(false);
        }
    }
};


/**
 * Updates the build report table with the provided filtered and sorted history data.
 *
 * @param data
 */
const updateBuildReportTable = async (data) => {
    try {
        if (!data) return;

        const phaseFilterContainer = document.getElementById('phase-filter');
        const reportBody = document.getElementById('report_body');

        // Show/hide and update phase filter for failed builds
        if (state.currentStatus === 'failed') {
            const phases = state.buildPhases;
            phaseFilterContainer.innerHTML = createPhaseFilter(phases, phases, state.selectedBuildPhase);
            phaseFilterContainer.style.display = 'block';
        } else {
            phaseFilterContainer.style.display = 'none';
            phaseFilterContainer.innerHTML = '';
        }

        // Clear existing content
        reportBody.innerHTML = '';

        // Create fragment for better performance
        const fragment = document.createDocumentFragment();

        data.forEach((item) => {
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

        reportBody.appendChild(fragment);
    } catch (error) {
        handleError(error, 'update build report table');
    }
};

// Event Handlers

/**
 * Handles the status filter selection, updates the current status, filters and sorts the build history,
 * updates the build report table, and updates the document title with the current status.
 *
 * @param {string} status - The selected status filter.
 */
const handleStatusFilter = async (status) => {
    if (state.currentStatus === status && state.cachedFilteredData) return;

    const buildHistory = state.history.flat();
    const searchValue = document.getElementById('search').value.toLowerCase();

    // Calculate the actual size of data we'll be showing
    let dataSize;
    if (status === 'total' || status === null) {
        dataSize = buildHistory.length;
    } else {
        dataSize = buildHistory.filter(item => item.result.toLowerCase() === status).length;
    }

    // Only show loading for datasets > CONFIG.SHOW_LOADING_WHEN_ROWS_EXCEED rows
    const showLoading = dataSize > CONFIG.SHOW_LOADING_WHEN_ROWS_EXCEED;
    if (showLoading) {
        setTableLoading(true);
    }

    try {
        // First switch to build report tab if we're not already there
        if (document.getElementById('build-report').classList.contains('hidden')) {
            await switchTab('build-report');
        }

        state.currentStatus = status;

        let filteredAndSortedHistory;
        // For total view, we use the full buildHistory
        if (status === 'total' || status === null) {
            filteredAndSortedHistory = buildHistory.map((item, index) => ({
                ...item,
                originalIndex: index + 1
            }));
        } else {
            filteredAndSortedHistory = filterAndSortHistory(buildHistory);
        }

        // Apply search filter before updating the table if there's a search value
        if (searchValue) {
            filteredAndSortedHistory = filteredAndSortedHistory.filter(item => {
                const searchableFields = [
                    item.origin,
                    item.ID.toString(),
                    item.result,
                    item.info
                ].join(' ').toLowerCase();
                return searchableFields.includes(searchValue);
            });
        }

        // Cache the unfiltered data
        state.cachedFilteredData = status === 'total' || status === null ?
            buildHistory.map((item, index) => ({...item, originalIndex: index + 1})) :
            filterAndSortHistory(buildHistory);

        // Add slight delay for loading to be visible if needed
        if (showLoading) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        await updateBuildReportTable(filteredAndSortedHistory);
        updateSelectedStat(status);
        document.title = `${CONFIG.HTML_TITLE} - ${status === 'total' ? 'Total' : status.charAt(0).toUpperCase() + status.slice(1)}`;
    } catch (error) {
        console.error('Error during status filtering:', error);
    } finally {
        if (showLoading) {
            setTableLoading(false);
        }
    }
};

// Data Processing Functions

/**
 * Filters rows based on the search value and status.
 *
 * @param {string} searchValue - The search value to filter rows.
 * @param {string} status - The status to filter rows.
 * @param showLoading
 */
const filterRows = debounce(async (searchValue) => { // Add async
    let dataToFilter = state.cachedFilteredData;
    if (!dataToFilter) return;

    let filteredData = dataToFilter;
    if (searchValue) {
        filteredData = dataToFilter.filter(item => {
            const searchableFields = [
                item.origin,
                item.ID.toString(),
                item.result,
                item.info
            ].join(' ').toLowerCase();
            return searchableFields.includes(searchValue);
        });
    }

    // Await the Promise
    await updateTableWithData(filteredData);
}, CONFIG.DEBOUNCE_DELAY);

const updateTableWithData = async (data) => {
    const reportBody = document.getElementById('report_body');
    const fragment = document.createDocumentFragment();

    // Process data in the next frame to allow loading state to show
    await new Promise(resolve => requestAnimationFrame(resolve));

    data.forEach((item) => {
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
};


/**
 * Sorts the build history by the specified column.
 *
 * - Parses the skip information or ID for sorting.
 * - Sorts in ascending or descending order based on the current sort direction.
 *
 * @param {Array} buildHistory - The array of build history objects.
 * @param {string} column - The column to sort by ('skip' or 'id').
 * @returns {Array} - The sorted build history array.
 */
const sortByColumn = (buildHistory, column) => {
    return [...buildHistory].sort((a, b) => {
        let valueA, valueB;
        if (column === 'skip') {
            valueA = parseInt(skipInfo(a.result, a.info)) || 0;
            valueB = parseInt(skipInfo(b.result, b.info)) || 0;
        } else if (column === 'no') {
            valueA = a.originalIndex;
            valueB = b.originalIndex;
        }
        return state.sortDirection === 'asc' ? valueA - valueB : valueB - valueA;
    });
};


/**
 * Filters and sorts the build history based on the current status and sort settings.
 *
 * @param {Array} buildHistory - The build history array.
 * @returns {Array} - The filtered and sorted build history array.
 */
const filterAndSortHistory = (buildHistory) => {
    if (!buildHistory || buildHistory.length === 0) return [];

    let indexedHistory = buildHistory.map((item, index) => ({
        ...item,
        originalIndex: index + 1
    }));

    // Update build phases when processing history
    if (state.currentStatus === 'failed') {
        state.buildPhases = extractBuildPhases(indexedHistory);
    }

    // Filter by status
    if (state.currentStatus && state.currentStatus !== 'total') {
        indexedHistory = indexedHistory.filter(item =>
            item.result.toLowerCase() === state.currentStatus
        );

        // Additional phase filtering for failed builds
        if (state.currentStatus === 'failed' && state.selectedBuildPhase) {
            indexedHistory = indexedHistory.filter(item => {
                const phase = item.info.split(':')[0];
                return phase === state.selectedBuildPhase;
            });
        }
    }

    // Apply sorting if needed
    if (state.sortColumn && state.sortDirection) {
        indexedHistory = sortByColumn(indexedHistory, state.sortColumn);
    }

    return indexedHistory;
};


/**
 * Processes the summary data and updates the application state and UI.
 *
 * @param {Object} data - The summary data object.
 */
const processSummary = async (data) => {
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
            await switchTab('progress-builders');
        }
    } else if (state.buildInProgress) {
        state.buildInProgress = false;
        if (!state.userSwitchedTab) {
            await switchTab('build-report');
        }
    }
};


/**
 * Processes the history data and updates the application state and UI.
 *
 * @param {Array} historyData - The history data array.
 */
const processHistory = async (historyData) => {
    try {
        state.history = historyData;
        const buildHistory = historyData.flat();

        // Set initial table data with all entries
        const indexedHistory = buildHistory.map((item, index) => ({
            ...item,
            originalIndex: index + 1
        }));

        state.cachedFilteredData = indexedHistory;
        await updateBuildReportTable(indexedHistory);

        // Set initial state
        state.initialDataLoaded = true;
        state.currentStatus = 'total';

        // Reset tab switch to default behavior
        state.userSwitchedTab = false;

        // Update UI to reflect initial state
        updateSelectedStat('total');
    } catch (error) {
        handleError(error, 'process history data');
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
const fetchWithRetry = async (url, retries = CONFIG.RETRY_ATTEMPTS) => {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return await response.json();
        } catch (error) {
            if (i === retries - 1) {
                handleError(error, `fetch data from ${url}`);
                throw error;
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
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
        applyFooterText();

        // Set up all event listeners first
        initializeEventListeners();

        const summaryData = await fetchSummary();
        await processSummary(summaryData);

        const historyData = await fetchHistory(state.kFiles);
        await processHistory(historyData);

        document.getElementById('build_info').style.display = 'block';
        document.getElementById('loading_stats_build').style.display = 'none';

        // Initialize with correct tab and search state
        const activeBuilder = summaryData.builders.find(builder => builder.phase !== "Idle");
        await switchTab(activeBuilder ? 'progress-builders' : 'build-report');
        state.userSwitchedTab = false;

        // If there's an initial search value, apply it
        const searchInput = document.getElementById('search');
        if (searchInput.value) {
            await filterRows(searchInput.value.toLowerCase(), state.currentStatus);
        }

        if (state.buildInProgress) {
            const pollData = async () => {
                const newSummary = await fetchSummary();
                await processSummary(newSummary);

                if (state.buildInProgress) {
                    setTimeout(pollData, CONFIG.POLL_INTERVAL);
                }
            };
            await pollData();
        }

    } catch (error) {
        handleError(error, 'initialize application');
    }
};

// Event Listeners

/**
 * Initializes event listeners for sorting, searching, tab switching, and info text expansion.
 *
 * - Adds click event listeners for sorting by 'skip' and 'no' columns.
 * - Adds input event listener for search input to filter rows based on search value.
 * - Adds click event listeners for tab links to switch tabs.
 * - Adds click event listener for info text expansion to toggle between truncated and full text.
 */
const initializeEventListeners = () => {
    // Sort handlers
    document.getElementById('skipHeader')
        .addEventListener('click', () => handleSort('skip'));
    document.getElementById('noHeader')
        .addEventListener('click', () => handleSort('no'));

    // Search handler
    const searchInput = document.getElementById('search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) =>
            filterRows(e.target.value.toLowerCase(), state.currentStatus));
    }

    // Tab handlers
    document.querySelectorAll('.tab-link').forEach(link => {
        link.addEventListener('click', async (e) => {
            e.preventDefault();
            const tabName = e.target.getAttribute('data-tab');
            await switchTab(tabName);
        });
    });

    // Info text expansion handler
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('info-text')) {
            const fullText = e.target.dataset.full;
            if (fullText) {
                if (e.target.classList.contains('expanded')) {
                    e.target.textContent = truncateText(fullText, 80);
                    e.target.classList.remove('expanded');
                } else {
                    e.target.textContent = fullText;
                    e.target.classList.add('expanded');
                }
            }
        }
    });
};

document.addEventListener('DOMContentLoaded', initializeApp);
